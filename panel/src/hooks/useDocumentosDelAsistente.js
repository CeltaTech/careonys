import { useCallback, useEffect, useState } from 'react';
import { llamadorDe } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';
import { useLocale } from '../i18n/LocaleContext';

export const llamarApiDocumentos = llamadorDe('/documentos-asistente');

/**
 * Los documentos que se le piden a un Asistente, con el estado de cada uno.
 *
 * Los lee una sola vez el Legajo y los reparte: la franja de arriba los cuenta y la sección de
 * Documentos los muestra. Así las dos dicen lo mismo y se recargan juntas.
 */
export function useDocumentosDelAsistente(asistenteId) {
  const { t } = useLocale();
  const [documentos, setDocumentos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!asistenteId) return;
    setEstado('cargando');
    setError(null);
    try {
      const respuesta = await llamarApiDocumentos(`/asistente/${asistenteId}`);
      setDocumentos(respuesta?.documentos ?? []);
      setEstado('listo');
    } catch (e) {
      setError(mensajeDeError(e, t, 'documentos del Asistente'));
      setEstado('error');
    }
  }, [asistenteId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { documentos, estado, error, recargar };
}
