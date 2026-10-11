import { useLocale } from '../../i18n/LocaleContext';
import { useCierrePorInactividad } from '../../hooks/useCierrePorInactividad';
import { Button } from '../ui/Button';

// La franja del último minuto antes del cierre por inactividad. Afecta a toda la pantalla y no
// frena el trabajo, así que es franja y no ventana emergente (`celtatech/CLAUDE.md` §8).
export function AvisoDeInactividad() {
  const { t } = useLocale();
  const { porCerrar, seguirTrabajando } = useCierrePorInactividad();
  if (!porCerrar) return null;
  return (
    <div className="alert alert-warning panel-franja-inactividad" role="alert">
      <span>{t.nav.inactividad_aviso}</span>
      <Button variant="secondary" onClick={seguirTrabajando}>
        {t.nav.inactividad_seguir}
      </Button>
    </div>
  );
}
