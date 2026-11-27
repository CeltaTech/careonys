import { useLocale } from '../../i18n/LocaleContext';
import { Alert } from '../../components/ui/Alert';
import { fraseDeAdvertencia } from '../../lib/importacion';

/* Las advertencias de una lectura o de una importación, cada una con su frase.
   Sin advertencias no se muestra nada. */

export function ListaDeAdvertencias({ advertencias }) {
  const { t } = useLocale();
  const frases = [...new Set((advertencias ?? []).map((a) => fraseDeAdvertencia(a, t)).filter(Boolean))];
  if (frases.length === 0) return null;

  return (
    <Alert variant="info">
      <strong>{t.importacion.advertencias_titulo}</strong>
      <ul>
        {frases.map((frase) => (
          <li key={frase}>{frase}</li>
        ))}
      </ul>
    </Alert>
  );
}
