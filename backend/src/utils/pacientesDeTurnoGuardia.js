// Punto único de verdad de a quiénes atiende un turno de guardia, dentro del backend
// (regla 12 de CLAUDE.md §7). Es el hermano de `panel/src/lib/pacientesDeTurnoGuardia.js`:
// la misma pregunta, contestada del lado del servidor.
//
// Un turno de guardia son las horas que el Asistente pasa cuidando, no el cuidado de una persona.
// Adentro de esas horas puede atender a más de un Paciente: un matrimonio en su casa, o un
// grupo entero en una residencia. Por eso la respuesta a "¿a quién atiende este turno de guardia?" es siempre una lista,
// aunque casi siempre tenga un solo nombre.
//
// La lista vive en la tabla `turno_guardia_pacientes`. La columna vieja `turnos_guardia.paciente_id`
// está en retiro: guarda a uno solo de los Pacientes y sigue existiendo únicamente como red
// de seguridad. Este archivo y el del Panel son los dos únicos lugares que la nombran.
//
// Ver el disparador `sincronizar_paciente_principal` de `turnos_guardia`.

import { FICHA_DOMICILIO, conSuFicha } from './fichaDelPaciente.js';

/** Lo mínimo que necesita una pantalla para nombrar y ubicar a un Paciente. */
export const CAMPOS_BASICOS = `id, ${FICHA_DOMICILIO}`;

/**
 * A quiénes atiende cada una de estos turnos de guardia.
 *
 * Recibe las filas de guardia ya leídas —no los ids— porque necesita `paciente_id` para la
 * red de seguridad de abajo. Devuelve un Map de id de guardia → lista de Pacientes, ordenada
 * por nombre para que dos turnos de guardia con la misma gente se lean igual.
 *
 * `campos` tiene que incluir siempre `id`: es con lo que se arma el respaldo.
 *
 * `db` es la conexión con la que se pregunta: la de quien pide en una ruta de persona, la de la
 * tarea en una tarea programada. Así la base sólo contesta lo que esa conexión puede ver.
 *
 * `prestadoraId` no tiene valor por defecto a propósito: el filtro va escrito igual, aunque la base
 * ya acote. Un identificador de turno de otra Prestadora tiene que devolver nada.
 */
export async function pacientesDeTurnosGuardia(db, prestadoraId, turnos_guardia, campos = CAMPOS_BASICOS) {
  const lista = (turnos_guardia ?? []).filter(Boolean);
  const mapa = new Map();
  if (lista.length === 0) return mapa;

  const { data, error } = await db
    .from('turno_guardia_pacientes')
    .select(`turno_guardia_id, pacientes(${campos})`)
    .eq('prestadora_id', prestadoraId)
    .in(
      'turno_guardia_id',
      lista.map((g) => g.id)
    );
  if (error) throw new Error(error.message);

  for (const fila of data ?? []) {
    if (!fila.pacientes) continue;
    if (!mapa.has(fila.turno_guardia_id)) mapa.set(fila.turno_guardia_id, []);
    mapa.get(fila.turno_guardia_id).push(conSuFicha(fila.pacientes));
  }

  // Red de seguridad: un turno de guardia que no tenga ninguna fila en la lista se atiende con el
  // Paciente de la columna vieja, para no mostrarle al Asistente un turno sin nadie cuando
  // en realidad sí tiene a quién atender.
  const sinLista = lista.filter((g) => !mapa.has(g.id) && g.paciente_id);
  if (sinLista.length > 0) {
    const { data: sueltos, error: errorSueltos } = await db
      .from('pacientes')
      .select(campos)
      .eq('prestadora_id', prestadoraId)
      .in('id', [...new Set(sinLista.map((g) => g.paciente_id))]);
    if (errorSueltos) throw new Error(errorSueltos.message);

    const porId = new Map((sueltos ?? []).map((p) => [p.id, conSuFicha(p)]));
    for (const g of sinLista) {
      const paciente = porId.get(g.paciente_id);
      if (paciente) mapa.set(g.id, [paciente]);
    }
  }

  for (const delTurnoGuardia of mapa.values()) {
    delTurnoGuardia.sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  }
  return mapa;
}

/** Lo mismo para un solo turno de guardia: devuelve la lista, nunca `null`. */
export async function pacientesDeTurnoGuardia(db, prestadoraId, turno_guardia, campos = CAMPOS_BASICOS) {
  const mapa = await pacientesDeTurnosGuardia(db, prestadoraId, [turno_guardia], campos);
  return mapa.get(turno_guardia?.id) ?? [];
}

/**
 * Los identificadores de los Pacientes de un turno de guardia, sin pasar por sus datos.
 *
 * Es para quien sólo necesita saber cuáles son —para buscar otro turno de guardia de la misma gente—, no
 * cómo se llaman. Como no lee sus datos, cuentan todos los del turno, cualquiera sea el estado de
 * sus datos. Misma red de seguridad que arriba: sin ninguna fila en la lista, el de la columna
 * vieja. Una falla de la base sube como error.
 */
