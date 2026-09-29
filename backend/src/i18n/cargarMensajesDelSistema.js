/* Traer de la base las frases de los mensajes del sistema, una vez, al arrancar el backend.
   ========================================================================================

   POR QUÉ ESTÁ SEPARADO DE `mensajesDelSistema.js`. Ese archivo guarda las frases y no sabe de
   dónde salieron: así lo puede cargar el backend desde la base, y una prueba desde lo que siembra la
   migración, sin levantar ninguna base. Acá está lo único que toca la base.

   POR QUÉ SE CARGA TODO JUNTO Y NO MENSAJE POR MENSAJE. Un mensaje se arma en el medio de mandar un
   correo, y ahí no hay lugar para esperar una consulta. Son unos cientos de renglones cortos: entran
   en memoria sin que se note.

   SI LA CARGA FALLA, EL BACKEND ARRANCA IGUAL. Los mensajes van a salir con la marca de frase
   faltante y la falla queda en el registro, que es exactamente lo que se quiere ver. Un backend
   que no levanta porque no pudo leer un texto deja sin funcionar todo lo demás, que sí anda.

   SE LEE DE A UNA PRESTADORA, CON LA CREDENCIAL DE CADA UNA. Lo propio de cada Prestadora se lee
   adentro de ella, y el texto del producto, que es igual para todas, una sola vez, adentro de la
   primera. Así ninguna lectura alcanza a dos Prestadoras. Y lo leído no se mezcla: cada frase propia
   queda guardada bajo el identificador de su Prestadora, y al pedirla se la busca por ese
   identificador exacto —ver `mensajesDelSistema.js`—. */

import { supabase, paraCadaPrestadora } from '../db/connection.js';
import { sembrarMensajesDelSistema, clavesCargadas } from './mensajesDelSistema.js';

const DE_A = 1000;
const TRABAJO = 'cargar_mensajes_del_sistema';

/** Lee de a mil, porque la lectura tiene un tope por pedido y el catálogo va a crecer. */
async function leerTodo(armarConsulta) {
  const filas = [];
  for (let desde = 0; ; desde += DE_A) {
    const { data, error } = await armarConsulta().range(desde, desde + DE_A - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < DE_A) return filas;
  }
}

/**
 * Lee `mensajes_del_sistema` entera y la deja cargada en memoria.
 *
 * @returns {Promise<{cargadas: number, error: string|null}>}
 */
export async function cargarMensajesDelSistema() {
  const filas = [];
  let delProductoLeido = false;
  let fallo = null;

  await paraCadaPrestadora(TRABAJO, async (prestadoraId) => {
    try {
      if (!delProductoLeido) {
        // El texto del producto no es de ninguna Prestadora: es el que sale cuando la suya no
        // escribió uno propio. La base se lo deja leer a cada Prestadora, y se lee una sola vez.
        filas.push(...await leerTodo(() => supabase
          .from('mensajes_del_sistema')
          .select('clave, i18n, prestadora_id, activo')
          .is('prestadora_id', null)
          .eq('activo', true)));
        delProductoLeido = true;
      }
      filas.push(...await leerTodo(() => supabase
        .from('mensajes_del_sistema')
        .select('clave, i18n, prestadora_id, activo')
        .eq('prestadora_id', prestadoraId)
        .eq('activo', true)));
    } catch (error) {
      fallo = error.message;
      console.error('No se pudieron leer los mensajes del sistema:', error.message);
    }
  });

  sembrarMensajesDelSistema(filas);
  return { cargadas: clavesCargadas().length, error: fallo };
}
