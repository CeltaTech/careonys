// Los textos de fábrica de los documentos que se firman: uno por país, clave e idioma, en
// `textos_consentimiento`. Rigen mientras la Prestadora no escriba el suyo. El código no guarda
// ninguno: si un país no tiene texto en un idioma, en ese país no hay documento en ese idioma.
//
// Devuelve un objeto idioma → cuerpo con la versión vigente más nueva de cada idioma.
export async function textosDeFabrica({ db, prestadoraId, clave }) {
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('pais')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (errorPrestadora) throw errorPrestadora;

  const { data, error } = await db
    .from('textos_consentimiento')
    .select('idioma, cuerpo, version')
    .eq('clave', clave)
    .eq('jurisdiccion', prestadora?.pais ?? '')
    .eq('es_borrador', false)
    .is('vigente_hasta', null)
    .order('version', { ascending: false });
  if (error) throw error;

  const porIdioma = {};
  for (const fila of data ?? []) porIdioma[fila.idioma] ??= fila.cuerpo;
  return porIdioma;
}
