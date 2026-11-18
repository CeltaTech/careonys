/* Generar las facturas de un tramo de fechas.
   ============================================================

   Una factura por Servicio y por cada período de su frecuencia de cobro que empiece en el tramo,
   ya terminado, y que todavía no tenga la suya. Si en ese período cambió el Responsable de pagos,
   el período se parte en el día del cambio y sale una factura por cada parte, cada una a nombre
   de quien pagaba esos días (`partesDelPeriodo`).

   Lo usan dos rutas: la que genera la tanda y la que cambia al Responsable de pagos, que vuelve a
   generar las facturas que el cambio dejó partidas. Por eso vive acá y no adentro de una ruta.

   UNA FACTURA SIN RENGLONES NO QUEDA. Si los renglones no entran, se borra la factura recién
   creada: una factura con monto y sin detalle no se puede reclamar ni explicar, y como no tiene
   ningún cobro todavía, borrarla no pierde nada.

   Lo que falla en la base se lanza con el código de respuesta que corresponde (`estado`), y la
   ruta lo contesta con `responderError`. */

import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { aDosDecimales } from './cobrosDeCliente.js';
import { plazoDePagoDe, vencimientoDe } from './facturacionDeClientes.js';
import {
  armarLaFacturaDelPeriodo,
  conLosDescuentos,
  partesDelPeriodo,
  periodosDelTramo,
  seSuperponen,
} from './facturaDelPeriodo.js';
import { condicionDe, condicionesDe } from './condicionesDelCliente.js';
import { horasEntre } from './horasDeGuardia.js';
import { FICHA_NOMBRE, conSusFichas } from './fichaDelPaciente.js';

/** Un error de la base, con el código de respuesta que le corresponde. */
function fallaDeLaBase(error, estado = 500) {
  const falla = new Error(error?.message ?? String(error));
  falla.estado = estado;
  return falla;
}

/** Lee con el trabajo de la Prestadora y lanza si la base contesta un error. */
async function leerEnLaPrestadora(prestadoraId, trabajo, consulta) {
  const { data, error } = await enLaPrestadora(prestadoraId, trabajo, consulta);
  if (error) throw fallaDeLaBase(error);
  return data || [];
}

function agrupadoPorServicio(filas) {
  const mapa = new Map();
  for (const fila of filas) {
    if (!fila.servicio_id) continue;
    if (!mapa.has(fila.servicio_id)) mapa.set(fila.servicio_id, []);
    mapa.get(fila.servicio_id).push(fila);
  }
  return mapa;
}

/**
 * @param {object} p
 * @param {object} p.req             El pedido: la base ve sólo lo que quien pide puede ver.
 * @param {string} p.prestadoraId    La Prestadora de la sesión.
 * @param {{desde: string, hasta: string}} p.tramo
 * @param {string|null} p.vencimientoDeLaTanda  La fecha escrita para toda la tanda, o vacío.
 * @param {string|null} [p.servicioId]  Sólo ese Servicio.
 * @returns {Promise<{generadas, sinPrestaciones, sinVencimiento, sinTerminar, guardiasSinAsignar,
 *   guardiasAmbiguas, sinPrecio, monedasMezcladas}>}
 */
