/*
 * La lectura de un archivo de importación.
 *
 * Ningún archivo se rechaza por su formato. Lo que se lee como tabla —un libro de planillas, un
 * texto delimitado, la copia de una base, una lista en JSON— vuelve con todas sus hojas, cada una
 * por separado. Lo que no es tabla —PDF, Word, foto, escaneo, texto suelto— vuelve como documento,
 * y se guarda entero en la historia anterior del Paciente.
 *
 * Cada hoja trae cuántos renglones se contaron y cuántos se leyeron. Si no coinciden, la
 * importación sigue igual y la Prestadora recibe un pedido para revisarlo: un renglón no se pierde
 * en silencio.
 *
 * Este módulo sólo lee. La lectura con IA de un formato desconocido llega de afuera, como una
 * función, para que la lectura de archivos no dependa del servicio de la IA.
 */

import XLSX from 'xlsx';
import mammoth from 'mammoth';

export const NOMBRE_DEL_TEXTO_PEGADO = 'texto-pegado.txt';

/** El texto pegado en la pantalla, tratado como si fuera un archivo. */
export function archivoDelTexto(texto) {
  const buffer = Buffer.from(String(texto ?? ''), 'utf8');
  return { buffer, originalname: NOMBRE_DEL_TEXTO_PEGADO, mimetype: 'text/plain', size: buffer.length };
}

// ─── Qué clase de archivo es ────────────────────────────────────────────────────────────────

