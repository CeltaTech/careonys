import { useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

// ============================================================================
// La pregunta en el momento en que hace falta: aparece adentro de la acción que va a usar el
// permiso, y no al entrar a la aplicación. Así la pide cualquier aplicación madura, y así lo
// piden las guías de Android y de Apple: quien la lee sabe para qué es, porque lo está haciendo.
//
// Los dos botones pesan lo mismo a propósito: resaltar uno sería empujar la decisión. Qué pasa si
// no lo permite no lo dice el producto: lo dice el texto de la Prestadora, que es quien lo decide.
// ============================================================================

export default function PreguntaDeConsentimiento({ item, onDecidido }) {
  const { t, locale } = useLocale();
  const [guardando, setGuardando] = useState('');
  const [error, setError] = useState('');

  async function decidir(decision) {
    setError('');
    setGuardando(decision);
    try {
      await api.decidirConsentimiento(item.clave, decision, locale);
      await onDecidido(decision);
    } catch {
      setError(t.comun.error_generico);
    } finally {
      setGuardando('');
    }
  }

  return (
    <div className="pwa-card-pie">
      <h3>{item.texto.titulo}</h3>
      {item.texto.es_borrador && <div className="alert alert-error">{t.consentimientos.aviso_borrador}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="texto-con-renglones">{item.texto.cuerpo}</p>
      <div className="consentimiento-acciones">
        <button type="button" className="btn" disabled={!!guardando} onClick={() => decidir('rechazado')}>
          {guardando === 'rechazado' ? t.comun.guardando : t.consentimientos.no_permitir}
        </button>
        <button type="button" className="btn" disabled={!!guardando} onClick={() => decidir('otorgado')}>
          {guardando === 'otorgado' ? t.comun.guardando : t.consentimientos.permitir}
        </button>
      </div>
    </div>
  );
}
