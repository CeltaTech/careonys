import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useMotivosReactivacionServicio } from '../../hooks/useMotivosReactivacionServicio';
import { reactivarElServicio } from '../../lib/apiServicios';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* La reactivación de un Servicio dado de baja.
   ==========================================================================

   Vuelve a dejarlo vigente, con el motivo elegido de la lista que arma la Prestadora en
   Configuración. Lo que la baja cerró —prestaciones, series, guardias— no se reabre: se carga de
   nuevo. La hace la base en una sola operación (`reactivar_el_servicio`). */
export function ReactivarElServicioModal({ servicioId, onClose, onReactivado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { filas: motivos, estado: estadoMotivos, error: errorMotivos } = useMotivosReactivacionServicio(prestadoraId);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [error, setError] = useState(null);

  const elegido = motivos.find((m) => m.id === motivoId) ?? null;
  const faltaMotivo = intentado && !elegido;
  const faltaDetalle = intentado && Boolean(elegido?.pide_detalle) && !detalle.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    if (!elegido) {
      document.getElementById('field-motivo_reactivacion')?.focus();
      return;
    }
    if (elegido.pide_detalle && !detalle.trim()) {
      document.getElementById('field-detalle_reactivacion')?.focus();
      return;
    }

    setReactivando(true);
    setError(null);
    try {
      await reactivarElServicio(servicioId, {
        motivo: elegido.id,
        motivoDetalle: elegido.pide_detalle ? detalle.trim() : null,
      });
    } catch (falla) {
      setReactivando(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    setReactivando(false);
    onReactivado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.servicios.reactivacion.boton}</h2>

        {(error || errorMotivos) && <Alert variant="error">{error || mensajeDeError(errorMotivos, t)}</Alert>}
        {estadoMotivos === 'vacio' && <Alert variant="warning">{t.servicios.reactivacion.sin_motivos}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label={t.servicios.reactivacion.motivo}
            name="motivo_reactivacion"
            type="select"
            required
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
            disabled={reactivando || estadoMotivos !== 'listo'}
            error={faltaMotivo ? t.formularios.falta_un_dato_obligatorio : undefined}
          >
            <option value="">{t.guardias.nueva_guardia.elegir}</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </FormField>

          {elegido?.pide_detalle && (
            <FormField
              label={t.prestaciones.cierre_servicio_motivo_detalle}
              name="detalle_reactivacion"
              type="textarea"
              required
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              disabled={reactivando}
              error={faltaDetalle ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          )}

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={reactivando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={reactivando || estadoMotivos !== 'listo'}>
              {reactivando ? t.servicios.reactivacion.reactivando : t.servicios.reactivacion.boton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
