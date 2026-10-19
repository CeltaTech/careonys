import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { llamarApiPanel } from '../../lib/apiPanel';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { TurnosQueTraban } from '../../components/cuenta/TurnosQueTraban';

/* Desactivar a un Asistente desde su Legajo. La cuenta no se borra: se desactiva con su motivo,
   y queda en el Padrón entre los desactivados, de donde se la puede reactivar.

   Si tiene turnos sin terminar, el backend no la desactiva y dice cuáles; se muestran acá mismo,
   en la ventana, con el enlace a donde se resuelve cada uno. */
export function DesactivarAsistenteModal({ asistente, onClose, onDesactivado }) {
  const { t } = useLocale();
  const tc = t.asistentes.cuenta;
  const [motivo, setMotivo] = useState('');
  const [faltaElMotivo, setFaltaElMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [traban, setTraban] = useState(null);
  const modal = useModalAccesible(enviando ? () => {} : onClose);

  async function confirmar() {
    const escrito = motivo.trim();
    if (!escrito) {
      setFaltaElMotivo(true);
      return;
    }
    setEnviando(true);
    setError(null);
    setTraban(null);
    try {
      await llamarApiPanel(`/usuarios/asistentes/${asistente.id}/desactivar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: escrito }),
      });
      onDesactivado();
    } catch (err) {
      if (Array.isArray(err.motivos) && err.motivos.length > 0) {
        setTraban({ motivos: err.motivos, turnos: err.turnos ?? [] });
      } else {
        setError(mensajeDeError(err, t));
      }
      setEnviando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={enviando ? undefined : onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <p id={modal.idTitulo}>{tc.confirmar}</p>
        {error && <Alert variant="error">{error}</Alert>}
        {traban && <TurnosQueTraban motivos={traban.motivos} turnos={traban.turnos} />}
        <FormField
          type="textarea"
          name="motivo-de-la-desactivacion"
          label={t.comun.motivo}
          required
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            if (e.target.value.trim()) setFaltaElMotivo(false);
          }}
          error={faltaElMotivo ? t.formularios.falta_un_dato_obligatorio : null}
        />
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={enviando}>{t.comun.cancelar}</Button>
          <Button onClick={confirmar} disabled={enviando}>
            {enviando ? tc.desactivando : tc.desactivar}
          </Button>
        </div>
      </div>
    </div>
  );
}
