import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { errorDeDocumentos } from '../utils/erroresDeDocumentos.js';
import { avisarCambioDeAsistente } from '../utils/avisoCambioDeAsistente.js';
import { aplicarReemplazoAceptado } from '../utils/coberturaDeAusencia.js';
import { hoyISO } from '../utils/horarios.js';

// ============================================================================
// Los turnos de guardia que se le asignaron al Asistente y todavía no respondió.
//
// El Coordinador le asigna un turno vacante a un Asistente, y a uno solo por vez. Acá está el otro
// lado: el Asistente ve lo que se le asignó y lo acepta, o lo rechaza con un motivo de la lista de
// su Prestadora. Si lo rechaza, el Coordinador busca a otro.
//
// Lo asignado es de tres clases, y las tres se contestan una sola vez: el turno de un día, el
// turno fijo —todos sus días— y el reemplazo durante la ausencia de otro —todos los días que dura—.
//
// ----------------------------------------------------------------------------
// Qué credencial usa cada parte
// ----------------------------------------------------------------------------
//
// Todo va con la credencial del Asistente. Mientras no respondió, del turno ve lo necesario para
// decidir —día, horario, barrio y nivel de complejidad—, y eso lo arma la función
// `turnos_asignados_sin_responder` de la base. El nombre del Paciente y el domicilio exacto, recién
// al aceptar, cuando el turno ya es suyo.
//
// El rechazo es una resolución, así que pasa por la función `resolver`, que firma con la sesión.
// Aceptar pasa por `aceptar_asignacion`, que toma el turno y anota la respuesta en un solo paso.
// ============================================================================

export const appAsistentesAsignacionesRouter = Router();

// Cuánto texto se acepta cuando el motivo elegido pide que se lo escriba.
const LARGO_MAXIMO_DETALLE = 500;

/**
 * Traduce lo que levanta la base al aceptar. Las frases salen de `aceptar_asignacion` y del
 * control de documentos.
 */
function motivoDeLaAceptacion(error) {
  const texto = String(error?.message ?? '');
  if (texto.includes('asignacion_no_encontrada')) return { estado: 404, motivo: 'asignacion_no_encontrada' };
  if (texto.includes('asignacion_ya_respondida')) return { estado: 409, motivo: 'asignacion_ya_respondida' };
  if (texto.includes('guardia_ya_cubierta')) return { estado: 409, motivo: 'guardia_ya_cubierta' };
  return null;
}

/**
 * Traduce lo que levanta la base al rechazar a un código que la pantalla sepa explicar. Las
 * frases salen de `resolver` y de los disparadores de `resoluciones` y de la asignación.
 */
function motivoDelRechazo(error) {
  const texto = String(error?.message ?? '');
  if (texto.includes('resolucion_sin_detalle')) return { estado: 400, motivo: 'detalle_requerido' };
  if (texto.includes('resolucion_motivo_')) return { estado: 400, motivo: 'motivo_requerido' };
  if (texto.includes('resolucion_sin_fila') || texto.includes('asignacion_ya_respondida')) {
    return { estado: 409, motivo: 'asignacion_ya_respondida' };
  }
  return null;
}

// Una respuesta que no es un error del sistema sino una situación prevista: el turno ya no está,
// la asignación ya estaba respondida. Viaja con su motivo, que es lo que le permite a la pantalla
// decir exactamente qué pasó.
//
// El `detalle` se queda de este lado, igual que en `responderError`: puede ser el texto crudo de
// un disparador de la base, y eso no puede salir al teléfono (`celtatech/CLAUDE.md` §6). Afuera
// va el código y nada más.
function noSePudo(res, estado, motivo, detalle) {
  const donde = res?.req ? `${res.req.method} ${res.req.originalUrl ?? res.req.url}` : 'sin ruta';
  console.error(`[${estado}] ${donde} — ${motivo}:`, detalle);
  return res.status(estado).json({ error: motivo, motivo });
}

// Si el turno que acaba de aceptar era de otro Asistente, recién ahora cambió de manos: se le
// avisa al Coordinador y al Cliente quién deja de ir y quién lo reemplaza. Se lee con la
// credencial del Asistente, que ya es dueño del turno y de su asignación. Nunca voltea la
// respuesta: el turno ya es suyo.
async function avisarSiReemplaza(req, guardiaId) {
  try {
    const { data: asignacion } = await clienteDelPedido(req)
      .from('asignaciones_de_turno')
      .select('asistente_id, asistente_anterior_id, guardias(id, prestadora_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin)')
      .eq('id', req.params.id)
      .maybeSingle();

    const anterior = asignacion?.asistente_anterior_id;
    const guardia = asignacion?.guardias;
    if (!anterior || anterior === asignacion.asistente_id || !guardia || guardia.id !== guardiaId) return;

    await avisarCambioDeAsistente({
      guardias: [guardia],
      prestadoraId: guardia.prestadora_id,
      asistenteNuevoId: asignacion.asistente_id,
      asistenteAnteriorId: anterior,
    });
  } catch (e) {
    console.error(`Error avisando el reemplazo del turno ${guardiaId}:`, e.message);
  }
}

