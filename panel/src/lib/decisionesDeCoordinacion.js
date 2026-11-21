import { llamarApiPanel } from './apiPanel';

/* Las decisiones del Coordinador y el veto de la administración.
   ==========================================================================

   Cada decisión que toma un Coordinador en un Servicio la anota la base sola, con el estado de
   antes de cada cosa que cambió. La administración las lee por Servicio y veta una con motivo; el
   Coordinador lee las suyas vetadas que todavía no vio y las marca vistas. Quién ve qué lo decide
   la base: acá sólo se pide. */

const RAIZ = '/decisiones';

/** Las decisiones de un Servicio, de la más nueva a la más vieja, con lo que cambió cada una. */
export async function decisionesDelServicio(servicioId) {
  const { decisiones } = await llamarApiPanel(`${RAIZ}/servicio/${servicioId}`);
  return decisiones ?? [];
}

/** Veta una decisión. Devuelve cuántos cambios se deshicieron y cuántos quedaron como estaban. */
export function vetarDecision(decisionId, motivo) {
  return llamarApiPanel(`${RAIZ}/${decisionId}/vetar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}

/** Las decisiones de quien inició sesión que le vetaron y todavía no vio. */
export async function vetosSinVer() {
  const { vetadas } = await llamarApiPanel(`${RAIZ}/vetadas-sin-ver`);
  return vetadas ?? [];
}

export function marcarVetoVisto(decisionId) {
  return llamarApiPanel(`${RAIZ}/${decisionId}/visto`, { method: 'PATCH' });
}

/** El nombre visible de la clase de una decisión, o el genérico si la clase es nueva. */
export function nombreDeLaClase(clase, t) {
  return t.decisiones[`clase_${clase}`] ?? t.decisiones.clase_otra;
}
