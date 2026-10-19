import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { llamarApiComprobaciones } from '../../lib/apiComprobaciones';
import { horaDelMomento } from '../../lib/horarios';
import { mensajeDeError } from '../../lib/errores';

/* El pedido de autorización de un Asistente que no pudo leer el código QR, con quién lo pide, a
   qué hora y por qué motivo. Quien coordina lo lee y autoriza desde acá: eso vale lo mismo que
   leer el código QR. */
export function SolicitudDeIngresoModal({ pedido, onClose, onAutorizado }) {
  const { t, locale } = useLocale();
  const tl = t.guardias.listado;
  const modal = useModalAccesible(onClose);
  const [autorizando, setAutorizando] = useState(false);
  const [error, setError] = useState(null);

  async function autorizar() {
    setAutorizando(true);
    setError(null);
    try {
      await llamarApiComprobaciones(`/${pedido.id}/autorizar`, { method: 'POST' });
      onAutorizado();
    } catch (err) {
      setError(mensajeDeError(err, t));
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
