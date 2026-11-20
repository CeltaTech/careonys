import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useMotivosDeResolucion } from '../../hooks/useMotivosDeResolucion';
import { cambiarPeriodoDelServicio, interrupcionesVigentes, reanudarCobertura } from '../../lib/coberturaDelServicio';
import { fechaVisible } from '../../lib/fechaVisible';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { CoberturaModal } from './CoberturaModal';

/* El período del Servicio y sus pausas y suspensiones vigentes.
   ==========================================================================

   - El período: primer día y último día. Sin último día, la duración es indeterminada. Lo cambia
     quien gestiona Servicios, mientras el Servicio está vigente.
   - Pausar y suspender el Servicio entero, para quien gestiona su cobertura: la administración o
     el Coordinador que lo coordina. La base aplica el mismo corte.
   - Las pausas y suspensiones que todavía rigen, de cualquier alcance, cada una con su botón para
     reanudar desde hoy. Las que puso una hospitalización se levantan al cerrar la hospitalización. */
export function CoberturaDelServicio({ servicio, prestaciones = [], cambiaElPeriodo, gestionaCobertura, onCambio }) {
  const { t, locale } = useLocale();
  const textos = t.servicios.cobertura;
  const periodo = t.servicios.periodo;
  const prestadoraId = usePrestadoraActual();
  const { filas: motivos } = useMotivosDeResolucion(prestadoraId, 'interrupciones_de_cobertura');

  const [interrupciones, setInterrupciones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [reanudandoId, setReanudandoId] = useState(null);
  const [accion, setAccion] = useState(null);
  const [cambiandoPeriodo, setCambiandoPeriodo] = useState(false);

  const vigente = servicio.estado === 'vigente';

  const cargar = useCallback(async () => {
    if (!gestionaCobertura) return;
    setEstado('cargando');
    setErrorCarga(null);
    try {
      const filas = await interrupcionesVigentes(servicio.id);
      setInterrupciones(filas ?? []);
      setEstado((filas ?? []).length === 0 ? 'vacio' : 'listo');
    } catch (falla) {
      setErrorCarga(falla);
      setEstado('error');
    }
  }, [gestionaCobertura, servicio.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreDelMotivo = useMemo(() => new Map(motivos.map((m) => [m.id, m.nombre])), [motivos]);
  const nombreDePrestacion = useMemo(() => new Map(prestaciones.map((p) => [p.id, p.tipo_servicio])), [prestaciones]);

  function queAlcanza(i) {
    const alcance = textos[`alcance_${i.alcance}`];
    if (i.alcance === 'prestacion' && nombreDePrestacion.has(i.prestacion_id)) return `${alcance}: ${nombreDePrestacion.get(i.prestacion_id)}`;
    return alcance;
  }

  async function reanudar(i) {
    setErrorAccion(null);
    setReanudandoId(i.id);
    try {
      await reanudarCobertura(i.id);
    } catch (falla) {
      setReanudandoId(null);
      setErrorAccion(mensajeDeError(falla, t));
      return;
    }
    setReanudandoId(null);
    await cargar();
    onCambio?.();
  }

  async function hecho() {
    setAccion(null);
    await cargar();
    onCambio?.();
  }

  const textoDelPeriodo = servicio.vigente_hasta
    ? con(periodo.del_al, { desde: fechaVisible(servicio.vigente_desde, locale), hasta: fechaVisible(servicio.vigente_hasta, locale) })
    : `${con(periodo.desde_el, { desde: fechaVisible(servicio.vigente_desde, locale) })} · ${periodo.indeterminado}`;

  return (
    <>
      <div className="servicios-dato">
        <span className="panel-mini">{periodo.titulo}</span>
        <b>{textoDelPeriodo}</b>
        {cambiaElPeriodo && vigente && (
          <Button variant="secondary" onClick={() => setCambiandoPeriodo(true)}>
            {periodo.cambiar}
          </Button>
        )}
      </div>

      {gestionaCobertura && (
        <div className="servicios-dato">
          <span className="panel-mini">{textos.titulo}</span>
          {errorAccion && <Alert variant="error">{errorAccion}</Alert>}
          {estado === 'cargando' && <span>{t.comun.cargando}</span>}
          {estado === 'error' && <Alert variant="error">{mensajeDeError(errorCarga, t)}</Alert>}
          {estado === 'vacio' && <span>{textos.sin_interrupciones}</span>}
          {estado === 'listo' &&
            interrupciones.map((i) => (
              <div key={i.id}>
                <b>{textos[`tipo_${i.tipo}`]}</b> · {queAlcanza(i)} · {con(textos.desde_el, { fecha: fechaVisible(i.desde, locale) })} ·{' '}
                {i.vuelta ? con(textos.vuelve_el, { fecha: fechaVisible(i.vuelta, locale) }) : textos.sin_vuelta}
                {i.hospitalizacion_id ? ` · ${textos.por_hospitalizacion}` : i.motivo_id && nombreDelMotivo.has(i.motivo_id) ? ` · ${nombreDelMotivo.get(i.motivo_id)}` : ''}
                {i.detalle ? ` · ${i.detalle}` : ''}
                {!i.hospitalizacion_id && (
                  <>
                    {' '}
                    <Button variant="secondary" onClick={() => reanudar(i)} disabled={reanudandoId !== null}>
                      {reanudandoId === i.id ? textos.reanudando : textos.reanudar}
                    </Button>
                  </>
                )}
              </div>
            ))}
          {vigente && (
            <div className="panel-filtros">
              <Button variant="secondary" onClick={() => setAccion('pausa')}>
                {textos.pausar}
              </Button>
              <Button variant="secondary" onClick={() => setAccion('suspension')}>
                {textos.suspender}
              </Button>
            </div>
          )}
        </div>
      )}

      {accion && (
        <CoberturaModal tipo={accion} alcance="servicio" servicioId={servicio.id} onClose={() => setAccion(null)} onHecho={hecho} />
      )}

      {cambiandoPeriodo && (
        <PeriodoDelServicioModal
          servicio={servicio}
          onClose={() => setCambiandoPeriodo(false)}
          onHecho={() => {
            setCambiandoPeriodo(false);
            onCambio?.();
          }}
        />
      )}
    </>
  );
}

function PeriodoDelServicioModal({ servicio, onClose, onHecho }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const periodo = t.servicios.periodo;
  const [desde, setDesde] = useState(servicio.vigente_desde ?? '');
  const [hasta, setHasta] = useState(servicio.vigente_hasta ?? '');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const faltaDesde = !desde;
  const hastaAntes = Boolean(desde && hasta && hasta < desde);

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    if (faltaDesde) {
      document.getElementById('field-periodo_desde')?.focus();
      return;
    }
    if (hastaAntes) {
      document.getElementById('field-periodo_hasta')?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await cambiarPeriodoDelServicio(servicio.id, desde, hasta || null);
    } catch (falla) {
      setGuardando(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    setGuardando(false);
    onHecho();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{periodo.cambiar}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label={periodo.desde}
            name="periodo_desde"
            type="date"
            required
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            disabled={guardando}
            error={intentado && faltaDesde ? t.formularios.falta_un_dato_obligatorio : undefined}
          />
          <FormField
            label={periodo.hasta_opcional}
            name="periodo_hasta"
            type="date"
            min={desde || undefined}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            disabled={guardando}
            error={intentado && hastaAntes ? periodo.hasta_antes_del_desde : undefined}
          />
          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? periodo.guardando : periodo.guardar}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
