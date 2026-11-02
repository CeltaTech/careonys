import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

// ============================================================================
// La tarjeta Privacidad de Perfil: un renglón por cada documento que el Asistente firmó, con su
// nombre, que lleva al texto completo.
//
// Acá no se decide nada. La condición de la ubicación se firma en el reclutamiento, y el texto
// nuevo que trae el paso de «Sólo viaje» a «Viaje y turno» se firma de la misma manera.
// ============================================================================

export default function Consentimientos() {
  const { t } = useLocale();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .consentimientos()
      .then(({ consentimientos }) => {
        if (activo) setItems(consentimientos);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!items) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  // Sin nada firmado no hay nada que mostrar.
  if (items.length === 0) return null;

  return (
    <section className="pwa-card">
      <h2>{t.consentimientos.titulo}</h2>
      {items.map((item) => (
        <div key={item.clave} className="permiso-fila">
          <Link to={`/privacidad/${item.clave}`}>{item.texto.titulo}</Link>
        </div>
      ))}
    </section>
  );
}
