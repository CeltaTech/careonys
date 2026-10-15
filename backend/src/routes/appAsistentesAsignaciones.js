import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { supabase, clienteDelPedido } from '../db/connection.js';
import { conPacientes } from '../utils/pacientesDeGuardia.js';
import { conDomicilioDelDia } from '../utils/domicilioDelDia.js';
import { FICHA_DOMICILIO, FICHA_NOMBRE } from '../utils/fichaDelPaciente.js';
import { visibilidadDelPedido } from '../utils/visibilidadPrestadora.js';
import { columnasSegunVisibilidad } from '../utils/catalogoVisibilidad.js';
import { responderError } from '../utils/errorConMotivo.js';

// ============================================================================
// Los turnos de guardia que se le asignaron al Asistente y todavía no respondió.
//
// El Coordinador le asigna un turno vacante a un Asistente, y a uno solo por vez. Acá está el otro
// lado: el Asistente ve lo que se le asignó y lo acepta, o lo rechaza con un motivo de la lista de
// su Prestadora. Si lo rechaza, el Coordinador busca a otro.
//
// ----------------------------------------------------------------------------
// Qué credencial usa cada parte
// ----------------------------------------------------------------------------
//
// La lista, los motivos y el rechazo van con la credencial del Asistente: la base le deja ver sus
// asignaciones, el turno de cada una mientras está sin responder y la lista de motivos de su
// Prestadora, y le deja pasar la suya a rechazada y nada más. El rechazo es una resolución, así que
// pasa por la función `resolver` de la base, que firma con la sesión.
//
// Aceptar sigue con la llave maestra, con el filtro por Prestadora y por Asistente escrito en cada
// consulta (CLAUDE.md §5, regla de aislamiento): aceptar es ponerse en una guardia que todavía no
// tiene a nadie, y la base no deja que un Asistente escriba en una guardia que no es suya.
// ============================================================================

export const appAsistentesAsignacionesRouter = Router();

// Cuánto texto se acepta cuando el motivo elegido pide que se lo escriba.
const LARGO_MAXIMO_DETALLE = 500;

// Con qué datos del Paciente se dibuja una asignación. Es la misma lista que la de sus guardias
// (`appAsistentes.js`), y por el mismo motivo: hay Prestadoras que no dan el domicilio exacto
// hasta que el turno está confirmado, y lo que está apagado no se pide, así que no viaja.
function camposDePacienteEnLaAsignacion(visibilidad) {
  const ficha = visibilidad.asistente_domicilio_del_paciente !== false ? FICHA_DOMICILIO : FICHA_NOMBRE;
  return columnasSegunVisibilidad(['id', ficha], visibilidad);
}

// Los datos del turno que necesita quien está decidiendo si lo acepta.
const CAMPOS_DE_GUARDIA =
  'id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, modalidad, estado, asistente_id';

/**
 * Traduce el rechazo de un disparador de la base a un motivo que la pantalla sepa explicar.
 *
 * Cuando la Matrícula o la modalidad de trabajo frenan una asignación, la base levanta un
 * mensaje con esta forma exacta:
 *
 *     matricula_bloquea:vencida:
 *     modalidad_bloquea:intermediacion:
 *
 * Ese texto no puede llegar nunca a la pantalla. Acá se lo abre y se devuelve el código que las
 * traducciones convierten en una frase. Si el error es otra cosa, devuelve `null` y la ruta lo
 * trata como una falla común.
 *
 * El Panel hace esta misma lectura por su cuenta, en `panel/src/lib/matricula.js`: son dos
 * unidades que se despliegan por separado y no pueden compartir código.
 */
