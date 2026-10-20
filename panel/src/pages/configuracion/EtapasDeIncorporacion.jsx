import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import '../../styles/molde-paginas.css';
import './elcuidado.css';

/* Las etapas por las que pasa un postulante hasta quedar incorporado. Viven en Reclutamiento
   porque son el camino del reclutamiento, no reglas del Servicio. */
export function EtapasDeIncorporacion() {
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
