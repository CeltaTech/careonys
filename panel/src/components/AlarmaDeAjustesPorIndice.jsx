import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { esAdminOSuperior } from '../lib/roles';
import { con } from '../lib/textos';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';

export const RUTA_DE_LOS_AJUSTES_POR_INDICE = '/ajustes-por-indice';

/* La franja que avisa que hay precios ajustados por índice esperando revisión.
   ==========================================================================

   Sólo para la administración, que es la única a la que la base le deja leer las propuestas.
   Mientras una propuesta no se revisa, sigue rigiendo el precio anterior: por eso se avisa.
   Sin propuestas pendientes, no hay franja. */
export function AlarmaDeAjustesPorIndice() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const esAdministracion = esAdminOSuperior(usuario?.rol);
  const [estado, setEstado] = useState('cargando');
  const [cantidad, setCantidad] = useState(0);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!esAdministracion) return;
    setEstado('cargando');
    setError(null);
    const { count, error: falla } = await supabase
      .from('propuestas_de_ajuste_por_indice')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente');
    if (falla) {
      setError(mensajeDeError(falla, t, 'alarma de ajustes por índice'));
      setEstado('error');
      return;
    }
    setCantidad(count ?? 0);
    setEstado(count ? 'listo' : 'vacio');
  }, [esAdministracion, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!esAdministracion) return null;
  return <FranjaDeAjustesPorIndice t={t} estado={estado} cantidad={cantidad} error={error} recargar={cargar} />;
}

// Lo que se dibuja. Cargando o vacío, nada: la franja aparece sólo cuando hay algo que revisar.
export function FranjaDeAjustesPorIndice({ t, estado, cantidad, error, recargar }) {
  const ta = t.ajustes_por_indice;
  if (estado === 'error') {
    return (
      <Alert variant="error">
        {error}{' '}
        <Button variant="secondary" onClick={recargar}>{t.comun.reintentar}</Button>
      </Alert>
    );
  }
  if (estado !== 'listo' || !cantidad) return null;
  return (
    <Alert variant="warning">
      {con(cantidad === 1 ? ta.alarma_una : ta.alarma_varias, { cantidad })}{' '}
      <Link to={RUTA_DE_LOS_AJUSTES_POR_INDICE}>{ta.revisar}</Link>
    </Alert>
  );
}
