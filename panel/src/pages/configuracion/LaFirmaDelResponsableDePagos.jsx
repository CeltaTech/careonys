import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* Si un Servicio puede programar guardias sin la firma del Responsable de pagos.
   ==========================================================================

   Lo decide cada Prestadora. Encendida, la base rechaza programar una guardia o una serie en un
   Servicio que no tenga la firma vigente de su Responsable de pagos, y el detalle del Servicio
   lo avisa. Lo que ya estaba programado sigue igual. De fábrica está apagada. */
export function LaFirmaDelResponsableDePagos() {
  const { t } = useLocale();
  const [soloConFirma, setSoloConFirma] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await llamarApi('/guardias/firma-del-pagador');
      setSoloConFirma(datos.guardias_solo_con_firma_del_pagador === true);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      await llamarApi('/guardias/firma-del-pagador', {
        method: 'PATCH',
        body: JSON.stringify({ guardias_solo_con_firma_del_pagador: soloConFirma }),
      });
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.servicios_firma_pagador_titulo}</h2>
      </div>
      <EstadoLista estado={estado} error={error} recargar={recargar}>
        {error && <Alert variant="error">{error}</Alert>}
        {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.servicios_firma_pagador_activa}
              name="guardias_solo_con_firma_del_pagador"
              type="checkbox"
              checked={soloConFirma}
              onChange={(e) => { setSoloConFirma(e.target.checked); setGuardado(false); }}
            />
          </div>
        </div>
        <div className="molde-acciones">
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </EstadoLista>
    </section>
  );
}
