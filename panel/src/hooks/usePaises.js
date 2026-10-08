import { useMemo } from 'react';
import { useCatalogo } from './useCatalogo';
import { useLocale } from '../i18n/LocaleContext';

/* Los países del mundo, con su nombre en el idioma de quien mira.
   =========================================================================

   La base guarda sólo el código de dos letras; el nombre lo pone el navegador, que ya lo sabe en
   cada idioma. Escribir doscientos cincuenta nombres en tres idiomas sería repetir lo que el
   navegador trae y equivocarse en alguno.

   SALEN ORDENADOS POR EL NOMBRE, no por el código: se busca «Uruguay», no «UY». */
export function usePaises() {
  const { locale } = useLocale();
  const { filas, estado, error, recargar } = useCatalogo('catalogo_paises', {
    columnas: 'codigo',
    filtros: { activo: true },
    orden: 'codigo',
  });

  const paises = useMemo(() => {
    const nombres = new Intl.DisplayNames([locale], { type: 'region' });
    return filas
      .map(({ codigo }) => ({ codigo, nombre: nombres.of(codigo) ?? codigo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, locale));
  }, [filas, locale]);

  const nombreDe = useMemo(() => {
    const nombres = new Intl.DisplayNames([locale], { type: 'region' });
    return (codigo) => (codigo ? nombres.of(codigo) ?? codigo : '');
  }, [locale]);

  return { paises, nombreDe, estado, error, recargar };
}
