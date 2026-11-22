import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido } from '../db/connection.js';
import { requierePermiso } from '../utils/permisos.js';
import { horasRealesDelTurnoGuardia } from '../utils/horasTrabajadas.js';
import { zonaDeLaPrestadora } from '../utils/relojDeLaPrestadora.js';
import { resolverEscalasVigentes } from '../utils/escalasLegales.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { responderError } from '../utils/errorConMotivo.js';
import { bordesDelPeriodo, calcularLiquidacion, esPeriodoValido, primerDia, ultimoDia } from '../utils/calcularLiquidacion.js';
import { diaCorrido, frecuenciaDePagoDe, periodosQueCierranEn } from '../utils/frecuenciaDePago.js';
import { filasDelLegajoPorAsistente, tramosDelLegajoEnElPeriodo } from '../utils/valorDelLegajoEnLaFecha.js';
import {
  LISTA_DE_MEDIOS_DE_PAGO_AL_ASISTENTE,
  mediosDePagoDeLaPrestadora,
} from '../utils/mediosDePago.js';

// La cuenta de cuánto se le paga a alguien por un mes ya no vive acá: la comparte con el
// Simulador de Vínculo, que proyecta esa misma cuenta bajo los dos tipos de vínculo. El punto
// único de verdad está en el Panel y de este lado hay una copia generada
// (`scripts/copias_entre_apps.mjs`). Se vuelven a exportar porque las pruebas de esta ruta las
// llaman desde acá, que es donde se usan.
export { bordesDelPeriodo, calcularLiquidacion, esPeriodoValido, primerDia, ultimoDia };

/* Lo que se le liquida a cada Asistente en un mes, guardado.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO (pendiente #126). La pantalla de pagos hacía la cuenta en el
   momento, cada vez que se abría, con el valor hora que el Legajo del Asistente tuviera ESE día. O sea que
   corregir hoy el valor hora de alguien reescribía lo que se le pagó en marzo, y no había
   dónde anotar "este mes ya se pagó". Acá la cuenta se hace UNA vez y queda escrita.

   LA IDEA DE FONDO: una liquidación es una foto. Se saca con los valores del día y no se
   vuelve a calcular. Por eso cada renglón guarda el nombre del concepto y el valor con el
   que se hizo la cuenta, copiados — leer un mes viejo nunca vuelve al catálogo, que pudo
   haber cambiado desde entonces.

   LO QUE NO ES: un comprobante fiscal. El producto no emite facturas ni notas y no está
   previsto que lo haga (CLAUDE.md §7 regla 14). Esto es la cuenta interna de qué se le pagó
   a quién; el comprobante con validez impositiva lo hace la Prestadora por fuera. Por eso no hay
   tipo de comprobante, ni punto de venta, ni numeración, ni impuestos discriminados.

   LO QUE TAMPOCO HACE: inventar un número. Ningún porcentaje ni monto legal está escrito
   acá adentro (regla 10). Los conceptos los arma cada Prestadora, y el que responde a una
   escala legal se resuelve contra `escalas_legales` a la fecha del período; si esa escala no
   está cargada, el concepto no entra y se avisa. Nunca se estima.

   NADA DE PLATA EN LOS REGISTROS NI EN LA DIRECCIÓN. Las remuneraciones son dato sensible
   (CLAUDE.md §6): no se loguean, no viajan por la URL. El período sí va en la URL porque es
   un mes, no un importe.

   CON LA CREDENCIAL DE QUIEN PIDE. Todo entra a la base con `clienteDelPedido(req)`: la base
   sabe quién pide y le contesta sólo lo de su Prestadora, así que ninguna consulta lleva el
   filtro de la Prestadora de la sesión. El Asistente pendiente de conformidad no lo devuelve la
   base, y no se liquida hasta que se conforme. */

export const panelLiquidacionesRouter = Router();

// Los turnos de guardia cerrados son las únicas que se pagan: una programada todavía no pasó y una
// cancelada no se hizo. Es el mismo criterio que usa la pantalla de pagos.
const ESTADO_HECHA = 'completada';

// Leer remuneraciones exige el mismo permiso con el que ya se leen los importes del Legajo
// del Asistente; escribir, además, ser de la administración. Es la misma pareja de
// condiciones que las reglas de acceso de la base aplican a estas tres tablas.
const PERMISO_LECTURA = 'ver_pagos_asistente';

const SIGNOS = ['suma', 'resta'];
const UNIDADES_CONCEPTO = ['monto_fijo_mensual', 'porcentaje', 'monto_por_hora'];
const ORIGENES_VALOR = ['propio', 'escala_legal'];

