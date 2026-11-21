/**
 * Cómo se lee una moneda en una lista: el código y, si el navegador lo sabe, cómo se llama en el
 * idioma elegido. Si no lo sabe queda el código solo, que es lo que se guarda: nunca un nombre
 * inventado.
 */
export function nombreDeLaMoneda(codigo, locale) {
  if (!codigo) return '';
  try {
    const nombre = new Intl.DisplayNames([locale], { type: 'currency' }).of(codigo);
    return nombre && nombre !== codigo ? `${codigo} — ${nombre}` : codigo;
  } catch {
    return codigo;
  }
}
