import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import MaterialDelContenido from '../components/MaterialDelContenido';

// Lo que la Prestadora escribió para quien cuida en su casa.
//
// El texto lo escribió una persona de la Prestadora, en su idioma, y por eso sale tal cual: acá
// no se traduce nada más que el marco de la pantalla. Se respetan los renglones que puso quien
// lo escribió, que es lo único que se puede dar por intencional de un texto suelto.
//
// Vuelve sólo lo publicado. Un borrador existe del lado del Panel y de acá no se ve: quién decide
// cuándo se muestra es quien lo escribe.
export default function Contenidos() {
  const { t } = useLocale();
  const [contenidos, setContenidos] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .contenidos()
      .then(({ contenidos: data }) => {
        if (activo) setContenidos(data);
      })
      .catch((e) => {
        if (activo) setError(mensajeDeError(e, t, 'contenido de la Prestadora'));
      });
    return () => {
      activo = false;
    };
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (contenidos === undefined) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  return (
    <>
      <h1>{t.contenidos.titulo}</h1>

      {contenidos.length === 0 ? (
        <div className="pwa-card estado-vacio" role="status">{t.contenidos.sin_contenidos}</div>
      ) : (
        contenidos.map((contenido) => (
          <article key={contenido.id} className="pwa-card">
            <h2>{contenido.titulo}</h2>
            <div className="texto-con-renglones pwa-card-dato">{contenido.cuerpo}</div>
            <MaterialDelContenido contenido={contenido} />
          </article>
        ))
      )}
    </>
  );
}
