import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useMotivosCierreServicio } from '../../hooks/useMotivosCierreServicio';
import { nombreMotivo, valorGuardado } from '../../lib/motivoDeCierre';
import { cerrarServicioDelPaciente } from '../../lib/cerrarServicioDelPaciente';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* La baja de un Servicio entero.
   ==========================================================================

   Es la misma baja que se hace Paciente por Paciente, corrida para cada uno de los Pacientes del
   Servicio con el mismo motivo, y al final el Servicio queda de baja. Si algún cierre falla, el
   Servicio no se da de baja: los que ya se cerraron quedan cerrados, y al volver a intentar sólo
   quedan los que faltaban. */
export function BajaDelServicioModal({ servicioId, pacientesIds, onClose, onDadoDeBaja }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const { filas: motivos, estado: estadoMotivos, error: errorMotivos } = useMotivosCierreServicio(prestadoraId);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [error, setError] = useState(null);

  const elegido = motivos.find((m) => m.id === motivoId) ?? null;
  const faltaMotivo = intentado && !elegido;
  const faltaDetalle = intentado && Boolean(elegido?.pide_detalle) && !detalle.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    if (!elegido) {
      document.getElementById('field-motivo_baja')?.focus();
      return;
    }
    if (elegido.pide_detalle && !detalle.trim()) {
      document.getElementById('field-detalle_baja')?.focus();
      return;
    }
    if (!(await confirmarDestructivo(t.servicios.baja.confirmar))) return;

    setDandoDeBaja(true);
    setError(null);
    // Los Pacientes cuya atención en este Servicio ya se cerró no se vuelven a cerrar: así un
    // reintento después de una falla no anota dos cierres para el mismo Paciente.
    const { data: yaCerrados, error: errorCierres } = await supabase
      .from('cierres_servicio_paciente')
      .select('paciente_id')
      .eq('servicio_id', servicioId);
    if (errorCierres) {
      setDandoDeBaja(false);
      setError(mensajeDeError(errorCierres, t));
      return;
    }
    const cerrados = new Set((yaCerrados ?? []).map((c) => c.paciente_id));
    for (const pacienteId of pacientesIds.filter((idPaciente) => !cerrados.has(idPaciente))) {
      const { error: errorDelCierre } = await cerrarServicioDelPaciente({
        prestadoraId,
        usuario,
        servicioId,
        pacienteId,
        motivo: valorGuardado(elegido),
        motivoDetalle: elegido.pide_detalle ? detalle.trim() : null,
      });
      if (errorDelCierre) {
        setDandoDeBaja(false);
        setError(mensajeDeError(errorDelCierre, t));
        return;
      }
    }
    const { error: errorBaja } = await supabase.from('servicios').update({ estado: 'de_baja' }).eq('id', servicioId);
    setDandoDeBaja(false);
    if (errorBaja) {
      setError(mensajeDeError(errorBaja, t));
      return;
    }
    onDadoDeBaja();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.servicios.baja.boton}</h2>

        {(error || errorMotivos) && <Alert variant="error">{error || mensajeDeError(errorMotivos, t)}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label={t.prestaciones.cierre_servicio_motivo}
            name="motivo_baja"
            type="select"
            required
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
            disabled={dandoDeBaja || estadoMotivos !== 'listo'}
            error={faltaMotivo ? t.formularios.falta_un_dato_obligatorio : undefined}
          >
            <option value="">{t.guardias.nueva_guardia.elegir}</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {nombreMotivo(m, t)}
              </option>
            ))}
          </FormField>

          {elegido?.pide_detalle && (
            <FormField
              label={t.prestaciones.cierre_servicio_motivo_detalle}
              name="detalle_baja"
              type="textarea"
              required
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              disabled={dandoDeBaja}
              error={faltaDetalle ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          )}

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={dandoDeBaja}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={dandoDeBaja}>
              {dandoDeBaja ? t.servicios.baja.dando_de_baja : t.servicios.baja.boton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
