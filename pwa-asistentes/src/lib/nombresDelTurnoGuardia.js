import { con } from './textos';

// En la tarjeta de un turno de guardia no entran diez nombres, así que se muestran los dos primeros y
// se dice cuántos faltan. La lista completa está adentro, al abrir el turno de guardia.
export function nombresDeLaTarjeta(turno_guardia, t) {
  const nombres = (turno_guardia.pacientes ?? []).map((p) => p.nombre).filter(Boolean);
  if (nombres.length === 0) return t.turnos_guardia.sin_paciente;
  const visibles = nombres.slice(0, 2);
  const restantes = nombres.length - visibles.length;
  if (restantes > 0) visibles.push(con(t.turnos_guardia.y_mas, { n: restantes }));
  return visibles.join(' · ');
}

// «Hoy · 14:00–20:00», o la fecha cuando no es hoy.
export function cuandoEsElTurnoGuardia(turno_guardia, t, hoy) {
  const dia = turno_guardia.fecha === hoy ? t.inicio.hoy : turno_guardia.fecha;
  return `${dia} · ${turno_guardia.hora_inicio?.slice(0, 5) ?? ''}–${turno_guardia.hora_fin?.slice(0, 5) ?? ''}`;
}
