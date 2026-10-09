import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { ESTADO_ACTIVO } from '../../lib/candidatos';
import { minutosDeDemoraTolerados } from '../../lib/llegadaEstimada';
import { mensajeDeError } from '../../lib/errores';
import { esMotivoDeFabrica, nombreMotivo } from '../../lib/motivoDeCierre';
import { con } from '../../lib/textos';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { ElCalculoDeCandidatos } from './ElCalculoDeCandidatos';
import { TurnosSinCubrirTab } from './TurnosSinCubrirTab';
import '../../styles/molde-paginas.css';
import './elcuidado.css';

/* Las reglas del cuidado en sí: cómo se arman los Servicios y sus guardias, qué
   signos vitales se toman. */
export function ConfiguracionCuidado() {
  return (
    <div className="molde-pila">
      <TabServicios />
      <ElCalculoDeCandidatos />
      <TurnosSinCubrirTab />
      <TabVitales />
    </div>
  );
}

const ROLES_RELEVO = ['suplente', 'franquero', 'emergencia', 'familiar'];

const TIPOS_PERSONAL_EMERGENCIA = ['franquero', 'emergencia'];

function TabServicios() {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [niveles, setNiveles] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nivelEditando, setNivelEditando] = useState(null);
  const [actualizandoId, setActualizandoId] = useState(null);

  const [diasGeneracion, setDiasGeneracion] = useState('');
  const [guardandoHorizonte, setGuardandoHorizonte] = useState(false);
  const [horizonteGuardado, setHorizonteGuardado] = useState(false);

  const [ausenciaActiva, setAusenciaActiva] = useState(true);
  const [minutosTolerancia, setMinutosTolerancia] = useState('');
  const [metrosTolerancia, setMetrosTolerancia] = useState('');
  // Las dos decisiones del pase de guardia (pendiente #113). Viven en la misma fila que las de
  // arriba y contestan la misma pregunta —cuándo cuenta que el Asistente llegó al domicilio—,
  // así que se guardan con el mismo botón.
  const [segundosCodigo, setSegundosCodigo] = useState('');
  const [minutosCodigoPrestadora, setMinutosCodigoPrestadora] = useState('');
  const [guardandoAusencia, setGuardandoAusencia] = useState(false);
  const [ausenciaGuardada, setAusenciaGuardada] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [{ niveles: filas }, { dias_generacion_series_guardia }, { configuracion }] = await Promise.all([
        llamarApi('/escalada-relevo'),
        llamarApi('/guardias/horizonte-generacion'),
        llamarApi('/ausencia-automatica'),
      ]);
      setNiveles(filas);
      setDiasGeneracion(String(dias_generacion_series_guardia));
      setAusenciaActiva(configuracion.activo);
      setMinutosTolerancia(String(configuracion.minutos_tolerancia_checkin));
      setMetrosTolerancia(String(configuracion.metros_tolerancia_checkin));
      setSegundosCodigo(String(configuracion.segundos_codigo_en_pantalla));
      setMinutosCodigoPrestadora(String(configuracion.minutos_codigo_de_la_prestadora));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function guardarHorizonte() {
    setGuardandoHorizonte(true);
    setError(null);
    setHorizonteGuardado(false);
    try {
      await llamarApi('/guardias/horizonte-generacion', {
        method: 'PATCH',
        body: JSON.stringify({ dias: Number(diasGeneracion) }),
      });
      setHorizonteGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoHorizonte(false);
    }
  }

  async function guardarAusencia() {
    setGuardandoAusencia(true);
    setError(null);
    setAusenciaGuardada(false);
    try {
      await llamarApi('/ausencia-automatica', {
        method: 'PATCH',
        body: JSON.stringify({
          activo: ausenciaActiva,
          minutos_tolerancia_checkin: Number(minutosTolerancia),
          metros_tolerancia_checkin: Number(metrosTolerancia),
          segundos_codigo_en_pantalla: Number(segundosCodigo),
          minutos_codigo_de_la_prestadora: Number(minutosCodigoPrestadora),
        }),
      });
      setAusenciaGuardada(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoAusencia(false);
    }
  }

  async function borrar(fila) {
    if (!(await confirmarDestructivo(t.configuracion.escalada_confirmar_borrar))) return;
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/escalada-relevo/${fila.id}`, { method: 'DELETE' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.servicios_horizonte_titulo}</h2>
        </div>
        {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
        {horizonteGuardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <FormField
            label={t.configuracion.servicios_horizonte_dias}
            name="dias_generacion"
            type="number"
            value={diasGeneracion}
            onChange={(e) => { setDiasGeneracion(e.target.value); setHorizonteGuardado(false); }}
          />
        </div>
        <div className="molde-acciones">
          <Button onClick={guardarHorizonte} disabled={guardandoHorizonte || !diasGeneracion}>
            {guardandoHorizonte ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.servicios_ausencia_titulo}</h2>
        </div>
        {ausenciaGuardada && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField label={t.configuracion.servicios_ausencia_activa} name="ausencia_activa" type="checkbox" checked={ausenciaActiva} onChange={(e) => { setAusenciaActiva(e.target.checked); setAusenciaGuardada(false); }} />
          </div>
          <FormField
            label={t.configuracion.servicios_ausencia_minutos}
            name="minutos_tolerancia_checkin"
            type="number"
            value={minutosTolerancia}
            onChange={(e) => { setMinutosTolerancia(e.target.value); setAusenciaGuardada(false); }}
          />
          <FormField
            label={t.configuracion.servicios_ausencia_metros}
            name="metros_tolerancia_checkin"
            type="number"
            value={metrosTolerancia}
            onChange={(e) => { setMetrosTolerancia(e.target.value); setAusenciaGuardada(false); }}
          />
          {/* El pase de guardia (pendiente #113). Va en la misma tarjeta y con el mismo botón
              porque es la misma fila de la base y la misma pregunta: qué cuenta como haber
              llegado al domicilio. Dos botones harían creer que una decisión se puede guardar
              sin la otra. */}
          <div className="molde-ancho">
            <h3>{t.configuracion.servicios_pase_titulo}</h3>
          </div>
          <FormField
            label={t.configuracion.servicios_pase_segundos}
            name="segundos_codigo_en_pantalla"
            type="number"
            value={segundosCodigo}
            onChange={(e) => { setSegundosCodigo(e.target.value); setAusenciaGuardada(false); }}
          />
          <FormField
            label={t.configuracion.servicios_pase_minutos}
            name="minutos_codigo_de_la_prestadora"
            type="number"
            value={minutosCodigoPrestadora}
            onChange={(e) => { setMinutosCodigoPrestadora(e.target.value); setAusenciaGuardada(false); }}
          />
        </div>
        <div className="molde-acciones">
          <Button
            onClick={guardarAusencia}
            disabled={guardandoAusencia || !minutosTolerancia || !metrosTolerancia || !segundosCodigo || !minutosCodigoPrestadora}
          >
            {guardandoAusencia ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.servicios_escalada_titulo}</h2>
          {/* El atraso que rige hoy (pendiente #101) se muestra porque el número se usa aunque
              no haya ningún nivel cargado. Sale de `minutosDeDemoraTolerados`, la misma función
              que usa el backend, así que la pantalla no puede decir uno y el sistema usar otro. */}
          <div className="cuidado-titulo-derecha">
            <span className="panel-mini">
              {con(t.configuracion.escalada_demora_en_uso, { minutos: minutosDeDemoraTolerados(niveles) })}
            </span>
            <Button onClick={() => setCreandoNuevo(true)}>{t.configuracion.escalada_nuevo_nivel}</Button>
          </div>
        </div>
        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && niveles.length === 0} recargar={recargar} mensajeVacio={t.configuracion.escalada_vacio}>
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.configuracion.escalada_col_nivel}</th>
                <th>{t.configuracion.escalada_col_minutos}</th>
                <th>{t.configuracion.escalada_col_orden}</th>
                <th>{t.configuracion.escalada_col_mensaje}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {niveles.map((n) => (
                <tr key={n.id}>
                  <td>{n.nivel}</td>
                  <td>{n.minutos_demora ?? '—'}</td>
                  <td>{(n.orden_prioridad || []).map((r) => t.configuracion[`escalada_rol_${r}`]).join(' → ') || '—'}</td>
                  <td>{n.plantilla_mensaje}</td>
                  <td>
                    {/* Cada botón dice a qué nivel se refiere: fuera del renglón, «Editar» solo
                        no dice nada, y esta tabla se lee con lector de pantalla igual que las
                        demás del Panel. */}
                    <div className="cuidado-acciones-fila">
                      <Button
                        variant="secondary"
                        onClick={() => setNivelEditando(n)}
                        disabled={actualizandoId === n.id}
                        aria-label={con(t.configuracion.escalada_editar_nivel_numero, { nivel: n.nivel })}
                      >
                        {t.comun.editar}
                      </Button>
                      <Button variant="secondary" onClick={() => borrar(n)} disabled={actualizandoId === n.id}>{t.comun.borrar}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {/* Un solo formulario para crear y para editar. Si fueran dos, el día que se agregue un
          campo habría que acordarse de los dos, y el que se olvide queda sin él. */}
      {creandoNuevo && (
        <NivelEscalada onClose={() => setCreandoNuevo(false)} onGuardado={() => { setCreandoNuevo(false); recargar(); }} />
      )}
      {nivelEditando && (
        <NivelEscalada
          nivelExistente={nivelEditando}
          onClose={() => setNivelEditando(null)}
          onGuardado={() => { setNivelEditando(null); recargar(); }}
        />
      )}

      <TabServiciosPersonalEmergencia />
      <TabServiciosMotivosAvisoPrevio />
      <TabServiciosMotivosCierre />
      <TabServiciosEtapasIncorporacion />
    </>
  );
}

/* Por qué se cierra la atención de un Paciente. La Prestadora nace con siete motivos y a partir
   de ahí la lista es suya: apaga los que no usa, borra los que le sobran y agrega los propios.
   Los que trae el producto se muestran traducidos y los de ella, tal como los escribió; el
   archivo `lib/motivoDeCierre.js` es el único que sabe cuál es cuál. */
function TabServiciosMotivosCierre() {
  const modal = useModalAccesible(() => setCreandoNuevo(false));
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [motivos, setMotivos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [pideDetalleNuevo, setPideDetalleNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { motivos: filas } = await llamarApi('/motivos-cierre-servicio');
      setMotivos(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function cambiar(fila, cambios) {
    setActualizandoId(fila.id);
    setError(null);
    try {
      await llamarApi(`/motivos-cierre-servicio/${fila.id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function borrar(fila) {
    if (!(await confirmarDestructivo(t.configuracion.motivos_cierre_confirmar_borrar))) return;
    setActualizandoId(fila.id);
    setError(null);
    try {
      await llamarApi(`/motivos-cierre-servicio/${fila.id}`, { method: 'DELETE' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/motivos-cierre-servicio', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombreNuevo, pide_detalle: pideDetalleNuevo }),
      });
      setNombreNuevo('');
      setPideDetalleNuevo(false);
      setCreandoNuevo(false);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.motivos_cierre_titulo}</h2>
        <Button onClick={() => setCreandoNuevo(true)}>{t.configuracion.motivos_cierre_nuevo}</Button>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && motivos.length === 0}
        recargar={recargar}
        mensajeVacio={t.configuracion.motivos_cierre_vacio}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.motivos_cierre_col_nombre}</th>
              <th>{t.configuracion.motivos_cierre_col_origen}</th>
              <th>{t.configuracion.motivos_cierre_col_pide_detalle}</th>
              <th>{t.configuracion.documentos_tipos_col_activo}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {motivos.map((m) => {
              const nombre = nombreMotivo(m, t);
              return (
                <tr key={m.id}>
                  <td>{nombre}</td>
                  <td>
                    {esMotivoDeFabrica(m)
                      ? t.configuracion.motivos_cierre_origen_producto
                      : t.configuracion.motivos_cierre_origen_prestadora}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.pide_detalle}
                      onChange={() => cambiar(m, { pide_detalle: !m.pide_detalle })}
                      disabled={actualizandoId === m.id}
                      aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.motivos_cierre_col_pide_detalle, nombre })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.activo}
                      onChange={() => cambiar(m, { activo: !m.activo })}
                      disabled={actualizandoId === m.id}
                      aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.documentos_tipos_col_activo, nombre })}
                    />
                  </td>
                  <td>
                    <div className="cuidado-acciones-fila">
                      <Button variant="secondary" onClick={() => borrar(m)} disabled={actualizandoId === m.id}>
                        {t.comun.borrar}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNuevo && (
        <div className="panel-modal-fondo" onClick={() => setCreandoNuevo(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <h2 id={modal.idTitulo}>{t.configuracion.motivos_cierre_nuevo}</h2>
            <FormField
              label={t.configuracion.motivos_cierre_col_nombre}
              name="nombre"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              required
            />
            <FormField
              label={t.configuracion.motivos_cierre_col_pide_detalle}
              name="pide_detalle"
              type="checkbox"
              checked={pideDetalleNuevo}
              onChange={(e) => setPideDetalleNuevo(e.target.checked)}
            />
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => setCreandoNuevo(false)} disabled={guardando}>{t.comun.cancelar}</Button>
              <Button onClick={crear} disabled={guardando || !nombreNuevo}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TabServiciosMotivosAvisoPrevio() {
  const modal = useModalAccesible(() => setCreandoNuevo(false));
  const { t } = useLocale();
  const [motivos, setMotivos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { motivos: filas } = await llamarApi('/motivos-aviso-previo');
      setMotivos(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActivo(fila) {
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/motivos-aviso-previo/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: fila.nombre, activo: !fila.activo }),
      });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/motivos-aviso-previo', { method: 'POST', body: JSON.stringify({ nombre: nombreNuevo }) });
      setNombreNuevo('');
      setCreandoNuevo(false);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.motivos_aviso_previo_titulo}</h2>
        <Button onClick={() => setCreandoNuevo(true)}>{t.configuracion.motivos_aviso_previo_nuevo}</Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && motivos.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.motivos_aviso_previo_col_nombre}</th>
              <th>{t.configuracion.documentos_tipos_col_activo}</th>
            </tr>
          </thead>
          <tbody>
            {motivos.map((m) => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={m.activo}
                    onChange={() => toggleActivo(m)}
                    disabled={actualizandoId === m.id}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.documentos_tipos_col_activo, nombre: m.nombre })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNuevo && (
        <div className="panel-modal-fondo" onClick={() => setCreandoNuevo(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <h2 id={modal.idTitulo}>{t.configuracion.motivos_aviso_previo_nuevo}</h2>
            <FormField label={t.configuracion.motivos_aviso_previo_col_nombre} name="nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} required />
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => setCreandoNuevo(false)} disabled={guardando}>{t.comun.cancelar}</Button>
              <Button onClick={crear} disabled={guardando || !nombreNuevo}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TabServiciosEtapasIncorporacion() {
  const modal = useModalAccesible(() => setCreandoNueva(false));
  const { t } = useLocale();
  const [etapas, setEtapas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNueva, setCreandoNueva] = useState(false);
  const [claveNueva, setClaveNueva] = useState('');
  const [nombreNueva, setNombreNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { etapas: filas } = await llamarApi('/etapas-incorporacion');
      setEtapas(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActiva(fila) {
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/etapas-incorporacion/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: fila.nombre, activa: !fila.activa }),
      });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function mover(fila, direccion) {
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/etapas-incorporacion/${fila.id}/mover`, { method: 'PATCH', body: JSON.stringify({ direccion }) });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/etapas-incorporacion', { method: 'POST', body: JSON.stringify({ clave: claveNueva, nombre: nombreNueva }) });
      setClaveNueva('');
      setNombreNueva('');
      setCreandoNueva(false);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.etapas_incorporacion_titulo}</h2>
        <Button onClick={() => setCreandoNueva(true)}>{t.configuracion.etapas_incorporacion_nueva}</Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && etapas.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.etapas_incorporacion_col_orden}</th>
              <th>{t.configuracion.etapas_incorporacion_col_nombre}</th>
              <th>{t.configuracion.documentos_tipos_col_activo}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((e, i) => (
              <tr key={e.id}>
                <td>{e.orden}</td>
                <td>{e.nombre}</td>
                <td>
                  {/* Las tres cosas de esta fila —la casilla y las dos flechas— dicen a qué
                      etapa se refieren: una fila de una tabla se lee sola, fuera del renglón,
                      y "activar" o "subir" sin el nombre al lado no dice nada. */}
                  <input
                    type="checkbox"
                    checked={e.activa}
                    onChange={() => toggleActiva(e)}
                    disabled={actualizandoId === e.id}
                    aria-label={con(t.comun.activo_de, { nombre: e.nombre })}
                  />
                </td>
                <td>
                  <div className="cuidado-acciones-fila">
                    <Button
                      variant="secondary"
                      onClick={() => mover(e, 'arriba')}
                      disabled={actualizandoId === e.id || i === 0}
                      aria-label={con(t.comun.subir, { nombre: e.nombre })}
                    >
                      <span aria-hidden="true">↑</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => mover(e, 'abajo')}
                      disabled={actualizandoId === e.id || i === etapas.length - 1}
                      aria-label={con(t.comun.bajar, { nombre: e.nombre })}
                    >
                      <span aria-hidden="true">↓</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNueva && (
        <div className="panel-modal-fondo" onClick={() => setCreandoNueva(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <h2 id={modal.idTitulo}>{t.configuracion.etapas_incorporacion_nueva}</h2>
            <FormField label={t.configuracion.etapas_incorporacion_col_clave} name="clave" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} required />
            <FormField label={t.configuracion.etapas_incorporacion_col_nombre} name="nombre" value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} required />
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => setCreandoNueva(false)} disabled={guardando}>{t.comun.cancelar}</Button>
              <Button onClick={crear} disabled={guardando || !claveNueva || !nombreNueva}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TabServiciosPersonalEmergencia() {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [personal, setPersonal] = useState([]);
  const [asistentes, setAsistentes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [{ personal: filas }, { data: asistentesData, error: errorAsistentes }] = await Promise.all([
        llamarApi('/personal-emergencia'),
        /* Anotar a alguien como personal de emergencia es ponerlo en la lista de a quién llamar
           cuando se cae una guardia, o sea repartir trabajo: quien ya no está en la Prestadora no
           puede entrar ahí. Acá sí se filtra en la consulta, y no en el desplegable como en las
           otras puertas, porque esta lista no se usa para mostrar a nadie —los nombres de la
           tabla de arriba salen de `/personal-emergencia`, no de esto—, así que no hay ningún
           nombre que se pueda quedar sin dueño. El valor sale de `ESTADO_ACTIVO` y no escrito a
           mano: es la misma regla que contesta `estaEnElPadron`, y una consulta a la base no
           puede llamar a una función de JavaScript (regla 12 de CLAUDE.md §7). */
        supabase.from('asistentes').select('id, nombre').eq('estado', ESTADO_ACTIVO).order('nombre'),
      ]);
      if (errorAsistentes) throw errorAsistentes;
      setPersonal(filas);
      setAsistentes(asistentesData ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActivo(fila) {
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/personal-emergencia/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !fila.activo }),
      });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function borrar(fila) {
    if (!(await confirmarDestructivo(t.configuracion.personal_emergencia_confirmar_borrar))) return;
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/personal-emergencia/${fila.id}`, { method: 'DELETE' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.personal_emergencia_titulo}</h2>
        <Button onClick={() => setCreandoNuevo(true)}>{t.configuracion.personal_emergencia_nuevo}</Button>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && personal.length === 0}
        recargar={recargar}
        mensajeVacio={t.configuracion.personal_emergencia_vacio}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.personal_emergencia_col_asistente}</th>
              <th>{t.configuracion.personal_emergencia_col_tipo}</th>
              <th>{t.configuracion.personal_emergencia_col_activo}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personal.map((fila) => (
              <tr key={fila.id}>
                <td>{fila.asistentes?.nombre || '—'}</td>
                <td>{t.configuracion[`personal_emergencia_tipo_${fila.tipo}`]}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={fila.activo}
                    onChange={() => toggleActivo(fila)}
                    disabled={actualizandoId === fila.id}
                    aria-label={con(t.comun.campo_de_fila, {
                      campo: t.configuracion.documentos_tipos_col_activo,
                      nombre: fila.asistentes?.nombre || t.configuracion[`personal_emergencia_tipo_${fila.tipo}`],
                    })}
                  />
                </td>
                <td>
                  <div className="cuidado-acciones-fila">
                    <Button variant="secondary" onClick={() => borrar(fila)} disabled={actualizandoId === fila.id}>{t.comun.borrar}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNuevo && (
        <NuevoPersonalEmergencia
          asistentes={asistentes}
          onClose={() => setCreandoNuevo(false)}
          onCreado={() => { setCreandoNuevo(false); recargar(); }}
        />
      )}
    </section>
  );
}