// PostgREST corta cualquier respuesta a mil filas. Un mes de guardias de una Prestadora
// mediana pasa ese número sin esfuerzo, y la liquidación que saliera de una lista cortada
// pagaría de menos sin que nadie se entere. Se pide de a mil hasta que no venga más nada.
const TAMANO_PAGINA = 1000;

async function traerPaginado(armarConsulta) {
  const todas = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data || []));
    if (!data || data.length < TAMANO_PAGINA) return todas;
  }
}

// Tocar la plata de una persona es de la administración de la Prestadora, no de cualquiera
// que pueda mirarla. Se contesta con el mismo texto que el permiso, porque desde afuera es
// la misma respuesta: esta acción no está habilitada.
const soloAdministracion = exigirAdministracion('La Prestadora no habilitó esta acción');

// ---------------------------------------------------------------------------------------
// Las cuentas, aparte de las rutas
//
// Todo lo que sigue son funciones sin base de datos adentro: entran datos, sale el
// resultado. Están así para que se puedan probar sin levantar nada y, sobre todo, para que
// la cuenta se pueda leer de corrido sin tener que seguir consultas por el medio.
// ---------------------------------------------------------------------------------------

/**
 * Si el vínculo de esa persona estaba en pie en algún momento del período que se liquida.
 *
 * Hace falta porque quien cobra por semana cobra los días que estuvo aunque no haya hecho
 * ningún turno de guardia: sin este control, al generar un período anterior a su ingreso le saldría
 * una liquidación de un trabajo que nunca hizo. Las fechas son de tipo `date`,
 * o sea texto `AAAA-MM-DD`, que se compara igual que un número.
 */
/**
 * Las dos fechas que se pidieron, o nada si no sirven.
 *
 * Llegan como `{ desde, hasta }`, en el cuerpo o en la dirección. Un mes escrito `AAAA-MM`
 * sigue valiendo y quiere decir del primero al último día de ese mes.
 */
export function tramoPedido(pedido) {
  const candidato = pedido && typeof pedido === 'object' && 'desde' in pedido
    ? { desde: pedido.desde, hasta: pedido.hasta }
    : pedido && typeof pedido === 'object'
      ? pedido.periodo
      : pedido;
  if (!esPeriodoValido(candidato)) return null;
  const { desde, hasta } = bordesDelPeriodo(candidato);
  return { desde, hasta };
}

const MENSAJE_TRAMO_INVALIDO = 'Faltan las dos fechas del tramo, en formato AAAA-MM-DD, y la primera no puede ser posterior a la segunda';

// Un mes tiene a lo sumo treinta y un días: el período que cierra el primer día del tramo
// empezó, como mucho, treinta días antes.
const DIAS_ANTES_DEL_TRAMO = 30;

export function vinculoVigenteEnElPeriodo(asistente, periodo) {
  const { desde, hasta } = bordesDelPeriodo(periodo);
  if (asistente.fecha_alta && asistente.fecha_alta > hasta) return false;
  if (asistente.fecha_baja && asistente.fecha_baja < desde) return false;
  return true;
}

/**
 * Cuántos turnos de guardia y cuántas horas hizo cada Asistente en el mes.
 *
 * ATENCIÓN antes de tocar esto: se cuenta UNA FILA POR TURNO DE GUARDIA, a propósito, y no se cruza
 * con la lista de Pacientes de cada turno de guardia. Desde que un mismo turno de guardia puede cubrir a
 * varias personas (un solo turno de guardia en una casa donde viven dos), la tentación es
 * "completar" la cuenta uniéndola con `turno_guardia_pacientes`. No se hace: si se hiciera, una
 * turno de guardia de ocho horas para dos Pacientes aparecería dos veces y el Asistente cobraría
 * dieciséis horas por ocho trabajadas.
 *
 * Al Asistente se le pagan las horas enteras, una sola vez, atienda a uno o a cinco. El
 * reparto entre Pacientes es la otra cuenta, la de los informes de obra social, y vive en
 * `utils/horasDeTurnoGuardia.js`.
 *
 * LAS HORAS SON LAS TRABAJADAS, no las programadas: salen de la llegada y el cierre que marcó el
 * Asistente, con la cuenta de `utils/horasTrabajadas.js` y la regla de pago de la Prestadora, que
 * decide si se paga la llegada antes de hora, si se descuenta la llegada tarde y la salida antes
 * de hora, y si se paga el tiempo después del fin. Las horas extra van aparte porque se pagan a
 * otro valor. Cada turno de guardia deja además su renglón en `detalle`, que se guarda con la
 * liquidación para que se pueda ver de dónde salió cada hora.
 */
