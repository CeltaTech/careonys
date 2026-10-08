import express, { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import {
  ORIGENES_DE_AFUERA,
  TOPE_DEL_LOTE,
  aDosDecimales,
  loQueEstaMalEnElCobro,
  primerDiaDelPeriodo,
} from '../utils/cobrosDeCliente.js';
import {
  LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE,
  mediosDePagoDeLaPrestadora,
} from '../utils/mediosDePago.js';
import {
  loQueEstaMalEnLaCorreccion,
  loQueEstaMalEnLoFacturado,
  plazoDePagoDe,
  sigueLaCobranza,
  vencimientoDe,
} from '../utils/facturacionDeClientes.js';
import {
  TOPE_DE_FILAS,
  esIdentificador,
  loFacturadoDeLaFila,
  queHacerConLaFilaFacturada,
} from '../utils/intercambioDeFacturacion.js';
import { laCobranzaLaLlevaOtroSoftware } from '../utils/seguimientoDeLaCobranza.js';
import { anotarLoFacturado, facturaParaAnotar } from '../utils/anotarLoFacturado.js';
import { guardarComprobante, loQueEstaMalEnElComprobante } from '../utils/comprobanteDeLaFactura.js';
import { armarLosRenglonesDeLaFactura } from '../utils/facturaDelPeriodo.js';
import { responderError } from '../utils/errorConMotivo.js';
import { requierePermiso } from '../utils/permisos.js';

/* Lo que el Cliente pagó, anotado; y el saldo, que es una resta.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO (pendiente #155). El saldo de cada Cliente no tenía de dónde
   mantenerse al día: la base guardaba cuánto se le facturó y un estado de dos valores que
   alguien marcaba a mano. Faltaba el otro término de la resta —cuánta plata entró—, y por eso
   un Cliente que pagaba la mitad quedaba idéntica a una que no pagaba nada.

   LA IDEA DE FONDO: el saldo no se guarda en ninguna parte, se calcula. Lo facturado menos lo
   cobrado, en la vista `saldos_cliente`, que es el único lugar donde vive esa resta (regla 12
   de CLAUDE.md §7). Este archivo no rehace esa cuenta ni una sola vez: la lee.

   Y CON UN SOFTWARE DE COBRANZAS CONECTADO, NI SIQUIERA LA LEE. Si la Prestadora eligió que el
   seguimiento de la cobranza es de otro software, el que sabe cuánto debe cada Cliente es él, y
   este sistema deja de calcular: las rutas que entregan la resta contestan que acá no se calcula,
   y lo que se muestra sale de `/estados-de-cuenta`, que devuelve lo que ese software avisó tal
   como llegó. Un número que viene de afuera y otro calculado acá son dos verdades para lo mismo,
   y eso es peor que no tener ninguna. Sin nada conectado no cambia nada.

   LA PUERTA DE ENTRADA ABIERTA. La plata puede entrar por donde sea: cargada acá, importada de
   un archivo, empujada por el sistema contable de la Prestadora, traída por una pasarela. La
   ruta `/entrada` acepta un lote de cobros de cualquiera de esos orígenes y contesta uno por
   uno qué pasó con cada uno. Es idempotente: quien reintenta el mismo envío con la misma
   `referencia_externa` recibe "duplicado" y no se suma plata de más. Nada acá está atado a un
   proveedor: el proveedor, si existe, es un texto en `referencia_externa`.

   LO QUE NO HACE, Y NO VA A HACER: decidir. Que un Cliente deba plata no corta ningún
   Servicio. La pantalla avisa; si se le sigue prestando o no, lo decide una persona.

   LO QUE TAMPOCO ES: un facturador. El producto no emite comprobantes y no va a emitirlos. Lo que
   sí hace es mandar a facturar —cuántas unidades, a qué precio, a qué plazo— y guardar lo que el
   software de facturación de la Prestadora le informa: el monto emitido, el vencimiento y cómo
   se llama el comprobante. Ese nombre es texto que se guarda y no se interpreta, porque cambia
   de país en país y el producto no conoce ninguno. Y una factura que salió mal no se toca: se anota
   la corrección que emitió ese mismo software, con su monto y para qué lado va.

   QUIÉN PUEDE, Y ACÁ HAY DOS PUERTAS DISTINTAS. Mandar a facturar es trabajo de la Prestadora y
   entra por el mismo criterio con el que se abre la pantalla: ser de la Prestadora y tener rol de
   Panel, que es la política `panel_gestiona_facturas_cliente` de la base y la función SQL
   `gestiona_la_facturacion()`, y que `requiereRolPanel` refleja. Pero **cuánto debe cada Cliente
   y si está atrasada no es información de quien coordina turnos**: eso pasa por la acción
   `ver_estado_de_cuenta_cliente` del catálogo `catalogo_acciones_permisos`, que nace reservada a
   la administración y que cada Prestadora abre o cierra desde su Panel. Lleva ese portero todo lo
   que entrega o mueve el estado de cuenta —los saldos, el estado de cuenta que llegó de afuera, el
   detalle de una factura, anotar un cobro, anularlo y la entrada de lotes—; no lo lleva lo que
   sirve para facturar. Que un Cliente haya quedado restringida tampoco: eso no dice cuánto
   debe, y quien coordina necesita saberlo para trabajar.

   NADA DE PLATA EN LOS REGISTROS NI EN LA DIRECCIÓN. Los importes y los datos de los Clientes
   son dato sensible (CLAUDE.md §6): no se loguean y no viajan por la URL. Por la URL viaja el
   identificador de una factura o un período, que no dicen cuánto debe nadie.

   CON LA CREDENCIAL DE QUIEN PIDE. Lo de esta ruta entra a la base con `clienteDelPedido(req)`,
   no con la llave maestra: la base sabe quién pide y le contesta sólo lo de su Prestadora. Por eso
   ninguna consulta lleva el filtro de la Prestadora de la sesión, y la Prestadora que se escribe al
   insertar es la de la fila que la base ya dejó ver —la factura, el Cliente—, no un dato del
   pedido. Quedan con la maestra, cada una con su motivo escrito al lado, las pocas lecturas y
   escrituras que la base todavía no le abre a todos los roles que esta ruta deja pasar, o que
   les esconde a todos, como los Clientes pendientes de conformidad. */

export const panelCobrosRouter = Router();

// Qué monto vale, cómo se lee un período: escrito una sola vez en `utils/cobrosDeCliente.js`,
// que es copia del archivo del Panel. La pantalla arma el desplegable con la misma lista con la
// que el backend controla, así no puede ofrecer algo que después se rechaza (regla 12 de
// CLAUDE.md §7). Se vuelven a exportar desde acá porque es de donde las venían tomando quienes
// las usan. Los medios no están en esa lista: salen de la base, por `utils/mediosDePago.js`.
export {
  ORIGENES_DE_AFUERA,
  TOPE_DEL_LOTE,
  loQueEstaMalEnElCobro,
  primerDiaDelPeriodo,
  aDosDecimales,
} from '../utils/cobrosDeCliente.js';
import { FICHA_NOMBRE, conSusFichas } from '../utils/fichaDelPaciente.js';

/**
 * Los nombres de estos Clientes, para las listas que se muestran en pantalla.
 *
 * Se buscan aparte en vez de traerlos colgados de la factura, y siempre dentro de la Prestadora
 * de quien pide.
 */
async function nombresDeClientes(prestadoraId, ids) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  // Con la llave maestra: la política restrictiva `oculta_pendientes_de_conformidad` de `clientes`
  // (`NOT pendiente_conformidad`) le esconde a todos los roles los Clientes pendientes de
  // conformidad, y sus facturas y saldos se mostraban con el nombre. Se decide aparte.
  const { data, error } = await supabase
    .from('clientes')
    .select('id, personas!clientes_contratante_de_la_misma_prestadora(nombre_visible)')
    .eq('prestadora_id', prestadoraId)
    .in('id', unicos);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((f) => [f.id, f.personas?.nombre_visible ?? null]));
}

