import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { MINUTOS_DE_INACTIVIDAD } from '../../lib/cierrePorInactividad';
import '../../styles/molde-paginas.css';

/* Quién puede hacer qué: los permisos de cada rol y el cierre por inactividad. */
export function ConfiguracionAccesos() {
  return (
    <div className="molde-pila">
      <TabPermisos />
      <SaludVisibleParaTodos />
      <CierrePorInactividad />
    </div>
  );
}

/* Si la información de salud de un Paciente la ve sólo quien lo atiende. La opción se muestra al
   revés de como se guarda: «visible para todos» es la restricción de HCE apagada. Donde el país la
   exige queda fija; eso lo contesta la base, y la base también niega apagarla ahí. */
function SaludVisibleParaTodos() {
  const { t } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  const [fija, setFija] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const resultado = await llamarApi('/restriccion-de-hce');
      setVisible(!resultado.rige);
      setFija(resultado.la_exige_el_pais);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      await llamarApi('/restriccion-de-hce', { method: 'PATCH', body: JSON.stringify({ rige: !visible }) });
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <div className="molde-formgrid">
          <FormField
            label={t.configuracion.salud_visible_para_todos}
            name="salud_visible_para_todos"
            type="select"
            value={visible ? 'si' : 'no'}
            disabled={fija}
            onChange={(e) => { setVisible(e.target.value === 'si'); setGuardado(false); }}
          >
            <option value="si">{t.comun.si}</option>
            <option value="no">{t.comun.no}</option>
          </FormField>
        </div>
        {!fija && (
          <div className="molde-acciones">
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        )}
      </EstadoLista>
    </section>
  );
}

// Cuánto queda abierta una sesión del Panel sin nadie delante (lib/cierrePorInactividad.js).
function CierrePorInactividad() {
  const { t } = useLocale();
  const { refrescarUsuario } = useAuth();
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [activo, setActivo] = useState(true);
  const [minutos, setMinutos] = useState('');
  const [bordes, setBordes] = useState(MINUTOS_DE_INACTIVIDAD);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const resultado = await llamarApi('/cierre-por-inactividad');
      setActivo(resultado.activo);
      setMinutos(String(resultado.minutos));
      if (resultado.bordes) setBordes(resultado.bordes);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      await llamarApi('/cierre-por-inactividad', {
        method: 'PATCH',
        body: JSON.stringify({ activo, minutos: Number(minutos) }),
      });
      // La configuración viaja pegada al usuario: sin releerlo, esta misma sesión seguiría
      // contando con la de antes hasta la próxima entrada.
      await refrescarUsuario();
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.inactividad_titulo}</h2>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <label className="panel-checkbox">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => { setActivo(e.target.checked); setGuardado(false); }}
          />
          {t.configuracion.inactividad_activo}
        </label>
        {activo && (
          <div className="molde-formgrid">
            <FormField
              label={t.configuracion.inactividad_minutos}
              name="cierre_por_inactividad_minutos"
              type="number"
              min={bordes.minimo}
              max={bordes.maximo}
              step={1}
              value={minutos}
              onChange={(e) => { setMinutos(e.target.value); setGuardado(false); }}
            />
          </div>
        )}
        <div className="molde-acciones">
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </EstadoLista>
    </section>
  );
}

