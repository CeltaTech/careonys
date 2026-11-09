import { supabase } from './supabaseClient';
import { lugaresDe, lugaresDeVarias } from './lugaresDeCadaPersona';

/* El cierre de un Servicio para un Paciente.
   ==========================================================================

   Es una sola regla y la usan dos lugares: la baja de un Paciente desde sus prestaciones, y la
   baja del Servicio entero, que la corre una vez por cada Paciente del Servicio. Lo que se pactó
   es el Servicio, así que todo lo que se da de baja acá se acota a él: si el Cliente tiene otro
   Servicio abierto para este mismo Paciente, ése sigue corriendo.

   No pregunta ni confirma: eso lo hace quien la llama, antes. Devuelve `{ error }` con el error
   de la base tal como vino, para que quien la llama lo muestre con `mensajeDeError`. */
export async function cerrarServicioDelPaciente({ prestadoraId, usuario, servicioId, pacienteId, motivo, motivoDetalle }) {
  const { data: cierre, error: errorInsert } = await supabase
    .from('cierres_servicio_paciente')
    .insert({
      prestadora_id: prestadoraId,
      servicio_id: servicioId,
      paciente_id: pacienteId,
      motivo,
      motivo_detalle: motivoDetalle ?? null,
      cerrado_por: usuario.id,
    })
    .select()
    .single();
  if (errorInsert) return { error: errorInsert };

  // La consulta de los Asistentes involucrados corre recién acá, después de insertar el cierre:
  // la política "coordinador_cierra_servicio_*" que le da visibilidad a un Coordinador fuera de
  // zona depende de que ese registro ya exista, y pregunta por el Servicio del cierre y no por el
  // Paciente. Y tiene que ir antes de la baja de más abajo, porque filtra por 'activa'/'programada'.
  const [seriesActivas, guardiasProgramadas] = await Promise.all([
    supabase
      .from('series_guardias')
      .select('asistente_id')
      .eq('paciente_id', pacienteId)
      .eq('servicio_id', servicioId)
      .eq('estado', 'activa'),
    supabase
      .from('guardias')
      .select('asistente_id')
      .eq('paciente_id', pacienteId)
      .eq('servicio_id', servicioId)
      .eq('estado', 'programada'),
  ]);

  const asistentesInvolucrados = [
    ...new Set(
      [...(seriesActivas.data ?? []), ...(guardiasProgramadas.data ?? [])]
        .map((fila) => fila.asistente_id)
        .filter(Boolean),
    ),
  ];

  const ahora = new Date().toISOString();
  const resultados = await Promise.all([
    // La fecha de fin no se manda desde acá: la pone la base al ver la baja, con su propio reloj,
    // y recorta sola lo que estaba pactado para más adelante.
    supabase
      .from('prestaciones')
      .update({ estado: 'de_baja' })
      .eq('paciente_id', pacienteId)
      .eq('servicio_id', servicioId)
      .eq('estado', 'vigente'),
    supabase
      .from('series_guardias')
      .update({ estado: 'cancelada', cancelacion_origen: 'prestadora', cancelado_at: ahora })
      .eq('paciente_id', pacienteId)
      .eq('servicio_id', servicioId)
      .eq('estado', 'activa'),
    supabase
      .from('guardias')
      .update({ estado: 'cancelada', cancelacion_origen: 'prestadora', cancelacion_alcance: 'total' })
      .eq('paciente_id', pacienteId)
      .eq('servicio_id', servicioId)
      .eq('estado', 'programada'),
    ...(asistentesInvolucrados.length > 0
      ? [
          supabase.from('cierre_servicio_asistentes').insert(
            asistentesInvolucrados.map((asistenteId) => ({
              prestadora_id: prestadoraId,
              cierre_id: cierre.id,
              asistente_id: asistenteId,
            })),
          ),
        ]
      : []),
  ]);

  const errorCascada = resultados.find((r) => r.error)?.error;
  if (errorCascada) return { error: errorCascada };

  if (usuario.rol === 'coordinador' && asistentesInvolucrados.length > 0) {
    // Quién quedó fuera del alcance de quien cierra se resuelve cruzando lugares con lugares.
    const [lugaresDeQuienCierra, lugaresPorAsistente] = await Promise.all([
      lugaresDe('usuario_lugares', 'usuario_id', usuario.id),
      lugaresDeVarias('asistente_lugares', 'asistente_id', asistentesInvolucrados),
    ]);
    const fueraDeZona = asistentesInvolucrados.filter(
      (asistenteId) =>
        !(lugaresPorAsistente.get(asistenteId) ?? []).some((lugar) => lugaresDeQuienCierra.includes(lugar)),
    );
    if (fueraDeZona.length > 0) {
      await supabase.from('notificaciones_cierre_servicio').insert(
        fueraDeZona.map((asistenteId) => ({
          prestadora_id: prestadoraId,
          cierre_id: cierre.id,
          paciente_id: pacienteId,
          asistente_id: asistenteId,
          cerrado_por: usuario.id,
          motivo,
          motivo_detalle: motivoDetalle ?? null,
        })),
      );
    }
  }

  return { error: null };
}
