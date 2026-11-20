import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useMotivosDeResolucion } from '../../hooks/useMotivosDeResolucion';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { interrumpirCobertura, cancelarCoberturaDesde } from '../../lib/coberturaDelServicio';
import { hoyISO } from '../../lib/horarios';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* Pausar, suspender o cancelar la cobertura.
   ==========================================================================

   Una sola ventana para las tres acciones y las cuatro cosas a las que alcanzan: el Servicio,
   una Prestación, un turno de guardia recurrente o un solo turno de guardia.

   - Pausa: pide la fecha de vuelta. Suspensión: la fecha de vuelta es opcional.
   - Cancelación: sólo de una Prestación o de un recurrente, desde una fecha, y antes de guardar
     se confirma, porque no tiene vuelta atrás.
   - Un solo turno de guardia se interrumpe el día que cae: no pide fechas.

   El motivo sale del catálogo de la Prestadora para esa acción, y el detalle se pide sólo si el
   motivo lo exige. Qué turnos de guardia se tocan lo decide la base. */
export function CoberturaModal({ tipo, alcance, servicioId, prestacionId = null, serieId = null, turnoGuardiaId = null, titulo, onClose, onHecho }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const textos = t.servicios.cobertura;
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const { filas: motivos, estado: estadoMotivos, error: errorMotivos } = useMotivosDeResolucion(
    prestadoraId,
    'interrupciones_de_cobertura',
    tipo,
  );

  const pideFechas = alcance !== 'turno_guardia';
  const pideVuelta = pideFechas && tipo !== 'cancelacion';
  const vueltaObligatoria = tipo === 'pausa';

  const [desde, setDesde] = useState(hoyISO());
  const [vuelta, setVuelta] = useState('');
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const elegido = motivos.find((m) => m.id === motivoId) ?? null;
  const faltaDesde = pideFechas && !desde;
  const faltaVuelta = pideVuelta && vueltaObligatoria && !vuelta;
  const faltaMotivo = !elegido;
  const faltaDetalle = Boolean(elegido?.pide_detalle) && !detalle.trim();

  const faltantes = [
    faltaDesde && 'field-cobertura_desde',
    faltaVuelta && 'field-cobertura_vuelta',
    faltaMotivo && 'field-cobertura_motivo',
    faltaDetalle && 'field-cobertura_detalle',
  ].filter(Boolean);

  const obligatorio = (falta) => (intentado && falta ? t.formularios.falta_un_dato_obligatorio : undefined);

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    if (faltantes.length > 0) {
      document.getElementById(faltantes[0])?.focus();
      return;
    }
    if (tipo === 'cancelacion' && !(await confirmarDestructivo({ texto: textos.confirmar_cancelacion, confirmar: textos.titulo_cancelacion }))) {
      return;
    }

    setGuardando(true);
    setError(null);
    const detalleFinal = elegido.pide_detalle ? detalle.trim() : null;
    try {
      if (tipo === 'cancelacion') {
        await cancelarCoberturaDesde({ alcance, prestacionId, serieId, desde, motivoId: elegido.id, detalle: detalleFinal });
      } else {
        await interrumpirCobertura({
          tipo,
          alcance,
          servicioId,
          prestacionId,
          serieId,
          turnoGuardiaId,
          desde: pideFechas ? desde : null,
          vuelta: pideVuelta && vuelta ? vuelta : null,
          motivoId: elegido.id,
          detalle: detalleFinal,
        });
      }
    } catch (falla) {
      setGuardando(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    setGuardando(false);
    onHecho();
  }

  const etiquetaBoton = textos[`titulo_${tipo}`];

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>
          {etiquetaBoton}: {titulo ?? textos[`alcance_${alcance}`]}
        </h2>

        {(error || errorMotivos) && <Alert variant="error">{error || mensajeDeError(errorMotivos, t)}</Alert>}
        {estadoMotivos === 'vacio' && <Alert variant="warning">{textos.sin_motivos}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          {pideFechas && (
            <FormField
              label={textos.desde}
              name="cobertura_desde"
              type="date"
              required
              min={hoyISO()}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              disabled={guardando}
              error={obligatorio(faltaDesde)}
            />
          )}

          {pideVuelta && (
            <FormField
              label={vueltaObligatoria ? textos.vuelta : textos.vuelta_opcional}
              name="cobertura_vuelta"
              type="date"
              required={vueltaObligatoria}
              min={desde || hoyISO()}
              value={vuelta}
              onChange={(e) => setVuelta(e.target.value)}
              disabled={guardando}
              error={obligatorio(faltaVuelta)}
            />
          )}

          <FormField
            label={textos.motivo}
            name="cobertura_motivo"
            type="select"
            required
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
            disabled={guardando || estadoMotivos !== 'listo'}
            error={obligatorio(faltaMotivo)}
          >
            <option value="">
              {estadoMotivos === 'cargando' ? t.comun.cargando : t.turnos_guardia.nuevo_turno_guardia.elegir}
            </option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </FormField>

          {elegido?.pide_detalle && (
            <FormField
              label={textos.detalle}
              name="cobertura_detalle"
              type="textarea"
              required
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              disabled={guardando}
              error={obligatorio(faltaDetalle)}
            />
          )}

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando || estadoMotivos !== 'listo'}>
              {guardando ? textos.guardando : etiquetaBoton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