function motivoDelBloqueo(error) {
  const texto = String(error?.message ?? error ?? '');

  const matricula = /matricula_bloquea:([a-z_]+)/.exec(texto);
  if (matricula) return `matricula_${matricula[1]}`;

  if (/modalidad_bloquea:/.test(texto)) return 'modalidad_no_habilitada';

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

// ============================================================================
// Lo que hoy tiene para responder
// ============================================================================

// Se muestra sólo lo que sigue vivo: sin responder, con el turno todavía sin cubrir y sin
// cancelar. Junto va la lista de motivos de rechazo de la Prestadora, que es la que se elige al
// rechazar.
appAsistentesAsignacionesRouter.get('/', requiereRolAsistente, async (req, res) => {
  const [asignaciones, motivos] = await Promise.all([
    clienteDelPedido(req)
      .from('asignaciones_de_turno')
      .select(`id, asignado_at, guardia_id, guardias!inner(${CAMPOS_DE_GUARDIA})`)
      .eq('asistente_id', req.usuarioAsistente.asistenteId)
      .eq('estado', 'sin_responder')
      .eq('guardias.estado', 'programada')
      .is('guardias.asistente_id', null)
      .order('asignado_at', { ascending: false })
      .limit(50),
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

  const vivas = asignaciones.data ?? [];

  try {
    const visibilidad = await visibilidadDelPedido(req);
    // La dirección que se muestra es la del día del turno, no la del Legajo del Paciente: es con
    // ese dato que se decide si se acepta (`utils/domicilioDelDia.js`).
    const guardias = await conDomicilioDelDia(
      supabase,
      await conPacientes(
        supabase,
        req.usuarioAsistente.prestadoraId,
        vivas.map((a) => a.guardias),
        camposDePacienteEnLaAsignacion(visibilidad)
      )
    );
    const porId = new Map(guardias.map((g) => [g.id, g]));

    res.json({
      asignaciones: vivas.map((a) => ({
        id: a.id,
        asignado_at: a.asignado_at,
        guardia: porId.get(a.guardia_id) ?? null,
      })),
      motivos: (motivos.data ?? []).map((m) => ({
        id: m.id,
        nombre_es_ar: m.nombre_es_ar,
        nombre_en: m.nombre_en,
        nombre_pt_br: m.nombre_pt_br,
        pide_detalle: m.pide_detalle,
      })),
    });
  } catch (e) {
    responderError(res, e);
  }
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

  // La asignación tiene que ser de esta persona. Se lee con su credencial: si no es suya, para el
  // Asistente no existe y se contesta lo mismo que si el número estuviera mal escrito.
  const { data: asignacion } = await clienteDelPedido(req)
    .from('asignaciones_de_turno')
    .select(`id, estado, guardia_id, guardias(${CAMPOS_DE_GUARDIA})`)
    .eq('id', req.params.id)
    .eq('asistente_id', req.usuarioAsistente.asistenteId)
    .maybeSingle();

  if (!asignacion) {
    return noSePudo(res, 404, 'asignacion_no_encontrada', 'Asignación no encontrada');
  }
  if (asignacion.estado !== 'sin_responder') {
    return noSePudo(res, 409, 'asignacion_ya_respondida', 'La asignación ya estaba respondida');
  }

  // --- Rechazar ---

  if (respuesta === 'rechaza') {
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
    return res.json({ respuesta: 'rechaza' });
  }

  // --- Aceptar ---

  const guardia = asignacion.guardias;
  if (!guardia || guardia.estado !== 'programada' || guardia.asistente_id) {
    return noSePudo(res, 409, 'guardia_ya_cubierta', 'El turno ya no está disponible');
  }

  // Primero se toma el turno y después se anota la respuesta, en ese orden. Al revés, si el turno
  // ya no estuviera libre, quedaría anotado que esta persona aceptó uno que no tiene.
  const { data: tomada, error: fallaGuardia } = await supabase
    .from('guardias')
    .update({ asistente_id: req.usuarioAsistente.asistenteId })
    .eq('id', guardia.id)
    .eq('prestadora_id', req.usuarioAsistente.prestadoraId)
    .is('asistente_id', null)
    .select('id');

  if (fallaGuardia) {
    // La Matrícula o la modalidad de trabajo pueden frenar la asignación en la base, y con
    // razón: entre la asignación y esta respuesta pudo vencerse el papel que lo autoriza.
    const bloqueo = motivoDelBloqueo(fallaGuardia);
    if (bloqueo) return noSePudo(res, 409, bloqueo, fallaGuardia.message);
    return responderError(res, fallaGuardia);
  }
  if (!tomada?.length) {
    return noSePudo(res, 409, 'guardia_ya_cubierta', 'El turno ya no está disponible');
  }

  const { data: aceptada, error: fallaAsignacion } = await supabase
    .from('asignaciones_de_turno')
    .update({ estado: 'aceptada' })
    .eq('id', asignacion.id)
    .eq('prestadora_id', req.usuarioAsistente.prestadoraId)
    .eq('asistente_id', req.usuarioAsistente.asistenteId)
    .eq('estado', 'sin_responder')
    .select('id');

  if (fallaAsignacion || !aceptada?.length) {
    // El turno vuelve a quedar vacante como estaba. Quedárselo sin que la asignación diga que lo
    // aceptó sería un turno asignado que nadie sabe por qué.
    await supabase
      .from('guardias')
      .update({ asistente_id: null })
      .eq('id', guardia.id)
      .eq('prestadora_id', req.usuarioAsistente.prestadoraId);

    if (!fallaAsignacion) {
      return noSePudo(res, 409, 'asignacion_ya_respondida', 'La asignación ya estaba respondida');
    }
    const bloqueo = motivoDelBloqueo(fallaAsignacion);
    if (bloqueo) return noSePudo(res, 409, bloqueo, fallaAsignacion.message);
    return responderError(res, fallaAsignacion);
  }

  res.json({ respuesta: 'acepta', guardiaId: guardia.id });
});
