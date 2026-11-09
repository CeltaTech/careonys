import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { llamarApiCobros } from '../lib/apiCobros';
import { formatearImporte } from '../lib/dinero';
import { mensajeDeError } from '../lib/errores';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EstadoLista } from '../components/layout/EstadoLista';

function soloLaFecha(momento, locale) {
  return momento ? new Date(momento).toLocaleDateString(locale) : '—';
}

/* Los Servicios que se dieron de baja con el Cliente debiendo.
   ==========================================================================

   El aviso lo arma la base en la misma operación que da la baja, con lo que debía ese día y los
   días de atraso. Acá se lo muestra a créditos y cobranzas con a quién se le reclama: el
   Responsable de pagos y el Contratante, que responde solidariamente. Quien lo vio lo marca, y
   deja de aparecer. Se muestra sólo si hay alguno: sin avisos, la sección no está. */
export function AvisosBajaConDeuda() {
  const { t, locale } = useLocale();
  const [avisos, setAvisos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [marcandoId, setMarcandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      setAvisos(await llamarApiCobros('/avisos-baja-con-deuda'));
      setEstado('listo');
    } catch (e) {
      setError(mensajeDeError(e, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function marcarVisto(aviso) {
    setMarcandoId(aviso.id);
    setError(null);
    try {
      await llamarApiCobros(`/avisos-baja-con-deuda/${aviso.id}/visto`, { method: 'PATCH' });
      setAvisos((anteriores) => anteriores.filter((a) => a.id !== aviso.id));
    } catch (e) {
      setError(mensajeDeError(e, t));
    } finally {
      setMarcandoId(null);
    }
  }

  if (estado === 'listo' && avisos.length === 0) return null;

  const a = t.facturacion.avisos_baja_con_deuda;

  return (
    <section className="panel-tarjeta">
      <h2 className="panel-tarjeta-titulo">{a.titulo}</h2>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <div className="tarjeta-desplazable"><table className="panel-tabla">
          <thead>
            <tr>
              <th>{a.col_servicio}</th>
              <th>{t.facturacion.col_importe}</th>
              <th>{t.facturacion.col_dias_de_atraso}</th>
              <th>{a.col_responsable_de_pagos}</th>
              <th>{a.col_contratante}</th>
              <th>{t.facturacion.col_aviso_fecha}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {avisos.map((aviso) => (
              <tr key={aviso.id}>
                <td>{aviso.servicio_etiqueta || '—'}</td>
                <td>{formatearImporte(aviso.importe, aviso.moneda, locale)}</td>
                <td>{aviso.dias_de_atraso ?? '—'}</td>
                <td>{aviso.responsable_de_pagos_nombre || '—'}</td>
                <td>{aviso.contratante_nombre || '—'}</td>
                <td>{soloLaFecha(aviso.created_at, locale)}</td>
                <td>
                  <Button variant="secondary" onClick={() => marcarVisto(aviso)} disabled={marcandoId === aviso.id}>
                    {a.marcar_visto}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </EstadoLista>
    </section>
  );
}
