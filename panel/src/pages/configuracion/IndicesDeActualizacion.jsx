import { useCallback, useEffect, useState } from 'react';
import { con } from '../../lib/textos';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { llamarApiActualizacion as llamarApi } from '../../lib/apiActualizacion';
import { formatearImporte } from '../../lib/dinero';
import { mensajeDeError } from '../../lib/errores';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import '../../styles/molde-paginas.css';

/* Los índices de actualización y la actualización de precios por índice.
   ==========================================================================

   LOS VALORES. Cada índice (hoy, el IPC del INDEC) con sus valores mes por mes. Los publicados los
   anota sola la tarea diaria del backend; los que la fuente todavía no publicó se cargan a mano, y
   un valor propio le gana al publicado del mismo mes. Sólo los propios se borran.

   LA ACTUALIZACIÓN. Desde qué mes rige el precio nuevo y entre qué dos meses del índice se mide la
   variación. Primero se mira la vista previa, que no escribe nada; después se aplica, todo junto
   o nada. El cálculo lo hace la base (`actualizar_precios_por_indice`): acá no se calcula ningún
   precio, sólo se muestra lo que la base contestó. El precio viejo no se pisa: queda con su fecha
   de fin y el nuevo empieza el día elegido. Sólo se actualiza lo que se actualiza por índice
   —según la configuración de facturación o la del propio Servicio—.

   Los períodos viajan como 'AAAA-MM'; la fecha desde, como el día 1 de ese mes. */
const VACIO_CARGA = { indice: '', periodo: '', valor: '' };
const VACIO_ACTUALIZACION = { desde: '', periodoBase: '', periodoNuevo: '' };

function nombreDelMes(periodo, locale) {
  const [anio, mes] = String(periodo).split('-').map(Number);
  if (!anio || !mes) return String(periodo);
  try {
    return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return String(periodo);
  }
}

function faltantes(datos, campos) {
  return campos.reduce((acc, campo) => (String(datos[campo] ?? '').trim() ? acc : { ...acc, [campo]: true }), {});
}

