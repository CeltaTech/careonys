import { archivoDeContenidoSeVeAdentro } from './archivosDeContenidos.js';

/* Cómo se muestra adentro de la pantalla el material de una pieza de Contenidos.
   ==========================================================================

   Una pieza puede traer un enlace y archivos subidos. Lo que se pueda ver adentro se ve adentro,
   sin salir de la aplicación; lo que no, queda con su botón para abrirlo aparte.

   Tres formas:
     - `marco`: otra página dentro de un recuadro. Videos de YouTube y Vimeo, archivos de Drive y
       de Documentos de Google, PDF, y Word, Excel y PowerPoint publicados en la web.
     - `imagen` y `video`: el archivo mismo, cuando la dirección termina en su extensión.

   Lo que no se reconoce no se muestra: se abre con el botón. Un enlace de Drive o de Office se ve
   sólo si quien lo publicó lo dejó abierto a cualquiera con el enlace; si no, el recuadro muestra
   la página de entrada de Google o de Microsoft, y el botón sigue estando.

   Los archivos subidos a Careonys siguen otra regla, la de `archivosDeContenidos.js`: la imagen y
   el PDF se ven adentro, y Word y Excel se descargan, porque mostrarlos obligaría a pasar un
   archivo confidencial por el visor de Microsoft.

   Original en el Panel; las copias de las aplicaciones las regenera `scripts/sincronizar_copias.mjs`. */

const IMAGENES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
const VIDEOS = ['mp4', 'webm', 'ogv'];
const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

const marco = (src) => ({ forma: 'marco', src });

function idDeYoutube(url, host) {
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0];
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  return url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
}

/** Cómo se ve adentro un enlace pegado en la pieza, o `null` si se abre aparte. */
export function vistaDelEnlace(direccion) {
  let url;
  try {
    url = new URL(direccion);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');

  const youtube = idDeYoutube(url, host);
  if (youtube && /^[\w-]{6,20}$/.test(youtube)) return marco(`https://www.youtube-nocookie.com/embed/${youtube}`);

  if (host === 'vimeo.com') {
    const [, id, clave] = url.pathname.match(/^\/(\d+)(?:\/([0-9a-f]+))?/) ?? [];
    if (id) return marco(`https://player.vimeo.com/video/${id}${clave ? `?h=${clave}` : ''}`);
  }
  if (host === 'player.vimeo.com' && /^\/video\/\d+/.test(url.pathname)) return marco(url.href);

  if (host === 'drive.google.com') {
    const id = url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ?? (url.pathname === '/open' ? url.searchParams.get('id') : null);
    if (id && /^[\w-]+$/.test(id)) return marco(`https://drive.google.com/file/d/${id}/preview`);
  }
  if (host === 'docs.google.com') {
    const [, clase, id] = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/) ?? [];
    if (id) return marco(`https://docs.google.com/${clase}/d/${id}/preview`);
  }

  const extension = url.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (IMAGENES.includes(extension)) return { forma: 'imagen', src: url.href };
  if (VIDEOS.includes(extension)) return { forma: 'video', src: url.href };
  if (extension === 'pdf') return marco(url.href);
  if (OFFICE.includes(extension)) {
    return marco(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url.href)}`);
  }
  return null;
}

/** Cómo se ve adentro un archivo subido, por su tipo, o `null` si se descarga. */
export function vistaDelArchivo(tipo) {
  if (!archivoDeContenidoSeVeAdentro(tipo)) return null;
  return tipo.startsWith('image/') ? 'imagen' : 'marco';
}
