// A quién proponer para uno o varios turnos de guardia, y qué advertencias lleva cada nombre.
//
// Las cuentas no están acá: las hacen `candidatos.js` (el orden y los motivos) y
// `avisosAsignacion.js` (qué puede salir mal al asignar). Este archivo sólo junta lo que esas dos
// contestan para la lista que se elige, y no toca la base: lo que necesita lo trae
// `hooks/useSugerenciasDeAsistentes.js`. Así el orden de la lista se prueba sin base.

import { candidatosParaTurnoGuardia, estaEnElPadron, limitesDeSemana, MOTIVO, TOPES } from './candidatos';
import { advertenciasDeAsignacion } from './avisosAsignacion';
import { comparable } from './textoComparable';

const lista = (x) => (Array.isArray(x) ? x : []);

/**
 * Lo que dice un motivo en contra que no es una advertencia. Que nunca haya atendido a este
 * Paciente le resta puntos en el orden, pero no es un problema de asignarle el turno de guardia: si
 * se mostrara como advertencia, la tendría casi todo el Padrón y ninguna se leería.
 */
const NO_ES_ADVERTENCIA = new Set([MOTIVO.SIN_CONTINUIDAD]);

/** El grupo de un candidato: 0 se propone, 1 se puede asignar con advertencia, 2 la base no deja. */
export function grupoDe(candidato) {
  if (candidato?.bloqueado) return 2;
  if (candidato?.desaconsejado) return 1;
  return 0;
}

/**
 * El mismo orden que `candidatosParaTurnoGuardia`: primero el grupo, después el puntaje y, si
 * empatan, el nombre, para que la lista no cambie de orden entre dos recargas.
 */
export function ordenarCandidatos(candidatos) {
  return [...lista(candidatos)].sort((a, b) => {
    if (grupoDe(a) !== grupoDe(b)) return grupoDe(a) - grupoDe(b);
    if ((b.puntaje ?? 0) !== (a.puntaje ?? 0)) return (b.puntaje ?? 0) - (a.puntaje ?? 0);
    return String(a.asistente?.nombre ?? '').localeCompare(String(b.asistente?.nombre ?? ''));
  });
}

/** Una sola vez cada clave: la primera que aparece trae sus valores. */
function sinRepetir(motivos) {
  const vistas = new Set();
  return lista(motivos).filter((m) => {
    if (!m?.clave || vistas.has(m.clave)) return false;
    vistas.add(m.clave);
    return true;
  });
}

/**
 * Junta las listas de candidatos de varios turnos de guardia en una sola.
 *
 * Pasa cuando un mismo Asistente se elige para cubrir varios turnos de una vez, como la ausencia
 * de otro. Cada uno queda con la suma de sus puntajes, con todas sus advertencias sin repetir, y en
 * el peor grupo que tuvo en cualquiera de esos turnos: si se pisa con uno solo, ya no se propone
 * para todos.
 */
export function combinarCandidatos(listasPorTurnoGuardia) {
  const porAsistente = new Map();
  for (const candidatos of lista(listasPorTurnoGuardia)) {
    for (const c of lista(candidatos)) {
      const id = c?.asistente?.id;
      if (!id) continue;
      const previo = porAsistente.get(id);
      if (!previo) {
        porAsistente.set(id, { ...c, aFavor: [...lista(c.aFavor)], enContra: [...lista(c.enContra)] });
        continue;
      }
      previo.puntaje = (previo.puntaje ?? 0) + (c.puntaje ?? 0);
      previo.aFavor.push(...lista(c.aFavor));
      previo.enContra.push(...lista(c.enContra));
      previo.bloqueado = previo.bloqueado || Boolean(c.bloqueado);
      previo.desaconsejado = previo.desaconsejado || Boolean(c.desaconsejado);
    }
  }
  return ordenarCandidatos(
    [...porAsistente.values()].map((c) => ({ ...c, aFavor: sinRepetir(c.aFavor), enContra: sinRepetir(c.enContra) }))
  );
}

