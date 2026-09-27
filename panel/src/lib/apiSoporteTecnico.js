import { llamadorDe } from './apiPanel';

/* Las rutas del pedido de soporte técnico.
   ==========================================================================

   Sólo el camino: el `fetch`, la sesión, los encabezados y el manejo del error están escritos una
   sola vez en `apiPanel.js`.

   @param {string} path  Lo que va después de `/api/panel/soporte-tecnico`, empezando con `/`.
   @param {object} opciones  Lo mismo que acepta `fetch`. */
export const llamarApiSoporteTecnico = llamadorDe('/soporte-tecnico');