function NuevoPersonalEmergencia({ asistentes, onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [asistenteId, setAsistenteId] = useState('');
  const [tipo, setTipo] = useState('franquero');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/personal-emergencia', {
        method: 'POST',
        body: JSON.stringify({ asistente_id: asistenteId, tipo }),
      });
      onCreado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.configuracion.personal_emergencia_nuevo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          label={t.configuracion.personal_emergencia_col_asistente}
          name="asistente_id"
          type="select"
          value={asistenteId}
          onChange={(e) => setAsistenteId(e.target.value)}
          required
        >
          <option value="">{t.configuracion.escalada_prioridad_vacio}</option>
          {asistentes.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </FormField>
        <FormField
          label={t.configuracion.personal_emergencia_col_tipo}
          name="tipo"
          type="select"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          {TIPOS_PERSONAL_EMERGENCIA.map((tipoOpcion) => (
            <option key={tipoOpcion} value={tipoOpcion}>{t.configuracion[`personal_emergencia_tipo_${tipoOpcion}`]}</option>
          ))}
        </FormField>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || !asistenteId}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * El formulario de un nivel de la escalada de relevo, para crearlo o para editarlo.
 *
 * Sin `nivelExistente` crea uno nuevo; con él, modifica ese. Es un solo formulario a propósito:
 * hasta el pendiente #101 se podía crear un nivel y borrarlo, pero no corregirlo, así que
 * cambiar los minutos de demora obligaba a borrar la fila y escribirla de nuevo entera —con el
 * mensaje y el orden de prioridad incluidos—, y en el medio la Prestadora se quedaba sin nivel.
 */
