/*
 * La lectura de un archivo de importación, con la propuesta de qué columna es cuál en cada hoja.
 *
 * La usan tres rutas: la que analiza para importar, la que propone la configuración inicial y la
 * que confirma, que vuelve a leer el archivo ella misma y no confía en filas mandadas por el
 * navegador. Escrita una sola vez, las tres leen igual.
 *
 * Nada se rechaza por su formato: lo que no es una tabla es un documento. El texto pegado entra
 * como un archivo `texto-pegado.txt`. Las advertencias son claves que la pantalla traduce.
 */

import { leerArchivo, archivoDelTexto } from './lecturaDeArchivos.js';
import { leerEstructuraIA } from './lecturaIA.js';
import {
  proponerMapeoIA, CAMPOS_IMPORTACION, CAMPOS_OBLIGATORIOS, CLASES_DE_HOJA, TIPOS_DE_IMPORTACION,
} from './importacionIA.js';
import { ErrorConMotivo } from './errorConMotivo.js';

const MB = 1024 * 1024;
const TOPE_POR_OMISION_MB = 20;

/** El tope de tamaño de un archivo de importación, en bytes. Se configura por variable de entorno. */
export function tamanoMaximoDeImportacion(entorno = process.env) {
  const mb = Number(entorno.TAMANO_MAXIMO_IMPORTACION_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : TOPE_POR_OMISION_MB) * MB;
}

/** Si el tipo es uno de los que la importación sabe cargar. Falla cerrado ante cualquier otro. */
export function esTipoDeImportacion(tipo) {
  return typeof tipo === 'string' && TIPOS_DE_IMPORTACION.includes(tipo);
}

/**
 * El archivo que llegó: el subido o, si no hay, el texto pegado. Sin ninguno de los dos, falta el
 * archivo.
 */
export function archivoDelPedido({ archivo, texto }) {
  if (archivo?.buffer) return archivo;
  if (typeof texto === 'string' && texto.trim()) return archivoDelTexto(texto);
  throw new ErrorConMotivo('falta_el_archivo');
}

/**
 * Los renglones contados no coinciden con las filas leídas. Una hoja sin cuenta no se compara:
 * no hay con qué.
 */
export function faltanRenglones(hoja) {
  return Number.isInteger(hoja?.renglonesContados) && hoja.renglonesContados !== (hoja.filas?.length ?? 0);
}

/**
 * Lee el archivo. Devuelve lo de `leerArchivo` más las advertencias de la lectura con IA, que
 * `leerArchivo` no conserva.
 *
 * @param {object} deps `leerArchivo` y `leerEstructuraIA`, para probar sin red.
 */
export async function leerLaImportacion({ archivo, prestadoraId }, deps = {}) {
  const leer = deps.leerArchivo ?? leerArchivo;
  const estructura = deps.leerEstructuraIA ?? leerEstructuraIA;
  const advertencias = [];
  const lectura = await leer(archivo, {
    leerConIA: async (texto) => {
      const leido = await estructura({ texto, prestadoraId });
      for (const a of leido?.advertencias ?? []) if (!advertencias.includes(a)) advertencias.push(a);
      return leido;
    },
  });
  // Lo leído por IA lo dice siempre, aunque la lectura no lo haya anotado.
  if (lectura.viaIA && !advertencias.includes('estructura_leida_por_ia')) advertencias.unshift('estructura_leida_por_ia');
  // Si la IA no dio una tabla, el archivo es un documento y esas advertencias no son de ninguna hoja.
  return { ...lectura, advertencias };
}

/**
 * Lee el archivo y propone el mapeo de cada hoja. Es la respuesta de `/analizar`.
 */
export async function analizarLaImportacion({ tipo, archivo, prestadoraId }, deps = {}) {
  const proponer = deps.proponerMapeoIA ?? proponerMapeoIA;
  const lectura = await leerLaImportacion({ archivo, prestadoraId }, deps);
  const esDocumento = tipo === 'documento' || lectura.esDocumento;

  const hojas = [];
  if (!esDocumento) {
    for (const hoja of lectura.hojas) {
      const propuesta = await proponer({ tipo, headers: hoja.headers, filasMuestra: hoja.filas, prestadoraId });
      const advertencias = [...lectura.advertencias, ...(propuesta.advertencias ?? [])];
      if (faltanRenglones(hoja)) advertencias.push('renglones_no_coinciden');
      hojas.push({
        indice: hoja.indice,
        nombre: hoja.nombre,
        headers: hoja.headers,
        filas: hoja.filas,
        renglonesContados: hoja.renglonesContados ?? null,
        mapeoPropuesto: propuesta.mapeo ?? {},
        advertencias: [...new Set(advertencias)],
        clasePropuesta: tipo === 'historia' && CLASES_DE_HOJA.includes(propuesta.clase) ? propuesta.clase : null,
      });
    }
  }

  return {
    archivoNombre: archivo.originalname,
    esDocumento,
    viaIA: lectura.viaIA,
    camposDisponibles: CAMPOS_IMPORTACION[tipo] ?? [],
    camposObligatorios: CAMPOS_OBLIGATORIOS[tipo] ?? [],
    clasesDeHoja: tipo === 'historia' ? CLASES_DE_HOJA : [],
    hojas,
    // Las del archivo entero: las de un documento no tienen hoja donde ir.
    advertencias: esDocumento ? lectura.advertencias : [],
  };
}

/**
 * Lo que mandó la pantalla por cada hoja, comprobado contra lo leído. Una hoja que no está en el
 * archivo o un mapeo que no es un objeto es un dato inválido, con el número de la hoja. Una hoja
 * leída que la pantalla no mandó entra igual, sin mapeo: nada queda afuera, y sus columnas van a
 * la historia como columnas sin lugar.
 */
export function hojasConfirmadas({ tipo, hojasLeidas, hojasMandadas }) {
  if (!Array.isArray(hojasMandadas)) throw new ErrorConMotivo('importacion_incompleta');
  const porIndice = new Map();
  for (const mandada of hojasMandadas) {
    const indice = mandada?.indice;
    const error = new ErrorConMotivo('dato_invalido');
    if (Number.isInteger(indice)) error.hoja = indice;
    if (!Number.isInteger(indice) || !hojasLeidas.some((h) => h.indice === indice)) throw error;
    if (!mandada.mapeo || typeof mandada.mapeo !== 'object' || Array.isArray(mandada.mapeo)) throw error;
    if (tipo === 'historia' && mandada.clase != null && !CLASES_DE_HOJA.includes(mandada.clase)) throw error;
    const campos = new Set(CAMPOS_IMPORTACION[tipo] ?? []);
    const mapeo = Object.fromEntries(Object.entries(mandada.mapeo)
      .map(([columna, campo]) => [columna, campos.has(campo) ? campo : null]));
    porIndice.set(indice, { mapeo, clase: mandada.clase ?? null });
  }
  return hojasLeidas.map((hoja) => ({
    hoja,
    mapeo: porIndice.get(hoja.indice)?.mapeo ?? Object.fromEntries(hoja.headers.map((h) => [h, null])),
    clase: porIndice.get(hoja.indice)?.clase ?? 'otro',
  }));
}

/** El texto de un archivo que se leyó como tabla, para guardarlo como documento. */
export function textoDeLasHojas(hojas) {
  return hojas.map((hoja) => [
    hoja.nombre,
    hoja.headers.join('\t'),
    ...hoja.filas.map((fila) => hoja.headers.map((c) => String(fila[c] ?? '')).join('\t')),
  ].join('\n')).join('\n\n');
}
