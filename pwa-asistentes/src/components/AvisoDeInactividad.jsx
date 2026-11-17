import { useLocale } from '../i18n/LocaleContext';
import { useCierrePorInactividad } from '../hooks/useCierrePorInactividad';

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano.
//
// La franja del último minuto antes del cierre por inactividad. Afecta a toda la pantalla y no
// frena lo que se está haciendo, así que es franja y no ventana emergente.
export default function AvisoDeInactividad() {
  const { t } = useLocale();
  const { porCerrar, seguirUsando } = useCierrePorInactividad();
  if (!porCerrar) return null;
  return (
    <div className="alert alert-alerta franja-inactividad" role="alert">
      <span>{t.inactividad.aviso}</span>
      <button type="button" className="btn btn-secondary" onClick={seguirUsando}>
        {t.inactividad.seguir}
      </button>
    </div>
  );
}
