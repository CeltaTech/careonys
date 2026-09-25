/* Traer de la base las frases de los avisos, una vez, al arrancar el motor.
   ==========================================================================

   POR QUÉ ESTÁ SEPARADO DE `mensajesDelSistema.js`. Ese archivo guarda las frases y no sabe de
   dónde salieron: así lo puede cargar el motor desde la base, y una prueba desde lo que siembra la
   migración, sin levantar ninguna base. Acá está lo único que toca la base.

   POR QUÉ SE CARGA TODO JUNTO Y NO AVISO POR AVISO. Un aviso se arma en el medio de mandar un
   correo, y ahí no hay lugar para esperar una consulta. Son unos cientos de renglones cortos: entran
   en memoria sin que se note.

   SI LA CARGA FALLA, EL MOTOR ARRANCA IGUAL. Los avisos van a salir con la marca de frase faltante
   y el aviso queda en el registro, que es exactamente lo que se quiere ver. Un motor que no levanta
   porque no pudo leer un texto deja sin funcionar todo lo demás, que sí anda. */

import { supabase } from '../db/connection.js';
import { sembrarMensajesDelSistema, clavesCargadas } from './mensajesDelSistema.js';

const DE_A = 1000;

/**
 * Lee `mensajes_del_sistema` entera y la deja cargada en memoria.
 *
 * @returns {Promise<{cargadas: number, error: string|null}>}
 */
export async function cargarMensajesDelSistema() {
  const filas = [];
  let desde = 0;

  // De a mil, porque la lectura tiene un tope por pedido y el catálogo va a crecer.
  for (;;) {
    // SIN PRESTADORA A PROPÓSITO
    // El catálogo se lee una sola vez, al arrancar el motor, cuando todavía no hay ninguna persona
    // adentro y por lo tanto ninguna Prestadora de la cual hablar. Acotarlo a una dejaría al motor
    // sin los textos de las demás.
    //
    // Y lo leído no se mezcla: cada frase propia queda guardada bajo el identificador de su
    // Prestadora, y al pedirla se la busca por ese identificador exacto. Una Prestadora que no
    // escribió la suya recibe la del producto, nunca la de otra —ver `mensajesDelSistema.js`—.
    const { data, error } = await supabase
      .from('mensajes_del_sistema')
      .select('clave, i18n, prestadora_id, activo')
      .eq('activo', true)
      .range(desde, desde + DE_A - 1);

    if (error) {
      console.error('No se pudieron leer los mensajes del sistema:', error.message);
      return { cargadas: clavesCargadas().length, error: error.message };
    }

    filas.push(...(data ?? []));
    if (!data || data.length < DE_A) break;
    desde += DE_A;
  }

  sembrarMensajesDelSistema(filas);
  return { cargadas: clavesCargadas().length, error: null };
}
