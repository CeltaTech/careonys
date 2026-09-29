/* Las regiones: en qué base vive cada Prestadora.
   =====================================================

   Ninguna parte del backend da por sentado que hay una sola base (docs/PLAN_HASTA_PRODUCCION.md,
   paso 5). Toda conexión nueva se arma con la región que corresponde, y la eligen las dos
   funciones de este archivo, que son el único lugar donde se decide:

   - `regionDeLaPrestadora`, para lo que ya sabe con qué Prestadora trabaja: el trabajo sin
     persona.
   - `regionDeLaCredencial`, para lo que llega con la credencial de una persona: la
     región es la que la emitió, y lo dice la propia credencial en su emisor (`iss`).

   HOY HAY UNA SOLA, y sale de las variables de entorno. El día que haya otra, cambia la lista y la
   forma de saber a cuál pertenece una Prestadora; nada que llame a estas funciones se entera.

   Lo que no se reconoce no se atiende: una credencial cuyo emisor no es ninguna región
   conocida no elige ninguna, y quien la trae queda afuera. */

let regiones = null;

/** La lista de regiones. Se arma al primer uso, con las variables que haya en ese momento. */
export function lasRegiones() {
  if (!regiones) {
    const url = process.env.SUPABASE_URL;
    const clavePublica = process.env.SUPABASE_ANON_KEY;
    if (!url || !clavePublica) {
      throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY: no hay región a la que conectarse');
    }
    regiones = [Object.freeze({ url, clavePublica, emisor: `${url}/auth/v1` })];
  }
  return regiones;
}

/**
 * La región en la que vive una Prestadora. Hoy es la única que hay, sea cual sea la
 * Prestadora; `prestadoraId` se recibe igual, porque es lo que va a decidir el día que haya más.
 */
export function regionDeLaPrestadora(prestadoraId) {
  return lasRegiones()[0];
}

/** Lo que dice la credencial de sí misma, sin comprobar la firma todavía. `null` si no se lee. */
function cuerpoSinVerificar(credencial) {
  try {
    const partes = String(credencial).split('.');
    if (partes.length !== 3) return null;
    const cuerpo = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return cuerpo && typeof cuerpo === 'object' ? cuerpo : null;
  } catch {
    return null;
  }
}

/**
 * La región que emitió una credencial, o `null` si no la emitió ninguna conocida.
 *
 * Leer el emisor sin haber comprobado la firma no le da nada a quien lo falsifique: sólo decide a
 * qué región se le pregunta si la firma vale, y cada una contesta únicamente por las suyas.
 */
export function regionDeLaCredencial(credencial) {
  const emisor = cuerpoSinVerificar(credencial)?.iss;
  if (typeof emisor !== 'string' || !emisor) return null;
  return lasRegiones().find((region) => region.emisor === emisor) ?? null;
}

/** Sólo para las pruebas: vuelve a leer las variables de entorno en el próximo uso. */
export function olvidarRegiones() {
  regiones = null;
}
