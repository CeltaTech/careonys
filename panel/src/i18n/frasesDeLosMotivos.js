/* Las frases de los motivos que levanta la base y que viven en la base.
   ==========================================================================

   Algunos rechazos los decide la base, para todas las pantallas a la vez, y su frase está guardada
   en `mensajes_del_sistema`: la Prestadora la puede reemplazar por la suya. El primero es
   «la_persona_no_tiene_documento», que sale cuando se le quiere dar a una persona sin documento
   un lugar que lo pide —Contratante, Paciente, obra social, Responsable de pagos y los demás—.

   La frase se lee una vez por sesión y se suma a `t.errores.motivos`, que es donde
   `mensajeDeError` busca la explicación de cada motivo. Así cualquier pantalla que ya pase sus
   errores por `mensajeDeError` la muestra sin cambiar nada.

   Se guarda en un anotador y no en un contexto por lo mismo que el nombre de la Prestadora
   (`marcaEnElTexto.js`): quien sabe que hay sesión cuelga del proveedor del idioma, no al revés. */

/** Qué frase de la base explica cada motivo. */
export const CLAVE_DE_CADA_MOTIVO = {
  la_persona_no_tiene_documento: 'personas.error.la_persona_no_tiene_documento',
};

const SIN_FRASES = Object.freeze([]);

let filasAnotadas = SIN_FRASES;
const oyentes = new Set();

/**
 * Anota las filas leídas de `mensajes_del_sistema`. Sin sesión se anota una lista vacía: las
 * frases propias de una Prestadora no pueden quedar a la vista de la siguiente sesión.
 *
 * @param {Array<{clave: string, prestadora_id: string|null, i18n: object}>|null|undefined} filas
 */
export function anotarFrasesDeLosMotivos(filas) {
  const nuevas = Array.isArray(filas) && filas.length ? filas : SIN_FRASES;
  if (nuevas === filasAnotadas) return;
  filasAnotadas = nuevas;
  for (const oyente of oyentes) oyente();
}

/** Las filas anotadas en esta sesión. */
export function frasesDeLosMotivosAnotadas() {
  return filasAnotadas;
}

/**
 * Avisa cuando cambian las filas anotadas. Devuelve cómo darse de baja.
 *
 * @param {() => void} oyente
 * @returns {() => void}
 */
export function alCambiarLasFrasesDeLosMotivos(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * El texto de cada motivo en el idioma pedido. La frase propia de la Prestadora gana sobre la de
 * fábrica; sin frase en ese idioma, la castellana. Un motivo sin frase no aparece, y entonces
 * `mensajeDeError` cae en la situación general.
 *
 * @returns {Record<string, string>}
 */
export function motivosEnElIdioma(filas, idioma) {
  const motivos = {};
  for (const [motivo, clave] of Object.entries(CLAVE_DE_CADA_MOTIVO)) {
    const deLaClave = (filas ?? []).filter((fila) => fila?.clave === clave);
    const enOrden = [deLaClave.find((f) => f.prestadora_id), deLaClave.find((f) => !f.prestadora_id)];
    const texto = [idioma, 'es-AR']
      .flatMap((cual) => enOrden.map((fila) => fila?.i18n?.[cual]))
      .find((frase) => typeof frase === 'string' && frase.trim());
    if (texto) motivos[motivo] = texto;
  }
  return motivos;
}

/**
 * El árbol de traducciones con las frases de la base sumadas a `errores.motivos`. Sin ninguna
 * frase devuelve el mismo árbol, sin copiarlo.
 */
export function conLosMotivosDeLaBase(arbol, motivos) {
  if (!motivos || Object.keys(motivos).length === 0) return arbol;
  const errores = arbol?.errores ?? {};
  return {
    ...arbol,
    errores: { ...errores, motivos: { ...(errores.motivos ?? {}), ...motivos } },
  };
}
