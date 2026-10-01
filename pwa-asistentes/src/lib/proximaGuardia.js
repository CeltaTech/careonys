// Cuál es la guardia que se le muestra primero al Asistente. Lo usan Inicio y Servicio, así que
// la regla está escrita una sola vez, acá.
//
// Primero la que está en curso, si hay una: es la que tiene entre manos. Si no, la programada que
// empieza antes entre las que todavía no terminaron. Una programada cuyo horario ya pasó no es la
// próxima de nadie.

import { inicioDeGuardia, finDeGuardia } from './horarios';
import { ESTADO_EN_CURSO } from './guardiaSinCerrar';

const ESTADO_PROGRAMADA = 'programada';

export function guardiaQueSigue(guardias, ahora = new Date()) {
  const lista = guardias ?? [];
  const enCurso = lista.find((g) => g.estado === ESTADO_EN_CURSO);
  if (enCurso) return enCurso;
  return (
    lista
      .filter((g) => g.estado === ESTADO_PROGRAMADA && finDeGuardia(g) >= ahora)
      .sort((a, b) => inicioDeGuardia(a) - inicioDeGuardia(b))[0] ?? null
  );
}

export function estaEnCurso(guardia) {
  return guardia?.estado === ESTADO_EN_CURSO;
}

// Los Pacientes que atiende, uno por cada persona distinta que aparece en sus guardias, cada uno
// con la guardia que le sigue con él.
export function pacientesDeLasGuardias(guardias, ahora = new Date()) {
  const porPaciente = new Map();
  for (const g of guardias ?? []) {
    for (const p of g.pacientes ?? []) {
      if (!p?.id) continue;
      if (!porPaciente.has(p.id)) porPaciente.set(p.id, { paciente: p, guardias: [] });
      porPaciente.get(p.id).guardias.push(g);
    }
  }
  return [...porPaciente.values()]
    .map(({ paciente, guardias: deEl }) => ({ paciente, guardia: guardiaQueSigue(deEl, ahora) }))
    .sort((a, b) => (a.paciente.nombre ?? '').localeCompare(b.paciente.nombre ?? ''));
}
