import { llamadorDe } from './apiPanel';

/* El membrete de los documentos que imprime el Panel.
   ===================================================

   Todo documento de la Prestadora que se imprime —una constancia, un presupuesto, una carta— lleva
   arriba el mismo membrete: su logo y su nombre, y debajo el título del documento. Se dibuja acá y
   en ningún otro lado, así que un documento nuevo lo suma con dos renglones:

     const membrete = await prepararMembrete();               // antes de armar el PDF
     let y = dibujarMembrete(doc, membrete, { nombre, titulo }); // la primera línea libre

   Qué logo va lo decide el backend (`/api/panel/membrete/logo`): el de impresión si está cargado,
   si no el de internet cuando es PNG o JPG, y si no ninguno. Si el logo no se puede bajar, el documento sale igual,
   con el nombre escrito: un logo que falta no frena una constancia. */

const llamarApi = llamadorDe('/membrete');

const MARGEN = 20;
const ANCHO_UTIL = 170;
// El lugar del logo, en milímetros: se achica sin deformarse hasta caber en este rectángulo.
const ALTO_MAXIMO_DEL_LOGO = 16;
const ANCHO_MAXIMO_DEL_LOGO = 50;
const ARRIBA = 12;
function cargarImagen(direccion) {
  return new Promise((listo, fallo) => {
    const imagen = new Image();
    imagen.onload = () => listo(imagen);
    imagen.onerror = () => fallo(new Error('el logo no se pudo leer como imagen'));
    imagen.src = direccion;
  });
}

function leerComoDatos(blob) {
  return new Promise((listo, fallo) => {
    const lector = new FileReader();
    lector.onload = () => listo(lector.result);
    lector.onerror = () => fallo(lector.error);
    lector.readAsDataURL(blob);
  });
}

async function mapaDeBits(blob, formato) {
  const datos = await leerComoDatos(blob);
  const imagen = await cargarImagen(datos);
  return { datos, formato, ancho: imagen.naturalWidth, alto: imagen.naturalHeight };
}

/**
 * Lo que el membrete necesita tener bajado antes de armar el documento: `{ logo }`, con el logo
 * listo para el PDF o `null` si va sin logo.
 */
export async function prepararMembrete() {
  try {
    const { logo } = await llamarApi('/logo');
    if (!logo?.url) return { logo: null };
    const respuesta = await fetch(logo.url);
    if (!respuesta.ok) throw new Error(`el logo contestó ${respuesta.status}`);
    const blob = await respuesta.blob();
    return { logo: await mapaDeBits(blob, logo.tipo === 'image/jpeg' ? 'JPEG' : 'PNG') };
  } catch (error) {
    console.error('[membrete] el documento sale sin logo:', error);
    return { logo: null };
  }
}

/** El tamaño del logo en el papel, sin deformarlo. */
export function tamanoDelLogo(ancho, alto) {
  if (!ancho || !alto) return null;
  const escala = Math.min(ALTO_MAXIMO_DEL_LOGO / alto, ANCHO_MAXIMO_DEL_LOGO / ancho);
  return { ancho: ancho * escala, alto: alto * escala };
}

/**
 * Dibuja el membrete arriba de la página: el logo, el nombre de la Prestadora a su lado y el título
 * del documento debajo, con una línea. Devuelve la primera altura libre, en milímetros.
 */
export function dibujarMembrete(doc, membrete, { nombre, titulo }) {
  const logo = membrete?.logo;
  const tamano = logo && tamanoDelLogo(logo.ancho, logo.alto);
  let abajoDelEncabezado = 20;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  if (tamano) {
    doc.addImage(logo.datos, logo.formato, MARGEN, ARRIBA, tamano.ancho, tamano.alto);
    doc.text(String(nombre ?? '').toUpperCase(), MARGEN + tamano.ancho + 6, ARRIBA + tamano.alto / 2 + 2);
    abajoDelEncabezado = ARRIBA + tamano.alto;
  } else {
    doc.text(String(nombre ?? '').toUpperCase(), MARGEN, abajoDelEncabezado);
  }

  const yTitulo = abajoDelEncabezado + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  if (titulo) doc.text(titulo, MARGEN, yTitulo);
  doc.setDrawColor(180);
  doc.line(MARGEN, yTitulo + 4, MARGEN + ANCHO_UTIL, yTitulo + 4);
  return yTitulo + 14;
}
