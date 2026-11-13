/* La promoción de un precio de lista: qué casilleros tiene su formulario, qué se acepta en cada
   uno, a qué renglones se le puede cargar una y cómo se ordenan en la lista.
   ==========================================================================

   Una promoción es un renglón aparte de `lista_precios` que apunta al precio de siempre
   (`promocion_de`) y tiene fecha de fin. Mientras rige, gana; cuando vence, vuelve a regir el precio
   de siempre sin que nadie toque nada: lo resuelve la base al consultar
   (`precios_de_lista_que_rigen`). La carga la hace `cargar_promocion_de_lista`, que controla lo
   mismo que se controla acá y además que no se superponga con otra promoción del mismo precio. */

export const AVISOS_DE_LA_PROMOCION = Object.freeze({
  FALTA: 'falta',
  PRECIO_NO_POSITIVO: 'precio_no_positivo',
  FECHA_ANTERIOR: 'fecha_anterior',
  FECHAS_AL_REVES: 'fechas_al_reves',
});

export const CAMPOS_DE_LA_PROMOCION = Object.freeze([
  { clave: 'precio', tipo: 'numero', obligatorio: true },
  { clave: 'vigente_desde', tipo: 'fecha', obligatorio: true },
  { clave: 'vigente_hasta', tipo: 'fecha', obligatorio: true },
]);

function vacio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

function fecha(valor) {
  return vacio(valor) ? null : String(valor).slice(0, 10);
}

/** Si el renglón es una promoción. */
export function esPromocion(fila) {
  return fila?.promocion_de !== null && fila?.promocion_de !== undefined;
}

/** Si a ese renglón se le puede cargar una promoción: un precio que rige, abierto y activo. */
export function admitePromocion(fila) {
  return Boolean(fila) && !esPromocion(fila) && !fila.vigente_hasta && fila.activo === true;
}

export function promocionVacia(base, hoy) {
  const desde = fecha(base?.vigente_desde);
  return {
    precio: '',
    vigente_desde: desde && hoy && desde > hoy ? desde : hoy ?? '',
    vigente_hasta: '',
  };
}

/**
 * Qué casillero está mal y por qué, en el orden del formulario: `{ clave: aviso }`.
 * La promoción no puede empezar antes que el precio de siempre.
 */
export function avisosDeLaPromocion(form, base) {
  const avisos = {};
  for (const campo of CAMPOS_DE_LA_PROMOCION) {
    if (vacio(form?.[campo.clave])) {
      if (campo.obligatorio) avisos[campo.clave] = AVISOS_DE_LA_PROMOCION.FALTA;
    }
  }
  if (!avisos.precio) {
    const n = Number(form.precio);
    if (!Number.isFinite(n) || n <= 0) avisos.precio = AVISOS_DE_LA_PROMOCION.PRECIO_NO_POSITIVO;
  }
  const desde = fecha(form?.vigente_desde);
  const hasta = fecha(form?.vigente_hasta);
  const desdeDeLaBase = fecha(base?.vigente_desde);
  if (desde && desdeDeLaBase && desde < desdeDeLaBase) avisos.vigente_desde = AVISOS_DE_LA_PROMOCION.FECHA_ANTERIOR;
  if (desde && hasta && hasta < desde) avisos.vigente_hasta = AVISOS_DE_LA_PROMOCION.FECHAS_AL_REVES;

  const ordenados = {};
  for (const campo of CAMPOS_DE_LA_PROMOCION) if (avisos[campo.clave]) ordenados[campo.clave] = avisos[campo.clave];
  return ordenados;
}

/** Los parámetros de `cargar_promocion_de_lista`. */
export function pedidoDeLaPromocion(form, base) {
  return {
    p_precio_id: base.id,
    p_precio: Number(form.precio),
    p_desde: fecha(form.vigente_desde),
    p_hasta: fecha(form.vigente_hasta),
  };
}

/** Si una promoción rige en esa fecha. */
export function promocionRige(fila, hoy) {
  if (!esPromocion(fila) || !fila.activo) return false;
  const desde = fecha(fila.vigente_desde);
  const hasta = fecha(fila.vigente_hasta);
  return Boolean(desde && hasta && desde <= hoy && hoy <= hasta);
}

/**
 * Las filas con cada promoción debajo de su precio de siempre, las promociones por fecha de
 * comienzo. Una promoción cuyo precio de siempre no vino en la lista queda al final.
 */
export function conSusPromociones(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const promociones = new Map();
  const sueltas = [];
  const ids = new Set(lista.filter((f) => !esPromocion(f)).map((f) => f.id));
  for (const f of lista) {
    if (!esPromocion(f)) continue;
    if (!ids.has(f.promocion_de)) {
      sueltas.push(f);
      continue;
    }
    if (!promociones.has(f.promocion_de)) promociones.set(f.promocion_de, []);
    promociones.get(f.promocion_de).push(f);
  }
  const porComienzo = (a, b) => String(a.vigente_desde ?? '').localeCompare(String(b.vigente_desde ?? ''));
  const resultado = [];
  for (const f of lista) {
    if (esPromocion(f)) continue;
    resultado.push(f);
    resultado.push(...(promociones.get(f.id) ?? []).sort(porComienzo));
  }
  return [...resultado, ...sueltas.sort(porComienzo)];
}