export function acumularTurnosGuardia(turnos_guardia, zona, reglaDePago) {
  const porAsistente = new Map();
  for (const g of turnos_guardia) {
    if (g.estado !== ESTADO_HECHA) continue;
    const acumulado = porAsistente.get(g.asistente_id) || { turnos_guardia: 0, horas: 0, horasExtra: 0, minutos: 0, minutosExtra: 0, detalle: [], sinMarca: 0 };
    const renglon = horasRealesDelTurnoGuardia(g, zona, reglaDePago);
    acumulado.turnos_guardia += 1;
    acumulado.minutos += renglon.minutos;
    acumulado.minutosExtra += renglon.minutos_extra;
    acumulado.horas = acumulado.minutos / 60;
    acumulado.horasExtra = acumulado.minutosExtra / 60;
    if (renglon.sin_marca) acumulado.sinMarca += 1;
    acumulado.detalle.push(renglon);
    porAsistente.set(g.asistente_id, acumulado);
  }
  for (const acumulado of porAsistente.values()) {
    acumulado.detalle.sort((a, b) => a.programado_desde.localeCompare(b.programado_desde));
  }
  return porAsistente;
}

/**
 * Qué escala legal rige cada tipo durante todo el mes que se liquida.
 *
 * La vigencia no se decide acá: la decide `resolverEscalasVigentes`, que es el punto único
 * de verdad y vive en el Panel (copiado a `utils/escalasLegales.js`, ver
 * `scripts/copias_entre_apps.mjs`). Acá solo se le pregunta dos veces, por el primer día y
 * por el último, porque una liquidación no es un hecho de un día: es un mes entero. Si las
 * dos respuestas no son la misma fila, la escala cambió en la mitad del período y no hay
 * forma de saber cuál corresponde sin inventar un prorrateo — así que ese concepto queda
 * afuera y se avisa (regla 10). Lo mismo si la única fila vigente es de una categoría de
 * convenio: un concepto apunta a un tipo de escala, no a una categoría, y elegirle una
 * sería adivinar.
 */
export function escalasEstablesDelPeriodo(filasEscalas, periodo, jurisdiccion) {
  const { desde, hasta } = bordesDelPeriodo(periodo);
  const alEmpezar = resolverEscalasVigentes(filasEscalas, desde, jurisdiccion);
  const alTerminar = resolverEscalasVigentes(filasEscalas, hasta, jurisdiccion);

  const sinCategoria = (resueltas, tipo) =>
    [...resueltas.values()].find((f) => f.tipo === tipo && !f.categoria) || null;

  const porTipo = new Map();
  for (const fila of alTerminar.values()) {
    if (fila.categoria) continue;
    const alPrincipio = sinCategoria(alEmpezar, fila.tipo);
    if (!alPrincipio || alPrincipio.vigencia_desde !== fila.vigencia_desde) continue;
    porTipo.set(fila.tipo, fila);
  }
  return porTipo;
}

// ---------------------------------------------------------------------------------------
// El catálogo de conceptos
// ---------------------------------------------------------------------------------------

/**
 * Qué le falta o qué está mal en un concepto que llega de afuera.
 *
 * La base tiene las mismas reglas escritas como restricciones y no dependemos de esto para
 * que se cumplan; esto existe para contestar con una frase entendible en vez de con el
 * mensaje crudo de Postgres.
 */
function loQueEstaMalEnElConcepto(cuerpo) {
  if (!cuerpo.nombre || !String(cuerpo.nombre).trim()) return 'El concepto necesita un nombre';
  if (!SIGNOS.includes(cuerpo.signo)) return 'El concepto tiene que sumar o restar';
  if (!UNIDADES_CONCEPTO.includes(cuerpo.unidad)) return 'La unidad del concepto no es una de las previstas';
  if (!ORIGENES_VALOR.includes(cuerpo.origen_valor)) return 'El valor del concepto sale de la Prestadora o de una escala legal';
  if (cuerpo.origen_valor === 'propio' && (cuerpo.valor === null || cuerpo.valor === undefined || Number.isNaN(Number(cuerpo.valor)))) {
    return 'Un concepto propio de la Prestadora necesita su valor';
  }
  if (cuerpo.origen_valor === 'escala_legal' && (!cuerpo.escala_tipo || !String(cuerpo.escala_tipo).trim())) {
    return 'Un concepto que sale de una escala legal necesita decir de qué escala';
  }
  return null;
}

