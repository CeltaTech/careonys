/* Los contactos de emergencia de un Cliente mientras se arma la lista en la Ficha del Cliente.
   ==========================================================================

   A quién se llama si al Paciente le pasa algo. Son hasta `maximo` (lo dice el backend), en orden
   de prioridad: el primero de la lista es el primero al que se llama.

   Cada contacto es una persona que ya está en Contactos (`personaId`) o una persona nueva, que se
   escribe con nombre, apellido y teléfono y se da de alta sin documento al guardar. Al guardar se
   manda la lista entera, y el backend la reemplaza de una vez.

   Es la cuenta sin pantalla, para que se pueda probar sola. */

export const CAMPOS_DE_LA_PERSONA_NUEVA = ['nombre', 'apellido', 'telefono'];

// Lo que el backend rechazó, y el texto de la base que lo explica (llega con la lista).
const ERROR_POR_MOTIVO = {
  demasiados_contactos_de_emergencia: 'demasiados',
  contacto_de_emergencia_repetido: 'repetido',
  contacto_de_emergencia_inexistente: 'inexistente',
  faltan_datos: 'faltan_datos',
  telefono_invalido: 'telefono_invalido',
};

// El lugar que la persona ocupa en el Cliente, y la clave de su texto en la base.
const LUGARES = [
  ['esContratante', 'contratante'],
  ['esPaciente', 'paciente'],
  ['esResponsableDePagos', 'responsable_de_pagos'],
  ['esPersonaAutorizada', 'persona_autorizada'],
];

/** La lista guardada, en orden de prioridad, como la edita la pantalla. */
export function deLaRespuesta(contactos) {
  return [...(contactos ?? [])]
    .sort((a, b) => a.prioridad - b.prioridad)
    .map((c) => ({ ...c, telefonos: c.telefonos ?? [], clave: c.personaId }));
}

function moverA(lista, desde, hasta) {
  if (desde < 0 || desde >= lista.length || hasta < 0 || hasta >= lista.length) return lista;
  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}

export const subir = (lista, indice) => moverA(lista, indice, indice - 1);
export const bajar = (lista, indice) => moverA(lista, indice, indice + 1);
export const quitar = (lista, indice) => lista.filter((_, i) => i !== indice);

export const sePuedeAgregar = (lista, maximo) => lista.length < maximo;

/** Si la persona de Contactos ya está en la lista. */
export const yaEstaEnLaLista = (lista, personaId) => lista.some((c) => c.personaId === personaId);

/**
 * Agrega al final una persona de Contactos. Si ya está, o la lista está llena, no cambia nada.
 *
 * @param {{personaId: string, nombre: string}} persona
 */
export function agregarPersona(lista, persona, maximo) {
  if (!persona?.personaId || !sePuedeAgregar(lista, maximo)) return lista;
  if (yaEstaEnLaLista(lista, persona.personaId)) return lista;
  return [...lista, { ...persona, telefonos: persona.telefonos ?? [], clave: persona.personaId }];
}

/** Los casilleros de la persona nueva que quedaron vacíos, en el orden del formulario. */
export function faltantesDeLaPersonaNueva(valores) {
  return CAMPOS_DE_LA_PERSONA_NUEVA.filter((campo) => !String(valores?.[campo] ?? '').trim());
}

/** Agrega al final una persona nueva. `clave` separa el renglón de los demás mientras no se guarde. */
export function agregarPersonaNueva(lista, valores, clave, maximo) {
  if (!sePuedeAgregar(lista, maximo) || faltantesDeLaPersonaNueva(valores).length > 0) return lista;
  const nombre = valores.nombre.trim();
  const apellido = valores.apellido.trim();
  const telefono = valores.telefono.trim();
  return [
    ...lista,
    { nueva: true, clave, personaId: null, nombre: `${nombre} ${apellido}`, nombrePropio: nombre, apellido, telefono, telefonos: [telefono] },
  ];
}

/** Lo que recibe el backend: la lista entera, en orden de prioridad. */
export function cuerpoDelPedido(lista) {
  return {
    contactos: lista.map((c) =>
      c.nueva ? { nombre: c.nombrePropio, apellido: c.apellido, telefono: c.telefono } : { personaId: c.personaId },
    ),
  };
}

/** Si la lista de la pantalla es distinta de la guardada. */
export function hayCambios(lista, guardada) {
  if (lista.length !== guardada.length) return true;
  return lista.some((c, i) => c.nueva || c.personaId !== guardada[i].personaId);
}

/** El lugar que la persona ocupa en el Cliente, con los textos de la base. */
export function lugaresDe(contacto, textos) {
  return LUGARES.filter(([marca]) => contacto?.[marca]).map(([, clave]) => textos?.[clave]).filter(Boolean);
}

/** El texto de la base para lo que el backend rechazó, o nulo si es otra cosa. */
export function textoDelError(fallo, textos) {
  const clave = ERROR_POR_MOTIVO[fallo?.motivo];
  return (clave && textos?.error?.[clave]) || null;
}
