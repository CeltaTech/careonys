/**
 * Ninguna consulta del backend toca una tabla de una Prestadora sin decir de qué Prestadora es.
 *
 *   node --test "src/**\/__tests__/*.test.js"
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El backend entra a la base con la llave de servicio y se saltea la
 * protección por fila, así que lo único que separa una Prestadora de otra son los filtros escritos
 * en cada consulta. Un filtro que falta no se ve: la pantalla anda igual de bien.
 *
 * QUÉ MIRA. Todo `src`, no sólo las rutas de las aplicaciones. El defecto no vive en quien llama:
 * vive en la consulta, y la mayoría de las consultas están en las funciones de adentro.
 *
 * QUÉ TABLAS ALCANZA. Las que tienen columna `prestadora_id`, leídas de las migraciones. Una tabla
 * sin esa columna es un catálogo del producto y no lleva filtro. Saberlo de las migraciones y no de
 * una lista escrita a mano es lo que evita que la lista envejezca en silencio.
 *
 * QUÉ CUENTA COMO ATADA. Que la consulta nombre la Prestadora. Nada más. Colgar de la fila padre no
 * alcanza: es exactamente el molde del defecto que esta prueba viene a cerrar.
 *
 * Y LA QUE LEGÍTIMAMENTE NO PUEDE lleva el motivo escrito encima, pegado a ella, con la marca que
 * está más abajo. No hay ninguna lista de excepciones acá adentro: una lista por archivo y tabla
 * dejaba de mirar también a las consultas vecinas de ese mismo archivo, que sí estaban atadas.
 *
 * Qué daría con el sistema roto: sacarle a cualquier consulta su filtro de Prestadora la deja
 * suelta, y esta prueba la nombra con archivo y renglón.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = join(AQUI, '..');
const MIGRACIONES = join(AQUI, '..', '..', '..', 'supabase', 'migrations');

/**
 * Lo que ata una consulta a una sola Prestadora: o la nombra ella misma, o la envuelve uno de los
 * ayudantes que no hacen otra cosa que ponerle ese filtro. Los ayudantes están escritos por su
 * nombre y no por un parecido —nada de «todo lo que empiece con acotar»—, para que un ayudante
 * nuevo tenga que entrar acá a propósito.
 */
const ATADURAS = [
  'prestadora_id',
  'prestadoraId',
  'acotarAPrestadora',
  'acotarAUsuariosDelPanel',
  'deLaOrganizacionDeLaCuenta',
];

/**
 * La marca que exime a una consulta, escrita en el comentario que tiene justo encima.
 *
 * El motivo vive pegado a su consulta y no en una lista acá adentro. Una lista por archivo y tabla
 * dejaba de mirar, de un plumazo, a todas las consultas vecinas que tocan esa misma tabla en ese
 * mismo archivo —y varias de ellas sí están atadas—. Pegado al código, el motivo exime a una sola
 * consulta, se mueve con ella y se lee donde hace falta leerlo.
 *
 * Debajo de la marca va el motivo escrito. La prueba no lo lee: lo leen las personas.
 */
const MARCA = 'SIN PRESTADORA A PROPÓSITO';

/** Recorre `src` entero salvo las pruebas. */
function archivosDe(carpeta) {
  const salida = [];
  for (const entrada of readdirSync(carpeta)) {
    if (entrada === '__tests__' || entrada === 'node_modules') continue;
    const camino = join(carpeta, entrada);
    if (statSync(camino).isDirectory()) salida.push(...archivosDe(camino));
    else if (entrada.endsWith('.js')) salida.push(camino);
  }
  return salida;
}

/** Las tablas que tienen columna `prestadora_id`, según las migraciones. */
function tablasConPrestadora() {
  const tablas = new Set();

  for (const archivo of readdirSync(MIGRACIONES).filter((a) => a.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');

    // La columna agregada después.
    const agregadas = sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z_0-9]+)"?[^;]*?add\s+column\s+(?:if\s+not\s+exists\s+)?"?prestadora_id"?/gis
    );
    for (const m of agregadas) tablas.add(m[1]);

    // La columna puesta al crear la tabla.
    const creadas = sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-z_0-9]+"?\.)?"?([a-z_0-9]+)"?\s*\(/gi
    );
    for (const m of creadas) {
      let abiertos = 0;
      let i = m.index + m[0].length - 1;
      const desde = i;
      do {
        if (sql[i] === '(') abiertos++;
        else if (sql[i] === ')') abiertos--;
        i++;
      } while (abiertos > 0 && i < sql.length);
      if (/\bprestadora_id\b/i.test(sql.slice(desde, i))) tablas.add(m[1]);
    }

    // Y la que se quitó.
    const quitadas = sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z_0-9]+)"?[^;]*?drop\s+column\s+(?:if\s+exists\s+)?"?prestadora_id"?/gis
    );
    for (const m of quitadas) tablas.delete(m[1]);
  }

  return tablas;
}