/**
 * Los campos de un concepto, tal como se guardan.
 *
 * La moneda no se recibe nunca de afuera: la completa la base con la de la Prestadora
 * (`fn_completar_moneda`, punto único de verdad de la regla 14), y solo cuando el concepto
 * es plata propia. Un porcentaje no lleva moneda y uno que sale de una escala la trae de la
 * escala, así que en esos dos casos tiene que quedar en nulo o la fila no entra.
 */
function camposDelConcepto(cuerpo) {
  const esPropio = cuerpo.origen_valor === 'propio';
  return {
    nombre: String(cuerpo.nombre).trim(),
    signo: cuerpo.signo,
    unidad: cuerpo.unidad,
    origen_valor: cuerpo.origen_valor,
    valor: esPropio ? Number(cuerpo.valor) : null,
    escala_tipo: esPropio ? null : String(cuerpo.escala_tipo).trim(),
    activo: cuerpo.activo ?? true,
    orden: cuerpo.orden ?? 100,
  };
}

panelLiquidacionesRouter.get('/conceptos', requiereRolPanel, requierePermiso(PERMISO_LECTURA), async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('conceptos_liquidacion')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) return responderError(res, error);
  res.json(data);
});

panelLiquidacionesRouter.post('/conceptos', requiereRolPanel, requierePermiso(PERMISO_LECTURA), soloAdministracion, async (req, res) => {
  const problema = loQueEstaMalEnElConcepto(req.body || {});
  if (problema) return res.status(400).json({ error: problema });

  // La fila nace con la Prestadora que la base deja ver a quien pide, no con un dato de la sesión.
  const db = clienteDelPedido(req);
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('id')
    .eq('id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (errorPrestadora) return responderError(res, errorPrestadora);
  if (!prestadora) return res.status(404).json({ error: 'Prestadora no encontrada' });

  const { data, error } = await db
    .from('conceptos_liquidacion')
    .insert({ prestadora_id: prestadora.id, ...camposDelConcepto(req.body) })
    .select()
    .single();
  if (error) return responderError(res, error, 400);
  res.json(data);
});

panelLiquidacionesRouter.patch('/conceptos/:id', requiereRolPanel, requierePermiso(PERMISO_LECTURA), soloAdministracion, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: actual, error: errorLectura } = await db
    .from('conceptos_liquidacion')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (errorLectura) return responderError(res, errorLectura);
  if (!actual) return res.status(404).json({ error: 'Concepto no encontrado' });

  // Un concepto no se borra nunca: dar de baja es `activo: false`. Borrarlo dejaría a los
  // renglones ya liquidados apuntando al vacío, y esos renglones son la explicación de un
  // pago que ya se hizo.
  const cuerpo = { ...actual, ...req.body };
  const problema = loQueEstaMalEnElConcepto(cuerpo);
  if (problema) return res.status(400).json({ error: problema });

  const campos = camposDelConcepto(cuerpo);

  // La moneda la completa un disparador que solo corre al insertar. Si la edición convierte
  // un porcentaje en un monto propio (o al revés), hay que recalcularla acá o la fila choca
  // contra su propia restricción.
  let moneda = actual.moneda;
  const deberiaTenerMoneda = campos.unidad !== 'porcentaje' && campos.origen_valor === 'propio';
  if (deberiaTenerMoneda && !moneda) {
    const { data: prestadora } = await db
      .from('prestadoras')
      .select('moneda')
      .eq('id', actual.prestadora_id)
      .maybeSingle();
    moneda = prestadora?.moneda ?? null;
  } else if (!deberiaTenerMoneda) {
    moneda = null;
  }

  const { data, error } = await db
    .from('conceptos_liquidacion')
    .update({ ...campos, moneda, updated_at: new Date().toISOString() })
    .eq('id', actual.id)
    .select()
    .single();
  if (error) return responderError(res, error, 400);
  res.json(data);
});

// ---------------------------------------------------------------------------------------
// Las liquidaciones
// ---------------------------------------------------------------------------------------

/** Los nombres de estos Asistentes, para las listas que se muestran en pantalla. */
async function nombresDeAsistentes(db, ids) {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from('asistentes')
    .select('id, nombre')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((a) => [a.id, a.nombre]));
}

panelLiquidacionesRouter.get('/', requiereRolPanel, requierePermiso(PERMISO_LECTURA), async (req, res) => {
  const tramo = tramoPedido(req.query);
  if (!tramo) return res.status(400).json({ error: MENSAJE_TRAMO_INVALIDO });

  // Se muestran las liquidaciones cuyo período CIERRA entre las dos fechas: son exactamente las
  // que genera el botón con esas mismas fechas, así que lo que se ve es lo que se generó.
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('liquidaciones_asistente')
    .select('*')
    .gte('periodo_hasta', tramo.desde)
    .lte('periodo_hasta', tramo.hasta)
    .order('periodo_desde', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);

  const nombres = await nombresDeAsistentes(db, (data || []).map((l) => l.asistente_id));
  res.json((data || []).map((l) => ({ ...l, asistente_nombre: nombres.get(l.asistente_id) ?? null })));
});

