// Pendiente #85 (docs/PLAN_HASTA_PRODUCCION.md), Grupo 3 Match — rutas del Panel: formas de
// cobro por Prestadora, accesos y cobros, calificaciones con descargo, y la auditoría de
// advertencias legales de Match.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Cada manejador entra a la base con `clienteDelPedido(req)`, y
// qué filas ve lo decide la RLS por la membresía de esa persona: no hay filtro por Prestadora
// escrito acá. Lo que se inserta toma la Prestadora de una fila que la base ya dejó ver
// (`prestadoraVisible`), nunca de la sesión ni del pedido. Lo que las políticas de la persona no
// alcanzan —tablas o funciones que no son de ningún rol que esta ruta deja pasar— va con el trabajo
// de la Prestadora (`enLaPrestadora`), que sólo ve esa Prestadora; un comentario dice por qué en
// cada caso.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { exigirAdministracion, exigirAdminDePrestadora } from '../middleware/exigirAdministracion.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirModalidad } from '../middleware/exigirModalidad.js';
import { advertenciaVigente, advertenciasVigentes, registrarAdvertencia } from '../utils/advertenciaLegal.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { prestadoraVisible } from '../utils/prestadoraVisible.js';
import { cuentasDeLasFilas } from '../utils/cuentaDeLaFila.js';
import { FICHA_NOMBRE, conSusFichas } from '../utils/fichaDelPaciente.js';
import { primerDiaDelPeriodo } from '../utils/cobrosDeCliente.js';
import { aDosDecimales } from '../utils/facturacionDeClientes.js';
import { aQuienFacturarle } from '../utils/intercambioDeFacturacion.js';
import { estadoDeCobroDeCadaAcceso } from '../utils/estadoDeCobroDelAcceso.js';
import { DATOS_PARA_FACTURAR } from '../utils/datosParaFacturar.js';

export const panelIntermediacionRouter = Router();

panelIntermediacionRouter.use(requiereRolPanel);

// Todo lo de Match pasa adentro de una Prestadora. Superadmin sin permiso de acceso
// abierta no está parado en ninguna, y entonces no hay sobre qué operar. El corte lo pone el
// middleware compartido con el resto de los routers: hasta hoy este archivo tenía su propia
// copia de la misma condición, con otro texto (CLAUDE.md §8, «ningún patrón repetido sin punto
// único de verdad»).
panelIntermediacionRouter.use(exigirOrganizacionActiva);

// Y todo lo de acá adentro existe solamente si la Prestadora tiene encendida la modalidad
// Match. Que el menú del Panel no muestre estos enlaces no alcanza: escribiendo la
// dirección a mano se entraba igual. El candado de verdad es éste (middleware/exigirModalidad.js).
panelIntermediacionRouter.use(exigirModalidad('intermediacion'));

// La plata del Match es de la administración de la Prestadora, no del Coordinador
// (Desarrollador, 2026-09-04: «absolutamente no puede ni debe»). Alcanza a todo lo que sea un
// cobro: las formas de cobro, la lista de accesos con sus importes y el historial de cobros. Lo que sí
// queda para el Coordinador es lo que no es plata: las calificaciones y la auditoría de advertencias legales.
//
// Hasta el 2026-09-04 este archivo tenía una función llamada `requiereAdminOSuperior` que
// dejaba pasar al Coordinador; las otras dos del backend, con el mismo nombre, no. Ahora el
// control se escribe una sola vez (middleware/exigirAdministracion.js) y lo único que se
// decide acá es a qué rutas se le pide.
const soloAdministracion = exigirAdministracion('Rol sin permiso');

// Adentro de la plata hay una parte que ni siquiera es de la administración en general: cuánto
// cobra una Prestadora y cada cuánto lo cobra es su política de comercialización, y CeltaTech no
// se mete en eso ni con precios sugeridos. Quien la arma es el Admin de la Prestadora; Superadmin la ve —la necesita
// para dar soporte— y no la escribe.
const soloAdminArmaLaFormaDeCobro = exigirAdminDePrestadora(
  'Cómo cobra la Prestadora lo decide ella: solo Admin puede armar y cambiar sus formas de cobro'
);

