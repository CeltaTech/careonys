import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { useModalAccesible } from '../../hooks/useModalAccesible';

/* Una lista que arma la Prestadora desde cero: renglones con nombre, encendidos o apagados, y —si
   la lista lo admite— la marca de que el renglón pide escribir un detalle. La usan la Lista de
   comprobación para la baja de un Servicio y los motivos de reactivación. El backend contesta
   `{ filas }` en `ruta` y acepta POST, PATCH y DELETE con el mismo molde
   (`catalogoDeLaPrestadora`, en `routes/panelConfiguracion.js`).

   @param {string} ruta         Lo que va después de `/api/panel/configuracion`.
   @param {boolean} conDetalle  Si cada renglón puede pedir un detalle.
   @param {object} textos       titulo, agregar, vacio, confirmar_borrar, col_nombre. */
export function ListaPropiaDeLaPrestadora({ ruta, conDetalle = false, textos }) {
  const modal = useModalAccesible(() => setCreandoNuevo(false));
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [pideDetalleNuevo, setPideDetalleNuevo] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { filas: recibidas } = await llamarApi(ruta);
      setFilas(recibidas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [ruta, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function cambiar(fila, cambios) {
    setActualizandoId(fila.id);
    setError(null);
    try {
      await llamarApi(`${ruta}/${fila.id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function borrar(fila) {
    if (!(await confirmarDestructivo(textos.confirmar_borrar))) return;
    setActualizandoId(fila.id);
    setError(null);
    try {
      await llamarApi(`${ruta}/${fila.id}`, { method: 'DELETE' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  function cerrarAlta() {
    setCreandoNuevo(false);
    setNombreNuevo('');
    setPideDetalleNuevo(false);
    setIntentado(false);
  }

  async function crear() {
    setIntentado(true);
    if (!nombreNuevo.trim()) {
      document.getElementById('field-nombre_renglon')?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await llamarApi(ruta, {
        method: 'POST',
        body: JSON.stringify(conDetalle ? { nombre: nombreNuevo.trim(), pide_detalle: pideDetalleNuevo } : { nombre: nombreNuevo.trim() }),
      });
      cerrarAlta();
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
        <h2>{textos.titulo}</h2>
        <Button onClick={() => setCreandoNuevo(true)}>{textos.agregar}</Button>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filas.length === 0}
        recargar={recargar}
        mensajeVacio={textos.vacio}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_nombre}</th>
              {conDetalle && <th>{t.configuracion.motivos_cierre_col_pide_detalle}</th>}
              <th>{t.configuracion.documentos_tipos_col_activo}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id}>
                <td>{fila.nombre}</td>
                {conDetalle && (
                  <td>
                    <input
                      type="checkbox"
                      checked={fila.pide_detalle}
                      onChange={() => cambiar(fila, { pide_detalle: !fila.pide_detalle })}
                      disabled={actualizandoId === fila.id}
                      aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.motivos_cierre_col_pide_detalle, nombre: fila.nombre })}
                    />
                  </td>
                )}
                <td>
                  <input
                    type="checkbox"
                    checked={fila.activo}
                    onChange={() => cambiar(fila, { activo: !fila.activo })}
                    disabled={actualizandoId === fila.id}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.documentos_tipos_col_activo, nombre: fila.nombre })}
                  />
                </td>
                <td>
                  <div className="cuidado-acciones-fila">
                    <Button variant="secondary" onClick={() => borrar(fila)} disabled={actualizandoId === fila.id}>
                      {t.comun.borrar}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNuevo && (
        <div className="panel-modal-fondo" onClick={cerrarAlta}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <h2 id={modal.idTitulo}>{textos.agregar}</h2>
            <FormField
              label={textos.col_nombre}
              name="nombre_renglon"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              required
              error={intentado && !nombreNuevo.trim() ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
            {conDetalle && (
              <FormField
                label={t.configuracion.motivos_cierre_col_pide_detalle}
                name="pide_detalle_renglon"
                type="checkbox"
                checked={pideDetalleNuevo}
                onChange={(e) => setPideDetalleNuevo(e.target.checked)}
              />
            )}
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={cerrarAlta} disabled={guardando}>{t.comun.cancelar}</Button>
              <Button onClick={crear} disabled={guardando}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