export async function idsDePacientesDeTurnoGuardia(db, prestadoraId, turno_guardia) {
  const { data, error } = await db
    .from('turno_guardia_pacientes')
    .select('paciente_id')
    .eq('prestadora_id', prestadoraId)
    .eq('turno_guardia_id', turno_guardia.id);
  if (error) throw new Error(error.message);

  if ((data ?? []).length > 0) return [...new Set(data.map((fila) => fila.paciente_id))];
  return turno_guardia.paciente_id ? [turno_guardia.paciente_id] : [];
}

/**
 * Le agrega a cada turno de guardia su lista de Pacientes, en el campo `pacientes`.
 *
 * Antes ese campo traía **un** Paciente (el que enganchaba PostgREST por la columna vieja) y
 * ahora trae la lista entera. El nombre se mantiene a propósito: es la misma pregunta, con
 * la respuesta completa.
 */
export async function conPacientes(db, prestadoraId, turnos_guardia, campos = CAMPOS_BASICOS) {
  const mapa = await pacientesDeTurnosGuardia(db, prestadoraId, turnos_guardia, campos);
  return (turnos_guardia ?? []).map((g) => ({ ...g, pacientes: mapa.get(g.id) ?? [] }));
}

/**
 * ¿Este Asistente atiende o atendió alguna vez a este Paciente?
 *
 * Es el permiso que dejan pasar los reportes anteriores y las órdenes de medicación. Se
 * pregunta contra la lista del turno de guardia y no contra `turnos_guardia.paciente_id`: si no, un
 * Asistente que cubre a dos personas en la misma casa vería los datos de una sola.
 */
export async function asistenteAtiendeAlPaciente(db, pacienteId, usuarioAsistente) {
  const { data } = await db
    .from('turno_guardia_pacientes')
    .select('turno_guardia_id, turnos_guardia!inner(asistente_id, prestadora_id)')
    .eq('prestadora_id', usuarioAsistente.prestadoraId)
    .eq('paciente_id', pacienteId)
    .eq('turnos_guardia.asistente_id', usuarioAsistente.asistenteId)
    .eq('turnos_guardia.prestadora_id', usuarioAsistente.prestadoraId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * A quiénes cubre cada una de estas series, por id.
 *
 * Una serie es el turno de guardia que se repite todas las semanas, y lleva su propia lista en
 * `series_turnos_guardia_pacientes`. Devuelve un Map de id de serie → lista de ids de Paciente.
 *
 * Igual que arriba, si una serie no tiene ninguna fila se cae a la columna vieja: una serie
 * cargada antes de este diseño tiene que seguir generando turnos de guardia con su Paciente.
 */
export async function pacientesDeSeries(db, prestadoraId, series) {
  const lista = (series ?? []).filter(Boolean);
  const mapa = new Map();
  if (lista.length === 0) return mapa;

  const { data, error } = await db
    .from('series_turnos_guardia_pacientes')
    .select('serie_id, paciente_id')
    .eq('prestadora_id', prestadoraId)
    .in(
      'serie_id',
      lista.map((s) => s.id)
    );
  if (error) throw new Error(error.message);

  for (const fila of data ?? []) {
    if (!mapa.has(fila.serie_id)) mapa.set(fila.serie_id, []);
    mapa.get(fila.serie_id).push(fila.paciente_id);
  }

  for (const serie of lista) {
    if (!mapa.has(serie.id) && serie.paciente_id) mapa.set(serie.id, [serie.paciente_id]);
  }
  return mapa;
}

/**
 * Anota en `turno_guardia_pacientes` que estos turnos de guardia cubren a estos Pacientes.
 *
 * Se usa cuando se crean turnos de guardia de a muchas y todas cubren a la misma gente — el caso de la
 * serie que se repite. No pisa lo que ya está: el disparador de la base ya anotó al Paciente
 * de la columna vieja en el momento del INSERT, y volver a escribirlo daría conflicto.
 */
export async function anotarPacientesEnTurnosGuardia(db, turnoGuardiaIds, pacienteIds, prestadoraId) {
  // Falla cerrado: la fila que se escribe lleva la Prestadora adentro, así que sin ella se estaría
  // anotando en un cajón que no es de nadie. No hay valor por omisión y no se supone ninguno.
  if (!prestadoraId) throw new Error('No se anotan Pacientes en una guardia sin saber de que Organizacion es');

  const turnos_guardia = [...new Set(turnoGuardiaIds ?? [])];
  const pacientes = [...new Set(pacienteIds ?? [])];
  if (turnos_guardia.length === 0 || pacientes.length === 0) return;

  const filas = turnos_guardia.flatMap((turnoGuardiaId) =>
    pacientes.map((pacienteId) => ({ turno_guardia_id: turnoGuardiaId, paciente_id: pacienteId, prestadora_id: prestadoraId }))
  );

  // SIN PRESTADORA A PROPÓSITO
  // La Prestadora va adentro de cada fila —arriba se corta si no viene—, y la columna del conflicto
  // es el identificador de un turno de guardia, único en toda la base: la fila en conflicto es siempre
  // del mismo turno de guardia y por lo tanto de la misma Prestadora. La base lo sostiene además con la clave
  // foránea `(turno_guardia_id, prestadora_id)` contra `turnos_guardia`, que rechaza cualquier otra pareja.
  const { error } = await db
    .from('turno_guardia_pacientes')
    .upsert(filas, { onConflict: 'turno_guardia_id,paciente_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
