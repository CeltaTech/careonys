import { supabase } from '../db/connection.js';
import {
  equipoDelPaciente,
  quienCubreFrancos,
  reglaDeEquipoDe,
  REGLA_QUE_SE_PUEDE_TOCAR,
} from './equipoDelPaciente.js';
// El correo de una persona se pide en un solo lugar. Acá había una segunda copia de esa lectura.
import { correoDe } from './correoDeUnaPersona.js';

// Quiénes son el equipo de un Paciente, leídos de la base.
// ============================================================================
//
// QUÉ HACE Y QUÉ NO. `equipoDelPaciente.js` contesta quiénes son el equipo, pero recibiéndolo todo
// ya cargado: no habla con la base, para poder correr igual en el Panel y en el backend. Este archivo
// es el que va a buscar esos datos del lado del backend, que es donde corren los procesos de fondo y
// donde no hay ninguna pantalla que los haya traído antes.
//
// NO SE COPIA A NINGUNA PARTE, y por eso vive acá y no en el Panel: el Panel ya trae estos datos
// con la sesión de la persona que está mirando (`pages/clientes/EquipoDelPaciente.jsx`), y acá lo
// pide una tarea programada, sin sesión de nadie. Lo que sí es el mismo en los dos lados —la regla de quién es del
// equipo— está en el archivo que se copia, y acá no se repite.
//
// Quien coordina a este Paciente es quien coordina sus Servicios vigentes, igual que en la pantalla.
//
// Corre adentro del trabajo de una sola Prestadora (`paraCadaPrestadora`), y cada consulta nombra
// además la Prestadora. Mismo criterio que los demás procesos de fondo.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * El equipo de un Paciente, con los nombres puestos.
 *
 * @param {object} entrada
 * @param {string} entrada.pacienteId
 * @param {string} entrada.prestadoraId
 * @param {object} entrada.regla Los números ya resueltos por `reglaDeEquipoDe()`. Si falta, se
 *   leen de la configuración de esa Prestadora.
 * @param {Date} entrada.ahora
 * @returns {Promise<{asistentes: Array, coordinadores: Array, cubrenFrancos: Array}>}
 *   Cada Asistente lleva `nombre`; cada coordinador, `nombre` y `email`. El correo es lo que
 *   permite escribirle a quien coordina a este Paciente y no al destino general de la Prestadora.
 */
