import { llamadorDe } from './apiPanel';

/* Los contactos de emergencia de un Cliente.
   ==========================================================================

   Lo que va después de `/api/panel/contactos-de-emergencia`. El `fetch`, la sesión, los
   encabezados y el manejo del error están escritos una sola vez en `apiPanel.js`.

   EL TELÉFONO DE UNA PERSONA NUEVA VIAJA EN EL CUERPO, NUNCA EN LA DIRECCIÓN. */
const llamarApiContactosDeEmergencia = llamadorDe('/contactos-de-emergencia');

const direccion = (clienteId, idioma) =>
  `/cliente/${encodeURIComponent(clienteId)}?idioma=${encodeURIComponent(idioma)}`;

/** La lista en orden de prioridad, el máximo y los textos de la base en el idioma de quien mira. */
export function pedirLosContactosDeEmergencia(clienteId, idioma) {
  return llamarApiContactosDeEmergencia(direccion(clienteId, idioma));
}

/** Reemplaza la lista entera. `cuerpo` sale de `cuerpoDelPedido` (lib/contactosDeEmergencia.js). */
export function guardarLosContactosDeEmergencia(clienteId, idioma, cuerpo) {
  return llamarApiContactosDeEmergencia(direccion(clienteId, idioma), {
    method: 'PUT',
    body: JSON.stringify(cuerpo),
  });
}
