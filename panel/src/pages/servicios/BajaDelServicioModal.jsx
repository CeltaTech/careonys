import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useMotivosCierreServicio } from '../../hooks/useMotivosCierreServicio';
import { useListaDeComprobacionBaja } from '../../hooks/useListaDeComprobacionBaja';
import { nombreMotivo, valorGuardado } from '../../lib/motivoDeCierre';
import { darDeBajaElServicio } from '../../lib/apiServicios';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* La baja de un Servicio entero.
   ==========================================================================

   La hace la base en una sola operación (`dar_de_baja_el_servicio`): cierra la atención de todos
   sus Pacientes, da de baja sus Prestaciones vigentes, cierra sus series y cancela las guardias
   que no tienen Asistente. Si queda alguna guardia asignada, la baja no sale: primero se cancela o
   se reasigna.

   Antes de darla, quien la da marca cada renglón de la Lista de comprobación que armó la
   Prestadora. Sin todos marcados no sale. La deuda del Cliente no la frena: la base la anota y el
   backend le avisa a créditos y cobranzas. */
export function BajaDelServicioModal({ servicioId, onClose, onDadoDeBaja }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const { filas: motivos, estado: estadoMotivos, error: errorMotivos } = useMotivosCierreServicio(prestadoraId);
  const { filas: lista, estado: estadoLista, error: errorLista } = useListaDeComprobacionBaja(prestadoraId);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [marcados, setMarcados] = useState(() => new Set());
  const [intentado, setIntentado] = useState(false);
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [error, setError] = useState(null);

  const elegido = motivos.find((m) => m.id === motivoId) ?? null;
  const faltaMotivo = intentado && !elegido;
  const faltaDetalle = intentado && Boolean(elegido?.pide_detalle) && !detalle.trim();
  const faltaMarcar = (renglon) => intentado && !marcados.has(renglon.id);
  const cargando = estadoMotivos === 'cargando' || estadoLista === 'cargando';

  function marcar(renglonId, marcado) {
    setMarcados((anteriores) => {
      const nuevos = new Set(anteriores);
      if (marcado) nuevos.add(renglonId);
      else nuevos.delete(renglonId);
      return nuevos;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    const primerRenglonSinMarcar = lista.find((r) => !marcados.has(r.id));
    if (!elegido) {
      document.getElementById('field-motivo_baja')?.focus();
      return;
    }
    if (elegido.pide_detalle && !detalle.trim()) {
      document.getElementById('field-detalle_baja')?.focus();
      return;
    }
    if (primerRenglonSinMarcar) {
      document.getElementById(`field-comprobacion_${primerRenglonSinMarcar.id}`)?.focus();
      return;
    }
    if (!(await confirmarDestructivo(t.servicios.baja.confirmar))) return;

    setDandoDeBaja(true);
    setError(null);
    try {
      await darDeBajaElServicio(servicioId, {
        motivo: valorGuardado(elegido),
        motivoDetalle: elegido.pide_detalle ? detalle.trim() : null,
        comprobaciones: [...marcados],
      });
    } catch (falla) {
      setDandoDeBaja(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    setDandoDeBaja(false);
    onDadoDeBaja();
  }

  const errorDeCarga = errorMotivos || errorLista;

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.servicios.baja.titulo}</h2>

        {(error || errorDeCarga) && <Alert variant="error">{error || mensajeDeError(errorDeCarga, t)}</Alert>}

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

          {lista.map((renglon) => (
            <FormField
              key={renglon.id}
              label={renglon.nombre}
              name={`comprobacion_${renglon.id}`}
              type="checkbox"
              required
              checked={marcados.has(renglon.id)}
              onChange={(e) => marcar(renglon.id, e.target.checked)}
              disabled={dandoDeBaja}
              error={faltaMarcar(renglon) ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          ))}

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={dandoDeBaja}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={dandoDeBaja || cargando || Boolean(errorDeCarga)}>
              {dandoDeBaja ? t.servicios.baja.dando_de_baja : t.servicios.baja.boton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
