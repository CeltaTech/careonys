import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { vistaDelEnlace, vistaDelArchivo } from '../lib/vistaDelMaterial';

// El material de una pieza de Contenidos: el enlace y los archivos subidos, mostrados adentro
// cuando se puede. Qué se ve adentro y qué no lo decide `lib/vistaDelMaterial.js`.
//
// El enlace sigue escrito entero y con su botón «Abrir», aunque se vea adentro: un archivo de Drive
// que no se compartió con cualquiera muestra la página de entrada de Google, y el botón es la
// salida.
//
// Los archivos subidos se piden de a uno, con un enlace temporal que dura un minuto: alcanza para
// cargarlos, y si alguien lo copia ya no sirve.
//
// Original en la aplicación de Asistentes; la copia de la de Clientes la regenera
// `scripts/sincronizar_copias.mjs`.

function Marco({ src, titulo }) {
  return (
    <div className="material-marco">
      <iframe
        src={src}
        title={titulo}
        loading="lazy"
        allow="fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function Vista({ forma, src, titulo }) {
  if (forma === 'imagen') return <img className="material-imagen" src={src} alt={titulo} loading="lazy" />;
  if (forma === 'video') return <video className="material-video" src={src} controls preload="metadata" />;
  return <Marco src={src} titulo={titulo} />;
}

/** Un archivo que se ve adentro: pide su enlace al aparecer, con sus cuatro estados. */
function ArchivoAdentro({ archivo, forma }) {
  const { t } = useLocale();
  const [src, setSrc] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .enlaceDeArchivoDeContenido(archivo.id)
      .then(({ url }) => {
        if (activo) setSrc(url);
      })
      .catch((e) => {
        if (activo) setError(mensajeDeError(e, t, 'archivo de un contenido'));
      });
    return () => {
      activo = false;
    };
  }, [archivo.id]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (src === undefined) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  return <Vista forma={forma} src={src} titulo={archivo.nombre} />;
}

/** Un archivo que se descarga: el enlace se pide recién al tocar el botón. */
function ArchivoParaDescargar({ archivo }) {
  const { t } = useLocale();
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState('');

  async function descargar() {
    setPidiendo(true);
    setError('');
    try {
      const { url } = await api.enlaceDeArchivoDeContenido(archivo.id);
      window.location.assign(url);
    } catch (e) {
      setError(mensajeDeError(e, t, 'archivo de un contenido'));
    } finally {
      setPidiendo(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button type="button" className="btn btn-secondary btn-full" onClick={descargar} disabled={pidiendo}>
        {pidiendo ? t.comun.cargando : t.contenidos.descargar}
      </button>
    </>
  );
}

export default function MaterialDelContenido({ contenido }) {
  const { t } = useLocale();
  const vista = contenido.enlace_url ? vistaDelEnlace(contenido.enlace_url) : null;

  return (
    <>
      {vista && <Vista forma={vista.forma} src={vista.src} titulo={contenido.titulo} />}
      {/* El enlace lleva a una página de la Prestadora, fuera de esta aplicación: se abre aparte, y
          sin ningún camino de vuelta hacia esta pestaña. */}
      {contenido.enlace_url && (
        <>
          <p className="enlace-del-contenido">
            <a href={contenido.enlace_url} target="_blank" rel="noopener noreferrer">
              {contenido.enlace_url}
            </a>
          </p>
          <a
            className="btn btn-secondary btn-full pwa-card-pie"
            href={contenido.enlace_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.contenidos.abrir_enlace}
          </a>
        </>
      )}

      {(contenido.archivos ?? []).map((archivo) => {
        const forma = vistaDelArchivo(archivo.tipo);
        return (
          <section key={archivo.id} className="material-archivo">
            <p className="material-nombre">{archivo.nombre}</p>
            {forma ? <ArchivoAdentro archivo={archivo} forma={forma} /> : <ArchivoParaDescargar archivo={archivo} />}
          </section>
        );
      })}
    </>
  );
}
