/**
 * El acceso guardado: la sesión que queda en el teléfono, cerrada con la huella.
 * ==============================================================================
 *
 * ORIGINAL. La copia de `pwa-clientes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
 * se edita a mano. Acá no hay una sola palabra propia de ninguna de las dos aplicaciones.
 *
 * CÓMO FUNCIONA. Es lo que hacen los bancos. Al cerrar sesión, la sesión no se revoca: se cifra y
 * queda guardada en el teléfono. Para volver a abrirla hace falta el secreto que el propio aparato
 * entrega sólo después de comprobar la huella o el rostro (la extensión PRF de WebAuthn). Ese
 * secreto no sale nunca del teléfono, no viaja al backend y no se guarda en ningún lado: se pide
 * cada vez.
 *
 * POR QUÉ HAY DOS LLAVES. Cerrar sesión no puede pedir la huella, así que el cifrado usa un par:
 * la mitad pública cifra la sesión al cerrar, sin preguntar nada, y la mitad privada —que es la
 * que abre— está cifrada a su vez con lo que entrega la huella.
 *
 * EL BACKEND NO PARTICIPA. La sesión se recupera con `refreshSession`, el mismo camino con el que
 * Supabase renueva cualquier sesión abierta. No hay ninguna credencial que alcance a nadie más.
 *
 * QUÉ SE GUARDA. Un solo renglón en el almacenamiento del navegador, de una sola persona: la del
 * último aparato habilitado acá.
 */
import { supabase } from './supabaseClient';

const CLAVE = 'acceso-guardado';
const VERSION = 1;
const INFO = new TextEncoder().encode('acceso-guardado-v1');

function aBase64(datos) {
  const bytes = new Uint8Array(datos);
  let texto = '';
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64(texto) {
  const normal = texto.replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(crudo, (letra) => letra.charCodeAt(0));
}

function leer() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return guardado?.v === VERSION ? guardado : null;
  } catch {
    return null;
  }
}

function escribir(registro) {
  localStorage.setItem(CLAVE, JSON.stringify(registro));
}

/** La sal que se le pasa al aparato. Cambia con cada aparato habilitado. */
export function salNueva() {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** El secreto que entregó el aparato, o nada si este aparato no sabe entregarlo. */
export function secretoDeLaHuella(credencial) {
  const resultado = credencial?.clientExtensionResults?.prf?.results?.first;
  return resultado ? new Uint8Array(resultado) : null;
}

async function claveDeLaHuella(secreto, sal) {
  const base = await crypto.subtle.importKey('raw', secreto, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Pide al aparato el secreto, con la huella o el rostro. */
export async function pedirSecretoDeLaHuella({ credencialId, parteConfiable, sal }) {
  const credencial = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: parteConfiable,
      allowCredentials: [{ type: 'public-key', id: deBase64(credencialId) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: sal } } },
    },
  });
  const resultado = credencial?.getClientExtensionResults?.()?.prf?.results?.first;
  return resultado ? new Uint8Array(resultado) : null;
}

/**
 * Deja este aparato listo para guardar la sesión bajo la huella. Reemplaza lo que hubiera: en el
 * teléfono hay un solo acceso guardado.
 */
export async function prepararAccesoGuardado({ usuarioId, rotulo, llaveId, credencialId, parteConfiable, sal, secreto }) {
  const par = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  const clave = await claveDeLaHuella(secreto, sal);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const privada = await crypto.subtle.exportKey('pkcs8', par.privateKey);
  const privadaCifrada = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, privada);
  escribir({
    v: VERSION,
    usuarioId,
    rotulo,
    llaveId,
    credencialId,
    parteConfiable,
    sal: aBase64(sal),
    publica: await crypto.subtle.exportKey('jwk', par.publicKey),
    privadaCifrada: aBase64(privadaCifrada),
    ivPrivada: aBase64(iv),
    tokenCifrado: null,
  });
}

/**
 * Al cerrar sesión: guarda la sesión cifrada, sin pedir la huella. Contesta si la guardó; si no,
 * quien llama cierra la sesión como siempre.
 */
export async function guardarSesionBajoLaHuella(sesion) {
  const registro = leer();
  if (!registro || !sesion?.refresh_token || sesion.user?.id !== registro.usuarioId) return false;
  const publica = await crypto.subtle.importKey(
    'jwk',
    registro.publica,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const clave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dato = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    clave,
    new TextEncoder().encode(sesion.refresh_token)
  );
  const claveEnvuelta = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publica,
    await crypto.subtle.exportKey('raw', clave)
  );
  escribir({ ...registro, tokenCifrado: { clave: aBase64(claveEnvuelta), iv: aBase64(iv), dato: aBase64(dato) } });
  return true;
}

/** Saca la sesión guardada y deja el aparato habilitado. */
export function descartarSesionGuardada() {
  const registro = leer();
  if (registro) escribir({ ...registro, tokenCifrado: null });
}

/**
 * Abre la sesión guardada con la huella. Deja la sesión abierta igual que la entrada con
 * contraseña: `onAuthStateChange` se entera solo. Devuelve el aparato con el que se entró.
 */
export async function abrirSesionConLaHuella() {
  const registro = leer();
  if (!registro?.tokenCifrado) throw new Error('sin acceso guardado');
  const sal = deBase64(registro.sal);
  const secreto = await pedirSecretoDeLaHuella({
    credencialId: registro.credencialId,
    parteConfiable: registro.parteConfiable,
    sal,
  });
  if (!secreto) throw new Error('el aparato no entregó el secreto');

  const clave = await claveDeLaHuella(secreto, sal);
  const privadaCruda = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(registro.ivPrivada) },
    clave,
    deBase64(registro.privadaCifrada)
  );
  const privada = await crypto.subtle.importKey(
    'pkcs8',
    privadaCruda,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  const { tokenCifrado } = registro;
  const claveCruda = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privada, deBase64(tokenCifrado.clave));
  const claveDelDato = await crypto.subtle.importKey('raw', claveCruda, 'AES-GCM', false, ['decrypt']);
  const token = new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(tokenCifrado.iv) }, claveDelDato, deBase64(tokenCifrado.dato))
  );

  // La sesión guardada sirve una sola vez: al renovarse, Supabase entrega otra.
  descartarSesionGuardada();
  const { error } = await supabase.auth.refreshSession({ refresh_token: token });
  if (error) throw error;
  return registro.llaveId;
}

/** Si hay una sesión guardada para esta Prestadora. */
export function hayAccesoGuardado(rotulo) {
  const registro = leer();
  return Boolean(registro?.tokenCifrado && rotulo && registro.rotulo === rotulo);
}

/** La Prestadora del acceso guardado, para cuando el teléfono no tiene otra anotada. */
export function rotuloDelAccesoGuardado() {
  const registro = leer();
  return registro?.tokenCifrado ? registro.rotulo : null;
}

/** El aparato habilitado acá, para olvidarlo si se lo revoca. */
export function llaveDelAccesoGuardado() {
  return leer()?.llaveId || null;
}

/** Olvida todo: el aparato habilitado y la sesión guardada. */
export function olvidarAccesoGuardado() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento no había nada guardado.
  }
}