/**
 * La factura, si la base la deja ver; si no, null: es de otra Prestadora y para quien pide no
 * existe. Trae su Prestadora, que es la que se escribe en lo que se le cuelga.
 */
async function facturaVisible(db, facturaId) {
  const { data, error } = await db
    .from('facturas_cliente')
    .select(
      'id, prestadora_id, cliente_id, periodo, monto_total, moneda, estado, fecha_emision, fecha_vencimiento, comprobante_subido_at'
    )
    .eq('id', facturaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** El saldo calculado de una factura, leído del único lugar donde vive esa resta. */
async function saldoDeLaFactura(db, facturaId) {
  const { data, error } = await db
    .from('saldos_cliente')
    .select('*')
    .eq('factura_id', facturaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// ---------------------------------------------------------------------------------------
// Las restricciones que avisó el software de créditos y cobranzas
//
// Sólo se leen. El sistema no las decide, no las cambia y no hace nada con ellas: las muestra
// para que una persona de la Prestadora sepa que a ese Cliente le pusieron una restricción y
// resuelva qué hacer. Ningún Servicio se corta ni ninguna Guardia se cancela por esto.
//
// De cada Cliente vale la fila más nueva: las anteriores quedan guardadas, pero lo que rige hoy
// es la última. Y se devuelven sólo las que están restringidas, porque una fila que levantó una
// restricción no tiene nada que mostrar.
// ---------------------------------------------------------------------------------------

/**
 * El portero del estado de cuenta.
 *
 * Cuánto debe un Cliente y si está atrasado es del trato económico entre la Prestadora y ese
 * Cliente, no del armado de las guardias. La acción nace reservada a la administración y cada
 * Prestadora decide si se la abre a quien coordina, como con cualquier otra del catálogo.
 */
const veElEstadoDeCuenta = requierePermiso('ver_estado_de_cuenta_cliente');

/** Lo que se contesta cuando se pide un número que este sistema ya no calcula. */
function noSeCalculaAca(res) {
  return res.status(409).json({ error: 'La cobranza de esta Prestadora la lleva otro software' });
}

/**
 * Si el seguimiento de la cobranza es de este sistema o de otro software.
 *
 * Vive acá y no sólo en Configuración porque la pantalla de saldos lo necesita para saber qué
 * mostrar, y a Configuración entra únicamente quien administra: un Coordinador que abre la
 * pantalla tiene que ver lo mismo que ve su Admin. De la fila sale sólo el interruptor; el
 * secreto de la caja fuerte no se toca acá.
 */
panelCobrosRouter.get('/configuracion', requiereRolPanel, async (req, res) => {
  // Con la maestra: la base le abre `configuracion_facturacion_clientes` sólo a la administración,
  // y esta lectura la necesita también quien coordina.
  const { data, error } = await supabase
    .from('configuracion_facturacion_clientes')
    .select('regla')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (error) return responderError(res, error);
  res.json({ sigue_la_cobranza: sigueLaCobranza(data?.regla) });
});

panelCobrosRouter.get('/restricciones', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  // Con la maestra: la base le abre `restricciones_de_cobranza` sólo a la administración, y quien
  // coordina necesita saber qué Cliente quedó restringido para trabajar.
  const { data, error } = await supabase
    .from('restricciones_de_cobranza')
    .select('id, cliente_id, restringida, motivo, origen, created_at')
    .eq('prestadora_id', prestadoraId)
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  // El más nuevo de cada Cliente, que es el que rige. La consulta ya vino del más nuevo al más
  // viejo, así que alcanza con quedarse con el primero de cada una.
  const ultimoDeCadaCliente = new Map();
  for (const restriccion of data || []) {
    if (!ultimoDeCadaCliente.has(restriccion.cliente_id)) {
      ultimoDeCadaCliente.set(restriccion.cliente_id, restriccion);
    }
  }
  const vigentes = [...ultimoDeCadaCliente.values()].filter((a) => a.restringida);

  let nombres;
  try {
    nombres = await nombresDeClientes(prestadoraId, vigentes.map((a) => a.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json(vigentes.map((a) => ({ ...a, cliente_nombre: nombres.get(a.cliente_id) ?? null })));
});

// ---------------------------------------------------------------------------------------
// El estado de cuenta que avisó el software de créditos y cobranzas
//
// ACÁ NO SE CALCULA NADA. Cuánto debe cada Cliente, en qué moneda, si está atrasado y desde
// cuándo llegó de afuera y se entrega tal como llegó. No se completa lo que no vino, no se suma
// ningún cobro anotado de este lado y no se compara contra la resta de `saldos_cliente`: son dos
// respuestas posibles para la misma pregunta, y con un software conectado la que vale es la de él.
//
// De cada Cliente rige el estado de cuenta más nuevo, y esa elección la hace la vista
// `estado_de_cuenta_externo_vigente`. Los anteriores quedan guardados.
// ---------------------------------------------------------------------------------------

panelCobrosRouter.get('/estados-de-cuenta', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const db = clienteDelPedido(req);

  const { data, error } = await db
    .from('estado_de_cuenta_externo_vigente')
    .select('cliente_id, saldo, moneda, atrasado, dias_de_atraso, vencimiento_mas_antiguo, fecha_del_estado, informado_at')
    .order('informado_at', { ascending: false });
  if (error) return responderError(res, error);

  let nombres;
  try {
    nombres = await nombresDeClientes(req.usuarioPanel.prestadoraId, (data || []).map((e) => e.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json((data || []).map((e) => ({ ...e, cliente_nombre: nombres.get(e.cliente_id) ?? null })));
});

// ---------------------------------------------------------------------------------------
// Los saldos
// ---------------------------------------------------------------------------------------

/**
 * Los saldos de un período: lo facturado, lo cobrado, lo que falta, de dónde salió el dato y
 * de cuándo es.
 */
panelCobrosRouter.get('/saldos', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const periodo = primerDiaDelPeriodo(req.query.periodo);
  if (!periodo) return res.status(400).json({ error: 'Falta el período, en formato AAAA-MM' });

  try {
    if (await laCobranzaLaLlevaOtroSoftware(req.usuarioPanel.prestadoraId)) return noSeCalculaAca(res);
  } catch (e) {
    return responderError(res, e);
  }

  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('saldos_cliente')
    .select('*')
    .eq('periodo', periodo)
    .order('fecha_emision', { ascending: false });
  if (error) return responderError(res, error);

  let nombres;
  try {
    nombres = await nombresDeClientes(req.usuarioPanel.prestadoraId, (data || []).map((s) => s.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json((data || []).map((s) => ({ ...s, cliente_nombre: nombres.get(s.cliente_id) ?? null })));
});

/** El detalle de una factura: su saldo y todos los cobros que la fueron bajando. */
panelCobrosRouter.get('/facturas/:facturaId', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const db = clienteDelPedido(req);

  let saldo;
  try {
    if (await laCobranzaLaLlevaOtroSoftware(prestadoraId)) return noSeCalculaAca(res);
    saldo = await saldoDeLaFactura(db, req.params.facturaId);
  } catch (e) {
    return responderError(res, e);
  }
  if (!saldo) return res.status(404).json({ error: 'Factura no encontrada' });

  // Los anulados vienen también: anular no es borrar, y el rastro de una plata que se dio de
  // baja es justamente lo que hay que poder mirar después.
  const { data: cobros, error } = await db
    .from('cobros_cliente')
    .select('*')
    .eq('factura_id', saldo.factura_id)
    .order('fecha_cobro', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  // Las correcciones van al lado de los cobros y no adentro de ellos: son dos cosas distintas.
  // Un cobro es plata que entró; una corrección es lo que se dejó de deber o se pasó a deber.
  const { data: correcciones, error: errorCorrecciones } = await db
    .from('correcciones_factura_cliente')
    .select('*')
    .eq('factura_id', saldo.factura_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (errorCorrecciones) return responderError(res, errorCorrecciones);

  let nombres;
  // Cuándo se guardó el papel que baja el Cliente. Va la fecha y no la ruta del archivo: la ruta
  // no la necesita ninguna pantalla, y lo que no viaja no se filtra.
  let factura;
  try {
    nombres = await nombresDeClientes(prestadoraId, [saldo.cliente_id]);
    factura = await facturaVisible(db, saldo.factura_id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({
    ...saldo,
    cliente_nombre: nombres.get(saldo.cliente_id) ?? null,
    comprobante_subido_at: factura?.comprobante_subido_at ?? null,
    cobros: cobros || [],
    correcciones: correcciones || [],
  });
});

// ---------------------------------------------------------------------------------------
// Las facturas del período
// ---------------------------------------------------------------------------------------

/**
 * Generar las facturas de un período, una por Cliente que todavía no tenga la suya.
 *
 * ESTO SE HACÍA EN EL NAVEGADOR, y la cuenta salía mal de dos maneras: cobraba prestaciones cuya
 * vigencia ya había terminado o todavía no había empezado, y cobraba renglón por renglón las
 * prestaciones que estaban adentro de un paquete, o sea desconociendo el precio único que se
 * había pactado. Qué lleva cada factura es un cálculo económico y ahora vive en
 * `utils/facturaDelPeriodo.js`, del mismo lado que las facturas.
 *
 * SE COBRA EL PRECIO ACORDADO, ENTERO, por cualquier prestación que corra aunque sea un día del
 * período. Partirlo en proporción a los días obligaría a decidir sobre cuántos se parte, y eso lo
 * acuerda cada Prestadora con cada Cliente.
 *
 * UNA FACTURA SIN RENGLONES NO QUEDA. Si los renglones no entran, se borra la factura recién
 * creada: una factura con monto y sin detalle no se puede reclamar ni explicar, y como no tiene
 * ningún cobro todavía, borrarla no pierde nada.
 */
panelCobrosRouter.post('/facturas/generar', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const periodo = primerDiaDelPeriodo(req.body?.periodo);
  if (!periodo) return res.status(400).json({ error: 'Falta el período, en formato AAAA-MM' });

  // La fecha puede venir escrita para toda la tanda —es lo que se hacía hasta ahora—, y en ese
  // caso pisa cualquier plazo acordado. Si no viene, cada factura vence según el plazo de ese
  // Cliente. Una factura sin vencimiento no se puede reclamar ni mostrar como vencida, así que
  // sin ninguna de las dos cosas ese Cliente no se factura: no se le inventa una fecha.
  const vencimientoDeLaTanda = String(req.body?.fecha_vencimiento ?? '').slice(0, 10);
  const vencimientoEscrito = /^\d{4}-\d{2}-\d{2}$/.test(vencimientoDeLaTanda);

  const db = clienteDelPedido(req);

  // Con la maestra: la base le abre `configuracion_facturacion_clientes` sólo a la administración,
  // y generar las facturas también lo hace quien coordina.
  const { data: configuracion, error: errorConfiguracion } = await supabase
    .from('configuracion_facturacion_clientes')
    .select('regla')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (errorConfiguracion) return responderError(res, errorConfiguracion);
  const plazoDeLaPrestadora = configuracion?.regla?.dias_hasta_el_vencimiento ?? null;

  const hoy = new Date().toISOString().slice(0, 10);

  // Cada Cliente trae su Prestadora: es la que se escribe en su factura.
  // Con la llave maestra: la política restrictiva `oculta_pendientes_de_conformidad` de
  // `clientes` y de `pacientes` (`NOT pendiente_conformidad`) le esconde a todos los roles las
  // Clientes y los Pacientes pendientes de conformidad, que esta tanda facturaba. Se decide aparte.
  const { data: clientes, error: errorClientes } = await supabase
    .from('clientes')
    .select(`id, prestadora_id, dias_hasta_el_vencimiento, financiador_tipo, pagador_persona_id, pacientes(id, ${FICHA_NOMBRE})`)
    .eq('prestadora_id', prestadoraId)
    .is('deleted_at', null);
  if (errorClientes) return responderError(res, errorClientes);

  // Quién paga es una Ficha del Directorio de Personas. Su nombre se busca acá una sola vez, y de
  // acá sale la copia que se lleva cada factura. Con la maestra: la base abre `personas` a quien
  // tiene la acción de ver el Directorio, y generar las facturas no la pide.
  const pagadorIds = [...new Set((clientes || []).map((f) => f.pagador_persona_id).filter(Boolean))];
  const nombresDePagadores = new Map();
  if (pagadorIds.length > 0) {
    const { data: pagadores, error: errorPagadores } = await supabase
      .from('personas')
      .select('id, nombre_visible')
      .eq('prestadora_id', prestadoraId)
      .in('id', pagadorIds);
    if (errorPagadores) return responderError(res, errorPagadores);
    for (const p of pagadores || []) nombresDePagadores.set(p.id, p.nombre_visible);
  }

  const pacientes = conSusFichas((clientes || []).flatMap((f) => f.pacientes || []));
  const pacienteIds = pacientes.map((p) => p.id);
  const nombresDePacientes = new Map(pacientes.map((p) => [p.id, p.nombre]));

  let prestaciones = [];
  let paquetes = [];
  let itemsDePaquete = [];

  if (pacienteIds.length > 0) {
    const { data, error } = await db
      .from('prestaciones')
      .select('id, paciente_id, servicio_id, tipo_servicio, precio_final, vigente_desde, vigente_hasta')
      .eq('estado', 'vigente')
      .in('paciente_id', pacienteIds);
    if (error) return responderError(res, error);
    prestaciones = data || [];

    const { data: datosPaquetes, error: errorPaquetes } = await db
      .from('paquetes_prestaciones')
      .select('id, paciente_id, nombre, precio_paquete, estado')
      .in('paciente_id', pacienteIds);
    if (errorPaquetes) return responderError(res, errorPaquetes);
    paquetes = datosPaquetes || [];

    if (paquetes.length > 0) {
      const { data: datosItems, error: errorItems } = await db
        .from('paquete_prestacion_items')
        .select('paquete_id, prestacion_id')
        .in('paquete_id', paquetes.map((pq) => pq.id));
      if (errorItems) return responderError(res, errorItems);
      itemsDePaquete = datosItems || [];
    }
  }

  const { data: existentes, error: errorExistentes } = await db
    .from('facturas_cliente')
    .select('cliente_id')
    .eq('periodo', periodo);
  if (errorExistentes) return responderError(res, errorExistentes);
  const yaFacturadas = new Set((existentes || []).map((f) => f.cliente_id));

  const porPaciente = new Map();
  for (const p of prestaciones) {
    if (!porPaciente.has(p.paciente_id)) porPaciente.set(p.paciente_id, []);
    porPaciente.get(p.paciente_id).push(p);
  }
  const paquetesPorPaciente = new Map();
  for (const pq of paquetes) {
    if (!paquetesPorPaciente.has(pq.paciente_id)) paquetesPorPaciente.set(pq.paciente_id, []);
    paquetesPorPaciente.get(pq.paciente_id).push(pq);
  }

  let generadas = 0;
  let sinPrestaciones = 0;
  let sinVencimiento = 0;

  for (const cliente of clientes || []) {
    if (yaFacturadas.has(cliente.id)) continue;

    const vencimiento = vencimientoEscrito
      ? vencimientoDeLaTanda
      : vencimientoDe(hoy, plazoDePagoDe(plazoDeLaPrestadora, cliente.dias_hasta_el_vencimiento));

    if (!vencimiento) {
      sinVencimiento += 1;
      continue;
    }

    const suyos = (cliente.pacientes || []).map((p) => p.id);
    const renglones = armarLosRenglonesDeLaFactura({
      periodo,
      nombresDePacientes,
      prestaciones: suyos.flatMap((id) => porPaciente.get(id) || []),
      paquetes: suyos.flatMap((id) => paquetesPorPaciente.get(id) || []),
      itemsDePaquete,
    });

    if (renglones.length === 0) {
      sinPrestaciones += 1;
      continue;
    }

    const montoTotal = aDosDecimales(renglones.reduce((acc, r) => acc + r.monto, 0));

    const { data: factura, error: errorFactura } = await db
      .from('facturas_cliente')
      .insert({
        prestadora_id: cliente.prestadora_id,
        cliente_id: cliente.id,
        periodo,
        monto_total: montoTotal,
        // La emisión se escribe en vez de dejarla en el valor por defecto de la base: el plazo
        // de pago se cuenta desde este mismo día, y si uno lo pone la base y el otro el backend,
        // un cambio de día entre los dos daría un vencimiento corrido.
        fecha_emision: hoy,
        fecha_vencimiento: vencimiento,
        // A quién se le reclama se copia de la Ficha del cliente el día que se genera, y no se
        // mira más: una factura emitida no cambia, así que si mañana ese Cliente pasa a pagar por
        // sí misma, las viejas tienen que seguir diciendo a quién se le reclamaron. Vacío en la
        // Ficha del cliente se guarda vacío, que quiere decir el Cliente.
        financiador_tipo: cliente.financiador_tipo ?? null,
        financiador_nombre: nombresDePagadores.get(cliente.pagador_persona_id) ?? null,
      })
      .select('id, prestadora_id')
      .single();
    if (errorFactura) return responderError(res, errorFactura, 400);

    const { error: errorRenglones } = await db
      .from('facturas_cliente_items')
      .insert(renglones.map((r) => ({ ...r, prestadora_id: factura.prestadora_id, factura_id: factura.id })));

    if (errorRenglones) {
      await db.from('facturas_cliente').delete().eq('id', factura.id);
      return responderError(res, errorRenglones, 400);
    }

    generadas += 1;
  }

  res.json({ generadas, sinPrestaciones, sinVencimiento });
});

// ---------------------------------------------------------------------------------------
// Lo que emitió el software de facturación
// ---------------------------------------------------------------------------------------

/**
 * Anotar lo que se emitió por esta factura: el monto, el comprobante y el vencimiento.
 *
 * SE ANOTA A MANO Y TAMBIÉN LO VA A ESCRIBIR LA CONEXIÓN. Quien hoy factura por afuera —con el
 * software que sea, o hasta a mano— entra acá lo que emitió, y desde ese momento la cobranza se
 * mide contra ese número. El día que Careonys le pida la factura sola a un software de
 * facturación, lo que conteste se guarda por esta misma puerta.
 *
 * EL TIPO DE COMPROBANTE NO SE COMPARA CONTRA NINGUNA LISTA. Cómo se llama lo que se emitió
 * depende del país y lo sabe quien emite. Careonys lo guarda y lo muestra, nada más.
 *
 * SE PUEDE CORREGIR LO ANOTADO MIENTRAS SEA ESO: un dato mal tipeado. Lo que no se corrige por
 * acá es una factura que salió mal, que es otra cosa y tiene su propia puerta más abajo.
 */
panelCobrosRouter.put('/facturas/:facturaId/facturado', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const cuerpo = req.body || {};

  const problema = loQueEstaMalEnLoFacturado(cuerpo);
  if (problema) return res.status(400).json({ error: `Falta o está mal el dato: ${problema}` });

  const db = clienteDelPedido(req);
  let factura;
  try {
    factura = await facturaVisible(db, req.params.facturaId);
  } catch (e) {
    return responderError(res, e);
  }
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

  // Qué columnas quedan escritas —y que el vencimiento sólo se pise si quien emitió informa uno—
  // está en `utils/anotarLoFacturado.js`, que es por donde escriben también el archivo y lo que
  // informa el software de facturación.
  const { error } = await anotarLoFacturado(prestadoraId, factura.id, cuerpo);
  if (error) return responderError(res, error, 400);

  let saldo;
  try {
    saldo = await saldoDeLaFactura(db, factura.id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ saldo });
});

/**
 * Subir a mano el comprobante que emitió el software de facturación.
 *
 * POR QUÉ EXISTE, ADEMÁS DE LA PUERTA CONECTADA. Un software de facturación comprado no siempre
 * puede empujarle el papel a nadie, y hay Prestadoras que facturan sin ninguno conectado. Sin esta
 * puerta, el Cliente no tendría de dónde bajar la factura salvo que el facturador se conecte.
 *
 * EL ARCHIVO LLEGA CRUDO, no adentro de un formulario: es un solo archivo y no lo acompaña ningún
 * otro dato. Qué se comprueba —que sea un PDF de verdad, que no venga vacío, que no pese de más—
 * está en `utils/comprobanteDeLaFactura.js`, que es por donde entra también el comprobante que
 * llega por la puerta conectada.
 */
panelCobrosRouter.post(
  '/facturas/:facturaId/comprobante',
  requiereRolPanel,
  express.raw({ type: 'application/pdf', limit: '5mb' }),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;

    const problema = loQueEstaMalEnElComprobante(req.body);
    if (problema) return res.status(400).json({ error: problema });

    let factura;
    try {
      factura = await facturaVisible(clienteDelPedido(req), req.params.facturaId);
    } catch (e) {
      return responderError(res, e);
    }
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

    const { error } = await guardarComprobante({
      prestadoraId,
      facturaId: factura.id,
      clienteId: factura.cliente_id,
      bytes: req.body,
    });
    if (error) return responderError(res, error);

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------------------
// El ida y vuelta con el software de facturación, por archivo
// ---------------------------------------------------------------------------------------

/**
 * Lo que hay para facturar de un período: una fila por factura que todavía no tiene comprobante.
 *
 * POR QUÉ POR ARCHIVO. Cada software de facturación se conecta de una manera distinta, y una
 * conexión sólo se puede escribir con el manual de ese software delante. El archivo, en cambio,
 * lo lee y lo escribe cualquiera, así que esta vía sirve para todas las Prestadoras desde el
 * primer día y no queda vieja cuando alguna conecte el suyo: los datos que van y vienen son los
 * mismos, y están escritos una sola vez en `utils/intercambioDeFacturacion.js`.
 *
 * ACÁ SALEN LAS FILAS, NO EL ARCHIVO. Quien lo pide es el Panel, que lo arma con ese mismo
 * archivo compartido y lo baja. Así el backend no tiene que saber nada de planillas de cálculo.
 *
 * UNA FACTURA YA FACTURADA NO SALE. Lo que se manda a facturar es lo que todavía no se facturó;
 * volver a mandar lo emitido llevaría a emitirlo dos veces.
 */
panelCobrosRouter.get('/para-facturar', requiereRolPanel, async (req, res) => {
  const periodo = primerDiaDelPeriodo(req.query.periodo);
  if (!periodo) return res.status(400).json({ error: 'Falta el período, en formato AAAA-MM' });

  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('saldos_cliente')
    .select('*')
    .eq('periodo', periodo)
    .is('facturado_at', null)
    .order('fecha_emision', { ascending: true });
  if (error) return responderError(res, error);

  let nombres;
  try {
    nombres = await nombresDeClientes(req.usuarioPanel.prestadoraId, (data || []).map((s) => s.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json((data || []).map((s) => ({
    factura_id: s.factura_id,
    cliente: nombres.get(s.cliente_id) ?? '',
    financiador_tipo: s.financiador_tipo ?? '',
    financiador_nombre: s.financiador_nombre ?? '',
    periodo: String(s.periodo).slice(0, 7),
    moneda: s.moneda,
    monto_a_facturar: s.monto_total,
    fecha_vencimiento: s.fecha_vencimiento ?? '',
  })));
});

/**
 * Lo que el software de facturación emitió, llegado de a muchos.
 *
 * Es la misma puerta que la de anotar a mano, abierta para un lote: por cada fila se guardan los
 * tres datos de siempre. Contesta una por una qué pasó, porque quien sube un archivo necesita
 * saber exactamente cuál renglón no entró para corregir ese y no volver a subir todo.
 *
 * LO YA FACTURADO NO SE PISA. Si esa factura ya tiene comprobante anotado se contesta que ya
 * estaba y no se toca nada: una factura emitida no cambia, y si lo emitido salió mal la salida
 * es una corrección, que tiene su propia puerta. Volver a subir el mismo archivo, entonces, no
 * hace ningún daño.
 *
 * LAS FILAS LLEGAN TAL COMO SALIERON DEL ARCHIVO, y la traducción a lo que guarda la base la hace
 * el archivo compartido. Así el día que un software empuje estos mismos datos por una conexión
 * directa, entra por acá sin pasar por ninguna pantalla.
 */
panelCobrosRouter.post('/facturado/importar', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const filas = req.body?.filas;

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ error: 'El archivo no trae ninguna fila' });
  }
  if (filas.length > TOPE_DE_FILAS) {
    return res.status(400).json({ error: `Se leen hasta ${TOPE_DE_FILAS} filas por vez` });
  }

  const resultados = [];
  const yaVistas = new Set();

  for (let i = 0; i < filas.length; i += 1) {
    const facturado = loFacturadoDeLaFila(filas[i] || {});
    const renglon = { indice: i, factura_id: facturado.factura_id || null };

    // La factura se busca antes de decidir, y sólo si vale la pena preguntar. Quién es de quién
    // lo resuelve esta consulta: una factura de otra Prestadora no aparece, y entonces el renglón
    // se rechaza igual que uno que no existe.
    const yaVista = yaVistas.has(facturado.factura_id);
    let factura = null;
    if (!yaVista && esIdentificador(facturado.factura_id)) {
      const { data, error: errorFactura } = await facturaParaAnotar(prestadoraId, facturado.factura_id);
      if (errorFactura) return responderError(res, errorFactura);
      factura = data;
    }

    const decision = queHacerConLaFilaFacturada(facturado, { yaVista, factura });
    if (decision.resultado !== 'anotado') {
      resultados.push({ ...renglon, ...decision });
      continue;
    }

    const { error } = await anotarLoFacturado(prestadoraId, factura.id, facturado);
    if (error) return responderError(res, error, 400);

    yaVistas.add(facturado.factura_id);
    resultados.push({ ...renglon, resultado: 'anotado' });
  }

  res.json({
    anotadas: resultados.filter((r) => r.resultado === 'anotado').length,
    ya_facturadas: resultados.filter((r) => r.resultado === 'ya_facturada').length,
    rechazadas: resultados.filter((r) => r.resultado === 'rechazado').length,
    resultados,
  });
});


// ---------------------------------------------------------------------------------------
// Las correcciones de una factura ya emitida
// ---------------------------------------------------------------------------------------

/**
 * Anotar la corrección de una factura que salió mal.
 *
 * POR QUÉ NO SE ANULA NI SE EDITA LA FACTURA. Una factura emitida no se toca. Si se facturó de
 * más o de menos, quien emitió emite otro comprobante por la diferencia, y acá se anota: por
 * cuánto, para qué lado, con qué comprobante y por qué. La factura queda como está y el saldo
 * sale de la suma, igual que con los cobros.
 *
 * CÓMO SE LLAMA ESE COMPROBANTE NO ENTRA EN NINGUNA LISTA. Cambia de país en país y lo decide
 * quien emite. Careonys guarda el nombre como texto y lo único que mira es el sentido y el monto.
 *
 * EL MOTIVO ES OBLIGATORIO. Una corrección sin explicación no se puede revisar después, y lo que
 * se está moviendo es plata de un tercero.
 */
panelCobrosRouter.post('/facturas/:facturaId/correcciones', requiereRolPanel, async (req, res) => {
  const cuerpo = req.body || {};

  const problema = loQueEstaMalEnLaCorreccion(cuerpo);
  if (problema) return res.status(400).json({ error: `Falta o está mal el dato: ${problema}` });

  const db = clienteDelPedido(req);
  let factura;
  try {
    factura = await facturaVisible(db, req.params.facturaId);
  } catch (e) {
    return responderError(res, e);
  }
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

  // Con la maestra: la base no le da a `authenticated` permiso de alta en
  // `correcciones_factura_cliente`. La factura ya la dejó ver la credencial de quien pide, y la
  // Prestadora que se escribe es la de esa factura.
  const { data, error } = await supabase
    .from('correcciones_factura_cliente')
    .insert({
      prestadora_id: factura.prestadora_id,
      factura_id: factura.id,
      sentido: cuerpo.sentido,
      monto: aDosDecimales(cuerpo.monto),
      comprobante_tipo: String(cuerpo.comprobante_tipo).trim(),
      comprobante_numero: String(cuerpo.comprobante_numero ?? '').trim() || null,
      motivo: String(cuerpo.motivo).trim(),
      fecha: cuerpo.fecha ?? new Date().toISOString().slice(0, 10),
      registrada_por: req.usuarioPanel.id,
    })
    .select()
    .single();
  if (error) return responderError(res, error, 400);

  let saldo;
  try {
    saldo = await saldoDeLaFactura(db, factura.id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ correccion: data, saldo });
});

// ---------------------------------------------------------------------------------------
// Los cobros
// ---------------------------------------------------------------------------------------

/**
 * Anotar un cobro cargado en el Panel. Puede ser parcial: nada obliga a que cubra el total, y
 * varios cobros contra la misma factura es exactamente cómo se representa el pago en partes.
 */
panelCobrosRouter.post('/facturas/:facturaId/cobros', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const cuerpo = req.body || {};

  let mediosAdmitidos;
  try {
    mediosAdmitidos = await mediosDePagoDeLaPrestadora(prestadoraId, LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE);
  } catch (e) {
    return responderError(res, e);
  }

  const problema = loQueEstaMalEnElCobro(cuerpo, mediosAdmitidos);
  if (problema) return res.status(400).json({ error: problema });

  const db = clienteDelPedido(req);
  let factura;
  try {
    factura = await facturaVisible(db, req.params.facturaId);
  } catch (e) {
    return responderError(res, e);
  }
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

  const { data, error } = await db
    .from('cobros_cliente')
    .insert({
      prestadora_id: factura.prestadora_id,
      factura_id: factura.id,
      monto: aDosDecimales(cuerpo.monto),
      fecha_cobro: cuerpo.fecha_cobro ?? new Date().toISOString().slice(0, 10),
      medio: cuerpo.medio,
      origen: 'panel',
      referencia_externa: cuerpo.referencia_externa || null,
      observaciones: cuerpo.observaciones || null,
      registrado_por: req.usuarioPanel.id,
    })
    .select()
    .single();
  if (error) return responderError(res, error, 400);

  let saldo;
  try {
    saldo = await saldoDeLaFactura(db, factura.id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ cobro: data, saldo });
});

/**
 * Anular un cobro. No se borra: la fila queda con quién lo anuló, cuándo y por qué, y deja de
 * contar para el saldo. Una plata que desaparece sin rastro es indistinguible de una que nunca
 * existió, y con plata de un tercero eso es justo lo que no puede pasar.
 */
panelCobrosRouter.post('/cobros/:id/anular', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const motivo = String(req.body?.motivo ?? '').trim();
  if (!motivo) return res.status(400).json({ error: 'Hace falta decir por qué se anula el cobro' });

  const db = clienteDelPedido(req);
  const { data: cobro, error } = await db
    .from('cobros_cliente')
    .select('id, factura_id, estado')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!cobro) return res.status(404).json({ error: 'Cobro no encontrado' });
  if (cobro.estado === 'anulado') return res.status(400).json({ error: 'Este cobro ya figura anulado' });

  const { data, error: errorAnulacion } = await db
    .from('cobros_cliente')
    .update({
      estado: 'anulado',
      motivo_anulacion: motivo,
      anulado_por: req.usuarioPanel.id,
      anulado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cobro.id)
    .select()
    .single();
  if (errorAnulacion) return responderError(res, errorAnulacion);

  let saldo;
  try {
    saldo = await saldoDeLaFactura(db, cobro.factura_id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ cobro: data, saldo });
});

// ---------------------------------------------------------------------------------------
// La puerta de entrada para lo que viene de afuera
// ---------------------------------------------------------------------------------------

/**
 * Ubicar la factura que un cobro de afuera dice estar pagando.
 *
 * Se admiten dos formas de nombrarla, porque un sistema de afuera no siempre conoce el
 * identificador nuestro: o `factura_id` directo, o el Cliente más el período. La base contesta
 * sólo las facturas que quien pide puede ver.
 */
async function ubicarFactura(db, cobro) {
  if (cobro.factura_id) {
    const factura = await facturaVisible(db, cobro.factura_id);
    return { factura, motivo: factura ? null : 'No hay ninguna factura con ese identificador' };
  }

  const periodo = primerDiaDelPeriodo(cobro.periodo);
  if (!cobro.cliente_id || !periodo) {
    return { factura: null, motivo: 'Falta decir qué factura se está pagando: o el identificador, o el Cliente y el período' };
  }

  const { data, error } = await db
    .from('facturas_cliente')
    .select('id, prestadora_id, cliente_id, periodo, monto_total, moneda, estado, fecha_emision, fecha_vencimiento')
    .eq('cliente_id', cobro.cliente_id)
    .eq('periodo', periodo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { factura: data ?? null, motivo: data ? null : 'Ese Cliente no tiene factura en ese período' };
}

/**
 * Un lote de cobros que viene de afuera.
 *
 * Contesta siempre uno por uno: qué se registró, qué ya estaba (duplicado) y qué se rechazó y
 * por qué. Un renglón malo no tira abajo el lote entero, porque quien envía necesita saber
 * exactamente cuál no entró para corregir ese y no volver a mandar todo.
 *
 * La idempotencia la garantiza la base con un índice único sobre Prestadora + origen +
 * referencia externa. Acá se consulta antes para poder contestar "duplicado" en vez de un
 * error, pero la garantía de que no se sume plata dos veces no depende de esa consulta: si dos
 * envíos llegan a la vez, uno de los dos choca contra el índice y también se contesta
 * "duplicado".
 */
panelCobrosRouter.post('/entrada', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const { origen, cobros } = req.body || {};

  if (!ORIGENES_DE_AFUERA.includes(origen)) {
    return res.status(400).json({ error: 'Falta decir de dónde viene el lote' });
  }
  if (!Array.isArray(cobros) || cobros.length === 0) {
    return res.status(400).json({ error: 'El lote no trae ningún cobro' });
  }
  if (cobros.length > TOPE_DEL_LOTE) {
    return res.status(400).json({ error: `Un lote admite hasta ${TOPE_DEL_LOTE} cobros por vez` });
  }

  // Lo que ya entró antes con estas mismas referencias. Se pregunta una vez por el lote entero
  // y no una vez por renglón: un lote de quinientos serían quinientas consultas.
  const referencias = cobros.map((c) => c?.referencia_externa).filter((r) => typeof r === 'string' && r.length > 0);
  const db = clienteDelPedido(req);
  const yaEstaban = new Map();
  if (referencias.length > 0) {
    const { data, error } = await db
      .from('cobros_cliente')
      .select('id, referencia_externa, factura_id')
      .eq('origen', origen)
      .in('referencia_externa', [...new Set(referencias)]);
    if (error) return responderError(res, error);
    for (const c of data || []) yaEstaban.set(c.referencia_externa, c);
  }

  // La lista de medios se pide una vez por lote y no una vez por renglón, por el mismo motivo
  // que las referencias de arriba.
  let mediosAdmitidos;
  try {
    mediosAdmitidos = await mediosDePagoDeLaPrestadora(prestadoraId, LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE);
  } catch (e) {
    return responderError(res, e);
  }

  const resultados = [];
  const facturasTocadas = new Set();
  // Dentro del mismo lote también puede venir la misma referencia dos veces.
  const vistasEnEsteLote = new Set();

  for (let i = 0; i < cobros.length; i += 1) {
    const cobro = cobros[i] || {};
    const referencia = typeof cobro.referencia_externa === 'string' && cobro.referencia_externa.length > 0
      ? cobro.referencia_externa
      : null;
    const renglon = { indice: i, referencia_externa: referencia };

    if (referencia && (yaEstaban.has(referencia) || vistasEnEsteLote.has(referencia))) {
      resultados.push({ ...renglon, resultado: 'duplicado', cobro_id: yaEstaban.get(referencia)?.id ?? null });
      continue;
    }

    const problema = loQueEstaMalEnElCobro(cobro, mediosAdmitidos);
    if (problema) {
      resultados.push({ ...renglon, resultado: 'rechazado', motivo: problema });
      continue;
    }

    let ubicacion;
    try {
      ubicacion = await ubicarFactura(db, cobro);
    } catch (e) {
      return responderError(res, e);
    }
    if (!ubicacion.factura) {
      resultados.push({ ...renglon, resultado: 'rechazado', motivo: ubicacion.motivo });
      continue;
    }

    const { data, error } = await db
      .from('cobros_cliente')
      .insert({
        prestadora_id: ubicacion.factura.prestadora_id,
        factura_id: ubicacion.factura.id,
        monto: aDosDecimales(cobro.monto),
        fecha_cobro: cobro.fecha_cobro ?? new Date().toISOString().slice(0, 10),
        medio: cobro.medio,
        origen,
        referencia_externa: referencia,
        observaciones: cobro.observaciones || null,
        // Sin persona detrás: esto no lo cargó nadie, lo mandó un sistema. Poner un usuario
        // sería inventar un responsable.
        registrado_por: null,
      })
      .select('id, factura_id')
      .single();

    if (error) {
      // El choque contra el índice único es la otra mitad de la idempotencia, la que sirve
      // cuando dos envíos llegan al mismo tiempo. No es un error del que envía.
      const esDuplicado = error.code === '23505';
      // El motivo de un renglón rechazado sale de las frases de este archivo, nunca del texto
      // crudo de la base: ese texto nombra tablas, columnas y restricciones (CLAUDE.md §6), y
      // acá viajaría al navegador mezclado entre los motivos escritos a mano. El detalle queda
      // del lado del servidor, que es donde se lo mira cuando algo falla.
      if (!esDuplicado) console.error('Cobros, entrada de lote, renglón', i, '—', error.message);
      resultados.push({
        ...renglon,
        resultado: esDuplicado ? 'duplicado' : 'rechazado',
        motivo: esDuplicado ? undefined : 'No se pudo registrar este cobro',
      });
      continue;
    }

    if (referencia) vistasEnEsteLote.add(referencia);
    facturasTocadas.add(data.factura_id);
    resultados.push({ ...renglon, resultado: 'registrado', cobro_id: data.id });
  }

  // Los saldos que quedaron después del lote, para que quien envía pueda comprobar contra su
  // propio sistema sin tener que volver a preguntar.
  let saldos = [];
  if (facturasTocadas.size > 0) {
    const { data, error } = await db
      .from('saldos_cliente')
      .select('factura_id, monto_total, cobrado, saldo, estado, moneda, actualizado_en, origenes')
      .in('factura_id', [...facturasTocadas]);
    if (error) return responderError(res, error);
    saldos = data || [];
  }

  res.json({
    registrados: resultados.filter((r) => r.resultado === 'registrado').length,
    duplicados: resultados.filter((r) => r.resultado === 'duplicado').length,
    rechazados: resultados.filter((r) => r.resultado === 'rechazado').length,
    resultados,
    saldos,
  });
});
