// El nombre de un motivo de resolución en el idioma de la pantalla.
//
// Los tres están siempre cargados: la base rechaza el motivo que llegue sin alguno.
//
// Original en el Panel; la copia de la aplicación del Asistente la regenera
// `scripts/sincronizar_copias.mjs`.

const COLUMNA_POR_IDIOMA = {
  'es-AR': 'nombre_es_ar',
  en: 'nombre_en',
  'pt-BR': 'nombre_pt_br',
};

export function nombreDelMotivo(motivo, locale) {
  if (!motivo) return '';
  const columna = COLUMNA_POR_IDIOMA[locale] ?? COLUMNA_POR_IDIOMA['es-AR'];
  return motivo[columna] ?? motivo.nombre_es_ar ?? '';
}
