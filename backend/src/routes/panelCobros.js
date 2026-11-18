import express, { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import {
  ORIGENES_DE_AFUERA,
  TOPE_DEL_LOTE,
  aDosDecimales,
  loQueEstaMalEnElCobro,
} from '../utils/cobrosDeCliente.js';
import {
  LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE,
  mediosDePagoDeLaPrestadora,
} from '../utils/mediosDePago.js';
import {
  loQueEstaMalEnLaCorreccion,
  loQueEstaMalEnLoFacturado,
  sigueLaCobranza,
} from '../utils/facturacionDeClientes.js';
import {
  TOPE_DE_FILAS,
  aQuienFacturarle,
  esIdentificador,
  loFacturadoDeLaFila,
  queHacerConLaFilaFacturada,
} from '../utils/intercambioDeFacturacion.js';
import { laCobranzaLaLlevaOtroSoftware } from '../utils/seguimientoDeLaCobranza.js';
import { anotarLoFacturado, facturaParaAnotar } from '../utils/anotarLoFacturado.js';
import { guardarComprobante, loQueEstaMalEnElComprobante } from '../utils/comprobanteDeLaFactura.js';
import {
  aNombreDeQuienSaleLaFactura,
  descuentosDeLaParte,
  etiquetaDelPeriodo,
  periodoEnteroDeLaParte,
  tramoNombrado,
  tramoPedido,
} from '../utils/facturaDelPeriodo.js';
import { generarFacturasDelTramo } from '../utils/generarFacturasDelTramo.js';
import { condicionDe } from '../utils/condicionesDelCliente.js';
import { CLASES_DE_DESCUENTO, descuentosDelPeriodo } from '../utils/descuentosDelPeriodo.js';
import { DATOS_PARA_FACTURAR } from '../utils/datosParaFacturar.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { anularPendiente } from '../utils/consentimientoPagador.js';
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
   pedido. Van con el trabajo de la Prestadora (`enLaPrestadora`), cada una con su motivo escrito
   al lado, las pocas lecturas y escrituras que la base no le abre a todos los roles que esta ruta
   deja pasar. */

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

/**
 * Los nombres de estos Clientes, para las listas que se muestran en pantalla.
 *
 * Se buscan aparte en vez de traerlos colgados de la factura, con la credencial de quien pide: un
 * Cliente que la base no le deja ver —el pendiente de conformidad— sale sin nombre.
 */
async function nombresDeClientes(db, ids) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await db
    .from('clientes')
    .select('id, personas!clientes_contratante_de_la_misma_prestadora(nombre_visible)')
    .in('id', unicos);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((f) => [f.id, f.personas?.nombre_visible ?? null]));
}

/**
 * A quién se le factura cada una de estas facturas, y el número de su Cliente.
 *
 * Cada factura es de un Servicio y sale a nombre de su Contratante —el del Servicio o, si no está
 * anotado, el del Cliente—, salvo que la Prestadora haya indicado que esos días sale a nombre del
 * Responsable de pagos. Si eso cambió en el medio del período, la factura ya salió partida en ese
 * día, así que lo que rige en su primer día rige para todos. Los datos de la persona se leen en
 * este momento y no se copian: lo que el facturador recibe es lo que esos datos dicen hoy.
 */
