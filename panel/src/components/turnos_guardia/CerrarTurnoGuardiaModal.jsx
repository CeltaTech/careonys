import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { llamarApiPanel } from '../../lib/apiPanel';
import { mensajeDeError } from '../../lib/errores';
import { momentoDelCampo, momentoParaElCampo } from '../../lib/horarios';
import {
  errorDeLaHora,
  horaPropuestaDeSalida,
  nombreDelMotivoDeSalida,
  revisarCierre,
} from '../../lib/cierreDelTurnoGuardia';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useMotivosCierreTurnoGuardia } from '../../hooks/useMotivosCierreTurnoGuardia';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { EstadoLista } from '../layout/EstadoLista';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { CampoHoraDeSalida } from './CampoHoraDeSalida';

// La ventana con la que se cierra a mano un turno de guardia empezado. Es una sola para todo el
// Panel: la usan la lista de turnos sin cerrar y el botón «Registrar check-out» del detalle.
//
// Pide el motivo, de la lista de la Prestadora, y la hora de salida. La hora se propone con la
// última vez que se supo que el Asistente estaba en la casa, o con su llegada. El cierre lo hace
// el backend por el único camino del cierre, y la base valida quién cierra, el motivo y la hora.
// Si el Reporte está pendiente, el turno queda en «Salida sin Reporte».
//
// `turno_guardia` necesita `id`; `detalle` es lo que se muestra arriba, ya armado por quien abre.
export function CerrarTurnoGuardiaModal({ turno_guardia, detalle = null, onClose, onCerrada }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const tc = t.cierre_turno_guardia;
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const motivos = useMotivosCierreTurnoGuardia(prestadoraId);

  const [estadoHora, setEstadoHora] = useState('cargando');
  const [errorHora, setErrorHora] = useState(null);
  const [motivoId, setMotivoId] = useState('');
  const [textoDetalle, setTextoDetalle] = useState('');
  const [hora, setHora] = useState('');
  const [faltan, setFaltan] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  // La hora que se propone sale de la base, no de lo que tenga cargado la pantalla que abrió.
  const cargarHora = useCallback(async () => {
    setEstadoHora('cargando');
    setErrorHora(null);
    const [{ data: turno, error: errorTurno }, { data: comprobaciones, error: errorComprobaciones }] = await Promise.all([
      supabase.from('turnos_guardia').select('checkin_at, ubicacion_actual_at').eq('id', turno_guardia.id).maybeSingle(),
      supabase.from('turno_guardia_comprobaciones').select('comprobada_en').eq('turno_guardia_id', turno_guardia.id),
    ]);
    const fallo = errorTurno ?? errorComprobaciones;
    if (fallo) {
      setErrorHora(mensajeDeError(fallo, t));
      setEstadoHora('error');
      return;
    }
    setHora(momentoParaElCampo(horaPropuestaDeSalida(turno, comprobaciones)));
    setEstadoHora('listo');
  }, [turno_guardia.id, t]);

  useEffect(() => {
    cargarHora();
  }, [cargarHora]);

  const motivo = motivos.filas.find((m) => m.id === motivoId) ?? null;

  // El texto al pie desaparece en cuanto el dato se completa.
  const quitarFalta = (campo) => setFaltan((antes) => {
    if (!antes[campo]) return antes;
    const { [campo]: _quitada, ...resto } = antes;
    return resto;
  });

  async function handleCerrar() {
    const momento = momentoDelCampo(hora);
    const revision = revisarCierre({ motivo, detalle: textoDetalle, hora: momento }, t);
    setFaltan(revision);
    if (Object.keys(revision).length > 0) {
      document.querySelector(`[name="${Object.keys(revision)[0] === 'hora' ? 'hora-de-salida' : `cierre-${Object.keys(revision)[0]}`}"]`)?.focus();
      return;
    }
    if (!(await confirmarDestructivo(tc.confirmar))) return;

    setError(null);
    setProcesando(true);
    try {
      await llamarApiPanel(`/turnos-guardia/${turno_guardia.id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({
          motivoId: motivo.id,
          hora: momento.toISOString(),
          detalle: motivo.pide_detalle ? textoDetalle.trim() : null,
        }),
      });
    } catch (err) {
      const textoDeLaHora = errorDeLaHora(err, t);
      if (textoDeLaHora) setFaltan({ hora: textoDeLaHora });
      else setError(mensajeDeError(err, t));
      setProcesando(false);
      return;
    }
    if (onCerrada) await onCerrada();
    setProcesando(false);
    onClose();
  }

  const estado = motivos.estado === 'listo' && estadoHora !== 'listo' ? estadoHora : motivos.estado;
  const recargar = () => {
    motivos.recargar();
    cargarHora();
  };

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{tc.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        {detalle}

        <EstadoLista
          estado={estado}
          error={motivos.error ?? errorHora}
          recargar={recargar}
          mensajeVacio={tc.sin_motivos}
        >
          <FormField
            label={tc.motivo}
            name="cierre-motivo"
            type="select"
            value={motivoId}
            error={faltan.motivo}
            onChange={(e) => {
              setMotivoId(e.target.value);
              quitarFalta('motivo');
            }}
            required
          >
            <option value="">{t.comun.seleccionar}</option>
            {motivos.filas.map((m) => (
              <option key={m.id} value={m.id}>{nombreDelMotivoDeSalida(m, t)}</option>
            ))}
          </FormField>

          {motivo?.pide_detalle && (
            <FormField
              label={tc.detalle}
              name="cierre-detalle"
              type="textarea"
              rows={3}
              value={textoDetalle}
              error={faltan.detalle}
              onChange={(e) => {
                setTextoDetalle(e.target.value);
                if (e.target.value.trim()) quitarFalta('detalle');
              }}
              required
            />
          )}

          <CampoHoraDeSalida
            valor={hora}
            error={faltan.hora}
            alCambiar={(valor) => {
              setHora(valor);
              if (valor) quitarFalta('hora');
            }}
          />
        </EstadoLista>

        <div className="panel-modal-acciones">
          <Button onClick={handleCerrar} disabled={procesando || estado !== 'listo'}>
            {procesando ? tc.cerrando : tc.cerrar}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={procesando}>
            {t.comun.cancelar}
          </Button>
        </div>
      </div>
    </div>
  );
}
