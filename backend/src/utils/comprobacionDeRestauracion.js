/**
 * Lo que se revisa cuando se abre un respaldo de los datos, separado de lo que lo baja y lo abre.
 *
 * QUÉ RESUELVE. Un respaldo que sube todas las noches no prueba nada hasta el día que se abre.
 * Cada Prestadora tiene el suyo, cifrado con su clave (`respaldoDeLosDatos.js`), y lo que hay que
 * saber al abrirlo es: si es de esa Prestadora, si trae filas, y si alguna fila es de otra.
 *
 * POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL PROGRAMA. Abrir un respaldo pide la clave privada de la
 * Prestadora, que vive en la caja fuerte, así que `scripts/abrir_respaldo.mjs` lo corre el
 * Desarrollador. Lo que sí se puede probar es esto: cuál es el respaldo más nuevo, y si lo que
 * trae está bien.
 *
 * UNA REVISIÓN QUE NO PUEDE FALLAR NO PRUEBA NADA. Un respaldo sin ninguna fila pasa cualquier
 * comparación. Por eso hay tres resultados: `roto`, `no_probado` —todo en orden pero vacío— y
 * `bien`, que exige además que haya filas.
 *
 * NO SALE NINGÚN DATO DE NADIE. Nombres de tabla y cantidades. Nunca el contenido de una fila.
 */

/** Nombre de un respaldo de los datos, tal como lo escribe `respaldoDeLosDatos.js`. */
const RESPALDO = /^datos\/[0-9a-f-]{36}\/[a-z0-9_-]+_datos_[0-9TZ-]+\.json\.gz\.age$/;

/**
 * El respaldo más nuevo de una lista de claves del bucket.
 *
 * El nombre lleva la fecha en formato ISO con los dos puntos cambiados por guiones, así que el
 * orden alfabético ya es el cronológico.
 */
export function elegirElUltimoRespaldo(claves) {
  const respaldos = claves.filter((clave) => RESPALDO.test(clave)).sort();
  if (respaldos.length === 0) {
    throw new Error('No hay ningún respaldo de esa Prestadora en el depósito.');
  }
  return respaldos[respaldos.length - 1];
}

/**
 * Revisa lo que trae un respaldo ya abierto.
 *
 * Devuelve el veredicto y las filas por tabla. Una fila con otra Prestadora en su columna rompe el
 * respaldo entero: quiere decir que la base dejó salir algo ajeno.
 */
export function revisarElRespaldo(contenido, prestadoraEsperada) {
  const motivos = [];
  const filasPorTabla = {};
  if (!contenido || typeof contenido !== 'object' || typeof contenido.tablas !== 'object' || contenido.tablas === null) {
    return { estado: 'roto', motivos: ['El archivo no tiene la forma de un respaldo de los datos.'], filasPorTabla };
  }
  if (contenido.prestadora !== prestadoraEsperada) {
    motivos.push('El respaldo es de otra Prestadora.');
  }

  let conDatos = 0;
  let filas = 0;
  for (const [tabla, lista] of Object.entries(contenido.tablas)) {
    if (!Array.isArray(lista)) {
      motivos.push(`${tabla}: no es una lista de filas.`);
      continue;
    }
    filasPorTabla[tabla] = lista.length;
    filas += lista.length;
    if (lista.length > 0) conDatos += 1;
    const ajenas = lista.filter((fila) => fila && 'prestadora_id' in fila && fila.prestadora_id !== prestadoraEsperada).length;
    if (ajenas > 0) motivos.push(`${tabla}: ${ajenas} filas de otra Prestadora.`);
  }

  const tablas = Object.keys(filasPorTabla).length;
  if (tablas === 0) motivos.push('El respaldo no trae ninguna tabla.');
  if (motivos.length > 0) return { estado: 'roto', motivos, filasPorTabla };

  if (conDatos === 0) {
    return {
      estado: 'no_probado',
      motivos: [`Las ${tablas} tablas están, pero ninguna trae una sola fila: un respaldo vacío pasa esta misma revisión.`],
      filasPorTabla,
    };
  }
  return {
    estado: 'bien',
    motivos: [`${tablas} tablas, ${filas} filas, con datos en ${conDatos} tablas, todas de esta Prestadora.`],
    filasPorTabla,
  };
}