export async function generarFacturasDelTramo({ req, prestadoraId, tramo, vencimientoDeLaTanda = null, servicioId = null }) {
  const db = clienteDelPedido(req);
  // La fecha puede venir escrita para toda la tanda, y en ese caso pisa cualquier plazo acordado.
  // Si no viene, cada factura vence según el plazo de ese Servicio. Una factura sin vencimiento no
  // se puede reclamar ni mostrar como vencida, así que sin ninguna de las dos cosas ese Servicio
  // no se factura: no se le inventa una fecha.
  const vencimientoEscrito = /^\d{4}-\d{2}-\d{2}$/.test(String(vencimientoDeLaTanda ?? ''));

  // Con el trabajo de la Prestadora, porque la base le abre `configuracion_facturacion_clientes`
  // sólo a la administración, y generar las facturas también lo hace quien coordina.
  const respuesta = await enLaPrestadora(prestadoraId, 'lectura de las condiciones de cobro', (dbTrabajo) =>
    dbTrabajo.from('configuracion_facturacion_clientes').select('regla').eq('prestadora_id', prestadoraId).maybeSingle(),
  );
  if (respuesta.error) throw fallaDeLaBase(respuesta.error);
  const reglaDeLaPrestadora = respuesta.data?.regla ?? null;
  const plazoDeLaPrestadora = reglaDeLaPrestadora?.dias_hasta_el_vencimiento ?? null;

  const hoy = new Date().toISOString().slice(0, 10);

  // Los pendientes de conformidad no los devuelve la base, y no se facturan. Del Cliente salen
  // los nombres de sus Pacientes para los renglones; la factura es de cada Servicio.
  const { data: clientes, error: errorClientes } = await db
    .from('clientes')
    .select(`id, prestadora_id, pacientes(id, ${FICHA_NOMBRE})`)
    .is('deleted_at', null);
  if (errorClientes) throw fallaDeLaBase(errorClientes);

  const pacientes = conSusFichas((clientes || []).flatMap((f) => f.pacientes || []));
  const pacienteIds = pacientes.map((p) => p.id);
  const nombresDePacientes = new Map(pacientes.map((p) => [p.id, p.nombre]));
  const clientesVisibles = new Set((clientes || []).map((c) => c.id));

  // Una factura por Servicio y por período. Cada Servicio trae su Prestadora, que es la que se
  // escribe en su factura. La deuda sigue siendo del Cliente.
  let consultaDeServicios = db.from('servicios').select('id, prestadora_id, cliente_id');
  if (servicioId) consultaDeServicios = consultaDeServicios.eq('id', servicioId);
  const { data: servicios, error: errorServicios } = await consultaDeServicios;
  if (errorServicios) throw fallaDeLaBase(errorServicios);
  const serviciosVisibles = (servicios || []).filter((s) => clientesVisibles.has(s.cliente_id));
  const servicioIds = (servicios || []).map((s) => s.id);

  // El plazo de pago, la frecuencia de cobro, la medición, los descuentos y el Responsable de pagos
  // de cada Servicio son parte de lo comercial, que la base le abre sólo a quien tiene ese
  // permiso; generar las facturas lo hace también quien coordina. Los descuentos terminados también
  // vienen: un período que cerró antes de la terminación todavía lo lleva.
  const [comerciales, descuentos, tramosDePagador] = servicioIds.length === 0 ? [[], [], []] : await Promise.all([
    leerEnLaPrestadora(prestadoraId, 'lectura de las condiciones de cobro de cada Servicio', (dbTrabajo) =>
      dbTrabajo
        .from('condiciones_comerciales_servicio')
        .select(
          'servicio_id, dias_hasta_el_vencimiento, frecuencia_de_cobro, medicion, cobra_cancelada_por_el_cliente, '
            + 'descuenta_lo_no_prestado, cobra_guardias_adicionales, cobra_horas_adicionales',
        )
        .in('servicio_id', servicioIds),
    ),
    leerEnLaPrestadora(prestadoraId, 'lectura de los descuentos de cada Servicio', (dbTrabajo) =>
      dbTrabajo
        .from('descuentos_del_servicio')
        .select('id, servicio_id, clase, valor, moneda, vigente_desde, cantidad_de_periodos, vigente_hasta, cargado_en, terminado_en')
        .in('servicio_id', servicioIds),
    ),
    leerEnLaPrestadora(prestadoraId, 'quién paga cada día de cada Servicio', (dbTrabajo) =>
      dbTrabajo
        .from('tramos_de_pagador_del_servicio')
        .select('servicio_id, pagador_persona_id, pagador_tipo, rige_desde, rige_hasta')
        .in('servicio_id', servicioIds),
    ),
  ]);
  const comercialDelServicio = new Map(comerciales.map((c) => [c.servicio_id, c]));
  const descuentosDelServicio = agrupadoPorServicio(descuentos);
  const pagadoresDelServicio = agrupadoPorServicio(tramosDePagador);

  // Los períodos de cada Servicio, con su propia frecuencia. Los que todavía no terminaron se
  // cuentan y no se facturan.
  let sinTerminar = 0;
  const periodosDelServicio = new Map();
  for (const servicio of serviciosVisibles) {
    const frecuencia = condicionDe('frecuencia_de_cobro', reglaDeLaPrestadora, comercialDelServicio.get(servicio.id));
    const { terminados, sinTerminar: abiertos } = periodosDelTramo({ tramo, frecuencia, hoy });
    sinTerminar += abiertos.length;
    if (terminados.length > 0) periodosDelServicio.set(servicio.id, terminados);
  }
  const todosLosPeriodos = [...periodosDelServicio.values()].flat();
  const primerDia = todosLosPeriodos.reduce((min, p) => (p.desde < min ? p.desde : min), tramo.desde);
  const ultimoDia = todosLosPeriodos.reduce((max, p) => (p.hasta > max ? p.hasta : max), tramo.hasta);

  let prestaciones = [];
  if (pacienteIds.length > 0) {
    const { data, error } = await db
      .from('prestaciones')
      .select('id, paciente_id, servicio_id, tipo_servicio, precio_final, moneda, vigente_desde, vigente_hasta, configuracion, prestacion_anterior_id, precio_guardia_adicional, precio_hora_adicional')
      .eq('estado', 'vigente')
      .in('paciente_id', pacienteIds);
    if (error) throw fallaDeLaBase(error);
    prestaciones = data || [];
  }

  // El trabajo: las guardias de esos Servicios en esas fechas, con sus Pacientes. Entran las
  // completadas, que se cobran, y las ausentes y las canceladas, que según las condiciones se
  // descuentan o se cobran; la cancelación dice quién la pidió. La pausada por internación no
  // entra. Las horas se cuentan con la misma regla que usa la Liquidación del Asistente.
  let guardias = [];
  const serviciosConPeriodos = [...periodosDelServicio.keys()];
  if (serviciosConPeriodos.length > 0) {
    const { data, error } = await db
      .from('guardias')
      .select('id, fecha, servicio_id, estado, cancelacion_origen, hora_inicio, hora_fin, dias_hasta_el_fin, horas_extra, guardia_pacientes(paciente_id)')
      .in('estado', ['completada', 'ausente', 'cancelada'])
      .in('servicio_id', serviciosConPeriodos)
      .gte('fecha', primerDia)
      .lte('fecha', ultimoDia);
    if (error) throw fallaDeLaBase(error);
    guardias = (data || []).map((g) => ({
      id: g.id,
      fecha: String(g.fecha).slice(0, 10),
      servicio_id: g.servicio_id,
      estado: g.estado,
      cancelacion_origen: g.cancelacion_origen ?? null,
      horas: horasEntre(g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin),
      horas_extra: Number(g.horas_extra) || 0,
      pacientes: (g.guardia_pacientes || []).map((gp) => gp.paciente_id),
    }));
  }

  // Lo ya facturado que toca estas fechas: una parte que se superpone con una factura del mismo
  // Servicio no se vuelve a facturar. La base lo rechazaría igual; mirarlo antes evita cortar la
  // tanda a la mitad.
  const { data: existentes, error: errorExistentes } = await db
    .from('facturas_cliente')
    .select('servicio_id, periodo, periodo_hasta')
    .lte('periodo', ultimoDia)
    .gte('periodo_hasta', primerDia);
  if (errorExistentes) throw fallaDeLaBase(errorExistentes);
  const yaFacturado = (idDelServicio, dias) =>
    (existentes || []).some(
      (f) =>
        f.servicio_id === idDelServicio &&
        seSuperponen({ desde: String(f.periodo).slice(0, 10), hasta: String(f.periodo_hasta).slice(0, 10) }, dias),
    );

  const porServicio = agrupadoPorServicio(prestaciones);
  const guardiasPorServicio = agrupadoPorServicio(guardias);

  const cuenta = {
    generadas: 0,
    sinPrestaciones: 0,
    sinVencimiento: 0,
    sinTerminar,
    guardiasSinAsignar: 0,
    guardiasAmbiguas: 0,
    sinPrecio: 0,
    monedasMezcladas: 0,
  };

  for (const servicio of serviciosVisibles) {
    const comercial = comercialDelServicio.get(servicio.id);
    // Todas las condiciones que rigen para este Servicio: la medición y qué se descuenta o se
    // cobra de más.
    const condiciones = condicionesDe(reglaDeLaPrestadora, comercial);

    for (const periodo of periodosDelServicio.get(servicio.id) || []) {
      for (const parte of partesDelPeriodo(periodo, pagadoresDelServicio.get(servicio.id))) {
        if (yaFacturado(servicio.id, parte)) continue;

        const factura = armarLaFacturaDelPeriodo({
          periodo,
          parte,
          medicion: condiciones.medicion,
          condiciones,
          prestaciones: porServicio.get(servicio.id) || [],
          guardias: guardiasPorServicio.get(servicio.id) || [],
          nombresDePacientes,
        });
        cuenta.guardiasSinAsignar += factura.guardiasSinAsignar;
        cuenta.guardiasAmbiguas += factura.guardiasAmbiguas;
        cuenta.sinPrecio += factura.sinPrecio;

        if (factura.renglones.length === 0) {
          cuenta.sinPrestaciones += 1;
          continue;
        }

        // Una factura tiene una sola moneda: con dos en el mismo Servicio no se arma.
        if (factura.monedasMezcladas) {
          cuenta.monedasMezcladas += 1;
          continue;
        }

        const vencimiento = vencimientoEscrito
          ? vencimientoDeLaTanda
          : vencimientoDe(hoy, plazoDePagoDe(plazoDeLaPrestadora, comercial?.dias_hasta_el_vencimiento ?? null));

        if (!vencimiento) {
          cuenta.sinVencimiento += 1;
          continue;
        }

        // Los descuentos se restan al final, sobre lo que suma la factura, cada uno en su renglón.
        const conDescuentos = conLosDescuentos({
          factura,
          descuentos: descuentosDelServicio.get(servicio.id),
          periodo,
          parte,
          frecuencia: condiciones.frecuencia_de_cobro,
          servicioId: servicio.id,
        });

        const { data: creada, error: errorFactura } = await db
          .from('facturas_cliente')
          .insert({
            prestadora_id: servicio.prestadora_id,
            cliente_id: servicio.cliente_id,
            servicio_id: servicio.id,
            periodo: parte.desde,
            periodo_hasta: parte.hasta,
            monto_total: aDosDecimales(conDescuentos.total),
            // La moneda es la de las prestaciones que se cobran. Si no la traen, la completa la
            // base con la de la Prestadora.
            ...(factura.moneda ? { moneda: factura.moneda } : {}),
            // La emisión se escribe en vez de dejarla en el valor por defecto de la base: el plazo
            // de pago se cuenta desde este mismo día, y si uno lo pone la base y el otro el
            // backend, un cambio de día entre los dos daría un vencimiento corrido.
            fecha_emision: hoy,
            fecha_vencimiento: vencimiento,
          })
          .select('id, prestadora_id')
          .single();
        if (errorFactura) throw fallaDeLaBase(errorFactura, 400);

        const { error: errorRenglones } = await db
          .from('facturas_cliente_items')
          .insert(conDescuentos.renglones.map((r) => ({ ...r, prestadora_id: creada.prestadora_id, factura_id: creada.id })));

        if (errorRenglones) {
          await db.from('facturas_cliente').delete().eq('id', creada.id);
          throw fallaDeLaBase(errorRenglones, 400);
        }

        cuenta.generadas += 1;
      }
    }
  }

  return cuenta;
}
