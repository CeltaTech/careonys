import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
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
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { accesos: filas } = await llamarApi('/accesos');
      setAccesos(filas);
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
                <section key={s.id} className="panel-tarjeta tarjeta-desplazable">
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
            ))}
      </div>
    </div>
  );
}