const IMAGENES_QUE_LEE_LA_IA = {
  png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

function empiezaCon(buffer, bytes) {
  return bytes.every((b, i) => buffer[i] === b);
}

function extension(nombre) {
  const partes = String(nombre ?? '').toLowerCase().split('.');
  return partes.length > 1 ? partes.pop() : '';
}

/** La imagen que la IA sabe leer, por su firma, o null. */
function imagenLegible(buffer) {
  if (empiezaCon(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (empiezaCon(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (empiezaCon(buffer, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (buffer.length > 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function esOtraImagen(buffer, nombre, tipoMime) {
  if (String(tipoMime ?? '').startsWith('image/')) return true;
  if (empiezaCon(buffer, [0x49, 0x49, 0x2a, 0x00]) || empiezaCon(buffer, [0x4d, 0x4d, 0x00, 0x2a])) return true; // TIFF
  if (empiezaCon(buffer, [0x42, 0x4d])) return true; // BMP
  return ['tif', 'tiff', 'bmp', 'heic', 'heif'].includes(extension(nombre));
}

/** Si el contenido es texto: UTF-8 válido y casi sin caracteres de control. */
function esTexto(buffer) {
  if (buffer.includes(0)) return false;
  const texto = buffer.toString('utf8');
  if (texto.includes('�')) return false;
  const muestra = texto.slice(0, 20000);
  let control = 0;
  for (const c of muestra) {
    const code = c.charCodeAt(0);
    if (code < 32 && c !== '\n' && c !== '\r' && c !== '\t' && c !== '\f') control += 1;
  }
  return control <= muestra.length * 0.01;
}

function sinMarcaDeOrden(texto) {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// ─── Contar renglones de un texto delimitado ────────────────────────────────────────────────

/**
 * Cuántos registros no vacíos tiene un texto delimitado, sin contar el encabezado. Un salto de
 * línea entre comillas no corta el registro.
 */
export function contarRegistrosDelimitados(texto) {
  let registros = 0;
  let enComillas = false;
  let conContenido = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '"') {
      if (enComillas && texto[i + 1] === '"') { i += 1; continue; }
      enComillas = !enComillas;
      conContenido = true;
    } else if ((c === '\n' || c === '\r') && !enComillas) {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      if (conContenido) registros += 1;
      conContenido = false;
    } else if (!/\s/.test(c)) {
      conContenido = true;
    }
  }
  if (conContenido) registros += 1;
  return Math.max(0, registros - 1);
}

/** El separador de un texto delimitado, o null si el texto no tiene forma de tabla. */
export function separadorDeLaTabla(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 50);
  if (lineas.length < 2) return null;
  for (const separador of ['\t', ';', ',', '|']) {
    const cuantos = (linea) => linea.split(separador).length - 1;
    const enElEncabezado = cuantos(lineas[0]);
    if (enElEncabezado === 0) continue;
    const iguales = lineas.filter((l) => cuantos(l) >= enElEncabezado).length;
    if (iguales >= lineas.length * 0.6) return separador;
  }
  return null;
}

// ─── Libros de planillas y textos delimitados ───────────────────────────────────────────────

function hojaDeFilas(indice, nombre, filas, renglonesContados) {
  const headers = [];
  for (const fila of filas) {
    for (const columna of Object.keys(fila)) if (!headers.includes(columna)) headers.push(columna);
  }
  return { indice, nombre, headers, filas, renglonesContados };
}

/** Todas las hojas no vacías de un libro, cada una con sus renglones contados y leídos. */
export function hojasDelLibro(buffer, { texto = null } = {}) {
  // `raw` deja el texto de un CSV tal cual: la fecha la interpreta después la importación, con el
  // día adelante. El código 65001 lee bien los acentos de un CSV en UTF-8 sin marca de orden.
  const libro = texto !== null
    ? XLSX.read(texto, { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'buffer', codepage: 65001, raw: true });
  const hojas = [];
  libro.SheetNames.forEach((nombre) => {
    const planilla = libro.Sheets[nombre];
    if (!planilla) return;
    const filas = XLSX.utils.sheet_to_json(planilla, { defval: '' });
    const crudas = XLSX.utils.sheet_to_json(planilla, { header: 1, blankrows: false, defval: '' })
      .filter((r) => r.some((v) => String(v ?? '').trim() !== ''));
    if (!crudas.length) return;
    const contados = texto !== null ? contarRegistrosDelimitados(texto) : Math.max(0, crudas.length - 1);
    // Un texto delimitado no tiene hojas: el nombre que le pone la biblioteca no es de nadie.
    hojas.push(hojaDeFilas(hojas.length, texto !== null ? null : nombre, filas, contados));
  });
  return hojas;
}

// ─── La copia de una base ───────────────────────────────────────────────────────────────────

/** Si el texto parece la copia de una base: tiene INSERT INTO o COPY … FROM stdin. */
export function pareceCopiaDeBase(texto, nombre) {
  if (/\binsert\s+(?:ignore\s+)?into\b/i.test(texto) || /\bcopy\s+[^;]+\bfrom\s+stdin\b/i.test(texto)) return true;
  return extension(nombre) === 'sql';
}

/**
 * Separa el texto en piezas: cadenas entre comillas simples (con '' y \' adentro), nombres entre
 * comillas dobles, acentos graves o corchetes, palabras, números y signos. Los comentarios se
 * saltean. Ninguna coma, paréntesis o punto y coma adentro de una cadena corta nada.
 */
function piezasDelSQL(texto) {
  const piezas = [];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '-' && texto[i + 1] === '-') {
      while (i < n && texto[i] !== '\n') i += 1;
      continue;
    }
    if (c === '#' && (i === 0 || texto[i - 1] === '\n')) {
      while (i < n && texto[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && texto[i + 1] === '*') {
      const fin = texto.indexOf('*/', i + 2);
      i = fin === -1 ? n : fin + 2;
      continue;
    }
    if (c === "'") {
      let valor = '';
      let j = i + 1;
      while (j < n) {
        const d = texto[j];
        if (d === '\\' && j + 1 < n) {
          const e = texto[j + 1];
          valor += { n: '\n', r: '\r', t: '\t', 0: '\0' }[e] ?? e;
          j += 2;
          continue;
        }
        if (d === "'") {
          if (texto[j + 1] === "'") { valor += "'"; j += 2; continue; }
          break;
        }
        valor += d;
        j += 1;
      }
      piezas.push({ t: 'cadena', v: valor, crudo: texto.slice(i, j + 1), desde: i, hasta: j + 1 });
      i = j + 1;
      continue;
    }
    if (c === '"' || c === '`' || c === '[') {
      const cierre = c === '[' ? ']' : c;
      let valor = '';
      let j = i + 1;
      while (j < n) {
        if (texto[j] === cierre) {
          if (texto[j + 1] === cierre && cierre !== ']') { valor += cierre; j += 2; continue; }
          break;
        }
        valor += texto[j];
        j += 1;
      }
      piezas.push({ t: 'nombre', v: valor, crudo: texto.slice(i, j + 1), desde: i, hasta: j + 1 });
      i = j + 1;
      continue;
    }
    if ('(),;.'.includes(c)) {
      piezas.push({ t: 'signo', v: c, crudo: c, desde: i, hasta: i + 1 });
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(texto[j]) && !"'\"`[(),;".includes(texto[j])) {
      if (texto[j] === '.' && !/^[-+]?\d*$/.test(texto.slice(i, j))) break;
      j += 1;
    }
    if (j === i) j = i + 1;
    piezas.push({ t: 'palabra', v: texto.slice(i, j), crudo: texto.slice(i, j), desde: i, hasta: j });
    i = j;
  }
  return piezas;
}

const PALABRAS_QUE_NO_SON_COLUMNA = new Set([
  'constraint', 'primary', 'unique', 'foreign', 'check', 'key', 'index', 'exclude', 'fulltext', 'spatial', 'like',
]);

/** El nombre de una tabla escrito con o sin esquema, a partir de la pieza `desde`. */
function nombreDeTabla(piezas, desde) {
  const partes = [];
  let k = desde;
  while (k < piezas.length && (piezas[k].t === 'nombre' || piezas[k].t === 'palabra')) {
    partes.push(piezas[k].v);
    if (piezas[k + 1]?.v === '.') { k += 2; continue; }
    k += 1;
    break;
  }
  return { nombre: partes.join('.'), siguiente: k };
}

/** Los elementos de una lista entre paréntesis que abre en `desde`, cortados por las comas de afuera. */
function listaEntreParentesis(piezas, desde) {
  const elementos = [];
  let actual = [];
  let profundidad = 0;
  let k = desde;
  for (; k < piezas.length; k += 1) {
    const p = piezas[k];
    if (p.t === 'signo' && p.v === '(') {
      profundidad += 1;
      if (profundidad === 1) continue;
    } else if (p.t === 'signo' && p.v === ')') {
      profundidad -= 1;
      if (profundidad === 0) { elementos.push(actual); return { elementos, siguiente: k + 1 }; }
    } else if (p.t === 'signo' && p.v === ',' && profundidad === 1) {
      elementos.push(actual);
      actual = [];
      continue;
    }
    actual.push(p);
  }
  // Paréntesis sin cerrar: lo leído hasta acá se conserva igual.
  if (actual.length) elementos.push(actual);
  return { elementos, siguiente: k, sinCerrar: true };
}

/** El valor de una celda de un INSERT, tal como lo guardó la base. */
function valorDeLaCelda(piezas) {
  if (!piezas.length) return '';
  if (piezas.length === 1) {
    const [p] = piezas;
    if (p.t === 'cadena') return p.v;
    if (p.t === 'palabra' && p.v.toUpperCase() === 'NULL') return '';
    return p.v;
  }
  // E'…', N'…', _utf8'…': el prefijo dice cómo está escrita la cadena.
  if (piezas.length === 2 && piezas[0].t === 'palabra' && piezas[1].t === 'cadena' && /^(?:e|n|x|b|_\w+)$/i.test(piezas[0].v)) {
    return piezas[1].v;
  }
  // Un número negativo, una conversión ('2024-01-01'::date) o una función: se guarda como está escrito.
  if (piezas[0].t === 'cadena' && piezas[1]?.v?.startsWith('::')) return piezas[0].v;
  return piezas.map((p) => p.crudo).join(piezas.every((p) => p.t !== 'palabra' || /^[-+]/.test(p.v)) ? '' : ' ')
    .replace(/\s*([().,])\s*/g, '$1');
}

function filaConColumnas(columnas, valores) {
  const fila = {};
  columnas.forEach((col, i) => { fila[col] = valores[i] ?? ''; });
  for (let i = columnas.length; i < valores.length; i += 1) fila[`columna_${i + 1}`] = valores[i];
  return fila;
}

// Los valores de un renglón de COPY: separados por tabulación, \N es vacío y la barra escapa.
function valoresDeCopy(linea) {
  return linea.split('\t').map((v) => (v === '\\N' ? '' : v.replace(/\\(.)/g, (_, e) => ({ n: '\n', r: '\r', t: '\t' }[e] ?? e))));
}

/**
 * Lee la copia de una base: cada tabla es una hoja, con todos sus renglones, aunque el texto de
 * una celda tenga comas, paréntesis, punto y coma o comillas. Entiende `INSERT INTO … VALUES` de
 * cualquier base y el `COPY … FROM stdin` de PostgreSQL. Si un INSERT no nombra las columnas,
 * las toma del `CREATE TABLE` de esa tabla, o las numera.
 */
export function hojasDeLaCopiaDeBase(textoEntero) {
  const texto = sinMarcaDeOrden(textoEntero);
  const tablas = new Map();
  const columnasCreadas = new Map();
  const tablaDe = (nombre) => {
    if (!tablas.has(nombre)) tablas.set(nombre, { nombre, columnas: [], filas: [], contados: 0 });
    return tablas.get(nombre);
  };
  const sumarColumnas = (tabla, columnas) => {
    for (const col of columnas) if (!tabla.columnas.includes(col)) tabla.columnas.push(col);
  };

  // Los datos de un COPY no son SQL: se separan antes, y el resto se lee pieza por pieza.
  let sql = '';
  const lineas = texto.split(/\r?\n/);
  for (let l = 0; l < lineas.length; l += 1) {
    const linea = lineas[l];
    const copia = /^\s*copy\s+((?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?)\s*(?:\(([^)]*)\))?\s+from\s+stdin\b[^;]*;\s*$/i.exec(linea);
    if (!copia) { sql += `${linea}\n`; continue; }
    const nombre = copia[1].replace(/"/g, '');
    const tabla = tablaDe(nombre);
    const columnas = copia[2] ? copia[2].split(',').map((c) => c.trim().replace(/^"|"$/g, '')) : [];
    sumarColumnas(tabla, columnas);
    for (l += 1; l < lineas.length && lineas[l] !== '\\.'; l += 1) {
      if (lineas[l] === '') continue;
      tabla.contados += 1;
      const valores = valoresDeCopy(lineas[l]);
      const nombres = columnas.length ? columnas : valores.map((_, i) => `columna_${i + 1}`);
      sumarColumnas(tabla, nombres.slice(0, valores.length));
      tabla.filas.push(filaConColumnas(nombres, valores));
    }
  }

  const piezas = piezasDelSQL(sql);
  let k = 0;
  while (k < piezas.length) {
    const p = piezas[k];
    const palabra = p.t === 'palabra' ? p.v.toLowerCase() : '';

    if (palabra === 'create' && piezas.slice(k + 1, k + 6).some((q) => q.t === 'palabra' && q.v.toLowerCase() === 'table')) {
      let m = k + 1;
      while (m < piezas.length && !(piezas[m].t === 'palabra' && piezas[m].v.toLowerCase() === 'table')) m += 1;
      m += 1;
      while (piezas[m]?.t === 'palabra' && ['if', 'not', 'exists'].includes(piezas[m].v.toLowerCase())) m += 1;
      const { nombre, siguiente } = nombreDeTabla(piezas, m);
      if (piezas[siguiente]?.v === '(') {
        const { elementos, siguiente: despues } = listaEntreParentesis(piezas, siguiente);
        const columnas = elementos
          .map((e) => e[0])
          .filter((primera) => primera && (primera.t === 'nombre' || (primera.t === 'palabra' && !PALABRAS_QUE_NO_SON_COLUMNA.has(primera.v.toLowerCase()))))
          .map((primera) => primera.v);
        columnasCreadas.set(nombre, columnas);
        k = despues;
        continue;
      }
      k = siguiente;
      continue;
    }

    if ((palabra === 'insert' || palabra === 'replace') && piezas.slice(k + 1, k + 4).some((q) => q.t === 'palabra' && q.v.toLowerCase() === 'into')) {
      let m = k + 1;
      while (m < piezas.length && !(piezas[m].t === 'palabra' && piezas[m].v.toLowerCase() === 'into')) m += 1;
      const { nombre, siguiente } = nombreDeTabla(piezas, m + 1);
      m = siguiente;
      let columnas = null;
      if (piezas[m]?.v === '(') {
        const lista = listaEntreParentesis(piezas, m);
        columnas = lista.elementos.map((e) => e.map((q) => q.v).join(''));
        m = lista.siguiente;
      }
      if (!(piezas[m]?.t === 'palabra' && /^values?$/i.test(piezas[m].v))) { k = m; continue; }
      m += 1;
      const tabla = tablaDe(nombre);
      const nombres = columnas ?? columnasCreadas.get(nombre) ?? null;
      while (piezas[m]?.v === '(') {
        const tupla = listaEntreParentesis(piezas, m);
        tabla.contados += 1;
        const valores = tupla.elementos.map(valorDeLaCelda);
        const cols = nombres ?? valores.map((_, i) => `columna_${i + 1}`);
        sumarColumnas(tabla, cols.slice(0, Math.max(cols.length, 0)));
        const fila = filaConColumnas(cols, valores);
        sumarColumnas(tabla, Object.keys(fila));
        tabla.filas.push(fila);
        m = tupla.siguiente;
        if (piezas[m]?.v === ',') m += 1;
        else break;
      }
      k = m;
      continue;
    }
    k += 1;
  }

  return [...tablas.values()]
    .filter((t) => t.contados > 0 || t.filas.length > 0)
    .map((t, indice) => ({
      indice,
      nombre: t.nombre,
      headers: t.columnas,
      filas: t.filas.map((f) => Object.fromEntries(t.columnas.map((c) => [c, f[c] ?? '']))),
      renglonesContados: t.contados,
    }));
}

// ─── Una lista en JSON ──────────────────────────────────────────────────────────────────────

function esListaDeObjetos(valor) {
  return Array.isArray(valor) && valor.length > 0 && valor.every((v) => v && typeof v === 'object' && !Array.isArray(v));
}

function celda(valor) {
  if (valor == null) return '';
  return typeof valor === 'object' ? JSON.stringify(valor) : valor;
}

/** Las hojas de un JSON: una lista de objetos es una hoja; un objeto con listas, una hoja por lista. */
export function hojasDelJSON(texto) {
  let datos;
  try { datos = JSON.parse(sinMarcaDeOrden(texto)); } catch { return null; }
  const listas = esListaDeObjetos(datos)
    ? [['datos', datos]]
    : (datos && typeof datos === 'object' ? Object.entries(datos).filter(([, v]) => esListaDeObjetos(v)) : []);
  if (!listas.length) return null;
  return listas.map(([nombre, lista], indice) => hojaDeFilas(
    indice,
    nombre,
    lista.map((obj) => Object.fromEntries(Object.entries(obj).map(([c, v]) => [c, celda(v)]))),
    lista.length,
  ));
}

// ─── Documentos ─────────────────────────────────────────────────────────────────────────────

// Lo legible de un Word viejo (.doc), que no es un formato abierto: los tramos de texto que tiene
// adentro. Lo demás queda en el archivo original, que se guarda entero.
function textoDeUnWordViejo(buffer) {
  const tramos = [];
  const utf16 = buffer.toString('utf16le').match(/[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]{4,}/gu) ?? [];
  const latin = buffer.toString('latin1').match(/[\x20-\x7e\xa0-\xff\n\r\t]{6,}/g) ?? [];
  tramos.push(...(utf16.join('').length >= latin.join('').length ? utf16 : latin));
  return tramos.join('\n').trim();
}

async function documentoDeWord(buffer, nombre) {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return { clase: 'word', texto: value.trim() };
  } catch {
    return { clase: 'word', texto: extension(nombre) === 'doc' || empiezaCon(buffer, [0xd0, 0xcf, 0x11, 0xe0]) ? textoDeUnWordViejo(buffer) : '' };
  }
}

function esWordAbierto(buffer, nombre) {
  return empiezaCon(buffer, [0x50, 0x4b, 0x03, 0x04]) && (extension(nombre) === 'docx' || buffer.includes('word/document.xml'));
}

function esWordViejo(buffer, nombre) {
  return empiezaCon(buffer, [0xd0, 0xcf, 0x11, 0xe0]) && ['doc', 'rtf'].includes(extension(nombre));
}

// ─── La lectura ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee un archivo de importación.
 *
 * @param {object} archivo `{ buffer, originalname, mimetype }`, como lo deja la subida.
 * @param {object} [opciones]
 * @param {(texto: string) => Promise<{esTabla: boolean, hojas?: object[]}>} [opciones.leerConIA]
 *   La lectura por partes con IA de un texto sin forma de tabla conocida. Sin ella, ese texto es
 *   un documento.
 * @returns {Promise<{esDocumento: boolean, viaIA: boolean, documento: object|null, hojas: object[]}>}
 *   `documento` trae `clase` (pdf, imagen, word, texto u otro), `tipoMedio` cuando la IA lo lee
 *   directo, y `texto` cuando lo que se lee es el texto.
 */
export async function leerArchivo(archivo, { leerConIA = null } = {}) {
  const { buffer, originalname: nombre, mimetype: tipoMime } = archivo;
  const comoDocumento = (documento) => ({ esDocumento: true, viaIA: false, documento, hojas: [] });

  if (!buffer?.length) return comoDocumento({ clase: 'texto', texto: '' });
  if (empiezaCon(buffer, [0x25, 0x50, 0x44, 0x46])) return comoDocumento({ clase: 'pdf', tipoMedio: 'application/pdf' });
  const imagen = imagenLegible(buffer);
  if (imagen) return comoDocumento({ clase: 'imagen', tipoMedio: IMAGENES_QUE_LEE_LA_IA[imagen] });
  if (esOtraImagen(buffer, nombre, tipoMime)) return comoDocumento({ clase: 'imagen', tipoMedio: null });
  if (esWordAbierto(buffer, nombre) || esWordViejo(buffer, nombre)) return comoDocumento(await documentoDeWord(buffer, nombre));

  if (esTexto(buffer)) {
    const texto = sinMarcaDeOrden(buffer.toString('utf8'));
    if (pareceCopiaDeBase(texto, nombre)) {
      const hojas = hojasDeLaCopiaDeBase(texto);
      if (hojas.length) return { esDocumento: false, viaIA: false, documento: null, hojas };
    }
    const delJSON = hojasDelJSON(texto);
    if (delJSON) return { esDocumento: false, viaIA: false, documento: null, hojas: delJSON };
    if (separadorDeLaTabla(texto)) {
      const hojas = hojasDelLibro(null, { texto });
      if (hojas.length) return { esDocumento: false, viaIA: false, documento: null, hojas };
    }
    if (leerConIA && texto.trim()) {
      const leido = await leerConIA(texto);
      if (leido?.esTabla && leido.hojas?.length) return { esDocumento: false, viaIA: true, documento: null, hojas: leido.hojas };
    }
    return comoDocumento({ clase: 'texto', texto });
  }

  // Un archivo binario: se prueba como libro de planillas. Si no lo es, es un documento.
  try {
    const hojas = hojasDelLibro(buffer);
    if (hojas.length) return { esDocumento: false, viaIA: false, documento: null, hojas };
  } catch {
    // No es un libro: sigue como documento.
  }
  return comoDocumento({ clase: 'otro', tipoMedio: null });
}
