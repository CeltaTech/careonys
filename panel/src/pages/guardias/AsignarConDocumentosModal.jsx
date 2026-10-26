import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { mensajeDeDocumentos } from '../../lib/documentos';
import { avisar } from '../../lib/mensajeEmergente';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';

/* Asignar un turno aunque el Asistente tenga documentos que le impiden trabajar.

   Lo abre quien tiene el permiso «Asignar con documentos pendientes», sobre una asignación que la
   base acaba de frenar por eso. El motivo es obligatorio: el backend lo vuelve a exigir y lo deja
   registrado. Nunca se ofrece para un turno fijo: la serie se asigna sin excepción.

   `reintentar(motivo)` repite la misma asignación que fue frenada, con el motivo, y devuelve
   `{ error, documentosPendientes }` como `asignarTurno`. */
export function AsignarConDocumentosModal({ documentos, reintentar, onClose, onAsignado }) {
  const { t } = useLocale();
  const td = t.documentos_asistente;
  const modal = useModalAccesible(onClose);
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState(null);

  async function asignar() {
    if (!motivo.trim()) {
      setIntentado(true);
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setAsignando(true);
    setError(null);
    const { error: falla } = await reintentar(motivo.trim());
    if (falla) {
      setError(falla);
      setAsignando(false);
      return;
    }
    avisar(td.turno_asignado);
    onAsignado();
  }

  return (
    <div className="panel-modal-fondo" onClick={asignando ? undefined : onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{td.excepcion_titulo}</h2>
        <Alert variant="warning">{mensajeDeDocumentos({ motivo: 'documentos_bloquean', documentos }, t)}</Alert>
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          label={t.comun.motivo}
          name="motivo_excepcion"
          type="textarea"
          required
          value={motivo}
          error={intentado && !motivo.trim() ? t.formularios.falta_un_dato_obligatorio : null}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={asignando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={asignar} disabled={asignando}>
            {td.asignar}
          </Button>
        </div>
      </div>
    </div>
  );
}