/**
 * Cada `.from('tabla')…` de un archivo, con la cadena encadenada entera —que es donde están los
 * filtros—. La cadena sigue mientras el renglón que viene arranque con un punto o sea continuación
 * de un paréntesis abierto; un comentario en el medio no la corta.
 */
function consultasDe(texto) {
  const renglones = texto.split('\n');
  const salida = [];

  for (let i = 0; i < renglones.length; i++) {
    // El nombre de la tabla puede venir escrito o puede venir en una variable —`.from(tabla)`—.
    // Cuando viene en una variable no se sabe qué tabla es, y entonces se le exige el filtro
    // igual: una consulta cuya tabla no se puede saber no se puede dar por buena. `Array.from(`
    // no es una consulta y queda afuera, igual que `Buffer.from(`. El depósito de archivos
    // —`storage.from(`— tampoco: ahí lo que aísla es que la ruta empiece por la Prestadora y la
    // política lo exija, que es otra cosa y se mira en otro lado.
    const marca = renglones[i].match(/(?<!Array|Buffer|storage)\.from\(\s*([^)]*?)\s*\)/);
    if (!marca) continue;
    // El depósito se escribe casi siempre partido, con `supabase.storage` en el renglón de arriba.
    if (i > 0 && /\.storage\s*$/.test(renglones[i - 1])) continue;

    const literal = marca[1].match(/^(['"`])([^'"`]+)\1$/);
    const tabla = literal ? literal[2] : marca[1];
    const seSabeQueTablaEs = Boolean(literal);

    // La consulta puede venir envuelta en un ayudante que la ata, y entonces el nombre del
    // ayudante queda en un renglón anterior:
    //   acotarAPrestadora(
    //     supabase.from('emergencias_guardia')…
    // Sin leer hacia arriba, no sólo se pierde el nombre: el paréntesis que quedó abierto ahí es
    // el que mantiene viva la cadena hasta el argumento que está más abajo.
    let arranque = i;
    while (arranque > 0 && /(?:\(|\bsupabase)\s*,?\s*$/.test(renglones[arranque - 1]) && i - arranque < 3) {
      arranque--;
    }

    let cadena = renglones.slice(arranque, i + 1).join('\n');
    let j = i;
    while (j + 1 < renglones.length) {
      const queSigue = renglones[j + 1].trim();
      const abiertos = (cadena.match(/\(/g) || []).length - (cadena.match(/\)/g) || []).length;
      const esComentario = queSigue.startsWith('//') || queSigue.startsWith('*');
      if (!queSigue.startsWith('.') && !esComentario && abiertos <= 0) break;
      j++;
      cadena += '\n' + renglones[j];
    }
    // Una consulta que se arma en varios pasos guarda el resultado en una variable y le agrega los
    // filtros después, renglones más abajo. Sin seguir esa variable, el filtro que viene después
    // no se ve y la consulta parecería suelta.
    // El nombre puede quedar un renglón más arriba, cuando la consulta se escribe partida:
    //   let query = supabase
    //     .from('zonas_cobertura')
    const bautismo =
      renglones[i].match(/(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?supabase/) ||
      (i > 0 && renglones[i - 1].match(/(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?supabase\s*$/));
    if (bautismo) {
      const variable = bautismo[1];
      const usa = new RegExp(`\\b${variable}\\b`);
      for (let k = j + 1; k < Math.min(j + 60, renglones.length); k++) {
        // Una declaración nueva con el mismo nombre ya es otra consulta.
        if (new RegExp(`(?:const|let|var)\\s+${variable}\\b`).test(renglones[k])) break;
        if (usa.test(renglones[k])) cadena += '\n' + renglones[k];
      }
    }

    // El comentario que la consulta tiene justo encima, que es donde puede estar escrito el motivo
    // por el que no lleva Prestadora. Se leen los renglones de comentario seguidos, sin saltear
    // ninguno: un renglón en blanco en el medio ya despega el comentario de la consulta.
    let encabezado = '';
    for (let k = arranque - 1; k >= 0; k--) {
      const linea = renglones[k].trim();
      if (!linea.startsWith('//') && !linea.startsWith('*') && !linea.startsWith('/*')) break;
      encabezado = renglones[k] + '\n' + encabezado;
    }

    salida.push({ renglon: i + 1, tabla, seSabeQueTablaEs, cadena, encabezado });
  }

  return salida;
}

/**
 * La cadena sin la lista de columnas que se piden.
 *
 * Pedir la columna no es filtrar por ella: `select('rol, prestadora_id')` trae la columna y no ata
 * nada, pero el nombre aparece en el texto y la consulta pasaría por parecido. Una atadura dada por
 * buena por coincidencia de texto es peor que ninguna, porque se ve verde.
 */
function sinLoQueSePide(cadena) {
  return cadena.replace(/\.select\(\s*(['"`])[\s\S]*?\1/g, '.select(');
}

/**
 * ¿Es un alta, y nada más que un alta?
 *
 * En un alta la Prestadora no se filtra: se escribe, adentro de la fila, y la fila casi siempre se
 * arma en una variable renglones más arriba. Pedirle un filtro a un `insert` sería pedirle que
 * acote un conjunto de filas que no existe: un alta no lee ninguna y no pisa ninguna.
 *
 * `upsert` NO entra acá, y es la diferencia que importa: ante conflicto sí escribe encima de una
 * fila que ya estaba, y si la columna del conflicto no lleva la Prestadora, esa fila puede ser de
 * otra. Cada `upsert` se mira de a uno y su motivo se escribe abajo.
 */
function esAlta(cadena) {
  return /\.insert\(/.test(cadena) && !/\.upsert\(/.test(cadena);
}

const ARCHIVOS = archivosDe(FUENTE);
const CON_COLUMNA = tablasConPrestadora();

/** Las consultas sueltas, con su archivo y su renglón. */
function sueltas() {
  const encontradas = [];

  for (const camino of ARCHIVOS) {
    const nombre = relative(FUENTE, camino).replace(/\\/g, '/');
    const texto = readFileSync(camino, 'utf8');
    for (const consulta of consultasDe(texto)) {
      if (consulta.seSabeQueTablaEs && !CON_COLUMNA.has(consulta.tabla)) continue;
      if (esAlta(consulta.cadena)) continue;
      if (ATADURAS.some((atadura) => sinLoQueSePide(consulta.cadena).includes(atadura))) continue;
      if (consulta.encabezado.includes(MARCA)) continue;
      encontradas.push(`${nombre}:${consulta.renglon} — ${consulta.tabla}`);
    }
  }

  return encontradas;
}

describe('las consultas del backend', () => {
  it('hay archivos que mirar', () => {
    // Sin esto, un cambio de carpetas dejaría la prueba mirando el vacío y dando verde.
    assert.ok(ARCHIVOS.length >= 100, `se encontraron ${ARCHIVOS.length} archivos`);
  });

  it('se reconocen las tablas que son de una Prestadora', () => {
    // Lo mismo si las migraciones se mudan: sin tablas reconocidas, todo pasaría.
    assert.ok(CON_COLUMNA.size >= 100, `se reconocieron ${CON_COLUMNA.size} tablas`);
  });

  it('todas quedan atadas a una sola Prestadora', () => {
    const encontradas = sueltas();
    assert.deepEqual(
      encontradas,
      [],
      `hay consultas sin ningún filtro que las ate a una Prestadora:\n  ${encontradas.join('\n  ')}`
    );
  });

  it('ninguna marca escrita sobra', () => {
    // Una marca que exime a una consulta que igual estaría atada es un agujero abierto por si
    // acaso: mañana alguien le saca el filtro a esa consulta y nadie se entera.
    const sobrantes = [];

    for (const camino of ARCHIVOS) {
      const nombre = relative(FUENTE, camino).replace(/\\/g, '/');
      const texto = readFileSync(camino, 'utf8');
      if (!texto.includes(MARCA)) continue;

      let pegadas = 0;
      for (const consulta of consultasDe(texto)) {
        if (!consulta.encabezado.includes(MARCA)) continue;
        pegadas++;
        const atada =
          (consulta.seSabeQueTablaEs && !CON_COLUMNA.has(consulta.tabla)) ||
          esAlta(consulta.cadena) ||
          ATADURAS.some((atadura) => sinLoQueSePide(consulta.cadena).includes(atadura));
        if (atada) sobrantes.push(`${nombre}:${consulta.renglon} — la consulta ya está atada`);
      }

      // Y una marca escrita en cualquier otro lado no exime a nada: es una marca suelta.
      const escritas = texto.split('\n').filter((linea) => linea.includes(MARCA)).length;
      if (escritas !== pegadas) {
        sobrantes.push(`${nombre} — hay ${escritas} marcas y ${pegadas} consultas que las usan`);
      }
    }

    assert.deepEqual(sobrantes, [], `sobran marcas escritas:\n  ${sobrantes.join('\n  ')}`);
  });
});