// ============================================================================
// Las formas de cobro que arma la Prestadora
//
// QUÉ SON. Las piezas con las que cada Prestadora arma cómo le cobra a sus Clientes: qué se
// cobra, cada cuánto, con cuántos días gratis, con qué saldo de contactos y si se renueva sola
// (la tabla `formas_de_cobro_intermediacion`). No hay una
// columna que diga «esto es una suscripción»: la forma sale de cómo se combinen las piezas, y
// una combinación nueva no necesita migración.
//
// POR QUÉ PASAN POR EL BACKEND Y NO DERECHO A LA BASE. La lista de precios de prestación directa
// se escribe desde la pantalla con la sesión de quien mira, y alcanza. Acá no: lo que decide que
// estas pantallas existan es la modalidad contratada, y ese candado vive en este riel
// (`exigirModalidad`, arriba). Escribiendo la dirección a mano se entraba igual.
//
// QUIÉN. Verlas es de la administración; armarlas y cambiarlas, sólo del Admin de la Prestadora,
// por lo mismo que las credenciales de cobro: cómo cobra una Prestadora no es asunto de un rol
// técnico de CeltaTech.
//
// Y NO HAY BAJA. Una forma que ya se contrató no se borra: se apaga con `ofrecida`, y los
// accesos que la tienen siguen apuntando a algo que existe.
// ============================================================================

const CAMPOS_DE_LA_FORMA =
  'id, nombre, importe, moneda, periodo_cantidad, periodo_unidad, dias_gratis, contactos_incluidos, renueva_sola, ofrecida, created_at, updated_at';

/** Las unidades de tiempo que el producto conoce. Salen de la base, nunca de una lista escrita
 *  acá (CLAUDE.md §8): la tabla es lo mismo que mira la clave foránea de la forma de cobro. */
async function unidadesDePeriodo(db) {
  const { data, error } = await db
    .from('catalogo_periodos_cobro')
    .select('clave, orden')
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data || []).map((fila) => fila.clave);
}

/** Un entero de verdad: ni texto con letras, ni un decimal, ni vacío. `Number('')` da 0, así que
 *  comprobar solamente que sea un número deja pasar el campo vacío como si fuera cero. */
function enteroOInvalido(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : NaN;
}

/**
 * Lo que se va a guardar, o un error con motivo.
 *
 * Repite en el servidor lo que la tabla ya comprueba en la base, y no por desconfianza de la
 * base: un `CHECK` que salta sube como código crudo de Postgres, y de ahí la pantalla sólo puede
 * decir «hay un dato mal cargado». Comprobándolo acá, cada pieza mal cargada viaja con su propio
 * motivo y la persona lee cuál es (`celtatech/CLAUDE.md` §6, y `utils/errorConMotivo.js`).
 *
 * Falla cerrado: cualquier pieza que no se entienda es un rechazo, nunca un valor por omisión.
 */
