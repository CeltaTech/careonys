/* El logo que va en los documentos que se imprimen.
   ================================================

   La Prestadora tiene dos logos. El de internet (`prestadoras.logo_url`) se ve en las pantallas y
   en los correos, y acepta PNG, JPG o WEBP. El de impresión (`prestadoras.logo_impresion_ruta`) va
   en presupuestos, facturas y correspondencia, y acepta PNG, JPG o SVG. WEBP no sirve para
   imprimir: no lo dibujan los programas que arman un PDF.

   Qué logo lleva un documento lo decide `logoParaDocumentos`, y nadie más:
     1. el de impresión, si está cargado;
     2. si no, el de internet, siempre que sea PNG o JPG;
     3. si no, ninguno: el documento sale con el nombre escrito.

   El de impresión vive en un depósito privado, porque un SVG puede llevar programas adentro, y se
   entrega con enlace temporal. Leerlo puede el personal del Panel de la Prestadora, en su carpeta:
   lo hace cumplir el depósito, por eso se pide con la credencial de quien pide. */

export const DEPOSITO_DE_LOGOS_PARA_IMPRESION = 'logos-para-impresion';
export const TIPOS_DE_LOGO_PARA_IMPRESION = ['image/png', 'image/jpeg', 'image/svg+xml'];
export const TAMANO_MAXIMO_DEL_LOGO_PARA_IMPRESION = 2 * 1024 * 1024; // 2 MB

// Lo que dura el enlace temporal. Alcanza para que el Panel baje la imagen y arme el documento.
const SEGUNDOS_DEL_ENLACE = 60;

const TIPO_POR_EXTENSION = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };

function tipoPorExtension(ruta) {
  const limpia = String(ruta ?? '').split('?')[0].toLowerCase();
  const extension = limpia.slice(limpia.lastIndexOf('.') + 1);
  return TIPO_POR_EXTENSION[extension] ?? null;
}

// Un SVG es texto, y puede traer programas o pedir archivos de otro lado. Ninguno de esos entra:
// un logo no los necesita.
const PARTES_PROHIBIDAS_DEL_SVG = [
  /<script\b/i,
  /<foreignObject\b/i,
  /<!ENTITY\b/i,
  /\bon[a-z]+\s*=/i,
  /javascript\s*:/i,
];

/** Si el archivo es un SVG que se puede usar como logo: es un dibujo y no trae programas. */
export function esUnSvgSinProgramas(buffer) {
  const texto = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer ?? '');
  if (!/<svg\b/i.test(texto)) return false;
  return !PARTES_PROHIBIDAS_DEL_SVG.some((patron) => patron.test(texto));
}

/** Enlace temporal a un archivo del depósito de impresión, o `null` si no se pudo dar. */
export async function enlaceDelLogoParaImpresion(db, ruta) {
  if (!ruta) return null;
  const { data, error } = await db.storage
    .from(DEPOSITO_DE_LOGOS_PARA_IMPRESION)
    .createSignedUrl(ruta, SEGUNDOS_DEL_ENLACE);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

/**
 * El logo que lleva un documento de la Prestadora de quien pide: `{ url, tipo }`, o `null` si el
 * documento va sin logo.
 */
export async function logoParaDocumentos(db) {
  const { data: prestadora, error } = await db
    .from('prestadoras')
    .select('logo_url, logo_impresion_ruta')
    .maybeSingle();
  if (error) throw error;
  if (!prestadora) return null;

  if (prestadora.logo_impresion_ruta) {
    const tipo = tipoPorExtension(prestadora.logo_impresion_ruta);
    const url = await enlaceDelLogoParaImpresion(db, prestadora.logo_impresion_ruta);
    if (url && tipo) return { url, tipo };
  }

  const tipoDeInternet = tipoPorExtension(prestadora.logo_url);
  if (prestadora.logo_url && (tipoDeInternet === 'image/png' || tipoDeInternet === 'image/jpeg')) {
    return { url: prestadora.logo_url, tipo: tipoDeInternet };
  }
  return null;
}
