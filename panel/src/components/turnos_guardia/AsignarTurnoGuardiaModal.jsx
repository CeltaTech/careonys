import { useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { asignarTurnoGuardia } from '../../lib/asignarTurnoGuardia';
import { avisar } from '../../lib/mensajeEmergente';
import { con } from '../../lib/textos';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useSugerenciasDeAsistentes } from '../../hooks/useSugerenciasDeAsistentes';
import { ListaDeAsistentes } from './ElegirAsistente';
import { AsignarConDocumentosModal } from '../../pages/turnos_guardia/AsignarConDocumentosModal';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

/* ASIGNAR UN TURNO DE GUARDIA QUE NO TIENE A NADIE

   Es la misma ventana en todos los lugares donde aparece un turno sin cubrir: la lista de turnos
   que quedaron sin nadie y la ficha del Servicio. Por eso vive acá y no adentro de ninguna de las
   dos pantallas.

   La lista propone primero a quien está libre, no se pisa con otro turno de guardia y no pasa su
   tope de horas. Elegido alguien con advertencias, se muestran antes de asignar y el botón dice
   «Asignar igual»: avisan, no frenan. Lo que sí frena es la base: si rechaza la asignación, queda
   rechazada. Con documentos pendientes, quien tiene el permiso puede repetirla con un motivo.

   Las sugerencias se piden por el id del turno: así la base devuelve el turno con todos sus
   Pacientes y su modalidad, venga de la pantalla que venga.

   `turnoGuardia` necesita `id`, `fecha`, `hora_inicio` y `hora_fin`. `pacientes` es la lista de
   `{ id, nombre }` que se muestra debajo del título. */
export function AsignarTurnoGuardiaModal({ turnoGuardia, pacientes = [], onClose, onAsignado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const puedeAsignarIgual = esAdminOSuperior(usuario?.rol) || puede('asignar_con_documentos_pendientes');
  const idsHuecos = useMemo(() => [turnoGuardia.id], [turnoGuardia.id]);
  // El Servicio y el turno de guardia salen de la base junto con el turno, venga de la pantalla
  // que venga; si la pantalla ya los tiene, se pasan igual.
  const sugerencias = useSugerenciasDeAsistentes({
    idsHuecos,
    servicioId: turnoGuardia.servicio_id ?? null,
    turnoGuardiaId: turnoGuardia.id,
  });
  const [asistenteId, setAsistenteId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [documentosPendientes, setDocumentosPendientes] = useState(null);
  const [asignandoIgual, setAsignandoIgual] = useState(false);

  const avisos = t.turnos_guardia.avisos;
  const advertencias = asistenteId ? sugerencias.advertenciasDe(asistenteId) : [];
  const nombres = pacientes.map((p) => p.nombre).filter(Boolean).join(', ');

  const asignar = (motivoExcepcion = null) => asignarTurnoGuardia(turnoGuardia.id, asistenteId, t, motivoExcepcion);

  async function guardar() {
    if (!asistenteId) return;
    setGuardando(true);
    setError(null);
    setDocumentosPendientes(null);
    const resultado = await asignar();
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      setDocumentosPendientes(resultado.documentosPendientes);
      return;
    }
    avisar(t.documentos_asistente.turno_guardia_asignado);
    onAsignado();
  }

  if (asignandoIgual && documentosPendientes) {
    return (
      <AsignarConDocumentosModal
        documentos={documentosPendientes}
        reintentar={asignar}
        onClose={() => setAsignandoIgual(false)}
        onAsignado={onAsignado}
      />
    );
  }

  return (
    <div className="panel-modal-fondo" onClick={guardando ? undefined : onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h3 id={modal.idTitulo}>{t.turnos_guardia.cobertura_panel.titulo}</h3>
        <p className="panel-mini">
          {`${turnoGuardia.fecha} · ${turnoGuardia.hora_inicio} – ${turnoGuardia.hora_fin}`}
          {nombres && ` · ${nombres}`}
        </p>

        <ListaDeAsistentes
          sugerencias={sugerencias}
          label={t.turnos_guardia.nuevo_turno_guardia.asistente}
          name="asistente-turno-vacante"
          value={asistenteId}
          onChange={(id) => { setAsistenteId(id); setError(null); setDocumentosPendientes(null); }}
          disabled={guardando}
        />

        {advertencias.length > 0 && (
          <Alert variant="warning">
            <b>{avisos.titulo}</b>
            {advertencias.map((a, n) => (
              <div key={`${a.clave}-${n}`}>{con(avisos[a.clave], a.valores)}</div>
            ))}
          </Alert>
        )}

        {error && (
          <Alert variant="error">
            {error}
            {documentosPendientes && puedeAsignarIgual && (
              <>
                {' '}
                <Button variant="secondary" onClick={() => setAsignandoIgual(true)}>
                  {t.documentos_asistente.asignar_igual}
                </Button>
              </>
            )}
          </Alert>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={guardar} disabled={guardando || !asistenteId}>
            {advertencias.length > 0 ? avisos.asignar_igual : t.documentos_asistente.asignar}
          </Button>
        </div>
      </div>
    </div>
  );
}