async function aQuienSeLeFactura(db, prestadoraId, facturaIds) {
  const resultado = new Map();
  const ids = [...new Set(facturaIds)];
  if (ids.length === 0) return resultado;

  const { data: facturas, error: e1 } = await db
    .from('facturas_cliente')
    .select('id, servicio_id, cliente_id, periodo')
    .in('id', ids);
  if (e1) throw new Error(e1.message);

  const servicioIds = [...new Set((facturas || []).map((f) => f.servicio_id).filter(Boolean))];
  const clienteIds = [...new Set((facturas || []).map((f) => f.cliente_id).filter(Boolean))];

  // Quién contrata y quién paga cada Servicio, con el trabajo de la Prestadora: la base se lo abre
  // sólo a quien tiene el permiso de lo comercial, y mandar a facturar lo hace también quien
  // coordina. Sólo las facturas que la base ya le dejó ver a quien pide.
  const [{ data: condiciones, error: e2 }, { data: tramos, error: e5 }, { data: clientes, error: e3 }] = await Promise.all([
    servicioIds.length
      ? enLaPrestadora(prestadoraId, 'a quién se le factura cada Servicio', (dbTrabajo) =>
          dbTrabajo
            .from('condiciones_comerciales_servicio')
            .select('servicio_id, contratante_persona_id')
            .in('servicio_id', servicioIds),
        )
      : Promise.resolve({ data: [], error: null }),
    servicioIds.length
      ? enLaPrestadora(prestadoraId, 'quién paga cada día de cada Servicio', (dbTrabajo) =>
          dbTrabajo
            .from('tramos_de_pagador_del_servicio')
            .select('servicio_id, rige_desde, rige_hasta, responsable_que_recibe_la_factura')
            .in('servicio_id', servicioIds),
        )
      : Promise.resolve({ data: [], error: null }),
    clienteIds.length
      ? db.from('clientes').select('id, numero_cliente, contratante_persona_id').in('id', clienteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  if (e5) throw new Error(e5.message);

  const servicioPorId = new Map((condiciones || []).map((s) => [s.servicio_id, s]));
  const clientePorId = new Map((clientes || []).map((c) => [c.id, c]));

  const personaDe = new Map();
  for (const f of facturas || []) {
    const s = servicioPorId.get(f.servicio_id);
    const c = clientePorId.get(f.cliente_id);
    const contratante = s?.contratante_persona_id || c?.contratante_persona_id || null;
    const tramosDelServicio = (tramos || []).filter((t) => t.servicio_id === f.servicio_id);
    personaDe.set(f.id, aNombreDeQuienSaleLaFactura(tramosDelServicio, f.periodo, contratante));
  }

  // Los datos del Contratante y del Responsable de pagos tampoco los alcanza quien coordina sin el
  // permiso, así que salen por el mismo camino.
  const personaIds = [...new Set([...personaDe.values()].filter(Boolean))];
  let fichas = new Map();
  if (personaIds.length) {
    const { data: personas, error: e4 } = await enLaPrestadora(prestadoraId, 'datos para facturar', (dbTrabajo) =>
      dbTrabajo.from('personas').select(DATOS_PARA_FACTURAR).in('id', personaIds),
    );
    if (e4) throw new Error(e4.message);
    fichas = new Map((personas || []).map((p) => [p.id, p]));
  }

  for (const f of facturas || []) {
    resultado.set(f.id, {
      numero_cliente: clientePorId.get(f.cliente_id)?.numero_cliente ?? '',
      ficha: fichas.get(personaDe.get(f.id)) ?? null,
    });
  }
  return resultado;
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
 * secreto con el que firma el otro software no se toca acá.
 */
panelCobrosRouter.get('/configuracion', requiereRolPanel, async (req, res) => {
  // Con el trabajo de la Prestadora, porque la base le abre `configuracion_facturacion_clientes`
  // sólo a la administración, y esta lectura la necesita también quien coordina.
  try {
    const { data, error } = await enLaPrestadora(
      req.usuarioPanel.prestadoraId,
      'lectura de quién lleva la cobranza',
      (dbTrabajo) =>
        dbTrabajo
          .from('configuracion_facturacion_clientes')
          .select('regla')
          .eq('prestadora_id', req.usuarioPanel.prestadoraId)
          .maybeSingle(),
    );
    if (error) return responderError(res, error);
    res.json({ sigue_la_cobranza: sigueLaCobranza(data?.regla) });
  } catch (e) {
    return responderError(res, e);
  }
});

panelCobrosRouter.get('/restricciones', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  // Con el trabajo de la Prestadora, porque la base le abre `restricciones_de_cobranza` sólo a la
  // administración, y quien coordina necesita saber qué Cliente quedó restringido para trabajar.
  let data;
  try {
    const respuesta = await enLaPrestadora(prestadoraId, 'lectura de restricciones de cobranza', (dbTrabajo) =>
      dbTrabajo
        .from('restricciones_de_cobranza')
        .select('id, cliente_id, restringida, motivo, origen, created_at')
        .eq('prestadora_id', prestadoraId)
        .order('created_at', { ascending: false }),
    );
    if (respuesta.error) return responderError(res, respuesta.error);
    data = respuesta.data;
  } catch (e) {
    return responderError(res, e);
  }

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
    nombres = await nombresDeClientes(clienteDelPedido(req), vigentes.map((a) => a.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  // Las restricciones se leyeron con el trabajo de la Prestadora, que alcanza a todos sus Clientes.
  // Se entregan sólo las de los Clientes que la base le deja ver a quien pide: un Coordinador no se
  // entera de la restricción ni del motivo de un Cliente que no coordina.
  res.json(vigentes
    .filter((a) => nombres.has(a.cliente_id))
    .map((a) => ({ ...a, cliente_nombre: nombres.get(a.cliente_id) ?? null })));
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
    nombres = await nombresDeClientes(db, (data || []).map((e) => e.cliente_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json((data || []).map((e) => ({ ...e, cliente_nombre: nombres.get(e.cliente_id) ?? null })));
});

// ---------------------------------------------------------------------------------------
// La baja de un Servicio con deuda
//
// La anota la base al dar la baja (`dar_de_baja_el_servicio`). Acá sólo se muestra, con el
// Contratante, a cuyo nombre sale la factura y que responde por el Servicio, y el Responsable de
// pagos, que es quien paga. Después se marca como visto.
// Ni la lectura ni la marca tocan la deuda: el reclamo es de créditos y cobranzas.
// ---------------------------------------------------------------------------------------

panelCobrosRouter.get('/avisos-baja-con-deuda', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('avisos_baja_servicio_con_deuda')
    .select('id, servicio_id, cliente_id, responsable_de_pagos_persona_id, contratante_persona_id, importe, moneda, dias_de_atraso, created_at, servicios(etiqueta)')
    .is('visto_at', null)
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  const personaIds = [...new Set((data || [])
    .flatMap((a) => [a.responsable_de_pagos_persona_id, a.contratante_persona_id])
    .filter(Boolean))];
  let personas = new Map();
  if (personaIds.length) {
    const { data: filas, error: e2 } = await db.from('personas').select('id, nombre_visible').in('id', personaIds);
    if (e2) return responderError(res, e2);
    personas = new Map((filas || []).map((p) => [p.id, p.nombre_visible]));
  }

  res.json((data || []).map(({ servicios, ...a }) => ({
    ...a,
    servicio_etiqueta: servicios?.etiqueta ?? null,
    responsable_de_pagos_nombre: personas.get(a.responsable_de_pagos_persona_id) ?? null,
    contratante_nombre: personas.get(a.contratante_persona_id) ?? null,
  })));
});

panelCobrosRouter.patch('/avisos-baja-con-deuda/:id/visto', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('avisos_baja_servicio_con_deuda')
    .update({ visto_at: new Date().toISOString(), visto_por: req.usuarioPanel.id })
    .eq('id', req.params.id)
    .is('visto_at', null)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return responderError(res, new ErrorConMotivo('no_encontrado'));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------------------
// Los saldos
// ---------------------------------------------------------------------------------------

/**
 * Los saldos de un tramo de fechas: lo facturado, lo cobrado, lo que falta, de dónde salió el
 * dato y de cuándo es. Entran las facturas cuyo período empieza en el tramo, que son las mismas
 * que genera ese tramo. El tramo llega como `desde` y `hasta`, o como el mes de antes, `periodo`.
 */
panelCobrosRouter.get('/saldos', requiereRolPanel, veElEstadoDeCuenta, async (req, res) => {
  const tramo = tramoPedido(req.query);
  if (!tramo) {
    return res.status(400).json({ error: 'Falta el período. Indique un mes, o las fechas desde y hasta, e intente nuevamente.' });
  }

  try {
    if (await laCobranzaLaLlevaOtroSoftware(req.usuarioPanel.prestadoraId)) return noSeCalculaAca(res);
  } catch (e) {
    return responderError(res, e);
  }

  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('saldos_cliente')
    .select('*')
    .gte('periodo', tramo.desde)
    .lte('periodo', tramo.hasta)
    .order('fecha_emision', { ascending: false });
  if (error) return responderError(res, error);

  let nombres;
  try {
    nombres = await nombresDeClientes(db, (data || []).map((s) => s.cliente_id));
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
  // Cuándo se guardó el comprobante que baja el Cliente. Va la fecha y no la ruta del archivo: la ruta
  // no la necesita ninguna pantalla, y lo que no viaja no se filtra.
  let factura;
  let items;
  try {
    nombres = await nombresDeClientes(db, [saldo.cliente_id]);
    factura = await facturaVisible(db, saldo.factura_id);
    items = await itemsDeLaFactura(prestadoraId, db, saldo.factura_id);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({
    ...saldo,
    cliente_nombre: nombres.get(saldo.cliente_id) ?? null,
    comprobante_subido_at: factura?.comprobante_subido_at ?? null,
    items,
    cobros: cobros || [],
    correcciones: correcciones || [],
  });
});

/**
 * Los ítems de una factura, en el orden en que se guardaron. Cada ítem de descuento lleva la clase
 * y el valor de su descuento, para que la pantalla lo nombre. Los descuentos son parte de las
 * condiciones comerciales, que la base le abre sólo a quien puede editarlas: se leen con el
 * trabajo de la Prestadora, igual que al generar la factura.
 */
async function itemsDeLaFactura(prestadoraId, db, facturaId) {
  const { data, error } = await db
    .from('facturas_cliente_items')
    .select('id, descripcion, cantidad, unidad, precio_unitario, monto, moneda, concepto, descuento_id')
    .eq('factura_id', facturaId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  const items = data || [];

  const descuentoIds = [...new Set(items.map((i) => i.descuento_id).filter(Boolean))];
  const descuentos = new Map();
  if (descuentoIds.length > 0) {
    const respuesta = await enLaPrestadora(prestadoraId, 'lectura de los descuentos de una factura', (dbTrabajo) =>
      dbTrabajo.from('descuentos_del_servicio').select('id, clase, valor, moneda').in('id', descuentoIds),
    );
    if (respuesta.error) throw new Error(respuesta.error.message);
    for (const d of respuesta.data || []) descuentos.set(d.id, { clase: d.clase, valor: Number(d.valor), moneda: d.moneda });
  }

  return items.map((i) => ({
    id: i.id,
    concepto: i.concepto ?? null,
    descripcion: i.descripcion,
    cantidad: i.cantidad === null ? null : Number(i.cantidad),
    unidad: i.unidad ?? null,
    precio_unitario: i.precio_unitario === null ? null : Number(i.precio_unitario),
    monto: Number(i.monto),
    moneda: i.moneda,
    descuento: i.descuento_id ? descuentos.get(i.descuento_id) ?? null : null,
  }));
}

/**
 * El período de cobro entero del que esta factura es una parte, con la frecuencia de su Servicio.
 * Se lee con el trabajo de la Prestadora, igual que al generar la factura.
 */
async function periodoEnteroDeLaFactura(prestadoraId, servicioId, parte) {
  const [regla, comercial] = await Promise.all([
    enLaPrestadora(prestadoraId, 'lectura de las condiciones de cobro', (dbTrabajo) =>
      dbTrabajo.from('configuracion_facturacion_clientes').select('regla').eq('prestadora_id', prestadoraId).maybeSingle(),
    ),
    enLaPrestadora(prestadoraId, 'lectura de la frecuencia de cobro del Servicio', (dbTrabajo) =>
      dbTrabajo.from('condiciones_comerciales_servicio').select('frecuencia_de_cobro').eq('servicio_id', servicioId).maybeSingle(),
    ),
  ]);
  if (regla.error) throw new Error(regla.error.message);
  if (comercial.error) throw new Error(comercial.error.message);
  return periodoEnteroDeLaParte(parte, condicionDe('frecuencia_de_cobro', regla.data?.regla ?? null, comercial.data));
}

/** Los motivos con que contesta `fijar_precio_de_item_adicional`, y el código de cada uno. */
const MOTIVOS_DEL_PRECIO_DEL_ITEM = { sin_permiso: 403, no_encontrado: 404, dato_invalido: 400 };

/**
 * Cambiar el precio unitario de un ítem adicional de una factura que todavía no se emitió.
 *
 * LA CUENTA SE HACE ACÁ Y LA BASE LA GUARDA ENTERA. El ítem cambia de monto, y con él el subtotal;
 * los descuentos de la factura se vuelven a calcular sobre el subtotal nuevo con la misma función
 * que los calculó al generarla, y la base guarda el ítem, los descuentos y el total en una sola
 * operación. Los descuentos que se recalculan son los que la factura ya tiene: el período no cambió,
 * así que no entra ni sale ninguno. Si la factura es una parte del período —porque en el medio
 * cambió el Responsable de pagos—, el descuento de importe fijo vuelve a ir en proporción a sus
 * días, igual que al generarla.
 *
 * LA BASE DECIDE SI SE PUEDE, con la sesión de quien pide: el permiso, que el ítem sea adicional y
 * de su Prestadora, y que la factura no esté emitida ni tenga comprobante. El cambio queda en el
 * registro de actividad con el precio anterior y el nuevo.
 */
panelCobrosRouter.put(
  '/facturas/:facturaId/items/:itemId/precio',
  requiereRolPanel,
  requierePermiso('editar_condiciones_comerciales_servicio'),
  async (req, res) => {
    const precio = Number(req.body?.precio);
    if (req.body?.precio === null || req.body?.precio === '' || !Number.isFinite(precio) || precio < 0) {
      return res.status(400).json({ error: 'dato_invalido', motivo: 'dato_invalido' });
    }
    const precioRedondeado = aDosDecimales(precio);
    const db = clienteDelPedido(req);

    try {
      const { data: factura, error: errorFactura } = await db
        .from('facturas_cliente')
        .select('id, servicio_id, periodo, periodo_hasta, moneda')
        .eq('id', req.params.facturaId)
        .maybeSingle();
      if (errorFactura) throw new Error(errorFactura.message);
      if (!factura) return res.status(404).json({ error: 'no_encontrado', motivo: 'no_encontrado' });

      const { data: items, error: errorItems } = await db
        .from('facturas_cliente_items')
        .select('id, cantidad, monto, concepto, descuento_id')
        .eq('factura_id', factura.id);
      if (errorItems) throw new Error(errorItems.message);

      const item = (items || []).find((i) => i.id === req.params.itemId);
      if (!item || item.concepto !== 'adicional') {
        return res.status(404).json({ error: 'no_encontrado', motivo: 'no_encontrado' });
      }

      // El subtotal nuevo: todos los ítems que no son descuento, con el editado a su precio nuevo.
      const subtotal = (items || [])
        .filter((i) => i.concepto !== 'descuento')
        .reduce((suma, i) => suma + (i.id === item.id ? aDosDecimales(Number(i.cantidad) * precioRedondeado) : Number(i.monto)), 0);

      // Los descuentos que la factura ya tiene, recalculados sobre el subtotal nuevo. Se les saca
      // el fin para que todos toquen el período: ya se decidió al generarla que lo tocaban.
      const descuentoIds = (items || []).filter((i) => i.concepto === 'descuento' && i.descuento_id).map((i) => i.descuento_id);
      const importes = {};
      if (descuentoIds.length > 0) {
        const { data: descuentos, error: errorDescuentos } = await db
          .from('descuentos_del_servicio')
          .select('id, clase, valor, moneda, vigente_desde, cargado_en')
          .in('id', descuentoIds);
        if (errorDescuentos) throw new Error(errorDescuentos.message);
        const periodo = { desde: String(factura.periodo).slice(0, 10), hasta: String(factura.periodo_hasta).slice(0, 10), orden: 1 };
        const periodoEntero = (descuentos || []).some((d) => d.clase === CLASES_DE_DESCUENTO.MONTO)
          ? await periodoEnteroDeLaFactura(req.usuarioPanel.prestadoraId, factura.servicio_id, periodo)
          : periodo;
        const resultado = descuentosDelPeriodo({
          descuentos: descuentosDeLaParte({
            descuentos: (descuentos || []).map((d) => ({
              ...d,
              vigente_desde: periodo.desde,
              cantidad_de_periodos: null,
              vigente_hasta: null,
              terminado_en: null,
            })),
            periodo: periodoEntero,
            parte: periodo,
          }),
          periodo,
          subtotal,
          moneda: factura.moneda,
        });
        // El que se queda sin saldo queda en cero: el ítem sigue, y la factura dice que no alcanzó.
        for (const id of descuentoIds) importes[id] = 0;
        for (const r of resultado.renglones) importes[r.descuento_id] = r.importe;
      }

      const { error } = await db.rpc('fijar_precio_de_item_adicional', {
        p_item: item.id,
        p_precio: precioRedondeado,
        p_descuentos: importes,
      });
      if (error) {
        const motivo = Object.keys(MOTIVOS_DEL_PRECIO_DEL_ITEM).find((m) => error.message === m);
        if (motivo) {
          console.error(`[${MOTIVOS_DEL_PRECIO_DEL_ITEM[motivo]}] ${req.method} ${req.originalUrl} — ${motivo}`);
          return res.status(MOTIVOS_DEL_PRECIO_DEL_ITEM[motivo]).json({ error: motivo, motivo });
        }
        throw new Error(error.message);
      }

      res.json({ items: await itemsDeLaFactura(req.usuarioPanel.prestadoraId, db, factura.id) });
    } catch (e) {
      return responderError(res, e);
    }
  },
);

// ---------------------------------------------------------------------------------------
// Las facturas del período
// ---------------------------------------------------------------------------------------

/**
 * Generar las facturas de un tramo de fechas: una por Servicio y por cada período de su
 * frecuencia de cobro que empiece en el tramo, ya terminado, y que todavía no tenga la suya.
 *
 * EL TRAMO llega como `{ desde, hasta }`, o como el mes de antes, `periodo: 'AAAA-MM'`. El período
 * de cada factura sale de la frecuencia del Servicio, y lo que se cobra, de su medición y del
 * trabajo anotado en las guardias completadas: la cuenta vive en `utils/facturaDelPeriodo.js` y
 * `utils/calcularLiquidacion.js`, del mismo lado que las facturas.
 *
 * UNA FACTURA SIN RENGLONES NO QUEDA. Si los renglones no entran, se borra la factura recién
 * creada: una factura con monto y sin detalle no se puede reclamar ni explicar, y como no tiene
 * ningún cobro todavía, borrarla no pierde nada.
 */
panelCobrosRouter.post('/facturas/generar', requiereRolPanel, async (req, res) => {
  const tramo = tramoPedido(req.body);
  if (!tramo) {
    return res.status(400).json({ error: 'Falta el período. Indique un mes, o las fechas desde y hasta, e intente nuevamente.' });
  }
  try {
    const cuenta = await generarFacturasDelTramo({
      req,
      prestadoraId: req.usuarioPanel.prestadoraId,
      tramo,
      vencimientoDeLaTanda: String(req.body?.fecha_vencimiento ?? '').slice(0, 10),
    });
    res.json(cuenta);
  } catch (e) {
    return responderError(res, e, e?.estado ?? 500);
  }
});

/** Los motivos con que contesta `cambiar_responsable_de_pagos`. Los códigos están en `ESTADO_POR_MOTIVO`. */
const MOTIVOS_DEL_CAMBIO_DE_PAGADOR = ['sin_permiso', 'no_encontrado', 'dato_invalido', 'cambio_de_pagador_con_factura_emitida'];
const TIPOS_DE_PAGADOR = ['cliente', 'obra_social', 'otro'];

/**
 * Cambiar el Responsable de pagos de un Servicio desde un día.
 *
 * LA FACTURA SALE A NOMBRE DEL CONTRATANTE, salvo que la Prestadora indique para ese Servicio, desde
 * ese día, que sale a nombre del Responsable de pagos (`factura_al_responsable`). La base guarda el
 * cambio con el día desde el que rige. Si el cambio cambia la persona a nombre de quien sale la
 * factura, la base rechaza el que caería sobre días de una factura ya emitida, con comprobante, con
 * cobros o con correcciones, y borra en la misma operación las facturas sin emitir que quedan con
 * días a nombre de dos personas; acá se vuelven a generar con la misma función que genera todas, y
 * salen partidas en el día del cambio. Un cambio que deja la factura a nombre del mismo no parte
 * ni rechaza nada.
 *
 * LA FIRMA DEL ANTERIOR SIGUE VALIENDO PARA SUS DÍAS. Lo que se anula es el documento que el
 * anterior tenía pendiente de firmar; el nuevo firma uno nuevo.
 */
panelCobrosRouter.put(
  '/servicios/:servicioId/responsable-de-pagos',
  requiereRolPanel,
  requierePermiso('editar_condiciones_comerciales_servicio'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    const cuerpo = req.body || {};
    const desde = String(cuerpo.desde ?? '').slice(0, 10);
    const personaId = cuerpo.persona_id ? String(cuerpo.persona_id) : null;
    const tipo = cuerpo.tipo ? String(cuerpo.tipo) : null;
    const facturaAlResponsable = cuerpo.factura_al_responsable === true;
    if (
      !tramoPedido({ desde, hasta: desde })
      || (tipo && !TIPOS_DE_PAGADOR.includes(tipo))
      || (cuerpo.factura_al_responsable !== undefined && typeof cuerpo.factura_al_responsable !== 'boolean')
      || (facturaAlResponsable && !personaId)
    ) {
      return responderError(res, new ErrorConMotivo('dato_invalido'));
    }

    try {
      const db = clienteDelPedido(req);
      const { data: borradas, error } = await db.rpc('cambiar_responsable_de_pagos', {
        p_servicio: req.params.servicioId,
        p_persona: personaId,
        p_tipo: tipo,
        p_desde: desde,
        p_factura_al_responsable: facturaAlResponsable,
      });
      if (error) {
        if (MOTIVOS_DEL_CAMBIO_DE_PAGADOR.includes(error.message)) throw new ErrorConMotivo(error.message, error.message);
        throw new Error(error.message);
      }

      // Las facturas que la base borró se vuelven a generar enteras, de a un período de cobro.
      let regeneradas = 0;
      const yaHechos = new Set();
      for (const fila of borradas || []) {
        const parte = { desde: String(fila.periodo).slice(0, 10), hasta: String(fila.periodo_hasta).slice(0, 10) };
        const tramo = await periodoEnteroDeLaFactura(prestadoraId, req.params.servicioId, parte);
        if (yaHechos.has(tramo.desde)) continue;
        yaHechos.add(tramo.desde);
        const cuenta = await generarFacturasDelTramo({ req, prestadoraId, tramo, servicioId: req.params.servicioId });
        regeneradas += cuenta.generadas;
      }

      // El documento pendiente de firmar de quien ya no es hoy el Responsable de pagos no corresponde.
      // Si el cambio rige desde un día que todavía no llegó, el de hoy sigue siendo el anterior.
      const { data: deHoy, error: errorDeHoy } = await db
        .from('tramos_de_pagador_del_servicio')
        .select('pagador_persona_id')
        .eq('servicio_id', req.params.servicioId)
        .eq('rige_hoy', true)
        .maybeSingle();
      if (errorDeHoy) throw new Error(errorDeHoy.message);
      const { data: pendientes, error: errorPendientes } = await db
        .from('consentimientos_pagador')
        .select('id, pagador_persona_id')
        .eq('servicio_id', req.params.servicioId)
        .eq('estado', 'pendiente_firma');
      if (errorPendientes) throw new Error(errorPendientes.message);
      for (const pendiente of pendientes || []) {
        if (pendiente.pagador_persona_id === (deHoy?.pagador_persona_id ?? null)) continue;
        await anularPendiente({ db, consentimientoId: pendiente.id, prestadoraId });
      }

      res.json({ ok: true, regeneradas });
    } catch (e) {
      return responderError(res, e, e?.estado ?? 500);
    }
  },
);

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
 * puede empujarle el comprobante a nadie, y hay Prestadoras que facturan sin ninguno conectado. Sin esta
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
  const tramo = tramoPedido(req.query);
  if (!tramo) {
    return res.status(400).json({ error: 'Falta el período. Indique un mes, o las fechas desde y hasta, e intente nuevamente.' });
  }

  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('saldos_cliente')
    .select('*')
    .gte('periodo', tramo.desde)
    .lte('periodo', tramo.hasta)
    .is('facturado_at', null)
    .order('fecha_emision', { ascending: true });
  if (error) return responderError(res, error);

  let nombres;
  let destinatarios;
  try {
    nombres = await nombresDeClientes(db, (data || []).map((s) => s.cliente_id));
    destinatarios = await aQuienSeLeFactura(db, req.usuarioPanel.prestadoraId, (data || []).map((s) => s.factura_id));
  } catch (e) {
    return responderError(res, e);
  }

  res.json((data || []).map((s) => ({
    factura_id: s.factura_id,
    numero_cliente: destinatarios.get(s.factura_id)?.numero_cliente ?? '',
    cliente: nombres.get(s.cliente_id) ?? '',
    ...aQuienFacturarle(destinatarios.get(s.factura_id)?.ficha ?? null),
    // Un mes calendario sale como siempre, `AAAA-MM`; otro período, con sus dos fechas.
    periodo: etiquetaDelPeriodo(s.periodo, s.periodo_hasta),
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

  // Con el trabajo de la Prestadora, porque la base no le da a `authenticated` permiso de alta en
  // `correcciones_factura_cliente`. La factura ya la dejó ver la credencial de quien pide, y la
  // Prestadora que se escribe es la de esa factura.
  let data;
  try {
    const respuesta = await enLaPrestadora(factura.prestadora_id, 'corrección de factura', (dbTrabajo) =>
      dbTrabajo
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
        .single(),
    );
    if (respuesta.error) return responderError(res, respuesta.error, 400);
    data = respuesta.data;
  } catch (e) {
    return responderError(res, e);
  }

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
    mediosAdmitidos = await mediosDePagoDeLaPrestadora(
      clienteDelPedido(req),
      prestadoraId,
      LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE,
    );
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
 *
 * EL PERÍODO puede ser un mes `AAAA-MM`, como hasta ahora, un día `AAAA-MM-DD` o `desde/hasta`. Se
 * buscan las facturas del Cliente cuyo período se superpone con ése, y si viene `servicio_id`,
 * sólo las de ese Servicio. Como un Cliente puede tener varios Servicios y varios períodos en un
 * mismo mes, sólo se acepta si queda exactamente una: elegir entre dos sería adivinar a cuál se
 * le está pagando.
 */
async function ubicarFactura(db, cobro) {
  if (cobro.factura_id) {
    const factura = await facturaVisible(db, cobro.factura_id);
    return { factura, motivo: factura ? null : 'No hay ninguna factura con ese identificador' };
  }

  const tramo = tramoNombrado(cobro.periodo);
  if (!cobro.cliente_id || !tramo) {
    return { factura: null, motivo: 'Falta decir qué factura se está pagando: o el identificador, o el Cliente y el período' };
  }

  let consulta = db
    .from('facturas_cliente')
    .select('id, prestadora_id, cliente_id, servicio_id, periodo, periodo_hasta, monto_total, moneda, estado, fecha_emision, fecha_vencimiento')
    .eq('cliente_id', cobro.cliente_id)
    .lte('periodo', tramo.hasta)
    .gte('periodo_hasta', tramo.desde);
  if (cobro.servicio_id) consulta = consulta.eq('servicio_id', cobro.servicio_id);
  const { data, error } = await consulta.limit(2);
  if (error) throw new Error(error.message);
  const encontradas = data || [];
  if (encontradas.length === 0) return { factura: null, motivo: 'Ese Cliente no tiene factura en ese período' };
  if (encontradas.length > 1) {
    return {
      factura: null,
      motivo: 'Ese Cliente tiene más de una factura en ese período: indique el identificador de la factura o el Servicio',
    };
  }
  return { factura: encontradas[0], motivo: null };
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
    mediosAdmitidos = await mediosDePagoDeLaPrestadora(
      clienteDelPedido(req),
      prestadoraId,
      LISTA_DE_MEDIOS_DE_PAGO_DEL_CLIENTE,
    );
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
