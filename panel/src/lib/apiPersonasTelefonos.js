import { llamadorDe } from './apiPanel';

/* Los teléfonos de contacto de una Ficha de Persona.
   ==========================================================================

   Lo que va después de `/api/panel/personas/telefonos`. El `fetch`, la sesión, los encabezados y el
   manejo del error están escritos una sola vez en `apiPanel.js`.

   EL NÚMERO VIAJA EN EL CUERPO, NUNCA EN LA DIRECCIÓN. Es dato sensible: una dirección queda
   escrita en el historial del navegador y en el registro de cualquier intermediario.

   @param {string} path  Lo que va después de `/api/panel/personas/telefonos`, empezando con `/`.
   @param {object} opciones  Lo mismo que acepta `fetch`. */
export const llamarApiPersonasTelefonos = llamadorDe('/personas/telefonos');

/** Todos los teléfonos del Directorio de Personas, para agruparlos por Ficha en la lista. */
export function pedirLosTelefonosDelDirectorio() {
  return llamarApiPersonasTelefonos('/');
}

/** Los de una Ficha sola. */
export function pedirLosTelefonosDeLaPersona(personaId) {
  return llamarApiPersonasTelefonos(`/${personaId}`);
}

export function cargarUnTelefono(personaId, telefono) {
  return llamarApiPersonasTelefonos(`/${personaId}`, {
    method: 'POST',
    body: JSON.stringify({ telefono }),
  });
}

export function corregirUnTelefono(personaId, telefonoId, telefono) {
  return llamarApiPersonasTelefonos(`/${personaId}/${telefonoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ telefono }),
  });
}

/** Queda en la Ficha y deja de ser el preferido para llamar. */
export function ponerFueraDeUso(personaId, telefonoId) {
  return llamarApiPersonasTelefonos(`/${personaId}/${telefonoId}/fuera-de-uso`, { method: 'POST' });
}

export function restaurarUnTelefono(personaId, telefonoId) {
  return llamarApiPersonasTelefonos(`/${personaId}/${telefonoId}/restaurar`, { method: 'POST' });
}

export function borrarUnTelefono(personaId, telefonoId) {
  return llamarApiPersonasTelefonos(`/${personaId}/${telefonoId}`, { method: 'DELETE' });
}