panelLiquidacionesRouter.post('/generar', requiereRolPanel, requierePermiso(PERMISO_LECTURA), soloAdministracion, async (req, res) => {
  const tramo = tramoPedido(req.body?.periodo);
  if (!tramo) return res.status(400).json({ error: MENSAJE_TRAMO_INVALIDO });

  const db = clienteDelPedido(req);
  const { desde, hasta } = tramo;
  // El período más largo que puede cerrar adentro del tramo es un mes, que puede haber empezado
  // hasta treinta días antes del primer día pedido. Se lee desde ahí.
  const lecturaDesde = diaCorrido(desde, -DIAS_ANTES_DEL_TRAMO);

  // Las liquidaciones nacen con la Prestadora que la base deja ver a quien pide.
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('id, pais, moneda')
    .eq('id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (errorPrestadora) return responderError(res, errorPrestadora);
  if (!prestadora) return res.status(404).json({ error: 'Prestadora no encontrada' });

  // Las marcas de llegada y cierre son momentos exactos, y el horario programado es de la zona
  // horaria de la Prestadora: sin zona no hay forma de compararlos, y no se adivina.
  let zona;
  try {
    zona = await zonaDeLaPrestadora(db, prestadora.id);
  } catch (errorZona) {
    return responderError(res, errorZona);
  }

  // Cómo paga esta Prestadora lo que no depende de una persona sola, incluso cómo se cuentan las
  // horas de cada turno de guardia contra sus marcas. Que la fila no exista no es un error: es la
  // configuración de fábrica.
  const { data: filaPago, error: errorConfigPago } = await db
    .from('configuracion_pago_asistentes')
    .select('regla, frecuencia_pago')
    .maybeSingle();
  if (errorConfigPago) return responderError(res, errorConfigPago);
  const reglaDePago = filaPago?.regla ?? {};
  const frecuenciaDeLaPrestadora = filaPago?.frecuencia_pago ?? {};

  // Se traen los turnos de guardia desde el primer día que puede tener un período que cierra en el
  // tramo. Cada período se queda después con los suyos. Sólo los de prestación directa: en la
  // intermediación al Asistente no le paga la Prestadora sino el Cliente, y ese turno de guardia
  // no entra en esta liquidación.
  const turnos_guardia = await traerPaginado(() =>
    db
      .from('turnos_guardia')
      .select('id, fecha, estado, hora_inicio, hora_fin, dias_hasta_el_fin, checkin_at, checkout_at, asistente_id')
      .eq('canal_modalidad', 'directa')
      .gte('fecha', lecturaDesde)
      .lte('fecha', hasta)
      .not('asistente_id', 'is', null)
      .order('id', { ascending: true })
  );
  const acumuladoDelTramo = acumularTurnosGuardia(turnos_guardia, zona, reglaDePago);

  // La relación laboral vive en su propia tabla, con permiso propio; la liquidación la recibe
  // como un dato más del Asistente.
  const asistentes = (await traerPaginado(() =>
    db
      .from('asistentes')
      .select('id, nombre, estado, relacion_laboral_asistente(relaciones_laborales(nombre)), fecha_alta, fecha_baja')
      .is('deleted_at', null)
      .order('nombre', { ascending: true })
  )).map(({ relacion_laboral_asistente: suRelacion, ...asistente }) => ({
    ...asistente,
    relaciones_laborales: (Array.isArray(suRelacion) ? suRelacion[0] : suRelacion)?.relaciones_laborales ?? null,
  }));

  // Lo que cobra cada uno vive en su propia tabla, separada del Legajo del Asistente justamente porque las
  // reglas de acceso de la base filtran filas y no columnas.
  // Cada turno de guardia se paga con el valor que regía el día de ese turno, así que además de
  // la fila vigente se lee la historia. Sólo hace falta la que todavía regía al empezar el tramo
  // leído: lo que terminó antes no paga ningún turno de los que se liquidan.
  const remuneraciones = await traerPaginado(() =>
    db
      .from('remuneraciones_asistente')
      .select('asistente_id, unidad_medicion, valor_hora, valor_turno_guardia, valor_semana, valor_hora_extra, moneda, frecuencia_pago, rige_desde')
      .order('asistente_id', { ascending: true })
  );
  const anteriores = await traerPaginado(() =>
    db
      .from('remuneraciones_asistente_anteriores')
      .select('asistente_id, unidad_medicion, valor_hora, valor_turno_guardia, valor_semana, valor_hora_extra, moneda, rige_desde')
      .gte('rige_hasta', lecturaDesde)
      .order('asistente_id', { ascending: true })
      .order('rige_desde', { ascending: true })
  );
  const pagoPorAsistente = new Map(remuneraciones.map((r) => [r.asistente_id, r]));
  const filasDelLegajo = filasDelLegajoPorAsistente(remuneraciones, anteriores);

  const { data: conceptos, error: errorConceptos } = await db
    .from('conceptos_liquidacion')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (errorConceptos) return responderError(res, errorConceptos);

  // Las escalas legales son contenido curado por CeltaTech por país, nunca una decisión de
  // una Prestadora: por eso el filtro es por jurisdicción y no por `prestadora_id`.
  const { data: filasEscalas, error: errorEscalas } = await db
    .from('escalas_legales')
    .select('*')
    .eq('jurisdiccion', prestadora.pais);
  if (errorEscalas) return responderError(res, errorEscalas);

  // Entra quien trabajó en el tramo —aunque después se haya dado de baja, porque el trabajo que
  // hizo se le paga igual— y también quien está activo sin haber hecho ningún turno de guardia,
  // siempre que su vínculo estuviera en pie: el que cobra por semana cobra esos días lo mismo.
  const aLiquidar = asistentes.filter(
    (a) => acumuladoDelTramo.has(a.id) || (a.estado === 'activo' && vinculoVigenteEnElPeriodo(a, { desde: lecturaDesde, hasta }))
  );

  // Las que ya están, de cualquier período que se pueda generar ahora. Se identifica cada una
  // por la persona y el día en que su período empieza, que es lo que la base tiene por única.
  const { data: yaExistentes, error: errorExistentes } = await db
    .from('liquidaciones_asistente')
    .select('id, asistente_id, periodo_desde, estado')
    .lte('periodo_desde', hasta)
    .gte('periodo_hasta', desde);
  if (errorExistentes) return responderError(res, errorExistentes);
  const existentes = new Map((yaExistentes || []).map((l) => [`${l.asistente_id}|${l.periodo_desde}`, l]));

  const resultado = {
    generadas: 0,
    rehechas: 0,
    omitidas_ya_pagadas: [],
    sin_dato_base: [],
    // Quien tuvo valores en dos monedas dentro del mismo período: pesos y dólares no se suman, y
    // convertir pediría una cotización que decide la Prestadora.
    varias_monedas_en_el_periodo: [],
    // El mismo concepto se saltea para todos los que le corresponden, así que la alerta es del
    // catálogo y no de cada persona: se dice una vez.
    sin_escala: new Set(),
    // Quien tiene turnos de guardia cerrados sin la marca de llegada o de cierre: esas horas no
    // se cuentan hasta que se corrijan las marcas.
    turnos_sin_marca: [],
  };

  // La escala vigente no depende de la persona sino del tramo de días, y con frecuencia mensual
  // todos comparten el mismo. Se resuelve una vez por tramo y no una por persona.
  const escalasPorTramo = new Map();
  const escalasDe = (unPeriodo) => {
    const llave = `${unPeriodo.desde}|${unPeriodo.hasta}`;
    if (!escalasPorTramo.has(llave)) {
      escalasPorTramo.set(llave, escalasEstablesDelPeriodo(filasEscalas || [], unPeriodo, prestadora.pais));
    }
    return escalasPorTramo.get(llave);
  };

  for (const asistente of aLiquidar) {
    const pago = pagoPorAsistente.get(asistente.id) || {};

    // Cada persona tiene su propio calendario de cobro: lo de fábrica, corrido por la
    // Prestadora, corrido a su vez por lo que se arregló con ella. Se generan los períodos suyos
    // que cierran entre las dos fechas: quien cobra por día recibe uno por cada día, quien cobra
    // los viernes uno por cada viernes, y quien cobra por mes uno cuando el mes terminó. Un
    // período que todavía no cerró queda para cuando cierre, así que ningún día se paga dos
    // veces ni se queda afuera.
    const frecuencia = frecuenciaDePagoDe(frecuenciaDeLaPrestadora, pago.frecuencia_pago);
    const suyos = periodosQueCierranEn(desde, hasta, frecuencia);

    for (const unPeriodo of suyos) {
      const trabajoDelPeriodo = turnos_guardia.some(
        (g) => g.asistente_id === asistente.id && g.estado === ESTADO_HECHA && g.fecha >= unPeriodo.desde && g.fecha <= unPeriodo.hasta
      );
      if (!trabajoDelPeriodo && !(asistente.estado === 'activo' && vinculoVigenteEnElPeriodo(asistente, unPeriodo))) continue;

      const existente = existentes.get(`${asistente.id}|${unPeriodo.desde}`);
      // Una liquidación pagada no se toca: es el registro de una plata que ya salió.
      if (existente?.estado === 'pagada') {
        resultado.omitidas_ya_pagadas.push(asistente.nombre);
        continue;
      }

      const turnosDelPeriodo = turnos_guardia.filter(
        (g) => g.asistente_id === asistente.id && g.fecha >= unPeriodo.desde && g.fecha <= unPeriodo.hasta
      );
      const SIN_TRABAJO = { turnos_guardia: 0, horas: 0, horasExtra: 0, detalle: [], sinMarca: 0 };
      const delPeriodo = acumularTurnosGuardia(turnosDelPeriodo, zona, reglaDePago);
      const acumuladoDelPeriodo = delPeriodo.get(asistente.id) || SIN_TRABAJO;

      // Cada día se paga con el valor del Legajo que regía ese día. El período se parte en los
      // tramos en que rigió cada valor, y cada tramo lleva el trabajo hecho en sus días. Sin
      // ningún valor cargado no hay tramos, y la cuenta lo dice como falta de la base.
      const tramos = tramosDelLegajoEnElPeriodo(filasDelLegajo.get(asistente.id) || [], unPeriodo).map((tramo) => ({
        desde: tramo.desde,
        hasta: tramo.hasta,
        valores: tramo.fila,
        acumulado:
          acumularTurnosGuardia(turnosDelPeriodo.filter((g) => g.fecha >= tramo.desde && g.fecha <= tramo.hasta), zona, reglaDePago).get(asistente.id) ||
          SIN_TRABAJO,
      }));

      const calculada = calcularLiquidacion({
        asistente: { ...asistente, frecuencia_pago: pago.frecuencia_pago },
        acumulado: acumuladoDelPeriodo,
        tramos,
        conceptos: conceptos || [],
        escalasPorTipo: escalasDe(unPeriodo),
        moneda: prestadora.moneda,
        jurisdiccion: prestadora.pais,
        periodo: unPeriodo,
        reglaDePago,
      });

      if (calculada.variasMonedas) {
        if (!resultado.varias_monedas_en_el_periodo.includes(asistente.nombre)) {
          resultado.varias_monedas_en_el_periodo.push(asistente.nombre);
        }
        continue;
      }
      if (calculada.faltaBase) {
        if (!resultado.sin_dato_base.includes(asistente.nombre)) resultado.sin_dato_base.push(asistente.nombre);
        continue;
      }
      for (const alerta of calculada.sinEscala) resultado.sin_escala.add(alerta);
      if (acumuladoDelPeriodo.sinMarca > 0 && !resultado.turnos_sin_marca.includes(asistente.nombre)) {
        resultado.turnos_sin_marca.push(asistente.nombre);
      }

      // Rehacer un período es borrar la liquidación anterior y generar otra. Se borra recién
      // acá, con la cuenta nueva ya hecha, para no dejarlo sin nada si algo salía mal antes.
      if (existente) {
        const { error: errorBorrado } = await db
          .from('liquidaciones_asistente')
          .delete()
          .eq('id', existente.id);
        if (errorBorrado) return responderError(res, errorBorrado);
      }

      // La moneda va con la cuenta: es la del Legajo, que puede no ser la de la Prestadora. Si el
      // Legajo no trae ninguna, la cuenta pone la de la Prestadora. Los renglones la heredan de
      // la cabecera en la base.
      const { data: guardada, error: errorGuardar } = await db
        .from('liquidaciones_asistente')
        .insert({
          prestadora_id: prestadora.id,
          ...calculada.liquidacion,
          detalle_horas: acumuladoDelPeriodo.detalle,
          generada_por: req.usuarioPanel.id,
        })
        .select()
        .single();
      if (errorGuardar) return responderError(res, errorGuardar);

      const { error: errorItems } = await db
        .from('liquidaciones_asistente_items')
        .insert(calculada.items.map((item) => ({ liquidacion_id: guardada.id, ...item })));
      if (errorItems) {
        // Una liquidación sin sus renglones no explica nada: si los renglones no entraron, la
        // cabecera tampoco se queda.
        await db.from('liquidaciones_asistente').delete().eq('id', guardada.id);
        return responderError(res, errorItems);
      }

      if (existente) resultado.rehechas += 1;
      else resultado.generadas += 1;
    }
  }

  res.json({ ...resultado, sin_escala: [...resultado.sin_escala] });
});

panelLiquidacionesRouter.get('/:id', requiereRolPanel, requierePermiso(PERMISO_LECTURA), async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: liquidacion, error } = await db
    .from('liquidaciones_asistente')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

  const { data: items, error: errorItems } = await db
    .from('liquidaciones_asistente_items')
    .select('*')
    .eq('liquidacion_id', liquidacion.id)
    .order('orden', { ascending: true });
  if (errorItems) return responderError(res, errorItems);

  const { data: asistente, error: errorAsistente } = await db
    .from('asistentes')
    .select('id, nombre')
    .eq('id', liquidacion.asistente_id)
    .maybeSingle();
  if (errorAsistente) return responderError(res, errorAsistente);

  res.json({
    ...liquidacion,
    items: items || [],
    asistente: asistente ?? null,
  });
});