function NivelEscalada({ nivelExistente, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [nivel, setNivel] = useState(nivelExistente ? String(nivelExistente.nivel) : '');
  const [minutosDemora, setMinutosDemora] = useState(
    nivelExistente?.minutos_demora === null || nivelExistente?.minutos_demora === undefined
      ? ''
      : String(nivelExistente.minutos_demora),
  );
  // Siempre cuatro casillas: son los cuatro roles posibles, y las que sobran quedan vacías.
  const [ordenPrioridad, setOrdenPrioridad] = useState(() => {
    const guardado = nivelExistente?.orden_prioridad ?? [];
    return [0, 1, 2, 3].map((i) => guardado[i] ?? '');
  });
  const [plantillaMensaje, setPlantillaMensaje] = useState(nivelExistente?.plantilla_mensaje ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function setPrioridad(indice, valor) {
    setOrdenPrioridad((actual) => actual.map((v, i) => (i === indice ? valor : v)));
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi(
        nivelExistente ? `/escalada-relevo/${nivelExistente.id}` : '/escalada-relevo',
        {
          method: nivelExistente ? 'PATCH' : 'POST',
          body: JSON.stringify({
            nivel: Number(nivel),
            minutos_demora: minutosDemora === '' ? null : Number(minutosDemora),
            orden_prioridad: ordenPrioridad.filter(Boolean),
            plantilla_mensaje: plantillaMensaje,
          }),
        },
      );
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>
          {nivelExistente
            ? con(t.configuracion.escalada_editar_nivel_numero, { nivel: nivelExistente.nivel })
            : t.configuracion.escalada_nuevo_nivel}
        </h2>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="molde-formgrid">
          <FormField label={t.configuracion.escalada_col_nivel} name="nivel" type="number" value={nivel} onChange={(e) => setNivel(e.target.value)} required />
          <FormField label={t.configuracion.escalada_minutos_label} name="minutos_demora" type="number" value={minutosDemora} onChange={(e) => setMinutosDemora(e.target.value)} />
          {ordenPrioridad.map((valor, indice) => (
            <FormField
              key={indice}
              label={`${t.configuracion.escalada_prioridad_label} ${indice + 1}`}
              name={`prioridad_${indice}`}
              type="select"
              value={valor}
              onChange={(e) => setPrioridad(indice, e.target.value)}
            >
              <option value="">{t.configuracion.escalada_prioridad_vacio}</option>
              {ROLES_RELEVO.map((rol) => (
                <option key={rol} value={rol}>{t.configuracion[`escalada_rol_${rol}`]}</option>
              ))}
            </FormField>
          ))}
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.escalada_col_mensaje}
              name="plantilla_mensaje"
              type="textarea"
              value={plantillaMensaje}
              onChange={(e) => setPlantillaMensaje(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || !nivel || !plantillaMensaje}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TabVitales() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [rangos, setRangos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardandoSigno, setGuardandoSigno] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('rangos_referencia_vitales')
      .select('*')
      .eq('prestadora_id', prestadoraId)
      .is('paciente_id', null)
      .order('signo');
    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }
    setRangos(data ?? []);
    setEstado('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function set(signo, campo, valor) {
    setRangos((filas) => filas.map((f) => (f.signo === signo ? { ...f, [campo]: valor } : f)));
  }

  async function guardar(fila) {
    setGuardandoSigno(fila.signo);
    setError(null);
    const { error: errorUpdate } = await supabase
      .from('rangos_referencia_vitales')
      .update({
        valor_min: Number(fila.valor_min),
        valor_max: Number(fila.valor_max),
        unidad: fila.unidad,
        fuente: fila.fuente,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fila.id);
    setGuardandoSigno(null);
    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      return;
    }
    recargar();
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.vitales_titulo}</h2>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && rangos.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.vitales_col_signo}</th>
              <th>{t.configuracion.vitales_col_min}</th>
              <th>{t.configuracion.vitales_col_max}</th>
              <th>{t.configuracion.vitales_col_unidad}</th>
              <th>{t.configuracion.vitales_col_fuente}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rangos.map((fila) => {
              /* El nombre del signo se resuelve una sola vez porque lo usan la celda visible y
                 los cuatro campos, que fuera del renglón se leerían como "Mínimo" a secas. */
              const nombreSigno = t.configuracion[`vitales_signo_${fila.signo}`];
              return (
                <tr key={fila.signo}>
                  <td>{nombreSigno}</td>
                  <td><input type="number" step="0.1" value={fila.valor_min} onChange={(e) => set(fila.signo, 'valor_min', e.target.value)} aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.vitales_col_min, nombre: nombreSigno })} /></td>
                  <td><input type="number" step="0.1" value={fila.valor_max} onChange={(e) => set(fila.signo, 'valor_max', e.target.value)} aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.vitales_col_max, nombre: nombreSigno })} /></td>
                  <td><input type="text" value={fila.unidad} onChange={(e) => set(fila.signo, 'unidad', e.target.value)} aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.vitales_col_unidad, nombre: nombreSigno })} /></td>
                  <td><input type="text" value={fila.fuente} onChange={(e) => set(fila.signo, 'fuente', e.target.value)} aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.vitales_col_fuente, nombre: nombreSigno })} /></td>
                  <td>
                    <div className="cuidado-acciones-fila">
                      <Button variant="secondary" onClick={() => guardar(fila)} disabled={guardandoSigno === fila.signo}>
                        {guardandoSigno === fila.signo ? t.comun.guardando : t.comun.guardar}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </EstadoLista>
    </section>
  );
}
