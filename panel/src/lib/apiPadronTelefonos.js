import { llamadorDe } from './apiPanel';

/* Los teléfonos de contacto de una ficha del Padrón.
   ==========================================================================

   Lo que va después de `/api/panel/padron/telefonos`. El `fetch`, la sesión, los encabezados y el
   manejo del error están escritos una sola vez en `apiPanel.js`.

   EL NÚMERO VIAJA EN EL CUERPO, NUNCA EN LA DIRECCIÓN. Es dato sensible: una dirección queda
   escrita en el historial del navegador y en el registro de cualquier intermediario.

   @param {string} path  Lo que va después de `/api/panel/padron/telefonos`, empezando con `/`.
   @param {object} opciones  Lo mismo que acepta `fetch`. */
export const llamarApiPadronTelefonos = llamadorDe('/padron/telefonos');

/** Todos los teléfonos del Padrón, para agruparlos por ficha en la lista. */
export function pedirLosTelefonosDelPadron() {
  return llamarApiPadronTelefonos('/');
}

/** Los de una ficha sola. */
export function pedirLosTelefonosDeLaFicha(legajoId) {
  return llamarApiPadronTelefonos(`/${legajoId}`);
}

export function cargarUnTelefono(legajoId, telefono) {
  return llamarApiPadronTelefonos(`/${legajoId}`, {
    method: 'POST',
    body: JSON.stringify({ telefono }),
  });
}

export function corregirUnTelefono(legajoId, telefonoId, telefono) {
  return llamarApiPadronTelefonos(`/${legajoId}/${telefonoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ telefono }),
  });
}

export function sacarUnTelefono(legajoId, telefonoId) {
  return llamarApiPadronTelefonos(`/${legajoId}/${telefonoId}`, { method: 'DELETE' });
}