export function IndicesDeActualizacion() {
  const { t, locale } = useLocale();
  const ta = t.actualizacion_de_precios;
  const confirmarDestructivo = useConfirmarDestructivo();
  const [indices, setIndices] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);

  const [carga, setCarga] = useState(VACIO_CARGA);
  const [faltaEnCarga, setFaltaEnCarga] = useState({});
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [borrandoId, setBorrandoId] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [pedido, setPedido] = useState(VACIO_ACTUALIZACION);
  const [faltaEnPedido, setFaltaEnPedido] = useState({});
  const [calculando, setCalculando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [errorPedido, setErrorPedido] = useState(null);
  const [vista, setVista] = useState(null);
  const [aplicada, setAplicada] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    try {
      const datos = await llamarApi('/indices');
      const lista = datos.indices ?? [];
      setIndices(lista);
      setCarga((c) => (c.indice || lista.length !== 1 ? c : { ...c, indice: lista[0].codigo }));
      setEstado('listo');
    } catch (err) {
      setErrorDeCarga(mensajeDeError(err, t, 'índices de actualización'));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const formatoDelValor = (valor) => Number(valor).toLocaleString(locale, { maximumFractionDigits: 4 });

  function cambiarCarga(campo, valor) {
    setCarga((c) => ({ ...c, [campo]: valor }));
    setFaltaEnCarga((f) => ({ ...f, [campo]: false }));
    setAviso(null);
  }

  async function cargarValor() {
    const falta = faltantes(carga, ['indice', 'periodo', 'valor']);
    setFaltaEnCarga(falta);
    if (Object.keys(falta).length > 0) {
      document.getElementById(`field-carga_${Object.keys(falta)[0]}`)?.focus();
      return;
    }
    setCargando(true);
    setErrorCarga(null);
    setAviso(null);
    try {
      await llamarApi(`/indices/${encodeURIComponent(carga.indice)}/valores`, {
        method: 'POST',
        body: JSON.stringify({ periodo: carga.periodo, valor: carga.valor }),
      });
      setCarga((c) => ({ ...VACIO_CARGA, indice: c.indice }));
      setAviso(ta.valor_guardado);
      await recargar();
    } catch (err) {
      setErrorCarga(mensajeDeError(err, t, 'carga de un valor del índice'));
    } finally {
      setCargando(false);
    }
  }

  async function borrarValor(valor) {
    if (!(await confirmarDestructivo(ta.confirmar_borrar_valor))) return;
    setBorrandoId(valor.id);
    setErrorCarga(null);
    setAviso(null);
    try {
      await llamarApi(`/indices/valores/${encodeURIComponent(valor.id)}`, { method: 'DELETE' });
      await recargar();
    } catch (err) {
      setErrorCarga(mensajeDeError(err, t, 'borrado de un valor del índice'));
    } finally {
      setBorrandoId(null);
    }
  }

  function cambiarPedido(campo, valor) {
    setPedido((p) => ({ ...p, [campo]: valor }));
    setFaltaEnPedido((f) => ({ ...f, [campo]: false }));
    // Otra cuenta: la vista previa anterior ya no vale para aplicar.
    setVista(null);
    setAplicada(null);
  }

  function cuerpoDelPedido() {
    return JSON.stringify({
      desde: `${pedido.desde}-01`,
      periodoBase: pedido.periodoBase,
      periodoNuevo: pedido.periodoNuevo,
    });
  }

  async function verVistaPrevia() {
    const falta = faltantes(pedido, ['desde', 'periodoBase', 'periodoNuevo']);
    setFaltaEnPedido(falta);
    if (Object.keys(falta).length > 0) {
      document.getElementById(`field-actualizacion_${Object.keys(falta)[0]}`)?.focus();
      return;
    }
    setCalculando(true);
    setErrorPedido(null);
    setAplicada(null);
    try {
      const datos = await llamarApi('/vista-previa', { method: 'POST', body: cuerpoDelPedido() });
      setVista(datos.renglones ?? []);
    } catch (err) {
      setVista(null);
      setErrorPedido(mensajeDeError(err, t, 'vista previa de la actualización'));
    } finally {
      setCalculando(false);
    }
  }

  async function aplicar() {
    if (!(await confirmarDestructivo(ta.confirmar_aplicar))) return;
    setAplicando(true);
    setErrorPedido(null);
    try {
      const datos = await llamarApi('/aplicar', { method: 'POST', body: cuerpoDelPedido() });
      const renglones = datos.renglones ?? [];
      // Un renglón de la lista cuyo precio no cambió vuelve con su mismo id: no cuenta como actualizado.
      setAplicada(renglones.filter((r) => r.renglonNuevoId != null && r.renglonNuevoId !== r.renglonId).length);
      setVista(null);
    } catch (err) {
      setErrorPedido(mensajeDeError(err, t, 'aplicación de la actualización'));
    } finally {
      setAplicando(false);
    }
  }

  const ocupado = calculando || aplicando;
  const conCambio = (vista ?? []).filter((r) => r.precioNuevo !== null && r.precioNuevo !== undefined);

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{ta.titulo}</h2>
      </div>
      <EstadoLista
        estado={estado}
        error={errorDeCarga}
        vacio={estado === 'listo' && indices.length === 0}
        mensajeVacio={ta.sin_indices}
        recargar={recargar}
      >
        <>
          {indices.map((indice) => (
            <div key={indice.codigo} className="molde-pila">
              <h3>{indice.nombre}</h3>
              {indice.valores.length === 0 ? (
                <p className="molde-vacio">{ta.sin_valores}</p>
              ) : (
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{ta.periodo}</th>
                      <th>{ta.valor}</th>
                      <th>{ta.origen}</th>
                      <th aria-label={t.comun.borrar} />
                    </tr>
                  </thead>
                  <tbody>
                    {indice.valores.map((valor) => (
                      <tr key={valor.id}>
                        <td>{nombreDelMes(valor.periodo, locale)}</td>
                        <td>{formatoDelValor(valor.valor)}</td>
                        <td>{ta.origenes[valor.origen] ?? ta.origenes.automatico}</td>
                        <td>
                          {valor.origen === 'manual' && (
                            <Button
                              variant="secondary"
                              onClick={() => borrarValor(valor)}
                              disabled={borrandoId !== null}
                            >
                              {borrandoId === valor.id ? t.comun.guardando : t.comun.borrar}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          <h3>{ta.cargar_valor}</h3>
          {errorCarga && <Alert variant="error">{errorCarga}</Alert>}
          {aviso && <Alert variant="info">{aviso}</Alert>}
          <div className="molde-formgrid">
            {indices.length > 1 && (
              <FormField
                label={ta.indice}
                name="carga_indice"
                type="select"
                required
                value={carga.indice}
                onChange={(e) => cambiarCarga('indice', e.target.value)}
                disabled={cargando}
                error={faltaEnCarga.indice ? t.formularios.falta_un_dato_obligatorio : undefined}
              >
                <option value="">{ta.elegir_indice}</option>
                {indices.map((i) => (
                  <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
                ))}
              </FormField>
            )}
            <FormField
              label={ta.periodo}
              name="carga_periodo"
              type="month"
              required
              value={carga.periodo}
              onChange={(e) => cambiarCarga('periodo', e.target.value)}
              disabled={cargando}
              error={faltaEnCarga.periodo ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
            <FormField
              label={ta.valor}
              name="carga_valor"
              type="text"
              inputMode="decimal"
              required
              value={carga.valor}
              onChange={(e) => cambiarCarga('valor', e.target.value)}
              disabled={cargando}
              error={faltaEnCarga.valor ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          </div>
          <div className="molde-acciones">
            <Button onClick={cargarValor} disabled={cargando}>
              {cargando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>

          <h3>{ta.actualizar_precios}</h3>
          {errorPedido && <Alert variant="error">{errorPedido}</Alert>}
          {aplicada !== null && <Alert variant="info">{con(ta.aplicada, { cantidad: aplicada })}</Alert>}
          <div className="molde-formgrid">
            <FormField
              label={ta.desde}
              name="actualizacion_desde"
              type="month"
              required
              value={pedido.desde}
              onChange={(e) => cambiarPedido('desde', e.target.value)}
              disabled={ocupado}
              error={faltaEnPedido.desde ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
            <FormField
              label={ta.periodo_base}
              name="actualizacion_periodoBase"
              type="month"
              required
              value={pedido.periodoBase}
              onChange={(e) => cambiarPedido('periodoBase', e.target.value)}
              disabled={ocupado}
              error={faltaEnPedido.periodoBase ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
            <FormField
              label={ta.periodo_nuevo}
              name="actualizacion_periodoNuevo"
              type="month"
              required
              value={pedido.periodoNuevo}
              onChange={(e) => cambiarPedido('periodoNuevo', e.target.value)}
              disabled={ocupado}
              error={faltaEnPedido.periodoNuevo ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          </div>
          <div className="molde-acciones">
            <Button variant="secondary" onClick={verVistaPrevia} disabled={ocupado}>
              {calculando ? t.comun.cargando : ta.vista_previa}
            </Button>
            {vista && conCambio.length > 0 && (
              <Button onClick={aplicar} disabled={ocupado}>
                {aplicando ? t.comun.guardando : ta.aplicar}
              </Button>
            )}
          </div>

          {vista && vista.length === 0 && <p className="molde-vacio">{ta.nada_que_actualizar}</p>}
          {vista && vista.length > 0 && (
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{ta.descripcion}</th>
                  <th>{ta.clase}</th>
                  <th>{ta.precio_actual}</th>
                  <th>{ta.precio_nuevo}</th>
                </tr>
              </thead>
              <tbody>
                {vista.map((r) => (
                  <tr key={`${r.clase}-${r.renglonId}`}>
                    <td>{r.descripcion}</td>
                    <td>{ta.clases[r.clase]}</td>
                    <td>{formatearImporte(r.precioActual, r.moneda, locale)}</td>
                    <td>
                      {r.precioNuevo === null || r.precioNuevo === undefined
                        ? ta.sin_valor_del_indice
                        : formatearImporte(r.precioNuevo, r.moneda, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      </EstadoLista>
    </section>
  );
}
