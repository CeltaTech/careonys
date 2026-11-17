import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { prestadoraVisible } from '../utils/prestadoraVisible.js';
import { registrarActividad } from '../utils/registroDeActividad.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { textoDelAviso } from '../i18n/incidentesDeSeguridad.js';

/* Los incidentes de seguridad, vistos desde el Panel.
   ======================================================================================

   QUÉ SE HACE DESDE ACÁ. Cargar un incidente, agregarle los pacientes alcanzados, cargar la
   evaluación de los cuatro factores del riesgo, anotar a quién se avisó y cuándo, ver la lista
   de incidentes y ver uno con su cuenta regresiva y el texto del aviso de su país.

   SÓLO LA ADMINISTRACIÓN. El candado de la ruta deja pasar sólo a la administración de la
   Prestadora, y la base repite el mismo control en sus políticas: aunque alguien se saltee esta
   ruta, la base no le muestra ni le deja escribir un incidente.

   TODO INCIDENTE QUEDA ANOTADO Y NO SE BORRA. No hay ruta de borrado ni de corrección de lo que
   se anotó del hecho. Lo que se corrige es la evaluación, y los avisos se anotan una sola vez.

   EL PRODUCTO AVISA Y NO DECIDE. La cuenta regresiva sale de los plazos que la ley del país
   escribe con número y artículo; un país sin plazo cargado no tiene cuenta regresiva. El texto
   del aviso sale de la plantilla de ese país; un país sin plantilla no tiene texto. Ninguna de
   las dos cosas frena nada: quien decide si avisa, y cuándo, es la Prestadora.

   CON LA CREDENCIAL DE QUIEN PIDE. Todo entra a la base con `clienteDelPedido(req)`: la base
   sabe quién pide y le contesta sólo lo de su Prestadora. Quién cargó y quién evaluó lo pone la
   base, nunca el pedido. El registro de actividad va con el trabajo de la Prestadora: es de
   `registrarActividad`, y guarda qué columnas cambiaron, nunca su contenido. */

export const ACCION_ALTA_DE_INCIDENTE = 'alta_de_incidente_de_seguridad';
export const ACCION_ALTA_DE_PACIENTE_ALCANZADO = 'alta_de_paciente_alcanzado_por_incidente';
export const ACCION_EVALUACION_DE_INCIDENTE = 'evaluacion_de_incidente_de_seguridad';
export const ACCION_NOTIFICACION_DE_INCIDENTE = 'notificacion_de_incidente_de_seguridad';

export const panelIncidentesDeSeguridadRouter = Router();

panelIncidentesDeSeguridadRouter.use(
  requiereRolPanel,
  exigirAdministracion('Solo Admin o Superadmin puede ver los incidentes de seguridad'),
  exigirOrganizacionActiva,
);

const COLUMNAS =
  'id, prestadora_id, ocurrido_at, conocido_at, descripcion, cargado_por, '
  + 'autoridad_notificada_at, titulares_notificados_at, responsable_notificado_at, '
  + 'factor_naturaleza_y_alcance, factor_quien_recibio, factor_adquiridos_o_vistos, factor_mitigacion, '
  + 'conclusion, evaluado_por, evaluado_at, created_at, updated_at';

const COLUMNAS_DE_PACIENTES =
  'id, paciente_id, created_at, '
  + 'paciente:pacientes!pacientes_de_incidentes_el_paciente_es_de_la_prestadora('
  + 'id, persona:personas!pacientes_persona_de_la_misma_prestadora(nombre_visible))';

const FACTORES = [
  'factor_naturaleza_y_alcance',
  'factor_quien_recibio',
  'factor_adquiridos_o_vistos',
  'factor_mitigacion',
];

const CONCLUSIONES = ['baja_probabilidad_de_compromiso', 'se_presume_brecha'];

// A quién se avisa, y en qué columna del incidente queda anotado.
const COLUMNA_DEL_AVISO = {
  autoridad: 'autoridad_notificada_at',
  titular: 'titulares_notificados_at',
  responsable: 'responsable_notificado_at',
};

