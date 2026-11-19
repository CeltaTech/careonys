// Cuál es el turno de guardia que se le muestra primero al Asistente. Lo usan Inicio y Servicio, así que
// la regla está escrita una sola vez, acá.
//
// Primero la que está en curso, si hay una: es la que tiene entre manos. Si no, la programada que
// empieza antes entre las que todavía no terminaron. Una programada cuyo horario ya pasó no es la
// próxima de nadie.

import { inicioDeTurnoGuardia, finDeTurnoGuardia } from './horarios';
import { ESTADO_EN_CURSO } from './turnoGuardiaSinCerrar';

const ESTADO_PROGRAMADA = 'programada';

export function turnoGuardiaQueSigue(turnos_guardia, ahora = new Date()) {
  const lista = turnos_guardia ?? [];
  const enCurso = lista.find((g) => g.estado === ESTADO_EN_CURSO);
  if (enCurso) return enCurso;
  return (
    lista
      .filter((g) => g.estado === ESTADO_PROGRAMADA && finDeTurnoGuardia(g) >= ahora)
      .sort((a, b) => inicioDeTurnoGuardia(a) - inicioDeTurnoGuardia(b))[0] ?? null
  );
}

export function estaEnCurso(turno_guardia) {
  return turno_guardia?.estado === ESTADO_EN_CURSO;
}

// Los Pacientes que atiende, uno por cada persona distinta que aparece en sus turnos de guardia, cada uno
// con el turno de guardia que le sigue con él.
export function pacientesDeLosTurnosGuardia(turnos_guardia, ahora = new Date()) {
  const porPaciente = new Map();
  for (const g of turnos_guardia ?? []) {
    for (const p of g.pacientes ?? []) {
      if (!p?.id) continue;
      if (!porPaciente.has(p.id)) porPaciente.set(p.id, { paciente: p, turnos_guardia: [] });
      porPaciente.get(p.id).turnos_guardia.push(g);
    }
  }
  return [...porPaciente.values()]
    .map(({ paciente, turnos_guardia: deEl }) => ({ paciente, turno_guardia: turnoGuardiaQueSigue(deEl, ahora) }))
    .sort((a, b) => (a.paciente.nombre ?? '').localeCompare(b.paciente.nombre ?? ''));
}
