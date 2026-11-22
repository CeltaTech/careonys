/** Horas escritas para leer, con un decimal: «7,5 h». */
export function formatearHoras(valor, locale) {
  return `${(Math.round(Number(valor ?? 0) * 10) / 10).toLocaleString(locale)} h`;
}