/** Un instante que vino en el pedido, como texto ISO, o `null` si no se entiende. */
function instante(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** El incidente que la base deja ver a quien pide, o `null`. */
async function incidenteVisible(db, id) {
  const { data, error } = await db
    .from('incidentes_de_seguridad')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// La lista: todos los incidentes de la Prestadora, se haya avisado o no.
panelIncidentesDeSeguridadRouter.get('/', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('incidentes_de_seguridad')
    .select(COLUMNAS)
    .order('conocido_at', { ascending: false });
  if (error) return responderError(res, error);
  res.json({ incidentes: data ?? [] });
});

// Cargar un incidente. Cuándo ocurrió y cuándo se supo son obligatorios: cada ley cuenta su
// plazo desde uno de los dos.
panelIncidentesDeSeguridadRouter.post('/', async (req, res) => {
  const ocurrido = instante(req.body?.ocurrido_at);
  const conocido = instante(req.body?.conocido_at);
  const descripcion = texto(req.body?.descripcion);
  if (!ocurrido || !conocido || !descripcion) {
    return responderError(res, new ErrorConMotivo('faltan_datos', 'incidente sin fechas o sin descripción'));
  }
  if (conocido < ocurrido) {
    return responderError(res, new ErrorConMotivo('fecha_anterior', 'se supo antes de que ocurriera'));
  }

  try {
    const db = clienteDelPedido(req);
    const prestadoraId = await prestadoraVisible(db);
    const { data, error } = await db
      .from('incidentes_de_seguridad')
      .insert({ prestadora_id: prestadoraId, ocurrido_at: ocurrido, conocido_at: conocido, descripcion })
      .select(COLUMNAS)
      .single();
    if (error) throw error;

    await registrarActividad(req.usuarioPanel, ACCION_ALTA_DE_INCIDENTE, {
      tablaAfectada: 'incidentes_de_seguridad',
      registroId: data.id,
      camposCambiados: ['ocurrido_at', 'conocido_at', 'descripcion'],
    });
    res.status(201).json({ incidente: data });
  } catch (error) {
    responderError(res, error);
  }
});

// Ver uno: el incidente, sus pacientes alcanzados, la cuenta regresiva de cada plazo del país y
// el texto del aviso de cada destinatario que tenga plantilla.
panelIncidentesDeSeguridadRouter.get('/:id', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const incidente = await incidenteVisible(db, req.params.id);
    if (!incidente) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');

    const [pacientes, cuenta, plantillas, idioma] = await Promise.all([
      db.from('pacientes_de_incidentes').select(COLUMNAS_DE_PACIENTES)
        .eq('incidente_id', incidente.id).order('created_at', { ascending: true }),
      db.rpc('cuenta_regresiva_del_incidente', { p_incidente: incidente.id }),
      // La base deja ver sólo las plantillas del país de la Prestadora. Se toma la vigente a la
      // fecha en que ocurrió el incidente, igual que los plazos.
      db.from('plantillas_de_aviso_de_brechas')
        .select('destinatario, texto, contenido_minimo, fuente, vigencia_desde, vigencia_hasta')
        .lte('vigencia_desde', incidente.ocurrido_at.slice(0, 10))
        .order('vigencia_desde', { ascending: false }),
      idiomaDeLaPrestadora(db, incidente.prestadora_id),
    ]);
    if (pacientes.error) throw pacientes.error;
    if (cuenta.error) throw cuenta.error;
    if (plantillas.error) throw plantillas.error;

    const fechaDelHecho = incidente.ocurrido_at.slice(0, 10);
    const vigentes = new Map();
    for (const plantilla of plantillas.data ?? []) {
      if (plantilla.vigencia_hasta && plantilla.vigencia_hasta < fechaDelHecho) continue;
      if (!vigentes.has(plantilla.destinatario)) vigentes.set(plantilla.destinatario, plantilla);
    }

    const listaDePacientes = pacientes.data ?? [];
    const avisos = [...vigentes.values()]
      .map((plantilla) => ({
        destinatario: plantilla.destinatario,
        texto: textoDelAviso({
          plantilla,
          idioma,
          zona: req.query?.zona,
          incidente,
          cantidadDePacientes: listaDePacientes.length,
        }),
        contenido_minimo: plantilla.contenido_minimo ?? [],
        fuente: plantilla.fuente,
      }))
      .filter((aviso) => aviso.texto);

    res.json({ incidente, pacientes: listaDePacientes, plazos: cuenta.data ?? [], avisos });
  } catch (error) {
    responderError(res, error);
  }
});

panelIncidentesDeSeguridadRouter.get('/:id/pacientes', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const incidente = await incidenteVisible(db, req.params.id);
    if (!incidente) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');

    const { data, error } = await db
      .from('pacientes_de_incidentes')
      .select(COLUMNAS_DE_PACIENTES)
      .eq('incidente_id', incidente.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ pacientes: data ?? [] });
  } catch (error) {
    responderError(res, error);
  }
});

