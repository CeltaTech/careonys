import { llamadorDe } from './apiPanel';

/* Las rutas del pase de guardia vistas desde la Prestadora (pendiente #113).
   ==========================================================================

   POR QUÉ PASA POR EL BACKEND Y NO POR LA BASE. Casi todas las pantallas del Panel consultan la
   base directo desde el navegador. Ésta no puede: autorizar un ingreso marca la llegada como
   comprobada y deja autorizada la salida del Asistente que se va, y quién autorizó lo tiene que
   escribir el backend con la sesión, nunca la pantalla con un dato que ella misma manda. Lo
   mismo vale para cerrar una llegada sin comprobar.

   El `fetch`, la sesión, los encabezados y el manejo del error están escritos una sola vez en
   `apiPanel.js`. Acá queda solamente el camino.

   @param {string} path  Lo que va después de `/api/panel/comprobaciones`, empezando con `/`.
   @param {object} opciones  Lo mismo que acepta `fetch`. */
export const llamarApiComprobaciones = llamadorDe('/comprobaciones');