// El turno fijo y el reemplazo: la base ya anotó la respuesta, y lo que sigue se hace acá.
//
// Del turno fijo, la base ya le puso a su nombre la serie y sus días libres; queda avisar, si lo
// tenía otro, quién deja de ir. Del reemplazo, la base marcó aceptadas sus coberturas, y ahora se
// le pasan los turnos del ausente. Eso escribe turnos que todavía no son suyos, así que va con el
// trabajo de su Prestadora, que la base acota a ella. Nunca voltea la respuesta: ya quedó aceptada.
async function aplicarLoAceptado(req) {
  const { prestadoraId, asistenteId } = req.usuarioAsistente;
  try {
    const { data: asignacion } = await clienteDelPedido(req)
      .from('asignaciones_de_turno')
      .select('serie_id, ausencia_id, asistente_anterior_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!asignacion) return;

    let guardiaIds = [];
    let anterior = null;
    if (asignacion.ausencia_id) {
      const { cubiertas, titularId } = await enLaPrestadora(prestadoraId, 'aplicar el reemplazo aceptado', (db) =>
        aplicarReemplazoAceptado({ db, prestadoraId, ausenciaId: asignacion.ausencia_id, sustitutoId: asistenteId }),
      );
      guardiaIds = cubiertas;
      anterior = titularId;
    } else if (asignacion.serie_id && asignacion.asistente_anterior_id) {
      const { data } = await clienteDelPedido(req)
        .from('guardias')
        .select('id')
        .eq('serie_id', asignacion.serie_id)
        .eq('asistente_id', asistenteId)
        .gte('fecha', hoyISO());
      guardiaIds = (data ?? []).map((g) => g.id);
      anterior = asignacion.asistente_anterior_id;
    }
    if (!anterior || anterior === asistenteId || guardiaIds.length === 0) return;

    const { data: guardias } = await clienteDelPedido(req)
      .from('guardias')
      .select('id, prestadora_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin')
      .in('id', guardiaIds)
      .order('fecha', { ascending: true });
    if (!guardias?.length) return;

    await avisarCambioDeAsistente({ guardias, prestadoraId, asistenteNuevoId: asistenteId, asistenteAnteriorId: anterior });
  } catch (e) {
    console.error(`Error aplicando lo aceptado en la asignación ${req.params.id}:`, e.message);
  }
}

// Quien rechaza el reemplazo no lo hace: sus coberturas de esa ausencia quedan objetadas, y en el
// Panel se ve que hay que buscar a otro. Con el trabajo de la Prestadora, porque el Asistente no
// tiene permiso sobre las coberturas.
async function dejarElReemplazo(req, ausenciaId) {
  const { prestadoraId, asistenteId } = req.usuarioAsistente;
  try {
    await enLaPrestadora(prestadoraId, 'dejar el reemplazo rechazado', async (db) => {
      const { error } = await db
        .from('coberturas_de_ausencia')
        .update({ objetada_at: new Date().toISOString() })
        .eq('prestadora_id', prestadoraId)
        .eq('ausencia_id', ausenciaId)
        .eq('asistente_sustituto_id', asistenteId)
        .is('aceptada_at', null)
        .is('objetada_at', null);
      if (error) throw error;
    });
  } catch (e) {
    console.error(`Error dejando el reemplazo rechazado de la ausencia ${ausenciaId}:`, e.message);
  }
}

// ============================================================================
// Lo que hoy tiene para responder
// ============================================================================

// Se muestra sólo lo que sigue vivo: sin responder, con el turno todavía sin cubrir y sin
// cancelar. Junto va la lista de motivos de rechazo de la Prestadora, que es la que se elige al
// rechazar.
appAsistentesAsignacionesRouter.get('/', requiereRolAsistente, async (req, res) => {
  const [asignaciones, motivos] = await Promise.all([
    clienteDelPedido(req).rpc('turnos_asignados_sin_responder'),
    clienteDelPedido(req)
      .from('motivos_resolucion')
      .select('id, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden')
      .eq('tabla', 'asignaciones_de_turno')
      .eq('estado', 'rechazada')
      .eq('activo', true)
      .order('orden', { ascending: true }),
  ]);

  if (asignaciones.error) return responderError(res, asignaciones.error);
  if (motivos.error) return responderError(res, motivos.error);

  res.json({
    asignaciones: (asignaciones.data ?? []).map((a) => ({
      id: a.asignacion_id,
      asignado_at: a.asignado_at,
      tipo: a.tipo,
      serie_id: a.serie_id ?? null,
      ausencia_id: a.ausencia_id ?? null,
      dias_semana: a.dias_semana ?? [],
      desde: a.desde ?? null,
      hasta: a.hasta ?? null,
      cantidad: a.cantidad ?? null,
      guardia: {
        id: a.guardia_id,
        fecha: a.fecha,
        hora_inicio: a.hora_inicio,
        hora_fin: a.hora_fin,
        dias_hasta_el_fin: a.dias_hasta_el_fin,
        modalidad: a.modalidad,
        barrios: a.barrios ?? [],
        niveles_de_complejidad: a.niveles_de_complejidad ?? [],
      },
    })),
    motivos: (motivos.data ?? []).map((m) => ({
      id: m.id,
      nombre_es_ar: m.nombre_es_ar,
      nombre_en: m.nombre_en,
      nombre_pt_br: m.nombre_pt_br,
      pide_detalle: m.pide_detalle,
    })),
  });
});

// ============================================================================
// Aceptar o rechazar
// ============================================================================

appAsistentesAsignacionesRouter.post('/:id/responder', requiereRolAsistente, async (req, res) => {
  const { respuesta } = req.body ?? {};
  if (respuesta !== 'acepta' && respuesta !== 'rechaza') {
    // Sin motivo a propósito: esto no le puede pasar a nadie desde la aplicación, que manda
    // una de las dos palabras y nada más.
    return res.status(400).json({ error: 'Respuesta no reconocida' });
  }

  // --- Aceptar ---

  // Las comprobaciones —que la asignación sea suya, que siga sin responder y que el turno siga
  // libre— las hace la función, en el mismo paso en que toma el turno.
  if (respuesta === 'acepta') {
    const { data: guardiaId, error: falla } = await clienteDelPedido(req).rpc('aceptar_asignacion', {
      p_asignacion_id: req.params.id,
    });
    if (falla) {
      const previsto = motivoDeLaAceptacion(falla);
      if (previsto) return noSePudo(res, previsto.estado, previsto.motivo, falla.message);
      // Un documento pendiente puede frenar la aceptación, y con razón: entre la asignación y
      // esta respuesta pudo vencerse. Viaja con los nombres de los que faltan.
      return responderError(res, errorDeDocumentos(falla) ?? falla);
    }
    if (guardiaId) {
      await avisarSiReemplaza(req, guardiaId);
    } else {
      await aplicarLoAceptado(req);
    }
    return res.json({ respuesta: 'acepta', guardiaId: guardiaId ?? null });
  }

  // --- Rechazar ---

  // La asignación tiene que ser de esta persona. Se lee con su credencial: si no es suya, para el
  // Asistente no existe y se contesta lo mismo que si el número estuviera mal escrito.
  const { data: asignacion } = await clienteDelPedido(req)
    .from('asignaciones_de_turno')
    .select('id, estado, ausencia_id')
    .eq('id', req.params.id)
    .eq('asistente_id', req.usuarioAsistente.asistenteId)
    .maybeSingle();

  if (!asignacion) {
    return noSePudo(res, 404, 'asignacion_no_encontrada', 'Asignación no encontrada');
  }
  if (asignacion.estado !== 'sin_responder') {
    return noSePudo(res, 409, 'asignacion_ya_respondida', 'La asignación ya estaba respondida');
  }

  const motivoId = typeof req.body?.motivoId === 'string' ? req.body.motivoId : '';
  if (!motivoId) return noSePudo(res, 400, 'motivo_requerido', 'Falta el motivo');

  const detalle =
    typeof req.body?.detalle === 'string' && req.body.detalle.trim()
      ? req.body.detalle.trim().slice(0, LARGO_MAXIMO_DETALLE)
      : null;

  const { error: falla } = await clienteDelPedido(req).rpc('resolver', {
    p_tabla: 'asignaciones_de_turno',
    p_fila_id: String(asignacion.id),
    p_motivo_id: motivoId,
    p_detalle: detalle,
  });

  if (falla) {
    const previsto = motivoDelRechazo(falla);
    if (previsto) return noSePudo(res, previsto.estado, previsto.motivo, falla.message);
    return responderError(res, falla);
  }
  if (asignacion.ausencia_id) await dejarElReemplazo(req, asignacion.ausencia_id);
  res.json({ respuesta: 'rechaza' });
});
