import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

// El texto completo de un permiso, tal como lo escribió la Prestadora. Se llega desde la tarjeta
// Privacidad de Perfil, tocando el nombre del permiso.
export default function TextoDeConsentimiento() {
  const { clave } = useParams();
  const { t, locale } = useLocale();
  const [item, setItem] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .consentimientos(locale)
      .then(({ consentimientos }) => {
        if (activo) setItem(consentimientos.find((c) => c.clave === clave) || null);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, [clave, locale]);

  if (item === null) return <Navigate to="/perfil" replace />;

  return (
    <div>
      <Link to="/perfil" className="btn btn-volver">
        <span aria-hidden="true">←</span> {t.comun.volver}
      </Link>
      {error ? (
        <div className="alert alert-error" role="alert">{error}</div>
      ) : !item ? (
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      ) : (
        <>
          <h1>{item.texto.titulo}</h1>
          <section className="pwa-card">
            {item.texto.es_borrador && <div className="alert alert-error">{t.consentimientos.aviso_borrador}</div>}
            <p className="texto-con-renglones">{item.texto.cuerpo}</p>
          </section>
        </>
      )}
    </div>
  );
}