function TabPermisos() {
  const { t } = useLocale();
  const [permisos, setPermisos] = useState([]);
  const [coordinadores, setCoordinadores] = useState([]);
  const [politica, setPolitica] = useState('omitir');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardandoAccion, setGuardandoAccion] = useState(null);
  const [guardandoPolitica, setGuardandoPolitica] = useState(false);
  const [politicaGuardada, setPoliticaGuardada] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [{ permisos: filas, coordinadores: coords }, { politica_verificacion_alta_manual }] = await Promise.all([
        llamarApi('/permisos'),
        llamarApi('/politica-verificacion'),
      ]);
      setPermisos(filas);
      setCoordinadores(coords);
      setPolitica(politica_verificacion_alta_manual);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function actualizarLocal(accion, cambios) {
    setPermisos((filas) => filas.map((f) => (f.accion === accion ? { ...f, ...cambios } : f)));
  }

  function excepcionDe(fila, coordId) {
    if ((fila.excepciones_permitir || []).includes(coordId)) return 'permitir';
    if ((fila.excepciones_denegar || []).includes(coordId)) return 'denegar';
    return 'general';
  }

  function setExcepcion(accion, coordId, valor) {
    setPermisos((filas) => filas.map((f) => {
      if (f.accion !== accion) return f;
      const permitir = (f.excepciones_permitir || []).filter((id) => id !== coordId);
      const denegar = (f.excepciones_denegar || []).filter((id) => id !== coordId);
      if (valor === 'permitir') permitir.push(coordId);
      if (valor === 'denegar') denegar.push(coordId);
      return { ...f, excepciones_permitir: permitir, excepciones_denegar: denegar };
    }));
  }

  async function guardar(fila) {
    setGuardandoAccion(fila.accion);
    setError(null);
    try {
      await llamarApi(`/permisos/${fila.accion}`, {
        method: 'PATCH',
        body: JSON.stringify({
          alcance: fila.alcance,
          excepciones_permitir: fila.excepciones_permitir,
          excepciones_denegar: fila.excepciones_denegar,
        }),
      });
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoAccion(null);
    }
  }

  async function guardarPolitica() {
    setGuardandoPolitica(true);
    setError(null);
    setPoliticaGuardada(false);
    try {
      await llamarApi('/politica-verificacion', { method: 'PATCH', body: JSON.stringify({ politica }) });
      setPoliticaGuardada(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoPolitica(false);
    }
  }

  return (
    <>
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.permisos_titulo}</h2>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.permisos_col_accion}</th>
              <th>{t.configuracion.permisos_col_alcance}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {permisos.map((fila) => (
              <tr key={fila.accion}>
                <td><b>{t.configuracion[`permisos_accion_${fila.accion}`]}</b></td>
                <td>
                  <select
                    value={fila.alcance}
                    onChange={(e) => actualizarLocal(fila.accion, { alcance: e.target.value })}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.permisos_col_alcance, nombre: t.configuracion[`permisos_accion_${fila.accion}`] })}
                  >
                    <option value="solo_admin">{t.configuracion.permisos_alcance_solo_admin}</option>
                    <option value="admin_y_coordinador">{t.configuracion.permisos_alcance_admin_y_coordinador}</option>
                  </select>
                  {coordinadores.length > 0 && (
                    <div className="panel-permisos-excepciones">
                      <span>{t.configuracion.permisos_excepciones_titulo}</span>
                      {coordinadores.map((c) => (
                        <label key={c.id} className="panel-permisos-excepcion-fila">
                          {c.nombre}
                          <select
                            value={excepcionDe(fila, c.id)}
                            onChange={(e) => setExcepcion(fila.accion, c.id, e.target.value)}
                          >
                            <option value="general">{t.configuracion.permisos_excepcion_general}</option>
                            <option value="permitir">{t.configuracion.permisos_excepcion_permitir}</option>
                            <option value="denegar">{t.configuracion.permisos_excepcion_denegar}</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <Button variant="secondary" onClick={() => guardar(fila)} disabled={guardandoAccion === fila.accion}>
                    {guardandoAccion === fila.accion ? t.comun.guardando : t.comun.guardar}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </section>

    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.permisos_verificacion_titulo}</h2>
      </div>
      {politicaGuardada && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <div className="molde-formgrid">
        <FormField
          label={t.configuracion.permisos_verificacion_label}
          name="politica_verificacion"
          type="select"
          value={politica}
          onChange={(e) => { setPolitica(e.target.value); setPoliticaGuardada(false); }}
        >
          <option value="omitir">{t.configuracion.permisos_verificacion_omitir}</option>
          <option value="pendiente">{t.configuracion.permisos_verificacion_pendiente}</option>
          <option value="aprobado">{t.configuracion.permisos_verificacion_aprobado}</option>
        </FormField>
      </div>
      <div className="molde-acciones">
        <Button onClick={guardarPolitica} disabled={guardandoPolitica}>
          {guardandoPolitica ? t.comun.guardando : t.comun.guardar}
        </Button>
      </div>
    </section>
    </>
  );
}
