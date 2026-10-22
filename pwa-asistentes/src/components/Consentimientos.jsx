import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import PreguntaDeConsentimiento from './PreguntaDeConsentimiento';

// ============================================================================
// La tarjeta Privacidad de Perfil: un renglón por permiso, con su nombre, que lleva al texto
// completo de la Prestadora.
//
// La condición de la ubicación se acepta en el reclutamiento. Lo único que se decide acá es el
// texto nuevo que trae el paso de «Sólo viaje» a «Viaje y turno»: quien todavía no lo aceptó lo
// tiene abierto debajo de su nombre, con los dos botones. Si deja vencer el plazo, se le avisa a
// la Prestadora y ella decide.
// ============================================================================

export default function Consentimientos() {
  const { t, locale } = useLocale();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => api
    .consentimientos(locale)
    .then(({ consentimientos }) => setItems(consentimientos)), [locale]);

  useEffect(() => {
    let activo = true;
    api
      .consentimientos(locale)
      .then(({ consentimientos }) => {
        if (activo) setItems(consentimientos);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, [locale]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!items) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  // Sin texto cargado para la Prestadora no hay nada que mostrar. Es el caso normal.
  if (items.length === 0) return null;

  return (
    <section className="pwa-card">
      <h2>{t.consentimientos.titulo}</h2>
      {items.map((item) => (
        <div key={item.clave} className="permiso-fila">
          {item.pendiente ? (
            <PreguntaDeConsentimiento item={item} onDecidido={cargar} />
          ) : (
            <Link to={`/privacidad/${item.clave}`}>{item.texto.titulo}</Link>
          )}
        </div>
      ))}
    </section>
  );
}
