import { supabase } from '../db/connection.js';
import {
  equipoDelServicio,
  quienCubreFrancos,
  reglaDeEquipoDe,
  REGLA_QUE_SE_PUEDE_TOCAR,
} from './equipoDelServicio.js';
// El correo de una persona se pide en un solo lugar. Acá había una segunda copia de esa lectura.
import { correoDe } from './correoDeUnaPersona.js';

// Quiénes son el equipo de un Servicio, leídos de la base.
// ============================================================================
//
// QUÉ HACE Y QUÉ NO. `equipoDelServicio.js` contesta quiénes son el equipo, pero recibiéndolo todo
// ya cargado: no habla con la base, para poder correr igual en el Panel y en el backend. Este archivo
// es el que va a buscar esos datos del lado del backend, que es donde corren los procesos de fondo y
// donde no hay ninguna pantalla que los haya traído antes.
//
// NO SE COPIA A NINGUNA PARTE, y por eso vive acá y no en el Panel: el Panel ya trae estos datos
// con la sesión de la persona que está mirando (`pages/servicios/EquipoDelServicio.jsx`), y acá lo
// pide una tarea programada, sin sesión de nadie. Lo que sí es el mismo en los dos lados —la regla de
// quién es del equipo— está en el archivo que se copia, y acá no se repite.
//
// Corre adentro del trabajo de una sola Prestadora (`paraCadaPrestadora`), y cada consulta nombra
// además la Prestadora. Mismo criterio que los demás procesos de fondo.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * El equipo de un Servicio, con los nombres puestos.
 *
 * @param {object} entrada
 * @param {string} entrada.servicioId
 * @param {string} entrada.prestadoraId
 * @param {object} entrada.regla Los números ya resueltos por `reglaDeEquipoDe()`. Si falta, se
 *   leen de la configuración de esa Prestadora.
 * @param {Date} entrada.ahora
 * @returns {Promise<{asistentes: Array, coordinadores: Array, cubrenFrancos: Array}>}
 *   Cada Asistente lleva `nombre`; cada coordinador, `nombre` y `email`. El correo es lo que
 *   permite escribirle a quien coordina este Servicio y no al destino general de la Prestadora.
 */
export async function equipoDeUnServicio({ servicioId, prestadoraId, regla = null, ahora = new Date() }) {
  const vacio = { asistentes: [], coordinadores: [], cubrenFrancos: [] };
  if (!servicioId) return vacio;

  const reglaFinal = regla ?? reglaDeEquipoDe(await configuracionDeEquipo(prestadoraId));
  const [guardias, series, decisiones, coordinadorDelServicio] = await Promise.all([
    guardiasDelServicio({ servicioId, prestadoraId, regla: reglaFinal, ahora }),
    seriesDelServicio({ servicioId, prestadoraId }),
    decisionesDelEquipo({ servicioId, prestadoraId }),
    coordinadorDe({ servicioId, prestadoraId }),
  ]);

  const equipo = equipoDelServicio({
    servicioId,
    guardias,
    series,
    decisiones,
    coordinadorDelServicio,
    regla: reglaFinal,
    ahora,
  });

  const asistentesPorId = await asistentesDelEquipo(
    [...new Set(equipo.asistentes.map((a) => a.asistente_id))],
    prestadoraId
  );
  const nombres = await nombresDeUsuarios(
    equipo.coordinadores.map((c) => c.usuario_id),
    prestadoraId
  );

  const asistentes = equipo.asistentes.map((a) => ({
    ...a,
    nombre: asistentesPorId.get(a.asistente_id)?.nombre ?? null,
  }));

  const coordinadores = await Promise.all(
    equipo.coordinadores.map(async (c) => ({
      ...c,
      nombre: nombres.get(c.usuario_id) ?? null,
      email: await correoDe({ prestadoraId, usuarioId: c.usuario_id }),
    }))
  );

  return { asistentes, coordinadores, cubrenFrancos: quienCubreFrancos({ asistentes }) };
}

async function configuracionDeEquipo(prestadoraId) {
  // Sin fila de configuración corren los valores de fábrica: que una Prestadora no haya tocado
  // nada no puede dejarla sin equipo.
  const { data, error } = await supabase
    .from('configuracion_equipo_paciente')
    .select('regla')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) {
    console.error(`Error leyendo la configuracion de equipo (prestadora ${prestadoraId}):`, error.message);
    return null;
  }
  return data?.regla ?? null;
}

/**
 * Los turnos con los que se cuenta quién es habitual.
 *
 * Se piden de la ventana configurada; el recorte fino lo hace después `equipoDelServicio()`.
 */
async function guardiasDelServicio({ servicioId, prestadoraId, regla, ahora }) {
  const dias = Math.max(regla.dias_hacia_atras, REGLA_QUE_SE_PUEDE_TOCAR.dias_hacia_atras.minimo);
  const desde = fechaISO(new Date(ahora.getTime() - dias * MS_POR_DIA));
  const { data, error } = await supabase
    .from('guardias')
    .select('id, servicio_id, asistente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .gte('fecha', desde);
  if (error) {
    console.error(`Error leyendo los turnos del Servicio (${servicioId}):`, error.message);
    return [];
  }
  return data ?? [];
}

async function seriesDelServicio({ servicioId, prestadoraId }) {
  const { data, error } = await supabase
    .from('series_guardias')
    .select('id, servicio_id, asistente_id, estado, vigente_hasta')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId);
  if (error) {
    console.error(`Error leyendo las series del Servicio (${servicioId}):`, error.message);
    return [];
  }
  return data ?? [];
}

async function decisionesDelEquipo({ servicioId, prestadoraId }) {
  const { data, error } = await supabase
    .from('equipo_servicio')
    .select('*')
    .eq('servicio_id', servicioId)
    .eq('prestadora_id', prestadoraId);
  if (error) {
    console.error(`Error leyendo las correcciones del equipo (${servicioId}):`, error.message);
    return [];
  }
  return data ?? [];
}

async function coordinadorDe({ servicioId, prestadoraId }) {
  const { data, error } = await supabase
    .from('servicios')
    .select('coordinador_id')
    .eq('prestadora_id', prestadoraId)
    .eq('id', servicioId)
    .maybeSingle();
  if (error) {
    console.error(`Error leyendo quien coordina el Servicio (${servicioId}):`, error.message);
    return null;
  }
  return data?.coordinador_id ?? null;
}

async function asistentesDelEquipo(ids, prestadoraId) {
  const porId = new Map();
  if (!ids.length) return porId;
  const { data, error } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', ids);
  if (error) {
    console.error(`Error leyendo los Asistentes del equipo (prestadora ${prestadoraId}):`, error.message);
    return porId;
  }
  for (const fila of data ?? []) porId.set(fila.id, fila);
  return porId;
}

/** Cómo se llama cada persona que coordina el equipo. */
async function nombresDeUsuarios(ids, prestadoraId) {
  const nombres = new Map();
  if (!ids.length) return nombres;
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', ids);
  if (error) {
    console.error(`Error leyendo los nombres de quienes coordinan (prestadora ${prestadoraId}):`, error.message);
    return nombres;
  }
  for (const fila of data ?? []) nombres.set(fila.id, fila.nombre);
  return nombres;
}

// La fecha de un momento como la guarda la base (`2026-08-07`), en hora local. `toISOString()` a
// secas daría la fecha en UTC, que en horario argentino cambia de día tres horas antes de tiempo.
function fechaISO(momento) {
  const corrida = new Date(momento.getTime() - momento.getTimezoneOffset() * 60000);
  return corrida.toISOString().slice(0, 10);
}
