import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { CampoHoraDeSalida } from '../../components/turnos_guardia/CampoHoraDeSalida';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { llamarApiComprobaciones } from '../../lib/apiComprobaciones';
import { horaDelMomento, momentoDelCampo, momentoParaElCampo } from '../../lib/horarios';
import { errorDeLaHora } from '../../lib/cierreDelTurnoGuardia';
import { mensajeDeError } from '../../lib/errores';

/* El pedido de autorización de un Asistente que no pudo leer el código QR, con quién lo pide, a
   qué hora y por qué motivo. Quien coordina lo lee y autoriza desde acá: eso vale lo mismo que
   leer el código QR.

   Si el pedido es de una salida, autorizar cierra el turno de guardia. La hora de salida se
   propone con la de este momento, y quien coordina la puede cambiar antes de registrar. Es el
   mismo casillero que el del cierre a mano, y la base valida la hora en el mismo lugar. */
export function SolicitudDeIngresoModal({ pedido, onClose, onAutorizado }) {
  const { t, locale } = useLocale();
  const tl = t.turnos_guardia.listado;
  const modal = useModalAccesible(onClose);
  const esSalida = pedido.momento === 'checkout';
  const [horaDeSalida, setHoraDeSalida] = useState(() => (esSalida ? momentoParaElCampo(new Date()) : ''));
  const [errorHora, setErrorHora] = useState(null);
  const [autorizando, setAutorizando] = useState(false);
  const [error, setError] = useState(null);

  async function autorizar() {
    let cuerpo;
    if (esSalida) {
      const momento = momentoDelCampo(horaDeSalida);
      if (!momento) {
        setErrorHora(t.cierre_turno_guardia.errores_hora.hora_de_salida_obligatoria);
        document.querySelector('[name="hora-de-salida"]')?.focus();
        return;
      }
      cuerpo = JSON.stringify({ horaDeSalida: momento.toISOString() });
    }
    setAutorizando(true);
    setError(null);
    setErrorHora(null);
    try {
      await llamarApiComprobaciones(`/${pedido.id}/autorizar`, { method: 'POST', body: cuerpo });
      onAutorizado();
    } catch (err) {
      const textoDeLaHora = esSalida ? errorDeLaHora(err, t) : null;
      if (textoDeLaHora) setErrorHora(textoDeLaHora);
      else setError(mensajeDeError(err, t));
      setAutorizando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{tl.solicitud_de_ingreso}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <dl className="panel-detalle-lista">
          <dt>{tl.solicitud_asistente}</dt>
          <dd>{pedido.asistente ?? '—'}</dd>
          <dt>{tl.solicitud_hora}</dt>
          <dd>{horaDelMomento(pedido.pedidoEn, locale) || '—'}</dd>
          <dt>{tl.solicitud_motivo}</dt>
          <dd>{tl[`solicitud_motivo_${pedido.motivo}`] ?? '—'}</dd>
          {pedido.detalle && (
            <>
              <dt>{tl.solicitud_detalle}</dt>
              <dd>{pedido.detalle}</dd>
            </>
          )}
        </dl>

        {esSalida && (
          <CampoHoraDeSalida
            valor={horaDeSalida}
            error={errorHora}
            disabled={autorizando}
            alCambiar={(valor) => {
              setHoraDeSalida(valor);
              if (valor) setErrorHora(null);
            }}
          />
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={autorizando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={autorizar} disabled={autorizando}>
            {autorizando ? tl.autorizando : tl.autorizar}
          </Button>
        </div>
      </div>
    </div>
  );
}
