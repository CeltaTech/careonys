/**
 * Lee de la base el equipo de un Servicio: quiénes lo atienden y quiénes lo coordinan.
 *
 * El equipo lo arma `equipoDelServicio` a partir de los turnos de guardia, las series, las
 * correcciones a mano y la regla de la Prestadora. Esto sólo junta esos datos y los nombres, y es
 * la única lectura del equipo que tiene el Panel. Ante cualquier error de la base, lo lanza para
 * que quien llama muestre el estado de error.
 */
import { equipoDelServicio, reglaDeEquipoDe } from './equipoDelServicio';

const nombreDe = (persona) => `${persona?.apellido ?? ''} ${persona?.nombre ?? ''}`.trim();

const sinFilas = Promise.resolve({ data: [], error: null });

const sinRepetir = (filas, campo) => [...new Set(filas.map((fila) => fila[campo]))];

/** Los datos del equipo, sin nombres: `{ equipo, turnos_guardia }`. */
async function leerElEquipo(supabase, servicio, ahora) {
  const [turnos_guardia, series, configuracion, decisiones] = await Promise.all([
    supabase
      .from('turnos_guardia')
      .select('id, servicio_id, asistente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado')
      .eq('servicio_id', servicio.id),
    supabase
      .from('series_turnos_guardia')
      .select('id, servicio_id, asistente_id, estado, vigente_hasta')
      .eq('servicio_id', servicio.id),
    supabase.from('configuracion_equipo_paciente').select('regla').eq('prestadora_id', servicio.prestadora_id).maybeSingle(),
    supabase.from('equipo_servicio').select('*').eq('servicio_id', servicio.id),
  ]);
  for (const respuesta of [turnos_guardia, series, configuracion, decisiones]) {
    if (respuesta.error) throw respuesta.error;
  }

  const equipo = equipoDelServicio({
    servicioId: servicio.id,
    turnos_guardia: turnos_guardia.data ?? [],
    series: series.data ?? [],
    decisiones: decisiones.data ?? [],
    coordinadorDelServicio: servicio.coordinador_id ?? null,
    regla: reglaDeEquipoDe(configuracion.data?.regla),
    ahora,
  });
  return { equipo, turnos_guardia: turnos_guardia.data ?? [] };
}

/** Los nombres de esos Asistentes y de esos usuarios del Panel, como dos funciones que dan un guion si falta. */
async function leerNombres(supabase, idsAsistentes, idsUsuarios = []) {
  const [personas, usuarios] = await Promise.all([
    idsAsistentes.length ? supabase.from('asistentes').select('id, nombre, apellido').in('id', idsAsistentes) : sinFilas,
    idsUsuarios.length ? supabase.from('usuarios').select('id, nombre').in('id', idsUsuarios) : sinFilas,
  ]);
  for (const respuesta of [personas, usuarios]) {
    if (respuesta.error) throw respuesta.error;
  }
  const asistentesPorId = new Map((personas.data ?? []).map((a) => [a.id, a]));
  const nombresDeUsuario = new Map((usuarios.data ?? []).map((u) => [u.id, nombreDe(u)]));
  return {
    nombreDeAsistente: (id) => (asistentesPorId.has(id) ? nombreDe(asistentesPorId.get(id)) : '—'),
    nombreDeUsuario: (id) => nombresDeUsuario.get(id) || '—',
  };
}

/**
 * El equipo entero, con los nombres.
 *
 * Devuelve `{ equipo, turnos_guardia, idsAsistentes, nombreDeAsistente, nombreDeUsuario }`:
 * `equipo` es lo que contesta `equipoDelServicio` —asistentes, afuera y coordinadores—,
 * `turnos_guardia` son los del Servicio tal como se leyeron, `idsAsistentes` son los que están en el
 * equipo o quedaron afuera a mano, y las dos funciones dan el nombre de un Asistente o de un
 * usuario del Panel, o un guion si no se encontró.
 */
export async function leerEquipoCompletoDelServicio(supabase, servicio, ahora = new Date()) {
  const { equipo, turnos_guardia } = await leerElEquipo(supabase, servicio, ahora);
  const idsAsistentes = sinRepetir([...equipo.asistentes, ...equipo.afuera], 'asistente_id');
  const nombres = await leerNombres(supabase, idsAsistentes, sinRepetir(equipo.coordinadores, 'usuario_id'));
  return { equipo, turnos_guardia, idsAsistentes, ...nombres };
}

/**
 * Los Asistentes del equipo, con su nombre. Devuelve `[{ asistente_id, nombre }]`, ordenado por
 * nombre. Quienes quedaron afuera a mano no están.
 */
export async function leerEquipoDelServicio(supabase, servicio, ahora = new Date()) {
  const { equipo } = await leerElEquipo(supabase, servicio, ahora);
  const ids = sinRepetir(equipo.asistentes, 'asistente_id');
  if (ids.length === 0) return [];
  const { nombreDeAsistente } = await leerNombres(supabase, ids);
  return ids
    .map((id) => ({ asistente_id: id, nombre: nombreDeAsistente(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
