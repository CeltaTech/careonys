import { sinPrestadora } from '../db/connection.js';
import { lasRegiones } from '../db/regiones.js';
import { decodificarLatin1, leerIpcNacional } from './lectorDelIpc.js';

/* La carga automática de los índices públicos.
   ==========================================================================

   Baja la serie del IPC del INDEC y anota en la base los valores mensuales del nivel general
   nacional. Un índice público es el mismo para todas las Prestadoras, así que corre con la cuenta
   automática que no es de ninguna: la base sólo a ella le deja llamar a
   `anotar_valor_de_indice_publico`, que escribe en `valores_de_indice` y en nada más. No usa
   ninguna credencial que alcance a las Prestadoras.

   Va una vez por día, aparte de las tareas por Prestadora (`server.js`), y en cada región: cada
   una tiene su base y su copia del índice.

   Lo que la fuente no trae no se toca. Un valor que ya está y no cambió no se vuelve a escribir. */

export const FUENTE_DEL_IPC = 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv';
export const CODIGO_DEL_IPC = 'ipc_indec_nacional';

// Sólo se anotan los últimos meses: la serie entera arranca en 2016 y los meses viejos no cambian.
const MESES_QUE_SE_ANOTAN = 24;

export async function bajarElIpc(fetchar = fetch) {
  const respuesta = await fetchar(FUENTE_DEL_IPC);
  if (!respuesta.ok) throw new Error(`La fuente del IPC contestó ${respuesta.status}.`);
  return leerIpcNacional(decodificarLatin1(new Uint8Array(await respuesta.arrayBuffer())));
}

export async function cargarLosIndicesPublicos({ fetchar = fetch, conexion = sinPrestadora, regiones = lasRegiones } = {}) {
  const valores = (await bajarElIpc(fetchar)).slice(-MESES_QUE_SE_ANOTAN);
  let anotados = 0;
  for (const region of regiones()) {
    const db = conexion('carga de los índices públicos', region);
    for (const { periodo, valor } of valores) {
      const { data, error } = await db.rpc('anotar_valor_de_indice_publico', {
        p_indice: CODIGO_DEL_IPC,
        p_periodo: periodo,
        p_valor: valor,
      });
      if (error) {
        console.error('carga de los índices públicos: no se pudo anotar un valor:', error.message);
        throw new Error('No se pudo anotar un valor del índice.');
      }
      if (data === true) anotados += 1;
    }
  }
  return { leidos: valores.length, anotados };
}