// Agregar pacientes alcanzados: uno o varios por pedido. Un paciente que ya estaba no se
// duplica ni da error: la lista queda igual. Un paciente de otra Prestadora no entra, porque la
// base exige que el paciente y el incidente sean de la misma.
panelIncidentesDeSeguridadRouter.post('/:id/pacientes', async (req, res) => {
  const pedidos = Array.isArray(req.body?.pacientes) ? req.body.pacientes : [req.body?.paciente_id];
  const pacientesIds = [...new Set(pedidos.map(texto).filter(Boolean))];
  if (pacientesIds.length === 0) {
    return responderError(res, new ErrorConMotivo('faltan_datos', 'sin pacientes'));
  }

  try {
    const db = clienteDelPedido(req);
    const incidente = await incidenteVisible(db, req.params.id);
    if (!incidente) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');

    const filas = pacientesIds.map((pacienteId) => ({
      prestadora_id: incidente.prestadora_id,
      incidente_id: incidente.id,
      paciente_id: pacienteId,
    }));
    const { error } = await db
      .from('pacientes_de_incidentes')
      .upsert(filas, { onConflict: 'incidente_id,paciente_id', ignoreDuplicates: true });
    if (error) {
      // La clave foránea rechaza un paciente que no existe o que es de otra Prestadora. Las dos
      // cosas se contestan igual: no se distingue «no existe» de «no es suyo».
      if (error.code === '23503') throw new ErrorConMotivo('paciente_no_encontrado', error.message);
      throw error;
    }

    await registrarActividad(req.usuarioPanel, ACCION_ALTA_DE_PACIENTE_ALCANZADO, {
      tablaAfectada: 'pacientes_de_incidentes',
      registroId: incidente.id,
      camposCambiados: ['paciente_id'],
    });

    const lista = await db
      .from('pacientes_de_incidentes')
      .select(COLUMNAS_DE_PACIENTES)
      .eq('incidente_id', incidente.id)
      .order('created_at', { ascending: true });
    if (lista.error) throw lista.error;
    res.status(201).json({ pacientes: lista.data ?? [] });
  } catch (error) {
    responderError(res, error);
  }
});

// La evaluación de los cuatro factores y la conclusión. Van los cinco juntos: una conclusión sin
// los cuatro factores no es una evaluación, y la base la rechaza igual.
panelIncidentesDeSeguridadRouter.put('/:id/evaluacion', async (req, res) => {
  const cambios = {};
  for (const factor of FACTORES) cambios[factor] = texto(req.body?.[factor]);
  cambios.conclusion = texto(req.body?.conclusion);
  if (FACTORES.some((factor) => !cambios[factor]) || !CONCLUSIONES.includes(cambios.conclusion)) {
    return responderError(res, new ErrorConMotivo('faltan_datos', 'evaluación incompleta'));
  }

  try {
    const db = clienteDelPedido(req);
    const { data, error } = await db
      .from('incidentes_de_seguridad')
      .update(cambios)
      .eq('id', req.params.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');

    await registrarActividad(req.usuarioPanel, ACCION_EVALUACION_DE_INCIDENTE, {
      tablaAfectada: 'incidentes_de_seguridad',
      registroId: data.id,
      camposCambiados: Object.keys(cambios),
    });
    res.json({ incidente: data });
  } catch (error) {
    responderError(res, error);
  }
});

// Anotar que se avisó a un destinatario. Sin fecha, es ahora. Un aviso se anota una sola vez:
// la fecha de un aviso que ya salió no se cambia.
panelIncidentesDeSeguridadRouter.post('/:id/notificado', async (req, res) => {
  const columna = COLUMNA_DEL_AVISO[texto(req.body?.destinatario)];
  const vinoFecha = req.body?.notificado_at !== undefined && req.body?.notificado_at !== null;
  const cuando = vinoFecha ? instante(req.body.notificado_at) : new Date().toISOString();
  if (!columna || !cuando) {
    return responderError(res, new ErrorConMotivo('faltan_datos', 'aviso sin destinatario o con fecha ilegible'));
  }

  try {
    const db = clienteDelPedido(req);
    const incidente = await incidenteVisible(db, req.params.id);
    if (!incidente) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');
    if (incidente[columna]) {
      return res.status(409).json({ error: 'aviso_ya_dado', motivo: 'aviso_ya_dado' });
    }
    if (cuando < new Date(incidente.ocurrido_at).toISOString()) {
      throw new ErrorConMotivo('fecha_anterior', 'aviso anterior al incidente');
    }

    const { data, error } = await db
      .from('incidentes_de_seguridad')
      .update({ [columna]: cuando })
      .eq('id', incidente.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ErrorConMotivo('no_encontrado', 'incidente no visible');

    await registrarActividad(req.usuarioPanel, ACCION_NOTIFICACION_DE_INCIDENTE, {
      tablaAfectada: 'incidentes_de_seguridad',
      registroId: data.id,
      camposCambiados: [columna],
    });
    res.json({ incidente: data });
  } catch (error) {
    responderError(res, error);
  }
});
