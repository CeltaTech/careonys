import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { esAdminOSuperior } from '../lib/roles';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { usePermisos } from '../context/PermisosContext';
import { con } from '../lib/textos';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';

export const RUTA_DE_LOS_AJUSTES_POR_INDICE = '/revisar-precios';

/* La franja que avisa que hay precios ajustados por índice esperando revisión.
   ==========================================================================

   Sólo para la administración, que es la única a la que la base le deja leer las propuestas.
   Mientras una propuesta no se revisa, sigue rigiendo el precio anterior: por eso se avisa.
   Sin propuestas pendientes, no hay franja.

   Lo mismo para los valores del Legajo ajustados por índice, que además piden ver los pagos a los
   Asistentes. Son dos franjas, una por cada cosa que espera revisión. */
export function AlarmaDeAjustesPorIndice() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const esAdministracion = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const veLosPagos = esAdministracion && puede('ver_pagos_asistente');
  const precios = usePendientesDeRevision('propuestas_de_ajuste_por_indice', esAdministracion, t);
  const delLegajo = usePendientesDeRevision('propuestas_de_ajuste_del_legajo', veLosPagos, t);

  if (!esAdministracion) return null;
  const ta = t.ajustes_por_indice;
  return (
    <>
      <FranjaDeAjustesPorIndice t={t} {...precios} />
      {veLosPagos && (
        <FranjaDeAjustesPorIndice
          t={t}
          {...delLegajo}
          una={ta.legajo_alarma_una}
          varias={ta.legajo_alarma_varias}
          revisar={ta.legajo_revisar}
        />
      )}
    </>
  );
}

// Cuántas propuestas de esa tabla esperan revisión en la Prestadora actual. Con `alcanza` falso no
// pregunta nada: la base no se las dejaría leer.
function usePendientesDeRevision(tabla, alcanza, t) {
  const prestadoraId = usePrestadoraActual();
  const [estado, setEstado] = useState('cargando');
  const [cantidad, setCantidad] = useState(0);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!alcanza || !prestadoraId) return;
    setEstado('cargando');
    setError(null);
    const { count, error: falla } = await supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('prestadora_id', prestadoraId)
      .eq('estado', 'pendiente');
    if (falla) {
      setError(mensajeDeError(falla, t, 'alarma de ajustes por índice'));
      setEstado('error');
      return;
    }
    setCantidad(count ?? 0);
    setEstado(count ? 'listo' : 'vacio');
  }, [tabla, alcanza, prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { estado, cantidad, error, recargar };
}

// Lo que se dibuja. Cargando o vacío, nada: la franja aparece sólo cuando hay algo que revisar.
// Sin `una`, `varias` y `revisar`, habla de los precios.
export function FranjaDeAjustesPorIndice({ t, estado, cantidad, error, recargar, una, varias, revisar }) {
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
      {con(cantidad === 1 ? una ?? ta.alarma_una : varias ?? ta.alarma_varias, { cantidad })}{' '}
      <Link to={RUTA_DE_LOS_AJUSTES_POR_INDICE}>{revisar ?? ta.revisar}</Link>
    </Alert>
  );
}
