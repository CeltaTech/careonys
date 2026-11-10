import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { supabase } from '../lib/supabaseClient';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { nombreDeLaAccion, queCambio } from '../lib/registroDeActividad';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { armarCsv, bajarCsv } from '../lib/exportarCsv';
import { encabezadosDelRegistroDeAccesos, renglonDelRegistroDeAccesos } from '../lib/planillaDelRegistroDeAccesos';
import '../styles/molde-paginas.css';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel${path}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token}` },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}

// El año del registro de accesos a la información de salud que se va a borrar por vencimiento,
// con la descarga para guardarlo afuera si la Prestadora quiere. El backend sólo contesta durante
// el año anterior al borrado; fuera de ese año, mientras carga o si no pudo preguntar, no se
// muestra nada, porque la franja es un aviso y no frena ningún trabajo.
function RegistroDeAccesosPorBorrar() {
  const { t, locale } = useLocale();
  const [porBorrar, setPorBorrar] = useState(null);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    llamarApi('/auditoria/registro-de-accesos-por-borrar')
      .then((r) => { if (vigente && r.anio) setPorBorrar(r); })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  if (!porBorrar) return null;
  const anio = String(porBorrar.anio);
  const fecha = new Date(`${porBorrar.se_borra_el}T12:00:00`).toLocaleDateString(locale);

  async function bajar() {
    setBajando(true);
    setError(null);
    try {
      const { accesos } = await llamarApi('/auditoria/registro-de-accesos-por-borrar/renglones');
      const filas = (accesos ?? []).map((a) => renglonDelRegistroDeAccesos(a, t, locale));
      bajarCsv(`${t.auditoria.por_borrar_archivo.replace('{{anio}}', anio)}.csv`, armarCsv(encabezadosDelRegistroDeAccesos(t), filas));
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setBajando(false);
    }
  }

  return (
    <>
      <Alert variant="warning">
        {t.auditoria.por_borrar_aviso.replace('{{anio}}', anio).replace('{{fecha}}', fecha)}{' '}
        <Button variant="secondary" onClick={bajar} disabled={bajando}>
          {t.auditoria.por_borrar_descargar.replace('{{anio}}', anio)}
        </Button>
      </Alert>
      {error && <Alert variant="error">{error}</Alert>}
    </>
  );
}

// Lectura del registro de los accesos (auditoria_de_accesos) y del registro de actividad de la
// Prestadora. El alcance lo decide el backend, no esta pantalla: se ve el registro de una sola
// Organización. El porqué está escrito en `backend/src/routes/panelAuditoria.js`, que es donde
// vive el filtro.
export function Auditoria() {
  const { t, locale } = useLocale();
  const [eventos, setEventos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [actividad, setActividad] = useState([]);
  const [estadoActividad, setEstadoActividad] = useState('cargando');
  const [errorActividad, setErrorActividad] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { eventos: filas } = await llamarApi('/auditoria');
      setEventos(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  const recargarActividad = useCallback(async () => {
    setEstadoActividad('cargando');
    setErrorActividad(null);
    try {
      const { actividad: filas } = await llamarApi('/auditoria/actividad');
      setActividad(filas);
      setEstadoActividad('listo');
    } catch (err) {
      setErrorActividad(mensajeDeError(err, t));
      setEstadoActividad('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
    recargarActividad();
  }, [recargar, recargarActividad]);

  function descripcionEvento(evento) {
    if (evento.tipo_evento === 'login') return t.auditoria.evento_login;
    if (evento.tipo_evento === 'renovacion') return t.auditoria.evento_renovacion;
    if (evento.tipo_evento === 'logout') {
      const motivo = evento.detalle?.motivo;
      if (motivo === 'tope_60min') return t.auditoria.evento_logout_tope;
      if (motivo === 'inactividad_5min') return t.auditoria.evento_logout_inactividad;
      return t.auditoria.evento_logout_manual;
    }
    // mutacion
    if (evento.tabla_afectada) {
      return `${t.auditoria.evento_mutacion} — ${evento.tabla_afectada} (${evento.operacion})`;
    }
    if (evento.detalle?.ruta) {
      return `${t.auditoria.evento_mutacion} — ${evento.detalle.metodo} ${evento.detalle.ruta}`;
    }
    return t.auditoria.evento_mutacion;
  }

  return (
    <div>
      <Cabecera titulo={t.auditoria.titulo} />

      <div className="molde-pila">
        <RegistroDeAccesosPorBorrar />
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.auditoria.titulo}</h2>
            {estado === 'listo' && <span className="panel-mini">{eventos.length}</span>}
          </div>
          <EstadoLista
            estado={estado}
            error={error}
            vacio={estado === 'listo' && eventos.length === 0}
            recargar={recargar}
          >
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{t.auditoria.col_fecha}</th>
                  <th>{t.auditoria.col_admin}</th>
                  <th>{t.auditoria.col_prestadora}</th>
                  <th>{t.auditoria.col_evento}</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td className="panel-mini">{new Date(evento.created_at).toLocaleString(locale)}</td>
                    <td><b>{evento.usuarios?.nombre || '—'}</b></td>
                    <td>{evento.prestadoras?.nombre_fantasia || '—'}</td>
                    <td>{descripcionEvento(evento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EstadoLista>
        </section>

        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.auditoria.actividad_titulo}</h2>
            {estadoActividad === 'listo' && <span className="panel-mini">{actividad.length}</span>}
          </div>
          <EstadoLista
            estado={estadoActividad}
            error={errorActividad}
            vacio={estadoActividad === 'listo' && actividad.length === 0}
            recargar={recargarActividad}
          >
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{t.auditoria.col_fecha}</th>
                  <th>{t.auditoria.col_admin}</th>
                  <th>{t.auditoria.col_accion}</th>
                  <th>{t.auditoria.col_que_cambio}</th>
                </tr>
              </thead>
              <tbody>
                {actividad.map((fila) => (
                  <tr key={fila.id}>
                    <td className="panel-mini">{new Date(fila.created_at).toLocaleString(locale)}</td>
                    <td><b>{fila.usuarios?.nombre || (fila.usuario_id ? '—' : t.clientes.accesos_salud.sistema)}</b></td>
                    <td>{nombreDeLaAccion(fila, t)}</td>
                    <td>{queCambio(fila, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EstadoLista>
        </section>
      </div>
    </div>
  );
}
