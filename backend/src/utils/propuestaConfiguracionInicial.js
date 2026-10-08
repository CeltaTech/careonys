import { supabase } from '../db/connection.js';
import { catalogoDeTiposAsistente, resolverTipoAsistenteEnCatalogo } from './cuentasPanel.js';
import { CAMPOS_LISTA, valorDesdeFila } from './importacionIA.js';

/* Qué configuración inicial propone una planilla que la Prestadora ya tiene.
   ==========================================================================

   POR QUÉ EXISTE. La guía de primeros pasos le pide a una Prestadora nueva ocho cosas, y casi
   todas ya están escritas en la planilla con la que venía trabajando. Esto lee esa planilla
   —con la misma lectura que ya usa la importación, no una nueva— y contesta qué traería.

   Y CONTESTA ALGO MÁS, QUE ES EL MOTIVO REAL. La importación no crea tipos de Asistente: un tipo
   que no calza con el catálogo deja al Asistente sin tipo —y el tipo es lo que decide si a esa
   persona se le va a exigir Matrícula (ver `resolverTipoAsistentePorNombre`)—. Eso se descubría
   después, revisando de a uno. Acá se dice antes de importar, para que la configuración se cargue
   primero y el archivo entre entero.

   Las localidades no se proponen: la importación las reconoce sola y agrega a la lista las que
   falten (`localidadesDeLaImportacion.js`).

   NO CREA NADA. Es una lectura y una comparación. Quien confirma sigue siendo la persona, en la
   pantalla de importación, que es donde están los dos frenos: revisar el mapeo y conformar el
   resultado real. */

/* Cuántos valores distintos se miran de una columna. Una planilla de Asistentes tiene un
   puñado de tipos; un archivo con cientos de valores distintos en esa columna ya no es un
   catálogo, es otra cosa, y listar todo eso no ayudaría a nadie a decidir. */
const TOPE_VALORES_DISTINTOS = 50;

/* Deja un texto comparable conservando los números. */
function comparable(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/* Los valores distintos que trae una columna de la planilla, con el texto tal como vino —es
   lo que se muestra en pantalla— y comparados sin mayúsculas, tildes ni puntuación. */
function valoresDistintos(filas, mapeo, tipo, campo) {
  const esLista = CAMPOS_LISTA[tipo].has(campo);
  const vistos = new Map();

  for (const fila of filas) {
    const valor = valorDesdeFila(fila, mapeo, campo, esLista);
    const textos = esLista ? valor : valor === undefined ? [] : [valor];
    for (const texto of textos) {
      const clave = comparable(texto);
      if (!clave || vistos.has(clave)) continue;
      vistos.set(clave, String(texto).trim());
      if (vistos.size >= TOPE_VALORES_DISTINTOS) return [...vistos.values()];
    }
  }

  return [...vistos.values()];
}

/**
 * @returns {Promise<{filasTotales:number, tiposNuevos:string[]}>}
 *   `tiposNuevos` es lo que la planilla nombra y la configuración de esa Prestadora todavía no
 *   tiene. Para una planilla de Clientes va vacía: ese archivo no trae configuración, trae
 *   Clientes.
 */
export async function proponerConfiguracionInicial({ tipo, filas, mapeo, prestadoraId }) {
  const filasTotales = filas.length;
  if (tipo !== 'asistente') return { filasTotales, tiposNuevos: [] };

  const tiposDeLaPlanilla = valoresDistintos(filas, mapeo, tipo, 'tipo_asistente');

  // El backend entra a la base con la llave maestra: el filtro por Prestadora va adentro de
  // `catalogoDeTiposAsistente` (celtatech/CLAUDE.md §5).
  const catalogo = await catalogoDeTiposAsistente(supabase, prestadoraId);

  return {
    filasTotales,
    tiposNuevos: tiposDeLaPlanilla.filter((nombre) => resolverTipoAsistenteEnCatalogo(nombre, catalogo) === null),
  };
}
