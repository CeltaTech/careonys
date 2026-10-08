// ---------------------------------------------------------------------------
// fichaDelPaciente.js — quién es el Paciente, leído de su Ficha de Persona
//
// QUÉ RESUELVE
// El Paciente no guarda su nombre, su fecha de nacimiento ni su domicilio: eso
// está en su Ficha de Persona, en el Directorio, que es el único lugar donde se
// guarda a una persona. Cada consulta de Pacientes trae la Ficha pegada, y acá
// se la aplana para que quien la usa siga leyendo `nombre`, `fecha_nacimiento`,
// `domicilio`, `lat` y `lng` sobre el Paciente, como antes.
//
// LO QUE NO SE PIDIÓ, NO APARECE. Una consulta que no pidió el domicilio —porque
// la Prestadora no deja que el Asistente lo vea, o porque sólo mide una
// distancia— no lo recibe: cada campo se completa sólo si su parte vino en la
// Ficha. Así `domicilioDelDia.js` sigue sabiendo qué se pidió.
//
// POR QUÉ ACÁ Y NO EN CADA PANTALLA
// Lo usan el backend y el Panel. El original vive acá y la copia del Panel se
// mantiene sola (scripts/copias_entre_apps.mjs).
// ---------------------------------------------------------------------------

import { domicilioEscrito } from './domicilioEscrito.js';

// La relación tiene nombre porque el Paciente apunta al Directorio por más de un
// lado —su obra social también es una Ficha de Persona— y sin nombre la base no
// sabe cuál de las dos se pide.
const LA_FICHA = 'persona:personas!pacientes_persona_de_la_misma_prestadora';

/** La Ficha con las partes que se nombren, para cuando ninguna de las de abajo calza justo. */
export function fichaCon(partes) {
  return `${LA_FICHA}(${partes.join(', ')})`;
}

/** Las partes del domicilio, con el nombre del lugar. */
export const PARTES_DEL_DOMICILIO = ['calle', 'numero', 'piso', 'unidad', 'lugar:lugares(nombre)'];

/** Lo que alcanza para nombrar al Paciente. */
export const FICHA_NOMBRE = `${LA_FICHA}(nombre_visible)`;

/** Para nombrarlo y ubicarlo en el mapa, sin mostrar dónde vive. */
export const FICHA_UBICACION = `${LA_FICHA}(nombre_visible, lat, lng)`;

/** Para nombrarlo, mostrar dónde vive y ubicarlo. */
export const FICHA_DOMICILIO = `${LA_FICHA}(nombre_visible, calle, numero, piso, unidad, lat, lng, lugar:lugares(nombre))`;

/** Todo lo que la Ficha dice del Paciente. */
export const FICHA_COMPLETA = `${LA_FICHA}(nombre_visible, fecha_nacimiento, calle, numero, piso, unidad, lugar_id, lat, lng, lugar:lugares(nombre))`;

/**
 * El Paciente con lo de su Ficha puesto encima.
 *
 * `textos` son las palabras «piso» y «unidad» en el idioma de quien mira; sin ellas se escriben en
 * castellano, que es lo que hace `domicilioEscrito`.
 */
export function conSuFicha(paciente, textos) {
  if (!paciente || typeof paciente !== 'object') return paciente;
  const { persona, ...resto } = paciente;
  if (!persona) return resto;

  const conFicha = { ...resto };
  if (Object.hasOwn(persona, 'nombre_visible')) conFicha.nombre = persona.nombre_visible ?? null;
  if (Object.hasOwn(persona, 'fecha_nacimiento')) conFicha.fecha_nacimiento = persona.fecha_nacimiento ?? null;
  if (Object.hasOwn(persona, 'calle')) {
    conFicha.domicilio =
      domicilioEscrito({ ...persona, lugar: persona.lugar?.nombre }, textos) || null;
    for (const parte of ['calle', 'numero', 'piso', 'unidad']) conFicha[parte] = persona[parte] ?? null;
  }
  if (Object.hasOwn(persona, 'lugar_id')) conFicha.lugar_id = persona.lugar_id ?? null;
  if (Object.hasOwn(persona, 'lat')) conFicha.lat = persona.lat ?? null;
  if (Object.hasOwn(persona, 'lng')) conFicha.lng = persona.lng ?? null;
  return conFicha;
}

/** Lo mismo para una lista. */
export function conSusFichas(pacientes, textos) {
  return (pacientes ?? []).map((p) => conSuFicha(p, textos));
}
