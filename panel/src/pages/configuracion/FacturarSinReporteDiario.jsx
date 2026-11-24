import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* Si se le factura al Cliente el turno de guardia en el que el Asistente salió sin presentar el
   Reporte Diario.
   ==========================================================================

   Lo decide cada Prestadora. Encendida, que es como viene de fábrica, el turno se factura igual:
   se prestó. Apagada, el turno se factura recién cuando llega el reporte, en la factura del
   período en que llegó si la de su fecha ya estaba hecha. La elección se anota en cada turno de
   guardia en el momento de la salida, así que cambiarla no toca los que ya salieron. */
export function FacturarSinReporteDiario() {
  const { t } = useLocale();
  const [factura, setFactura] = useState(true);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await llamarApi('/facturar-turnos-sin-reporte');
      setFactura(datos.factura_turnos_sin_reporte_diario !== false);
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
      await llamarApi('/facturar-turnos-sin-reporte', {
        method: 'PATCH',
        body: JSON.stringify({ factura }),
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
        <h2>{t.configuracion.facturar_sin_reporte_titulo}</h2>
      </div>
      <EstadoLista estado={estado} error={error} recargar={recargar}>
        {error && <Alert variant="error">{error}</Alert>}
        {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.facturar_sin_reporte_activa}
              name="factura_turnos_sin_reporte_diario"
              type="checkbox"
              checked={factura}
              onChange={(e) => { setFactura(e.target.checked); setGuardado(false); }}
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