export async function equipoDeUnPaciente({ pacienteId, prestadoraId, regla = null, ahora = new Date() }) {
  const reglaFinal = regla ?? reglaDeEquipoDe(await configuracionDeEquipo(prestadoraId));
  const guardias = await guardiasDelPaciente({ pacienteId, prestadoraId, regla: reglaFinal, ahora });
  const series = await seriesDelPaciente({ pacienteId, prestadoraId });
  const decisiones = await decisionesDelEquipo({ pacienteId, prestadoraId });

  // Todas las guardias que volvieron tocan a este Paciente: se preguntó por él.
  const pacientesPorGuardia = new Map(guardias.map((g) => [g.id, [pacienteId]]));

  const conCoordinadores = equipoDelPaciente({
    pacienteId,
    guardias,
    pacientesPorGuardia,
    series,
    decisiones,
    regla: reglaFinal,
    coordinadoresDeSusServicios: await coordinadoresDeSusServicios({ pacienteId, prestadoraId }),
    ahora,
  });

  const asistentesPorId = await asistentesDelEquipo(
    [...new Set(conCoordinadores.asistentes.map((a) => a.asistente_id))],
    prestadoraId
  );
  const nombres = await nombresDeUsuarios(
    conCoordinadores.coordinadores.map((c) => c.usuario_id),
    prestadoraId
  );

  const asistentes = conCoordinadores.asistentes.map((a) => ({
    ...a,
    nombre: asistentesPorId.get(a.asistente_id)?.nombre ?? null,
  }));

  const coordinadores = await Promise.all(
    conCoordinadores.coordinadores.map(async (c) => ({
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
 * Se piden de la ventana más grande que una Prestadora puede configurar; el recorte fino lo hace
 * después la regla de cada una, adentro de `equipoDelPaciente()`.
 */
async function guardiasDelPaciente({ pacienteId, prestadoraId, regla, ahora }) {
  const dias = Math.max(regla.dias_hacia_atras, REGLA_QUE_SE_PUEDE_TOCAR.dias_hacia_atras.minimo);
  const desde = fechaISO(new Date(ahora.getTime() - dias * MS_POR_DIA));

  const { data: vinculos, error: errorVinculos } = await supabase
    .from('guardia_pacientes')
    .select('guardia_id')
    .eq('paciente_id', pacienteId)
    .eq('prestadora_id', prestadoraId);
  if (errorVinculos) {
    console.error(`Error leyendo los turnos del Paciente (${pacienteId}):`, errorVinculos.message);
    return [];
  }

  const campos = 'id, asistente_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado';
  const ids = [...new Set((vinculos ?? []).map((v) => v.guardia_id).filter(Boolean))];

  // Por la lista y por la columna vieja, igual que en la pantalla: una guardia cargada antes de que
  // existiera la lista sigue teniendo a su Paciente en la columna.
  const [porLista, porColumnaVieja] = await Promise.all([
    ids.length
      ? supabase
          .from('guardias')
          .select(campos)
          .eq('prestadora_id', prestadoraId)
          .in('id', ids)
          .gte('fecha', desde)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('guardias')
      .select(campos)
      .eq('prestadora_id', prestadoraId)
      .eq('paciente_id', pacienteId)
      .gte('fecha', desde),
  ]);
  if (porLista.error || porColumnaVieja.error) {
    console.error(
      `Error leyendo los turnos del Paciente (${pacienteId}):`,
      (porLista.error ?? porColumnaVieja.error).message
    );
    return [];
  }

  return [
    ...new Map([...(porLista.data ?? []), ...(porColumnaVieja.data ?? [])].map((g) => [g.id, g])).values(),
  ];
}

async function seriesDelPaciente({ pacienteId, prestadoraId }) {
  const { data: vinculos, error } = await supabase
    .from('series_guardias_pacientes')
    .select('serie_id')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId);
  if (error) {
    console.error(`Error leyendo las series del Paciente (${pacienteId}):`, error.message);
    return [];
  }

  const campos = 'id, asistente_id, estado, vigente_hasta';
  const ids = [...new Set((vinculos ?? []).map((v) => v.serie_id).filter(Boolean))];
  const [porLista, porColumnaVieja] = await Promise.all([
    ids.length
      ? supabase
          .from('series_guardias')
          .select(campos)
          .eq('prestadora_id', prestadoraId)
          .in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('series_guardias')
      .select(campos)
      .eq('prestadora_id', prestadoraId)
      .eq('paciente_id', pacienteId),
  ]);
  if (porLista.error || porColumnaVieja.error) {
    console.error(
      `Error leyendo las series del Paciente (${pacienteId}):`,
      (porLista.error ?? porColumnaVieja.error).message
    );
    return [];
  }

  return [
    ...new Map([...(porLista.data ?? []), ...(porColumnaVieja.data ?? [])].map((s) => [s.id, s])).values(),
  ];
}

async function decisionesDelEquipo({ pacienteId, prestadoraId }) {
  const { data, error } = await supabase
    .from('equipo_paciente')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('prestadora_id', prestadoraId);
  if (error) {
    console.error(`Error leyendo las correcciones del equipo (${pacienteId}):`, error.message);
    return [];
  }
  return data ?? [];
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

/** Quiénes coordinan los Servicios vigentes de quien contrata la atención de este Paciente. */
async function coordinadoresDeSusServicios({ pacienteId, prestadoraId }) {
  const { data: paciente, error: errorPaciente } = await supabase
    .from('pacientes')
    .select('cliente_id')
    .eq('prestadora_id', prestadoraId)
    .eq('id', pacienteId)
    .maybeSingle();
  if (errorPaciente || !paciente?.cliente_id) {
    if (errorPaciente) console.error(`Error leyendo el Cliente del Paciente (${pacienteId}):`, errorPaciente.message);
    return [];
  }
  const { data, error } = await supabase
    .from('servicios')
    .select('coordinador_id')
    .eq('prestadora_id', prestadoraId)
    .eq('tipo_contratante', 'cliente')
    .eq('contratante_id', paciente.cliente_id)
    .eq('estado', 'vigente')
    .not('coordinador_id', 'is', null);
  if (error) {
    console.error(`Error leyendo quien coordina los Servicios del Paciente (${pacienteId}):`, error.message);
    return [];
  }
  return [...new Set((data ?? []).map((s) => s.coordinador_id))];
}

/** Cómo se llama cada persona que coordina a este Paciente. */
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