function formaValidada(cuerpo, unidades) {
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : '';
  if (!nombre) throw new ErrorConMotivo('faltan_datos', 'La forma de cobro necesita un nombre');

  if (cuerpo.importe === null || cuerpo.importe === undefined || cuerpo.importe === '') {
    throw new ErrorConMotivo('faltan_datos', 'La forma de cobro necesita un importe');
  }
  const importe = Number(cuerpo.importe);
  if (!Number.isFinite(importe) || importe < 0) {
    throw new ErrorConMotivo('importe_invalido', `Importe fuera de rango: ${cuerpo.importe}`);
  }

  // El período son dos piezas que viajan juntas o no viajan: «cada 2» sin unidad no quiere decir
  // nada, y «cada mes» sin cantidad tampoco. Las dos vacías es una forma que se cobra una vez.
  const periodoCantidad = enteroOInvalido(cuerpo.periodo_cantidad);
  const periodoUnidad = typeof cuerpo.periodo_unidad === 'string' && cuerpo.periodo_unidad
    ? cuerpo.periodo_unidad
    : null;
  if (Number.isNaN(periodoCantidad)) {
    throw new ErrorConMotivo('periodo_invalido', `Cantidad de período no entera: ${cuerpo.periodo_cantidad}`);
  }
  if ((periodoCantidad === null) !== (periodoUnidad === null)) {
    throw new ErrorConMotivo('periodo_incompleto', 'El período lleva cantidad y unidad, o ninguna de las dos');
  }
  if (periodoCantidad !== null && periodoCantidad <= 0) {
    throw new ErrorConMotivo('periodo_invalido', `Cantidad de período no positiva: ${periodoCantidad}`);
  }
  if (periodoUnidad !== null && !unidades.includes(periodoUnidad)) {
    throw new ErrorConMotivo('unidad_de_periodo_desconocida', `Unidad fuera del catálogo: ${periodoUnidad}`);
  }

  const diasGratis = enteroOInvalido(cuerpo.dias_gratis);
  if (Number.isNaN(diasGratis) || (diasGratis !== null && diasGratis < 0)) {
    throw new ErrorConMotivo('dias_gratis_invalido', `Días gratis fuera de rango: ${cuerpo.dias_gratis}`);
  }

  const contactos = enteroOInvalido(cuerpo.contactos_incluidos);
  if (Number.isNaN(contactos) || (contactos !== null && contactos <= 0)) {
    throw new ErrorConMotivo('contactos_incluidos_invalido', `Contactos incluidos fuera de rango: ${cuerpo.contactos_incluidos}`);
  }

  const renuevaSola = cuerpo.renueva_sola === true;
  if (renuevaSola && periodoCantidad === null) {
    throw new ErrorConMotivo('renovacion_sin_periodo', 'Una forma que se cobra una sola vez no se renueva sola');
  }

  return {
    nombre,
    importe,
    periodo_cantidad: periodoCantidad,
    periodo_unidad: periodoUnidad,
    dias_gratis: diasGratis,
    contactos_incluidos: contactos,
    renueva_sola: renuevaSola,
    // Una forma nueva se ofrece salvo que se diga lo contrario: quien la está cargando la está
    // cargando para usarla.
    ofrecida: cuerpo.ofrecida === undefined ? true : cuerpo.ofrecida === true,
  };
}

/** El nombre repetido es lo único que la base rechaza y que la persona puede corregir sola, así
 *  que sube con motivo propio en vez de caer en «algo falló de nuestro lado». */
function errorDeGuardado(error) {
  if (error?.code === '23505') {
    return new ErrorConMotivo('nombre_de_forma_repetido', error.message);
  }
  return error;
}

panelIntermediacionRouter.get('/formas-de-cobro', soloAdministracion, async (req, res) => {
  const db = clienteDelPedido(req);
  // La lista, con el trabajo de la Prestadora: la política de lectura de
  // `formas_de_cobro_intermediacion` es sólo del Admin de la Prestadora, y Superadmin —que la ve
  // para dar soporte— la recibiría vacía.
  const { data, error } = await enLaPrestadora(req.usuarioPanel.prestadoraId, 'las formas de cobro', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('formas_de_cobro_intermediacion')
      .select(CAMPOS_DE_LA_FORMA)
      .order('created_at', { ascending: true })
  );
  if (error) return responderError(res, error);

  // Las unidades viajan con la lista para que la pantalla arme su desplegable sin tener que
  // conocerlas: el catálogo está en la base y esta ruta es la única puerta hacia él.
  let unidades;
  try {
    unidades = await unidadesDePeriodo(db);
  } catch (errorCatalogo) {
    return responderError(res, errorCatalogo);
  }

  res.json({ formas: data, unidades_de_periodo: unidades });
});

panelIntermediacionRouter.post('/formas-de-cobro', soloAdministracion, soloAdminArmaLaFormaDeCobro, async (req, res) => {
  const db = clienteDelPedido(req);
  let valores;
  try {
    valores = formaValidada(req.body || {}, await unidadesDePeriodo(db));
  } catch (error) {
    return responderError(res, error, 400);
  }

  let prestadoraId;
  try {
    prestadoraId = await prestadoraVisible(db);
  } catch (error) {
    return responderError(res, error);
  }

  // La moneda no viaja: la completa el disparador con la de la Prestadora, que es el único lugar
  // donde está decidida (`CLAUDE.md` de Careonys, «la moneda de cada importe se completa sola»).
  const { data, error } = await db
    .from('formas_de_cobro_intermediacion')
    .insert({ ...valores, prestadora_id: prestadoraId })
    .select(CAMPOS_DE_LA_FORMA)
    .single();
  if (error) return responderError(res, errorDeGuardado(error));

  res.json({ forma: data });
});

