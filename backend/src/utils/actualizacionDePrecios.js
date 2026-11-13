import { ErrorConMotivo } from './errorConMotivo.js';

/* Lo que se puede revisar sin base de la actualización de precios.
   ==========================================================================

   Las rutas de `routes/panelActualizacion.js` y la importación de listas de precios de
   `routes/panelImportacion.js` sólo arman el pedido y se lo pasan a la base, que es la que hace el
   trabajo y la que decide quién puede (`supabase/migrations/20270330000300_actualizacion_de_precios.sql`).
   Lo que vive acá es lo que se revisa antes de llamarla: que las fechas sean fechas, que el
   valor sea un número, y que cada renglón de la planilla tenga lo suyo. Son funciones puras, así
   que se prueban sin base. */

/** «2026-10», «2026-10-01» o «2026-10-17» → «2026-10-01». null si no es un mes. */
export function periodoDelMes(texto) {
  const coincide = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(texto ?? '').trim());
  if (!coincide) return null;
  const mes = Number(coincide[2]);
  if (mes < 1 || mes > 12) return null;
  if (coincide[3] !== undefined && fechaDelDia(texto) === null) return null;
  return `${coincide[1]}-${coincide[2]}-01`;
}

/** «2026-10-17» → «2026-10-17», sólo si el día existe. null si no. */
export function fechaDelDia(texto) {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? '').trim());
  if (!coincide) return null;
  const [anio, mes, dia] = coincide.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return coincide[0];
}

