import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { Cabecera } from '../../components/ui/Cabecera';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { llamarApiIntermediacion as llamarApi } from '../../lib/apiIntermediacion';
import { claseBadge } from '../../lib/tonos';
import { formatearImporte } from '../../lib/dinero';
import { hoyISO } from '../../lib/horarios';
import { armarArchivo } from '../../lib/intercambioDeFacturacion';
import { bajarArchivo } from '../../lib/exportarCsv';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

export function IntermediacionClientes() {
  const { t, locale } = useLocale();
  const [accesos, setAccesos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [expandida, setExpandida] = useState(null);
  const [cobrosPorAcceso, setCobrosPorAcceso] = useState({});
  const [cargandoCobros, setCargandoCobros] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [rielesConectados, setRielesConectados] = useState([]);
  const [rielElegido, setRielElegido] = useState({});
  const [dandoAlta, setDandoAlta] = useState(null);
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      // Las pasarelas se piden junto con los accesos porque de ellas depende qué se puede hacer
      // en esta pantalla: con ninguna conectada no hay alta posible, y con más de una hay que
      // elegir cuál cobra. Elegir por la Prestadora sería decidir con qué cobra.
      const [{ accesos: filas }, { pasarelas }] = await Promise.all([
        llamarApi('/accesos'),
        llamarApi('/pasarela'),
      ]);
      setAccesos(filas);
      setRielesConectados((pasarelas || []).filter((p) => p.estado_conexion === 'conectada').map((p) => p.proveedor));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function verCobros(accesoId) {
    if (expandida === accesoId) {
      setExpandida(null);
      return;
    }
    setExpandida(accesoId);
    if (cobrosPorAcceso[accesoId]) return;
    setCargandoCobros(accesoId);
    setError(null);
    try {
      const { cobros } = await llamarApi(`/accesos/${accesoId}/cobros`);
      setCobrosPorAcceso((c) => ({ ...c, [accesoId]: cobros }));
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargandoCobros(null);
    }
  }

  async function darDeAlta(accesoId) {
    setDandoAlta(accesoId);
    setError(null);
    setMensajeExito(null);
    try {
      // El riel sólo se manda cuando hay más de uno conectado; con uno solo lo resuelve el backend.
      const elegido = rielesConectados.length > 1 ? rielElegido[accesoId] : null;
      await llamarApi(`/accesos/${accesoId}/alta-en-pasarela`, {
        method: 'POST',
        body: JSON.stringify(elegido ? { proveedor: elegido } : {}),
      });
      setMensajeExito(t.intermediacion.alta_pasarela_exitosa);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setDandoAlta(null);
    }
  }

  /* Baja lo que hay para facturar del mes, con el mismo formato de archivo que la prestación
     directa: el software de facturación lee uno solo. */
  async function exportarParaFacturar() {
    setExportando(true);
    setError(null);
    setMensajeExito(null);
    try {
      const filas = await llamarApi(`/accesos/para-facturar?periodo=${mes}`);
      if (filas.length === 0) {
        setMensajeExito(t.intermediacion.exportar_para_facturar_vacio);
        return;
      }
      bajarArchivo(
        `match-para-facturar-${mes}.csv`,
        new Blob([armarArchivo(filas)], { type: 'text/csv;charset=utf-8' })
      );
      setMensajeExito(
        filas.length === 1
          ? t.intermediacion.exportar_para_facturar_listo_uno
          : t.intermediacion.exportar_para_facturar_listo.replace('{cantidad}', filas.length)
      );
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.intermediacion.clientes_titulo} />

      {mensajeExito && <Alert variant="success">{mensajeExito}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="molde-pila">
        <section className="panel-tarjeta">
          <div className="panel-filtros">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {t.intermediacion.cobros_col_periodo}
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
            <Button variant="secondary" onClick={exportarParaFacturar} disabled={exportando || !mes}>
              {t.intermediacion.exportar_para_facturar}
            </Button>
          </div>
        </section>

        <section className="panel-tarjeta tarjeta-desplazable">
          <div className="panel-tarjeta-titulo">
            <h2>{t.intermediacion.clientes_titulo}</h2>
            {estado === 'listo' && <span className="panel-mini">{accesos.length}</span>}
          </div>
          <EstadoLista estado={estado} error={null} vacio={estado === 'listo' && accesos.length === 0} recargar={recargar}>
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{t.intermediacion.col_cliente}</th>
                  <th>{t.intermediacion.col_paciente}</th>
                  <th>{t.intermediacion.col_asistente}</th>
                  <th>{t.intermediacion.col_estado}</th>
                  <th>{t.intermediacion.col_monto}</th>
                  <th>{t.intermediacion.col_estado_cobro}</th>
                  <th>{t.intermediacion.col_ultimo_cobro}</th>
                  <th>{t.intermediacion.col_proximo_cobro}</th>
                  <th>{t.intermediacion.col_cobro}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accesos.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.cliente_nombre || '—'}</b>
                    </td>
                    <td>{s.paciente_nombre || '—'}</td>
                    <td>{s.asistente_nombre || '—'}</td>
                    <td>
                      <span className={claseBadge(s.estado)}>{t.intermediacion[`estado_${s.estado}`] || s.estado}</span>
                    </td>
                    <td>{formatearImporte(s.importe, s.moneda, locale)}</td>
                    <td>
                      {s.estado_cobro ? (
                        <span className={claseBadge(s.estado_cobro)}>
                          {t.intermediacion[`cobro_${s.estado_cobro}`] || s.estado_cobro}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {s.ultimo_cobro
                        ? `${s.ultimo_cobro.fecha_cobro || String(s.ultimo_cobro.periodo).slice(0, 7)} · ${formatearImporte(
                            s.ultimo_cobro.monto,
                            s.ultimo_cobro.moneda,
                            locale
                          )}`
                        : '—'}
                    </td>
                    <td>{s.proximo_cobro || '—'}</td>
                    <td>
                      {s.alta_en_pasarela
                        ? t.intermediacion[`medio_${s.proveedor}`] || s.proveedor
                        : t.intermediacion.alta_pasarela_pendiente}
                    </td>
                    <td>
                      <button type="button" className="panel-enlace" onClick={() => verCobros(s.id)}>
                        {t.intermediacion.ver_cobros}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EstadoLista>
        </section>

        {estado === 'listo' &&
          accesos
            .filter((s) => s.id === expandida)
            .map((s) => (
              <div key={s.id} className="panel-grilla panel-columnas-2">
                <section className="panel-tarjeta tarjeta-desplazable">
                  <div className="panel-tarjeta-titulo">
                    <h2>{t.intermediacion.cobros_titulo}</h2>
                    <span className="panel-mini">{s.cliente_nombre || '—'}</span>
                  </div>
                  <EstadoLista
                    estado={cargandoCobros === s.id ? 'cargando' : 'listo'}
                    error={null}
                    vacio={cargandoCobros !== s.id && (cobrosPorAcceso[s.id] || []).length === 0}
                  >
                    <table className="panel-tabla">
                      <thead>
                        <tr>
                          <th>{t.intermediacion.cobros_col_periodo}</th>
                          <th>{t.intermediacion.cobros_col_medio}</th>
                          <th>{t.intermediacion.cobros_col_monto}</th>
                          <th>{t.intermediacion.cobros_col_estado}</th>
                          <th>{t.intermediacion.cobros_col_fecha}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cobrosPorAcceso[s.id] || []).map((c) => (
                          <tr key={c.id}>
                            <td>{c.periodo}</td>
                            <td>{t.intermediacion[`medio_${c.medio}`] || c.medio}</td>
                            <td>{formatearImporte(c.monto, c.moneda, locale)}</td>
                            <td>
                              <span className={claseBadge(c.estado_cobro)}>
                                {t.intermediacion[`cobro_${c.estado_cobro}`] || c.estado_cobro}
                              </span>
                            </td>
                            <td>{c.fecha_cobro || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EstadoLista>
                </section>

                <section className="panel-tarjeta">
                  <div className="panel-tarjeta-titulo">
                    <h2>{t.intermediacion.alta_pasarela_titulo}</h2>
                  </div>
                  {s.alta_en_pasarela ? (
                    <div className="panel-fila-alerta">
                      <div>
                        <b>
                          {t.intermediacion.alta_pasarela_hecha.replace(
                            '{proveedor}',
                            t.intermediacion[`medio_${s.proveedor}`] || s.proveedor
                          )}
                        </b>
                        {s.url_accion && (
                          <span className="panel-mini">
                            <a href={s.url_accion} target="_blank" rel="noreferrer">
                              {t.intermediacion.alta_pasarela_link}
                            </a>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : rielesConectados.length === 0 ? (
                    <Alert variant="warning">{t.errores.motivos.sin_pasarela_conectada}</Alert>
                  ) : (
                    <>
                      {rielesConectados.length > 1 && (
                        <div className="molde-formgrid">
                          <div className="molde-ancho">
                            <FormField
                              label={t.intermediacion.alta_pasarela_riel}
                              name={`riel-${s.id}`}
                              type="select"
                              value={rielElegido[s.id] || ''}
                              onChange={(e) => setRielElegido((r) => ({ ...r, [s.id]: e.target.value }))}
                            >
                              <option value="">{t.comun.seleccionar}</option>
                              {rielesConectados.map((riel) => (
                                <option key={riel} value={riel}>
                                  {t.intermediacion[`medio_${riel}`] || riel}
                                </option>
                              ))}
                            </FormField>
                          </div>
                        </div>
                      )}
                      <div className="molde-acciones">
                        <Button
                          onClick={() => darDeAlta(s.id)}
                          disabled={dandoAlta === s.id || (rielesConectados.length > 1 && !rielElegido[s.id])}
                        >
                          {dandoAlta === s.id ? t.comun.guardando : t.intermediacion.alta_pasarela_boton}
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            ))}
      </div>
    </div>
  );
}
