import { useLocale } from '../../i18n/LocaleContext';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

export function EstadoLista({ estado, error, vacio, recargar, mensajeVacio, accionVacio, children }) {
  const { t } = useLocale();

  if (estado === 'cargando') {
    return <p className="estado-cargando">{t.comun.cargando}</p>;
  }

  if (estado === 'error') {
    return (
      <Alert variant="error">
        {error || t.comun.error_generico}{' '}
        <Button variant="secondary" onClick={recargar}>
          {t.comun.reintentar}
        </Button>
      </Alert>
    );
  }

  if (vacio) {
    return (
      <div className="estado-vacio-bloque">
        <p className="estado-vacio">{mensajeVacio || t.comun.vacio}</p>
        {accionVacio}
      </div>
    );
  }

  return children;
}
