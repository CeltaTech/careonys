/**
 * Para las bases de mentira de las pruebas de rutas: la información de salud ya no se pide directo
 * a la tabla, sino por `leer_informacion_de_salud`, `agregar_informacion_de_salud` y
 * `modificar_informacion_de_salud` (`src/db/informacionDeSalud.js`).
 *
 * `traducirPedidoDeSalud` convierte ese pedido en el que habría sido directo —`GET /rest/v1/reportes`
 * con sus filtros en la dirección—, para que cada prueba siga preparando la respuesta de la tabla y
 * mirando los filtros como siempre. Marca el pedido con `porLaFuncion` y el origen, que las pruebas
 * comprueban: si una ruta volviera a ir directo a la tabla, esa marca falta.
 *
 * `respuestaDeSalud` acomoda lo preparado a lo que contesta la función: siempre una lista de filas,
 * o el número cuando se pidió sólo contar.
 */

const FUNCIONES = {
  leer_informacion_de_salud: 'GET',
  agregar_informacion_de_salud: 'POST',
  modificar_informacion_de_salud: 'PATCH',
};

function valorEnTexto(valor) {
  return Array.isArray(valor) ? `(${valor.join(',')})` : String(valor);
}

function condicion(prefijo, f) {
  if (f.op === 'is_null') return [`${prefijo}${f.columna}`, 'is.null'];
  if (f.op === 'not_null') return [`${prefijo}${f.columna}`, 'not.is.null'];
  return [`${prefijo}${f.columna}`, `${f.op}.${valorEnTexto(f.valor)}`];
}

function enTextoDeO(f) {
  if (f.op === 'is_null') return `${f.columna}.is.null`;
  if (f.op === 'not_null') return `${f.columna}.not.is.null`;
  return `${f.columna}.${f.op}.${valorEnTexto(f.valor)}`;
}

export function traducirPedidoDeSalud(clave, cuerpo) {
  const m = clave.match(/^POST \/rest\/v1\/rpc\/(\w+)$/);
  const metodo = m && FUNCIONES[m[1]];
  if (!metodo || !cuerpo?.p_tabla) return null;

  const parametros = new URLSearchParams();
  const columnas = cuerpo.p_columnas ?? cuerpo.p_columnas_devueltas;
  if (columnas) parametros.append('select', columnas.join(','));
  for (const f of cuerpo.p_filtros ?? []) {
    if (f.o) parametros.append('or', `(${f.o.map(enTextoDeO).join(',')})`);
    else if (f.guardia) for (const g of f.guardia) parametros.append(...condicion('guardias.', g));
    else parametros.append(...condicion('', f));
  }
  if (cuerpo.p_orden?.length) {
    parametros.append('order', cuerpo.p_orden.map((o) => `${o.columna}.${o.desc ? 'desc' : 'asc'}`).join(','));
  }
  if (cuerpo.p_limite != null) parametros.append('limit', String(cuerpo.p_limite));

  const ruta = `/rest/v1/${cuerpo.p_tabla}`;
  const consulta = parametros.toString();
  return {
    metodo,
    clave: `${metodo} ${ruta}`,
    url: consulta ? `${ruta}?${consulta}` : ruta,
    cuerpo: cuerpo.p_fila ?? cuerpo.p_cambios ?? null,
    porLaFuncion: m[1],
    origen: cuerpo.p_origen,
    contar: Boolean(cuerpo.p_contar),
  };
}

export function respuestaDeSalud(traducido, valor) {
  if (valor === undefined || valor === null || valor.__estado) return valor;
  const filas = Array.isArray(valor) ? valor : [valor];
  return traducido.contar ? filas.length : filas;
}
