/* Cuánto se guarda cada respaldo.
   ================================

   Los diarios de los últimos DIAS_DIARIOS días, y de lo anterior uno por mes —el más viejo de cada
   mes— durante MESES_MENSUALES meses. Lo demás se borra. Vale por separado para el volcado de la
   base y para el paquete del código: cada uno tiene su propia fila de diarios y de mensuales.

   POR QUÉ EL MÁS VIEJO DE CADA MES. Es el único que no cambia con el paso de los días: el de un mes
   que ya pasó sigue siendo el más viejo mañana. Si se eligiera el más nuevo, cada noche se borraría
   el mensual de ayer para guardar el de hoy.

   SÓLO SE TOCA LO QUE TIENE NOMBRE DE RESPALDO. Un archivo que no tiene la forma
   `<código>_backup_<fecha>` o `<código>_codigo_<fecha>` no se borra nunca, aunque esté en el mismo
   depósito: lo que se copia de los depósitos de archivos vive al lado y no tiene fecha. */

const DIA_MS = 24 * 60 * 60 * 1000;

export const DIAS_DIARIOS = Number(process.env.RESPALDOS_DIAS_DIARIOS || 30);
export const MESES_MENSUALES = Number(process.env.RESPALDOS_MESES_MENSUALES || 12);

/** La clase y la fecha de un respaldo por su nombre, o null si el nombre no es de un respaldo. */
export function fechaDelRespaldo(nombre, codigo) {
  const m = new RegExp(`^${codigo}_(backup|codigo)_(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2})-(\\d{2})-(\\d{2})-(\\d{3})Z\\.`).exec(nombre);
  if (!m) return null;
  const [, clase, a, mes, d, h, mi, s, ms] = m;
  return { clase, fecha: new Date(Date.UTC(+a, +mes - 1, +d, +h, +mi, +s, +ms)) };
}

/** Los nombres que ya pasaron el plazo. Nunca incluye uno que no sea de un respaldo. */
export function respaldosQueSeBorran(nombres, codigo, ahora = new Date(), { dias = DIAS_DIARIOS, meses = MESES_MENSUALES } = {}) {
  if (!(dias > 0) || !(meses >= 0)) throw new Error('Plazo de los respaldos mal configurado: no se borra nada');
  const limiteMensual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - meses, 1));

  const respaldos = nombres
    .map((nombre) => ({ nombre, ...fechaDelRespaldo(nombre, codigo) }))
    .filter((r) => r.fecha)
    .sort((x, y) => x.fecha - y.fecha);

  const mensuales = new Set();
  const vistos = new Set();
  for (const r of respaldos) {
    const mes = `${r.clase}:${r.fecha.toISOString().slice(0, 7)}`;
    if (!vistos.has(mes)) { vistos.add(mes); mensuales.add(r.nombre); }
  }

  return respaldos
    .filter((r) => ahora - r.fecha > dias * DIA_MS)
    .filter((r) => !(mensuales.has(r.nombre) && r.fecha >= limiteMensual))
    .map((r) => r.nombre);
}