/** Las advertencias de un candidato que se muestran al lado de su nombre. */
export function etiquetasDe(candidato) {
  return sinRepetir(candidato?.enContra).filter((m) => !NO_ES_ADVERTENCIA.has(m.clave));
}

/**
 * La lista ordenada para elegir a quién asignar uno o varios turnos de guardia.
 *
 * Sin ningún turno de guardia que mirar —por ejemplo, un turno fijo que no tiene días pendientes—
 * no hay con qué ordenar: queda el Padrón por nombre y sin advertencias.
 *
 * @param huecos    los turnos de guardia que se van a asignar, cada uno con `fecha`, `hora_inicio`,
 *                  `hora_fin` y, si los tiene, `id`, sus Pacientes y `canal_modalidad`.
 * @param datos     lo mismo que recibe `candidatosParaTurnoGuardia`.
 * @param opciones  `{ pesos, topes, excluir }`. `excluir` son ids de Asistente que no se ofrecen.
 */
export function sugerenciasPara(huecos, datos = {}, opciones = {}) {
  const excluir = new Set(lista(opciones.excluir).filter(Boolean));
  const turnos = lista(huecos).filter((h) => h?.fecha && h?.hora_inicio && h?.hora_fin);

  const candidatos = turnos.length
    ? combinarCandidatos(
        turnos.map((h) => candidatosParaTurnoGuardia(h, datos, { pesos: opciones.pesos, topes: opciones.topes }))
      )
    : ordenarCandidatos(
        lista(datos.asistentes)
          .filter(estaEnElPadron)
          .map((asistente) => ({ asistente, puntaje: 0, aFavor: [], enContra: [], bloqueado: false, desaconsejado: false }))
      );

  return candidatos.filter((c) => !excluir.has(c.asistente?.id));
}

/**
 * Qué puede salir mal si se le asignan estos turnos de guardia a este Asistente. Cada advertencia
 * una sola vez, las graves primero, como las devuelve `advertenciasDeAsignacion`.
 */
export function advertenciasPara(huecos, asistenteId, datos = {}, opciones = {}) {
  if (!asistenteId) return [];
  const todas = lista(huecos).flatMap((h) => advertenciasDeAsignacion(h, asistenteId, datos, { topes: opciones.topes }));
  return sinRepetir(todas).sort((a, b) => Number(b.grave) - Number(a.grave));
}

/** Los candidatos cuyo nombre contiene lo que se escribió, sin importar tildes ni mayúsculas. */
export function filtrarPorNombre(candidatos, busqueda) {
  const buscado = comparable(busqueda);
  if (!buscado) return lista(candidatos);
  return lista(candidatos).filter((c) => comparable(c.asistente?.nombre).includes(buscado));
}

/** Un día del almanaque local como `AAAA-MM-DD`, sin pasar por la hora universal. */
function diaISO(f) {
  const m = String(f.getMonth() + 1).padStart(2, '0');
  const d = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${m}-${d}`;
}

/** Una fecha `AAAA-MM-DD` corrida algunos días. */
function correrDias(fechaISO, dias) {
  const f = new Date(`${fechaISO}T00:00:00`);
  f.setDate(f.getDate() + dias);
  return diaISO(f);
}

/**
 * Qué días de turnos de guardia hay que traer para evaluar estos huecos: desde el comienzo de la
 * semana del primero —para contar las horas de esa semana— hasta el fin de la semana del último.
 * Se suma un día de cada lado para ver el descanso con un turno de guardia de la noche anterior o
 * de la mañana siguiente.
 *
 * @returns {{ desde: string, hasta: string } | null}  `hasta` incluido.
 */
export function rangoDeFechas(huecos, topes = TOPES) {
  const fechas = lista(huecos).map((h) => h?.fecha).filter(Boolean).sort();
  if (!fechas.length) return null;
  const diaInicio = topes?.dia_inicio_semana ?? TOPES.dia_inicio_semana;
  const primera = fechas[0];
  const ultima = fechas[fechas.length - 1];
  const inicioSemana = diaISO(limitesDeSemana(primera, diaInicio).desde);
  return { desde: correrDias(inicioSemana, -1), hasta: correrDias(ultima, 7) };
}