panelIntermediacionRouter.patch('/formas-de-cobro/:id', soloAdministracion, soloAdminArmaLaFormaDeCobro, async (req, res) => {
  // Se lee la forma entera antes de tocarla por dos motivos. Uno: si no es de esta Prestadora, no
  // existe, y se contesta lo mismo que si no existiera. Dos: las piezas se comprueban entre sí
  // —renovarse sola exige período—, y eso no se puede hacer mirando sólo lo que vino en el pedido.
  const db = clienteDelPedido(req);
  const { data: actual, error: errorLectura } = await db
    .from('formas_de_cobro_intermediacion')
    .select(CAMPOS_DE_LA_FORMA)
    .eq('id', req.params.id)
    .maybeSingle();
  if (errorLectura) return responderError(res, errorLectura);
  if (!actual) return responderError(res, new ErrorConMotivo('no_encontrado', 'Forma de cobro de otra Prestadora o inexistente'));

  let valores;
  try {
    valores = formaValidada({ ...actual, ...req.body }, await unidadesDePeriodo(db));
  } catch (error) {
    return responderError(res, error, 400);
  }

  const { data, error } = await db
    .from('formas_de_cobro_intermediacion')
    .update({ ...valores, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select(CAMPOS_DE_LA_FORMA)
    .single();
  if (error) return responderError(res, errorDeGuardado(error));

  res.json({ forma: data });
});

// ============================================================================
// Accesos y cobros
// ============================================================================

// Nombres legibles de Cliente/Paciente/Asistente en consultas separadas (no un único JOIN
// embebido): cliente_id apunta a clientes.id, que a su vez comparte id con usuarios.id, así
// que el nombre real vive en usuarios — resolverlo acá evita mostrar UUID crudo en el Panel
// (CLAUDE.md §7 regla 7, "sin datos crudos").
panelIntermediacionRouter.get('/accesos', soloAdministracion, async (req, res) => {
  // Los accesos, con el trabajo de la Prestadora: la política de lectura de
  // `accesos_intermediacion` no alcanza a Superadmin, que esta ruta deja pasar con el permiso de
  // acceso abierto.
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const { data, error } = await enLaPrestadora(prestadoraId, 'los accesos de Match', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('accesos_intermediacion')
      .select('id, cliente_id, paciente_id, asistente_id, estado, importe, moneda, gratis_hasta, proximo_cobro, cancelada_en, created_at')
      .order('created_at', { ascending: false })
  );
  if (error) return responderError(res, error);

  // Lo que informó el software de cobranzas de cada acceso: el producto no anota cobros por su
  // cuenta, muestra lo que le avisaron. Con el mismo trabajo de la Prestadora que los accesos.
  const accesoIds = data.map((s) => s.id);
  let cobros = [];
  if (accesoIds.length) {
    const { data: filas, error: errorDeCobros } = await enLaPrestadora(prestadoraId, 'los cobros informados de Match', (dbDelTrabajo) =>
      dbDelTrabajo
        .from('cobros_intermediacion')
        .select('acceso_id, estado_cobro, fecha_cobro, monto, moneda, periodo, created_at')
        .in('acceso_id', accesoIds)
    );
    if (errorDeCobros) return responderError(res, errorDeCobros);
    cobros = filas || [];
  }
  const cobroDe = estadoDeCobroDeCadaAcceso(cobros);

  const clienteIds = [...new Set(data.map((s) => s.cliente_id).filter(Boolean))];
  const pacienteIds = [...new Set(data.map((s) => s.paciente_id).filter(Boolean))];
  const asistenteIds = [...new Set(data.map((s) => s.asistente_id).filter(Boolean))];

  const [cuentasCliente, { data: pacientes }, { data: asistentes }] = await Promise.all([
    cuentasDeLasFilas('clientes', clienteIds, 'nombre', prestadoraId),
    // Los nombres de Pacientes y Asistentes, con el trabajo de la Prestadora: a Superadmin no lo
    // alcanzan las políticas de lectura de la persona. Un acceso nace de un Paciente y un Asistente
    // ya admitidos, así que la política restrictiva `oculta_pendientes_de_conformidad`, que vale
    // también para el trabajo, no esconde a ninguno de los que se nombran acá.
    pacienteIds.length
      ? enLaPrestadora(prestadoraId, 'los nombres de los Pacientes de Match', (dbDelTrabajo) =>
          dbDelTrabajo.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', pacienteIds))
      : { data: [] },
    asistenteIds.length
      ? enLaPrestadora(prestadoraId, 'los nombres de los Asistentes de Match', (dbDelTrabajo) =>
          dbDelTrabajo.from('asistentes').select('id, nombre').in('id', asistenteIds))
      : { data: [] },
  ]);

  const nombreCliente = new Map([...cuentasCliente].map(([id, datos]) => [id, datos?.nombre ?? null]));
  const nombrePaciente = new Map(conSusFichas(pacientes).map((p) => [p.id, p.nombre]));
  const nombreAsistente = new Map((asistentes || []).map((a) => [a.id, a.nombre]));

  const accesos = data.map((s) => ({
    ...s,
    cliente_nombre: nombreCliente.get(s.cliente_id) || null,
    paciente_nombre: nombrePaciente.get(s.paciente_id) || null,
    asistente_nombre: s.asistente_id ? nombreAsistente.get(s.asistente_id) || null : null,
    estado_cobro: cobroDe.get(s.id)?.estado_cobro ?? null,
    ultimo_cobro: cobroDe.get(s.id)?.ultimo_cobro ?? null,
  }));

  res.json({ accesos });
});

/**
 * Lo que hay para facturar de un período en Match: una fila por acceso que se cobra ese mes.
 *
 * Sale con las mismas columnas que lo de la prestación directa (`utils/intercambioDeFacturacion.js`),
 * para que el software de facturación lea un solo formato. La Liquidación de un acceso es su
 * importe, en su moneda, el día de su próximo cobro; se le factura al Contratante del Cliente.
 *
 * Un acceso cancelado, sin importe o todavía en su período sin cargo no sale: no hay nada que
 * facturar.
 */
panelIntermediacionRouter.get('/accesos/para-facturar', soloAdministracion, async (req, res) => {
  const periodo = primerDiaDelPeriodo(req.query.periodo);
  if (!periodo) return res.status(400).json({ error: 'Falta el período, en formato AAAA-MM' });
  const [anio, mes] = periodo.split('-').map(Number);
  const hasta = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);

  const prestadoraId = req.usuarioPanel.prestadoraId;
  const { data: accesos, error } = await enLaPrestadora(prestadoraId, 'lo que hay para facturar en Match', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('accesos_intermediacion')
      .select('id, cliente_id, importe, moneda, proximo_cobro, gratis_hasta')
      .eq('estado', 'vigente')
      .gte('proximo_cobro', periodo)
      .lt('proximo_cobro', hasta)
      .order('proximo_cobro', { ascending: true })
  );
  if (error) return responderError(res, error);

  const aFacturar = (accesos || []).filter(
    (a) => Number(a.importe) > 0 && !(a.gratis_hasta && a.gratis_hasta >= a.proximo_cobro)
  );

  const clienteIds = [...new Set(aFacturar.map((a) => a.cliente_id).filter(Boolean))];
  let clientes = new Map();
  let fichas = new Map();
  if (clienteIds.length) {
    const { data: filas, error: errorDeClientes } = await enLaPrestadora(prestadoraId, 'a quién se le factura en Match', (dbDelTrabajo) =>
      dbDelTrabajo.from('clientes').select('id, numero_cliente, contratante_persona_id').in('id', clienteIds)
    );
    if (errorDeClientes) return responderError(res, errorDeClientes);
    clientes = new Map((filas || []).map((c) => [c.id, c]));

    const personaIds = [...new Set((filas || []).map((c) => c.contratante_persona_id).filter(Boolean))];
    if (personaIds.length) {
      const { data: personas, error: errorDePersonas } = await enLaPrestadora(prestadoraId, 'datos para facturar en Match', (dbDelTrabajo) =>
        dbDelTrabajo.from('personas').select(DATOS_PARA_FACTURAR).in('id', personaIds)
      );
      if (errorDePersonas) return responderError(res, errorDePersonas);
      fichas = new Map((personas || []).map((p) => [p.id, p]));
    }
  }
  const cuentasCliente = await cuentasDeLasFilas('clientes', clienteIds, 'nombre', prestadoraId);

  res.json(aFacturar.map((a) => {
    const cliente = clientes.get(a.cliente_id);
    const ficha = fichas.get(cliente?.contratante_persona_id) ?? null;
    const destinatario = aQuienFacturarle(ficha);
    return {
      // Un acceso de Match no tiene factura propia: la columna sale vacía.
      factura_id: '',
      numero_cliente: cliente?.numero_cliente ?? '',
      cliente: cuentasCliente.get(a.cliente_id)?.nombre ?? '',
      ...destinatario,
      periodo: periodo.slice(0, 7),
      moneda: a.moneda,
      monto_a_facturar: aDosDecimales(a.importe),
      fecha_vencimiento: a.proximo_cobro ?? '',
    };
  }));
});


panelIntermediacionRouter.get('/accesos/:id/cobros', soloAdministracion, async (req, res) => {
  // Con el trabajo de la Prestadora: la política de lectura de `cobros_intermediacion` no alcanza
  // a Superadmin.
  const { data, error } = await enLaPrestadora(req.usuarioPanel.prestadoraId, 'los cobros de un acceso', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('cobros_intermediacion')
      .select('id, medio, monto, moneda, periodo, estado_cobro, referencia_externa, fecha_cobro, registrado_por, created_at')
      .eq('acceso_id', req.params.id)
      .order('periodo', { ascending: false })
  );
  if (error) return responderError(res, error);
  res.json({ cobros: data });
});

// ============================================================================
// Calificaciones y descargos — visibilidad pública queda como único campo editable por la
// Prestadora (schema_calificaciones_asistente.sql), el contenido (incluido el descargo del
// Asistente) nunca se edita desde acá.
// ============================================================================

panelIntermediacionRouter.get('/calificaciones', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('calificaciones_asistente')
    .select('id, asistente_id, paciente_id, cliente_id, estrellas, comentario, visible_publica, descargo_asistente, descargo_en, created_at')
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  const asistenteIds = [...new Set(data.map((c) => c.asistente_id).filter(Boolean))];
  // Los nombres, con el trabajo de la Prestadora: el Coordinador sólo alcanza los Asistentes de su
  // zona, y una calificación de un Asistente de otra zona quedaría sin nombre en la lista.
  const { data: asistentes } = asistenteIds.length
    ? await enLaPrestadora(req.usuarioPanel.prestadoraId, 'nombres de las calificaciones', (dbDelTrabajo) =>
        dbDelTrabajo.from('asistentes').select('id, nombre').in('id', asistenteIds))
    : { data: [] };
  const nombreAsistente = new Map((asistentes || []).map((a) => [a.id, a.nombre]));

  const calificaciones = data.map((c) => ({ ...c, asistente_nombre: nombreAsistente.get(c.asistente_id) || null }));

  res.json({ calificaciones });
});

panelIntermediacionRouter.patch('/calificaciones/:id/visibilidad', async (req, res) => {
  const { visible_publica: visiblePublica } = req.body || {};
  if (typeof visiblePublica !== 'boolean') {
    return res.status(400).json({ error: 'Falta visible_publica (booleano)' });
  }
  // La escritura devuelve la fila tocada: sin esto la base contesta que salió bien aunque no
  // haya encontrado ninguna, y la pantalla muestra un cambio de visibilidad que no ocurrió.
  // Con el trabajo de la Prestadora: la política de modificación de `calificaciones_asistente` no
  // incluye a Superadmin. El trabajo sólo puede tocar la visibilidad.
  const { data: modificada, error } = await enLaPrestadora(req.usuarioPanel.prestadoraId, 'visibilidad de una calificación', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('calificaciones_asistente')
      .update({ visible_publica: visiblePublica })
      .eq('id', req.params.id)
      .select('id')
  );
  if (error) return responderError(res, error);
  if (!modificada?.length) {
    // No existe, o es de otra Prestadora. Se contesta lo mismo en los dos casos.
    return res.status(404).json({ error: 'No se encontró esa calificación' });
  }
  res.json({ ok: true });
});

// ============================================================================
// Las cinco funciones de riesgo legal de Match
//
// QUÉ SON. `docs/legal/argentina.md` describe cinco funciones de la modalidad Match
// que, en Argentina, acercan el vínculo con el Asistente a una relación de dependencia:
// el ranking calculado por la plataforma, la consecuencia automática atada a la calificación,
// el precio u horario fijado por la plataforma, la exclusividad y la mediación de conflictos.
// Cada una tiene su texto de advertencia escrito en ese documento, y esos cinco textos están
// cargados en `advertencias_legales`.
//
// CUÁL ES LA LISTA. Sale de la base, de `catalogo_funciones_intermediacion`, y no de una lista
// escrita acá: los catálogos salen de la base (CLAUDE.md §8). Hasta el 2026-09-10 estaba
// escrita en este archivo, y la tabla que la guarda no existía; ahora la usan las tres rutas
// de abajo desde un solo lugar.
// ============================================================================

/** Las funciones de riesgo, en el orden en que las escribe el documento legal. */
async function catalogoDeFuncionesDeRiesgo(db) {
  return db
    .from('catalogo_funciones_intermediacion')
    .select('clave, orden')
    .order('orden', { ascending: true });
}

/* Lo único que agrega este ayudante es en qué consulta falló, porque una misma ruta hace
   varias y saber la ruta no alcanza para saber cuál. Qué sale hacia afuera no lo decide acá:
   lo decide `responderError`, que es el punto único —afuera va el código, el detalle crudo de
   la base se queda en el registro del servidor (CLAUDE.md §6)—. Antes contestaba una frase
   escrita a mano en castellano, que además nunca llegaba a verse: la pantalla trata cualquier
   500 como falla del sistema sin leer el mensaje (`panel/src/lib/errores.js`). */
function fallaDelSistema(res, donde, error) {
  console.error(`Match, ${donde}:`, error?.message ?? error);
  return responderError(res, error);
}

// ----------------------------------------------------------------------------
// Encender y apagar cada función — la advertencia avisa, no bloquea
// ----------------------------------------------------------------------------
//
// AVISA, NO BLOQUEA (CLAUDE.md §7). Encender cualquiera de las cinco siempre se puede. Lo que
// hace el backend es mostrar la advertencia escrita para la jurisdicción de esa Prestadora —si esa
// jurisdicción tiene documento— y dejar registrado que se avisó, cuándo y a quién. Si el país
// no tiene documento, no hay advertencia y la función se enciende igual: no se improvisa un texto
// por parecido con otro país, y la falta de texto nunca se convierte en un impedimento.
//
// Y ninguna de las cinco queda apagada por decisión del sistema: nacen apagadas porque nadie
// las encendió, que no es lo mismo. Encenderlas es un clic.
//
// POR QUÉ EL REGISTRO SE ESCRIBE ACÁ Y NO EN LA PANTALLA: ver utils/advertenciaLegal.js.

panelIntermediacionRouter.get('/funciones-riesgo', async (req, res) => {
  const db = clienteDelPedido(req);
  const prestadoraId = req.usuarioPanel.prestadoraId;

  const { data: catalogo, error: errorCatalogo } = await catalogoDeFuncionesDeRiesgo(db);
  if (errorCatalogo) return fallaDelSistema(res, 'catálogo de funciones de riesgo', errorCatalogo);

  const { data: guardadas, error } = await db
    .from('configuracion_funciones_intermediacion')
    .select('funcion_clave, activa, advertida_en');
  if (error) return fallaDelSistema(res, 'funciones de riesgo encendidas', error);

  const porClave = new Map((guardadas || []).map((f) => [f.funcion_clave, f]));
  const advertencias = await advertenciasVigentes(prestadoraId, (catalogo || []).map((f) => f.clave));

  res.json({
    funciones: (catalogo || []).map((f) => {
      const guardada = porClave.get(f.clave);
      return {
        clave: f.clave,
        // Sin fila guardada, apagada: una Prestadora recién creada no necesita que nadie le
        // siembre cinco filas para estar en el estado en el que ya está.
        activa: guardada?.activa ?? false,
        advertida_en: guardada?.advertida_en ?? null,
        // El texto viaja para que la pantalla pueda mostrarlo ANTES de encender, que es el
        // único momento en el que sirve. Si esta jurisdicción no tiene documento para esta
        // función, viaja `null` y no hay nada que mostrar.
        texto_advertencia: advertencias.get(f.clave)?.texto ?? null,
      };
    }),
  });
});

// Encender o apagar una de estas cinco es una decisión de negocio con consecuencia legal: la
// toma la administración de la Prestadora, no el Coordinador, que las ve y no las toca.
panelIntermediacionRouter.put('/funciones-riesgo/:clave', soloAdministracion, async (req, res) => {
  const { activa } = req.body || {};
  if (typeof activa !== 'boolean') {
    return res.status(400).json({ error: 'Falta activa (booleano)' });
  }

  const db = clienteDelPedido(req);
  const usuarioId = req.usuarioPanel.id;

  // La clave se valida contra el catálogo de la base, no contra una lista escrita acá.
  const { data: catalogo, error: errorCatalogo } = await catalogoDeFuncionesDeRiesgo(db);
  if (errorCatalogo) return fallaDelSistema(res, 'catálogo de funciones de riesgo', errorCatalogo);
  if (!(catalogo || []).some((f) => f.clave === req.params.clave)) {
    return res.status(404).json({ error: 'No se encontró esa función' });
  }

  let prestadoraId;
  try {
    prestadoraId = await prestadoraVisible(db);
  } catch (error) {
    return responderError(res, error);
  }

  // La advertencia se resuelve antes de guardar porque forma parte de lo que se guarda: la fila
  // queda diciendo que esta función se encendió sabiendo esto. Apagar no lleva advertencia: lo que
  // el documento legal advierte es de usar la función, no de dejar de usarla.
  const advertencia = activa ? await advertenciaVigente(prestadoraId, req.params.clave) : null;
  const ahora = new Date().toISOString();

  const { error } = await db
    .from('configuracion_funciones_intermediacion')
    .upsert(
      {
        prestadora_id: prestadoraId,
        funcion_clave: req.params.clave,
        activa,
        updated_at: ahora,
        ...(advertencia ? { advertida_en: ahora, advertida_por: usuarioId } : {}),
      },
      { onConflict: 'prestadora_id,funcion_clave' }
    );
  if (error) return fallaDelSistema(res, 'encender función de riesgo', error);

  // Recién con la función efectivamente encendida se anota que se avisó: el registro de una
  // advertencia sobre algo que no llegó a pasar no es un registro, es ruido. Al revés no aplica —
  // que el registro falle nunca hace fallar el encendido (utils/advertenciaLegal.js).
  if (advertencia) {
    await registrarAdvertencia({ prestadoraId, usuarioId, funcionClave: req.params.clave, advertencia });
  }

  res.json({ ok: true, activa, advertencia });
});

// ----------------------------------------------------------------------------
// La auditoría: qué se avisó, cuándo y a quién
// ----------------------------------------------------------------------------

// Es un informe de la administración, igual que la auditoría de la Prestadora: el Coordinador no
// lo ve.
panelIntermediacionRouter.get('/auditoria-legal', soloAdministracion, async (req, res) => {
  const { data: catalogo, error: errorCatalogo } = await catalogoDeFuncionesDeRiesgo(clienteDelPedido(req));
  if (errorCatalogo) return fallaDelSistema(res, 'catálogo de funciones de riesgo', errorCatalogo);

  // Con el trabajo de la Prestadora: la política de lectura de `usuarios` sólo le muestra a cada
  // persona su propia fila, así que el nombre de quien encendió cada función llegaría vacío.
  const { data, error } = await enLaPrestadora(req.usuarioPanel.prestadoraId, 'la auditoría legal de Match', (dbDelTrabajo) =>
    dbDelTrabajo
      .from('auditoria_advertencias_legales')
      .select('id, usuario_id, funcion_clave, jurisdiccion, texto_mostrado, created_at, usuarios(nombre)')
      .in('funcion_clave', (catalogo || []).map((f) => f.clave))
      .order('created_at', { ascending: false })
  );
  if (error) return fallaDelSistema(res, 'auditoría de advertencias legales', error);
  res.json({ auditoria: data });
});