/** Un número mayor que cero, escrito con punto o con coma decimal. null si no lo es. */
export function valorPositivo(crudo) {
  if (typeof crudo === 'number') return Number.isFinite(crudo) && crudo > 0 ? crudo : null;
  const texto = String(crudo ?? '').trim().replace(/\s/g, '');
  if (texto === '') return null;
  // Con coma, la coma es el decimal y los puntos son de miles. Sin coma, el punto es el decimal.
  const limpio = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** El código de un índice: minúsculas, números y guion bajo, igual que la base. */
export function codigoDeIndiceValido(texto) {
  return typeof texto === 'string' && /^[a-z0-9_]+$/.test(texto);
}

/**
 * El valor de un índice cargado a mano.
 * @returns {{periodo: string, valor: number}}
 * @throws {ErrorConMotivo} `faltan_datos` o `dato_invalido`.
 */
export function valorDeIndiceDelPedido(cuerpo) {
  if (cuerpo?.periodo == null || cuerpo?.valor == null || cuerpo.periodo === '' || cuerpo.valor === '') {
    throw new ErrorConMotivo('faltan_datos', 'falta el período o el valor del índice');
  }
  const periodo = periodoDelMes(cuerpo.periodo);
  const valor = valorPositivo(cuerpo.valor);
  if (!periodo || valor === null) throw new ErrorConMotivo('dato_invalido', 'período o valor del índice mal escrito');
  return { periodo, valor };
}

/**
 * Los argumentos de `actualizar_precios_por_indice`. Rige desde el día 1 de un mes, y el período
 * nuevo tiene que ser posterior al de base: la base lo vuelve a exigir, esto es para contestar antes.
 * @throws {ErrorConMotivo} `faltan_datos` o `dato_invalido`.
 */
export function pedidoDeActualizacionPorIndice(cuerpo, aplicar) {
  const { desde, periodoBase, periodoNuevo } = cuerpo ?? {};
  if (!desde || !periodoBase || !periodoNuevo) {
    throw new ErrorConMotivo('faltan_datos', 'falta la fecha o un período de la actualización');
  }
  const pDesde = fechaDelDia(desde);
  const pBase = periodoDelMes(periodoBase);
  const pNuevo = periodoDelMes(periodoNuevo);
  if (!pDesde || !pDesde.endsWith('-01') || !pBase || !pNuevo || pNuevo <= pBase) {
    throw new ErrorConMotivo('dato_invalido', 'fecha o períodos de la actualización mal elegidos');
  }
  return { p_desde: pDesde, p_periodo_base: pBase, p_periodo_nuevo: pNuevo, p_aplicar: aplicar === true };
}

/** El renglón que devuelve la base, con los nombres que lee la pantalla. */
export function renglonDeLaActualizacion(r) {
  return {
    clase: r.clase,
    renglonId: r.renglon_id,
    renglonNuevoId: r.renglon_nuevo_id ?? null,
    servicioId: r.servicio_id ?? null,
    descripcion: r.descripcion,
    indice: r.indice,
    precioActual: r.precio_actual === null ? null : Number(r.precio_actual),
    precioNuevo: r.precio_nuevo === null || r.precio_nuevo === undefined ? null : Number(r.precio_nuevo),
    moneda: r.moneda,
  };
}

/* La importación de una lista de precios.
   --------------------------------------------------------------------------
   La planilla trae tres columnas: el tipo de servicio, la modalidad y el precio. Qué columna es
   cuál lo elige la persona en la pantalla, igual que en la importación de Asistentes y Clientes;
   acá se propone una por el nombre del encabezado. */

export const CAMPOS_DE_LA_LISTA_DE_PRECIOS = ['tipo_servicio', 'modalidad', 'precio'];

const NOMBRES_DE_CADA_CAMPO = {
  tipo_servicio: ['tipo de servicio', 'tipo_servicio', 'servicio', 'tipo', 'service', 'tipo de serviço', 'serviço'],
  modalidad: ['modalidad', 'modalidade', 'modality', 'mode', 'unidad', 'unidade', 'unit'],
  precio: ['precio', 'preço', 'preco', 'price', 'valor', 'importe', 'monto', 'amount'],
};

function normalizado(texto) {
  return String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Qué encabezado es cada campo, por el nombre. Lo que no se reconoce queda sin elegir. */
export function mapeoPropuestoDeLaLista(encabezados) {
  const mapeo = {};
  const usados = new Set();
  for (const campo of CAMPOS_DE_LA_LISTA_DE_PRECIOS) {
    const nombres = NOMBRES_DE_CADA_CAMPO[campo].map(normalizado);
    const elegido = (encabezados ?? []).find((h) => !usados.has(h) && nombres.includes(normalizado(h)));
    mapeo[campo] = elegido ?? null;
    if (elegido) usados.add(elegido);
  }
  return mapeo;
}

/**
 * Los renglones que recibe `importar_lista_de_precios`. `fila` es el número de renglón de la
 * planilla contando el encabezado, para que la persona lo encuentre. Un precio que no se entiende
 * viaja vacío: la base lo devuelve como dudoso, nunca lo carga como cero.
 * @throws {ErrorConMotivo} `faltan_datos` si falta elegir alguna columna.
 */
export function renglonesDeLaLista(filas, mapeo) {
  const faltan = CAMPOS_DE_LA_LISTA_DE_PRECIOS.filter((campo) => !mapeo?.[campo]);
  if (faltan.length > 0 || !Array.isArray(filas)) {
    throw new ErrorConMotivo('faltan_datos', `faltan columnas de la lista de precios: ${faltan.join(', ')}`);
  }
  return filas.map((fila, i) => ({
    fila: i + 2,
    tipo_servicio: String(fila?.[mapeo.tipo_servicio] ?? '').trim(),
    modalidad: String(fila?.[mapeo.modalidad] ?? '').trim(),
    precio: valorPositivo(fila?.[mapeo.precio]),
  }));
}

/** Un lote de importación que trae personas, y que por eso se conforma o se rechaza. */
export function esLoteDePersonas(lote) {
  return lote?.tipo === 'asistente' || lote?.tipo === 'cliente';
}

/**
 * El error de una función de la base, con su motivo. Las funciones de la actualización levantan el
 * motivo como mensaje —`fecha_anterior`, `ya_reemplazado`—; un texto que no tiene forma de código es
 * de Postgres y no viaja: queda como falla del sistema, con el detalle en el registro del servidor.
 * @returns {{error: Error, estado: number}}
 */
export function errorDeLaBase(error) {
  const mensaje = String(error?.message ?? '');
  if (/^[a-z_]+$/.test(mensaje)) {
    return { error: new ErrorConMotivo(mensaje, `la base rechazó la operación: ${mensaje}`), estado: 400 };
  }
  return { error: error instanceof Error ? error : new Error(mensaje || 'error de la base'), estado: 500 };
}
