import { con } from './textos';

// En la tarjeta de una guardia no entran diez nombres, así que se muestran los dos primeros y
// se dice cuántos faltan. La lista completa está adentro, al abrir la guardia.
export function nombresDeLaTarjeta(guardia, t) {
  const nombres = (guardia.pacientes ?? []).map((p) => p.nombre).filter(Boolean);
  if (nombres.length === 0) return t.guardias.sin_paciente;
  const visibles = nombres.slice(0, 2);
  const restantes = nombres.length - visibles.length;
  if (restantes > 0) visibles.push(con(t.guardias.y_mas, { n: restantes }));
  return visibles.join(' · ');
}

// «Hoy · 14:00–20:00», o la fecha cuando no es hoy.
export function cuandoEsLaGuardia(guardia, t, hoy) {
  const dia = guardia.fecha === hoy ? t.inicio.hoy : guardia.fecha;
  return `${dia} · ${guardia.hora_inicio?.slice(0, 5) ?? ''}–${guardia.hora_fin?.slice(0, 5) ?? ''}`;
}
