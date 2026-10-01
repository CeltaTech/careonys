import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { EstadoLista } from '../components/layout/EstadoLista';
import { diasComputados } from '../lib/diasDeAusencia';
import { mensajeDeError } from '../lib/errores';
import { con } from '../lib/textos';
import { hoyISO, sumarDias } from '../lib/horarios';
import '../styles/molde-paginas.css';
import './ausencias-coordinador.css';

/* Las ausencias de un Coordinador.
   ==========================================================================

   Las carga el Administrador, que es también a quien el sistema le pregunta por la vuelta cuando
   pasa la fecha prevista. Mientras dura, otro Coordinador lo cubre y ve la zona del ausente: eso lo
   resuelve la base, con la misma función que decide qué Asistentes alcanza cada Coordinador. Sin
   nadie elegido, lo cubre el Administrador, que ya alcanza todo.

   La fecha prevista es obligatoria y cada cambio queda en el historial, que anota la base. La
   vuelta deja el último día de ausencia en el anterior, igual que la de un Asistente. */

const TIPOS = ['enfermedad_inculpable', 'accidente_inculpable', 'otra_licencia', 'ausencia_no_justificada'];
const VACIA = { tipo: 'enfermedad_inculpable', fecha_inicio: '', fecha_fin: '', coordinador_que_cubre_id: '' };