panelLiquidacionesRouter.post('/:id/pagar', requiereRolPanel, requierePermiso(PERMISO_LECTURA), soloAdministracion, async (req, res) => {
  const { fecha_pago: fechaPago, forma_pago: formaPago, referencia_pago: referenciaPago } = req.body || {};
  // "Pagada" sin fecha no dice nada: la fecha es la mitad del dato.
  if (!fechaPago || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    return res.status(400).json({ error: 'Hace falta la fecha del pago, en formato AAAA-MM-DD' });
  }

  // Con qué se pagó ya no es texto libre: es una opción de la lista `medios_de_pago_al_asistente`,
  // que no es la del cobro del Cliente. Anotarlo sigue siendo opcional, pero si se anota
  // tiene que ser una de las que alcanzan a esta Prestadora. El disparador de la base frena lo
  // mismo; esto contesta antes y con una frase entendible.
  const medioAnotado = typeof formaPago === 'string' && formaPago.trim() !== '' ? formaPago.trim() : null;

  const db = clienteDelPedido(req);
  const { data: liquidacion, error } = await db
    .from('liquidaciones_asistente')
    .select('id, estado, asistente_id, periodo_desde, periodo_hasta, prestadora_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });
  if (liquidacion.estado === 'pagada') return res.status(400).json({ error: 'Esta liquidación ya figura pagada' });

  if (medioAnotado !== null) {
    let mediosAdmitidos;
    try {
      // La lista del lado del Asistente, que no es la de la cobranza: acá no se le paga con
      // tarjeta ni con débito automático a nadie.
      mediosAdmitidos = await mediosDePagoDeLaPrestadora(
        db,
        liquidacion.prestadora_id,
        LISTA_DE_MEDIOS_DE_PAGO_AL_ASISTENTE,
      );
    } catch (e) {
      return responderError(res, e);
    }
    if (!mediosAdmitidos.includes(medioAnotado)) {
      return res.status(400).json({ error: 'El medio de pago no es uno de los admitidos' });
    }
  }

  const { data, error: errorPago } = await db
    .from('liquidaciones_asistente')
    .update({
      estado: 'pagada',
      fecha_pago: fechaPago,
      forma_pago: medioAnotado,
      referencia_pago: referenciaPago ?? null,
      pagada_por: req.usuarioPanel.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', liquidacion.id)
    .select()
    .single();
  if (errorPago) return responderError(res, errorPago);
  res.json(data);
});

panelLiquidacionesRouter.delete('/:id', requiereRolPanel, requierePermiso(PERMISO_LECTURA), soloAdministracion, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: liquidacion, error } = await db
    .from('liquidaciones_asistente')
    .select('id, estado')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });
  // Una liquidación pagada es el registro de una plata que ya salió: borrarla sería borrar la
  // única explicación de ese pago.
  if (liquidacion.estado === 'pagada') {
    return res.status(400).json({ error: 'Una liquidación ya pagada no se puede borrar' });
  }

  // La condición de más arriba se repite acá adentro. La lectura pasó hace un instante, y en ese
  // instante otra persona puede haber marcado la liquidación como pagada: comprobarlo solo antes
  // deja abierto justo el caso que el control existe para impedir. Y se comprueba que haya
  // borrado algo, porque "borré" sin haber borrado nada es la peor respuesta posible acá.
  const { data: borrada, error: errorBorrado } = await db
    .from('liquidaciones_asistente')
    .delete()
    .eq('id', liquidacion.id)
    .neq('estado', 'pagada')
    .select('id');
  if (errorBorrado) return responderError(res, errorBorrado);
  if (!borrada?.length) {
    return res.status(409).json({ error: 'La liquidación ya no está, o quedó pagada mientras tanto' });
  }
  res.json({ ok: true });
});
