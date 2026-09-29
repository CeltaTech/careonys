/* Las instalaciones: en qué base vive cada Prestadora.
   =====================================================

   Ninguna parte del backend da por sentado que hay una sola base (docs/PLAN_HASTA_PRODUCCION.md,
   paso 5). Toda conexión nueva se arma con la instalación que corresponde, y la eligen las dos
   funciones de este archivo, que son el único lugar donde se decide:

   - `instalacionDeLaPrestadora`, para lo que ya sabe con qué Prestadora trabaja: el trabajo sin
     persona.
   - `instalacionDeLaCredencial`, para lo que llega con la credencial de una persona: la
     instalación es la que la emitió, y lo dice la propia credencial en su emisor (`iss`).

   HOY HAY UNA SOLA, y sale de las variables de entorno. El día que haya otra, cambia la lista y la
   forma de saber a cuál pertenece una Prestadora; nada que llame a estas funciones se entera.

   Lo que no se reconoce no se atiende: una credencial cuyo emisor no es ninguna instalación
   conocida no elige ninguna, y quien la trae queda afuera. */

let instalaciones = null;

/** La lista de instalaciones. Se arma al primer uso, con las variables que haya en ese momento. */
export function lasInstalaciones() {
  if (!instalaciones) {
    const url = process.env.SUPABASE_URL;
    const clavePublica = process.env.SUPABASE_ANON_KEY;
    if (!url || !clavePublica) {
      throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY: no hay instalación a la que conectarse');
    }
    instalaciones = [Object.freeze({ url, clavePublica, emisor: `${url}/auth/v1` })];
  }
  return instalaciones;
}

/**
 * La instalación en la que vive una Prestadora. Hoy es la única que hay, sea cual sea la
 * Prestadora; `prestadoraId` se recibe igual, porque es lo que va a decidir el día que haya más.
 */
export function instalacionDeLaPrestadora(prestadoraId) {
  return lasInstalaciones()[0];
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
 * La instalación que emitió una credencial, o `null` si no la emitió ninguna conocida.
 *
 * Leer el emisor sin haber comprobado la firma no le da nada a quien lo falsifique: sólo decide a
 * qué instalación se le pregunta si la firma vale, y cada una contesta únicamente por las suyas.
 */
export function instalacionDeLaCredencial(credencial) {
  const emisor = cuerpoSinVerificar(credencial)?.iss;
  if (typeof emisor !== 'string' || !emisor) return null;
  return lasInstalaciones().find((instalacion) => instalacion.emisor === emisor) ?? null;
}

/** Sólo para las pruebas: vuelve a leer las variables de entorno en el próximo uso. */
export function olvidarInstalaciones() {
  instalaciones = null;
}