export function AusenciasDelCoordinador({ usuario, otrosCoordinadores }) {
  const { t, locale } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const textos = t.asistentes.ausencias;
  const [ausencias, setAusencias] = useState([]);
  const [cambiosDeFecha, setCambiosDeFecha] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState(VACIA);
  const [fechaForm, setFechaForm] = useState({});

  const recargar = useCallback(async () => {
    setEstado('cargando');
    const { data, error: errorAusencias } = await supabase
      .from('ausencias')
      .select('id, tipo, fecha_inicio, fecha_fin, fecha_vuelta_real, dias_computados, coordinador_que_cubre_id')
      .eq('usuario_id', usuario.id)
      .order('fecha_inicio', { ascending: false });
    if (errorAusencias) {
      setError(mensajeDeError(errorAusencias, t));
      setEstado('error');
      return;
    }
    const porAusencia = {};
    if (data?.length) {
      const { data: cambios, error: errorCambios } = await supabase
        .from('ausencias_cambios_de_fecha')
        .select('id, ausencia_id, fecha_anterior, fecha_nueva, cambiado_at')
        .in('ausencia_id', data.map((a) => a.id))
        .order('cambiado_at');
      if (errorCambios) {
        setError(mensajeDeError(errorCambios, t));
        setEstado('error');
        return;
      }
      for (const cambio of cambios ?? []) (porAusencia[cambio.ausencia_id] ??= []).push(cambio);
    }
    setAusencias(data ?? []);
    setCambiosDeFecha(porAusencia);
    setError(null);
    setEstado(data?.length ? 'listo' : 'vacio');
  }, [usuario.id, t]);

  useEffect(() => { recargar(); }, [recargar]);

  function fechaVisible(fecha) {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale);
  }

  function nombreDe(id) {
    return otrosCoordinadores.find((c) => c.id === id)?.nombre ?? '';
  }

  async function registrar() {
    if (!nueva.fecha_inicio || !nueva.fecha_fin) return;
    setGuardando(true);
    setError(null);
    const { error: errorAlta } = await supabase.from('ausencias').insert({
      prestadora_id: prestadoraId,
      usuario_id: usuario.id,
      tipo: nueva.tipo,
      fecha_inicio: nueva.fecha_inicio,
      fecha_fin: nueva.fecha_fin,
      coordinador_que_cubre_id: nueva.coordinador_que_cubre_id || null,
      dias_computados: diasComputados(nueva),
    });
    setGuardando(false);
    if (errorAlta) {
      setError(mensajeDeError(errorAlta, t));
      return;
    }
    setNueva(VACIA);
    recargar();
  }

  async function moverElFin(ausencia, { fechaFin, fechaVuelta = null }) {
    if (!fechaFin || fechaFin < ausencia.fecha_inicio) return;
    setGuardando(true);
    setError(null);
    const cambios = { fecha_fin: fechaFin, dias_computados: diasComputados({ ...ausencia, fecha_fin: fechaFin }) };
    if (fechaVuelta) cambios.fecha_vuelta_real = fechaVuelta;
    const { error: errorUpdate } = await supabase.from('ausencias').update(cambios).eq('id', ausencia.id);
    setGuardando(false);
    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      return;
    }
    setFechaForm((prev) => ({ ...prev, [ausencia.id]: {} }));
    recargar();
  }

  function registrarVuelta(ausencia) {
    const vuelta = fechaForm[ausencia.id]?.vuelta;
    if (!vuelta || vuelta <= ausencia.fecha_inicio) return;
    return moverElFin(ausencia, { fechaFin: sumarDias(vuelta, -1), fechaVuelta: vuelta });
  }

  function cambiarFecha(ausenciaId, campo, valor) {
    setFechaForm((prev) => ({ ...prev, [ausenciaId]: { ...prev[ausenciaId], [campo]: valor } }));
  }

  return (
    <div className="molde-pila ausencias-coord">
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.titulo}</h2>
          {estado === 'listo' && <span className="panel-mini">{ausencias.length}</span>}
        </div>
        {error && estado !== 'error' && <Alert variant="error">{error}</Alert>}
        <EstadoLista estado={estado} error={error} recargar={recargar}>
          {ausencias.map((a) => (
            <div key={a.id} className="ausencias-coord-renglon">
              <div className="ausencias-coord-cabeza">
                <div>
                  <b>{textos[`tipo_${a.tipo}`]}</b>
                  <span className="panel-mini">
                    {fechaVisible(a.fecha_inicio)}
                    {a.fecha_vuelta_real
                      ? ` · ${con(textos.volvio_el, { fecha: fechaVisible(a.fecha_vuelta_real) })}`
                      : ` → ${fechaVisible(a.fecha_fin)}`}
                  </span>
                  {a.coordinador_que_cubre_id && (
                    <span className="panel-mini">{con(t.usuarios_panel.lo_cubre, { nombre: nombreDe(a.coordinador_que_cubre_id) })}</span>
                  )}
                  {a.dias_computados !== null && a.dias_computados !== undefined && (
                    <span className="panel-mini">{con(textos.dias_computados, { n: a.dias_computados })}</span>
                  )}
                </div>
                {!a.fecha_vuelta_real && (
                  <span className={`badge ${a.fecha_fin < hoyISO() ? 'badge-atencion' : 'badge-info'}`}>{textos.prevista}</span>
                )}
              </div>
              {!a.fecha_vuelta_real && a.fecha_fin < hoyISO() && (
                <Alert variant="warning">{textos.vuelta_sin_confirmar}</Alert>
              )}
              {!a.fecha_vuelta_real && (
                <>
                  <div className="molde-formgrid">
                    <FormField
                      label={textos.nueva_fecha_prevista}
                      name={`prevista-${a.id}`}
                      type="date"
                      value={fechaForm[a.id]?.prevista || ''}
                      onChange={(e) => cambiarFecha(a.id, 'prevista', e.target.value)}
                    />
                    <FormField
                      label={textos.fecha_vuelta}
                      name={`vuelta-${a.id}`}
                      type="date"
                      value={fechaForm[a.id]?.vuelta || ''}
                      onChange={(e) => cambiarFecha(a.id, 'vuelta', e.target.value)}
                    />
                  </div>
                  <div className="molde-acciones">
                    <Button
                      variant="secondary"
                      onClick={() => moverElFin(a, { fechaFin: fechaForm[a.id]?.prevista })}
                      disabled={guardando || !fechaForm[a.id]?.prevista}
                    >
                      {textos.cambiar_fecha_prevista}
                    </Button>
                    <Button variant="secondary" onClick={() => registrarVuelta(a)} disabled={guardando || !fechaForm[a.id]?.vuelta}>
                      {textos.registrar_vuelta}
                    </Button>
                  </div>
                </>
              )}
              {cambiosDeFecha[a.id]?.length > 0 && (
                <div className="ausencias-coord-historial">
                  <b>{textos.historial_fechas}</b>
                  {cambiosDeFecha[a.id].map((c) => (
                    <span key={c.id} className="panel-mini">
                      {con(textos.cambio_de_fecha, {
                        antes: fechaVisible(c.fecha_anterior),
                        despues: fechaVisible(c.fecha_nueva),
                        cuando: new Date(c.cambiado_at).toLocaleDateString(locale),
                      })}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </EstadoLista>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.registrar_nueva}</h2>
        </div>
        <div className="molde-formgrid">
          <FormField label={textos.tipo} name="tipo-coordinador" type="select" value={nueva.tipo} onChange={(e) => setNueva((f) => ({ ...f, tipo: e.target.value }))}>
            {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{textos[`tipo_${tipo}`]}</option>)}
          </FormField>
          <FormField
            label={t.usuarios_panel.coordinador_que_cubre}
            name="cubre-coordinador"
            type="select"
            value={nueva.coordinador_que_cubre_id}
            onChange={(e) => setNueva((f) => ({ ...f, coordinador_que_cubre_id: e.target.value }))}
          >
            <option value="">{t.guardias.nueva_guardia.elegir}</option>
            {otrosCoordinadores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FormField>
          <FormField label={textos.fecha_inicio} name="inicio-coordinador" type="date" value={nueva.fecha_inicio} onChange={(e) => setNueva((f) => ({ ...f, fecha_inicio: e.target.value }))} required />
          <FormField label={textos.fecha_fin} name="fin-coordinador" type="date" value={nueva.fecha_fin} onChange={(e) => setNueva((f) => ({ ...f, fecha_fin: e.target.value }))} required />
        </div>
        <div className="molde-acciones">
          <Button onClick={registrar} disabled={guardando || !nueva.fecha_inicio || !nueva.fecha_fin}>
            {guardando ? t.comun.guardando : textos.registrar_nueva}
          </Button>
        </div>
      </section>
    </div>
  );
}
