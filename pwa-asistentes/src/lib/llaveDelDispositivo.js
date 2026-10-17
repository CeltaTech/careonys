/**
 * La llave que guarda este teléfono, del lado del navegador.
 * ==========================================================
 *
 * ORIGINAL. La copia de `pwa-clientes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
 * se edita a mano (`CLAUDE.md` §6). Por eso acá no hay una sola palabra propia de ninguna de las
 * dos aplicaciones: la puerta la pone quien llama.
 *
 * QUÉ HACE Y QUÉ NO. Pide el desafío, se lo da al navegador para que el teléfono lo firme con la
 * llave que guarda adentro, y devuelve la firma. La huella y el rostro no pasan por acá ni por
 * ningún otro lado del producto: las mira el propio aparato para destrabar su llave, y lo único
 * que sale es la firma.
 *
 * INGRESAR CON BIOMETRÍA NO PASA POR ACÁ. Eso abre la sesión guardada en el teléfono
 * (`accesoGuardado.js`). Acá se le pide al aparato, al darlo de alta, el secreto que después la
 * abre; ese secreto se separa de la respuesta antes de mandarla y no llega nunca al backend.
 */
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { pedirSecretoDeLaHuella, secretoDeLaHuella } from './accesoGuardado';

/**
 * Si este navegador y este aparato pueden guardar una llave.
 *
 * Se pregunta antes de mostrar el botón: ofrecer una puerta que no abre es peor que no ofrecerla.
 * Ante la duda contesta que no, que es el lado seguro — quien no pueda usar la llave sigue
 * teniendo la contraseña.
 */
export async function esteAparatoGuardaLlaves() {
  try {
    if (!window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Si la persona canceló el pedido del navegador, en vez de haber fallado algo. */
export function loCancelaronAMano(error) {
  return error?.name === 'NotAllowedError' || error?.name === 'AbortError';
}

/**
 * Dar de alta una llave en este aparato. La puerta la pone quien llama, porque vive adentro de la
 * aplicación y cada una tiene la suya.
 *
 * `puerta.desafio()` pide el número a firmar y `puerta.guardar(firma)` manda la llave nueva.
 * `sal` es lo que el aparato mezcla con su secreto; devuelve, además de lo que contesta el backend,
 * el secreto —o nada, si el aparato no sabe darlo— y lo necesario para volver a pedirlo.
 */
export async function guardarLaLlaveEnEsteAparato(puerta, sal) {
  const opciones = await puerta.desafio();
  const firma = await startRegistration({
    optionsJSON: { ...opciones, extensions: { ...opciones.extensions, prf: { eval: { first: sal } } } },
  });
  let secreto = secretoDeLaHuella(firma);
  const { prf: _secreto, ...resultados } = firma.clientExtensionResults || {};
  const respuesta = await puerta.guardar({ ...firma, clientExtensionResults: resultados });

  const credencialId = firma.id;
  const parteConfiable = opciones.rp?.id || window.location.hostname;
  // Algunos aparatos dan el secreto sólo al usar la llave, no al crearla.
  if (!secreto && _secreto) {
    secreto = await pedirSecretoDeLaHuella({ credencialId, parteConfiable, sal }).catch(() => null);
  }
  return { ...respuesta, credencialId, parteConfiable, secreto };
}

/**
 * Firmar con la llave ya guardada. `pedirDesafio()` trae el número a firmar desde la aplicación de
 * quien llama; lo que vuelve es la firma, que se manda junto con lo firmado y la comprueba el
 * backend antes de guardar nada.
 */
export async function firmarConLaLlaveDelAparato(pedirDesafio) {
  const opciones = await pedirDesafio();
  return startAuthentication({ optionsJSON: opciones });
}
