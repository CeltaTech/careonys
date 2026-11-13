/** Una fecha de la base escrita como la escribe el idioma de quien mira, o un guion si no hay.
 *  Una fecha sola (`2027-04-10`) se lee como medianoche local: leída como UTC, en América se
 *  mostraba el día anterior. */
export function fechaVisible(valor, locale) {
  if (!valor) return '—';
  const texto = String(valor);
  const momento = texto.length === 10 ? new Date(`${texto}T00:00:00`) : new Date(texto);
  return Number.isNaN(momento.getTime()) ? '—' : momento.toLocaleDateString(locale);
}
