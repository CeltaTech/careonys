import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { useAuth } from '../context/AuthContext';
import { esAdminDePrestadora } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { ElegirLugares } from '../components/lugares/ElegirLugares';
import { llamarApiLugaresDeTrabajo } from '../lib/apiLugaresDeTrabajo';
import { con } from '../lib/textos';
import { nombreDeLaAccion, queCambio } from '../lib/registroDeActividad';
import { AusenciasDelCoordinador } from './AusenciasDelCoordinador';
import { TurnosQueTraban } from '../components/cuenta/TurnosQueTraban';
import '../styles/molde-paginas.css';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/usuarios${path}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}

/* Cuánto queda a la vista el aviso de que algo salió bien. */
const DURACION_DEL_AVISO = 4000;

export function UsuariosPanel() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  /* Las cuentas desactivadas las ve sólo el Administrador, y la elección no se recuerda: cada vez
     que se abre la lista, se abre en las activas. */
  const veDesactivadas = esAdminDePrestadora(usuario?.rol);
  const [vista, setVista] = useState('activas');
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!aviso) return undefined;
    const reloj = setTimeout(() => setAviso(null), DURACION_DEL_AVISO);
    return () => clearTimeout(reloj);
  }, [aviso]);

  const filtro = veDesactivadas ? (
    <div className="panel-filtros">
      <select value={vista} onChange={(e) => setVista(e.target.value)} aria-label={t.usuarios_panel.filtro_cuentas}>
        <option value="activas">{t.usuarios_panel.filtro_activas}</option>
        <option value="desactivadas">{t.usuarios_panel.filtro_desactivadas}</option>
      </select>
    </div>
  ) : null;

  return veDesactivadas && vista === 'desactivadas'
    ? <CuentasDesactivadas filtro={filtro} aviso={aviso} onReactivada={() => setAviso(t.usuarios_panel.reactivada)} />
    : <CuentasActivas filtro={filtro} aviso={aviso} />;
}

function CuentasActivas({ filtro, aviso }) {
  const { t } = useLocale();
  const [usuarios, setUsuarios] = useState([]);
  const [sufijo, setSufijo] = useState('');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { usuarios: filas, sufijo: sufijoDeLaPrestadora } = await llamarApi('');
      setUsuarios(filas);
      setSufijo(sufijoDeLaPrestadora ?? '');
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /* Desde acá se gestiona sólo la coordinación: la cuenta del Administrador y la del equipo técnico
     las hace CeltaTech. */
  const puedeEditar = (fila) => fila.rol === 'coordinador';

  return (
    <div>
      <Cabecera titulo={t.usuarios_panel.titulo}>
        <Button onClick={() => setCreandoNuevo(true)}>
          {t.usuarios_panel.nuevo_coordinador}
        </Button>
      </Cabecera>
      {aviso && <Alert variant="success">{aviso}</Alert>}

      <section className="panel-tarjeta">
        {filtro}
        <div className="panel-tarjeta-titulo">
          <h2>{t.usuarios_panel.titulo}</h2>
          {estado === 'listo' && <span className="panel-mini">{usuarios.length}</span>}
        </div>
        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && usuarios.length === 0} recargar={recargar}>
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.usuarios_panel.col_nombre}</th>
                <th>{t.usuarios_panel.col_rol}</th>
                <th>{t.usuarios_panel.col_telefono}</th>
                <th>{t.configuracion.lugares_alcance_titulo}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nombre}</b></td>
                  <td><span className="badge badge-neutro">{t.usuarios_panel[`rol_${u.rol}`]}</span></td>
                  <td>{u.telefono || '—'}</td>
                  {/* Quien administra alcanza a toda la Organización, así que el alcance por lugares
                      no le dice nada: es la coordinación la que se acota. */}
                  <td>{u.rol === 'coordinador' ? (u.lugares === 1 ? t.configuracion.lugares_elegidos_uno : con(t.configuracion.lugares_elegidos, { cantidad: u.lugares ?? 0 })) : '—'}</td>
                  <td>
                    {puedeEditar(u) && (
                      <button type="button" className="panel-enlace" onClick={() => setEditando(u)}>{t.comun.editar}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {creandoNuevo && (
        <NuevoUsuarioPanel
          sufijo={sufijo}
          onClose={() => setCreandoNuevo(false)}
          onCreado={() => {
            recargar();
          }}
        />
      )}

      {editando && (
        <EditarUsuarioPanel
          usuario={editando}
          otrosCoordinadores={usuarios.filter((u) => u.rol === 'coordinador' && u.id !== editando.id)}
          onClose={() => setEditando(null)}
          onActualizado={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

/* El nombre de usuario se escribe en dos partes: la primera la elige quien da el alta, y la segunda
   es el código de la Prestadora, que va pegado al casillero y no se escribe. */
function NuevoUsuarioPanel({ sufijo, onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const modalCreada = useModalAccesible(onClose);
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [telefono, setTelefono] = useState('');
  /* Hasta dónde llega esta cuenta. Se guardan lugares de la lista de la Prestadora, nunca nombres
     tecleados: mientras el alcance de la coordinadora y la zona de la Asistente eran dos textos
     escritos a mano, una letra distinta en uno de los dos no encontraba a nadie y nadie se
     enteraba. */
  const [lugares, setLugares] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [creado, setCreado] = useState(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      const resultado = await llamarApi('', {
        method: 'POST',
        body: JSON.stringify({ email, nombre, usuario, telefono, lugares }),
      });
      setCreado({ usuario: resultado.usuario, passwordTemporal: resultado.passwordTemporal });
      onCreado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  if (creado) {
    return (
      <div className="panel-modal-fondo" onClick={onClose}>
        <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modalCreada.props}>
          <h2 id={modalCreada.idTitulo}>{t.usuarios_panel.cuenta_creada_titulo}</h2>
          <dl className="panel-detalle-lista">
            <dt>{t.usuarios_panel.col_usuario}</dt>
            <dd><code>{creado.usuario}</code></dd>
            <dt>{t.usuarios_panel.password_temporal}</dt>
            <dd><code>{creado.passwordTemporal}</code></dd>
          </dl>
          <div className="panel-modal-acciones">
            <Button onClick={onClose}>{t.comun.cerrar}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.usuarios_panel.nuevo_coordinador}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="molde-formgrid">
          <FormField label={t.usuarios_panel.col_nombre} name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <FormField label={t.usuarios_panel.col_usuario} name="usuario" autoComplete="off" unidad={sufijo} ayuda={t.usuarios_panel.usuario_formato} value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          <FormField label={t.usuarios_panel.col_email} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <FormField label={t.usuarios_panel.col_telefono} name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <div className="molde-ancho">
            <h3>{t.configuracion.lugares_alcance_titulo}</h3>
            <ElegirLugares valor={lugares} onChange={setLugares} deshabilitado={guardando} />
          </div>
        </div>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || !email || !nombre || !usuario}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditarUsuarioPanel({ usuario, otrosCoordinadores, onClose, onActualizado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [telefono, setTelefono] = useState(usuario.telefono || '');
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState(null);
  // Los turnos que no dejaron desactivar la cuenta, con qué hacer con cada uno.
  const [traban, setTraban] = useState(null);

  /* Hasta dónde llega esta cuenta. Vive en su propia tabla y se lee y se escribe por el backend, que
     deja guardados exactamente los lugares que quedaron tildados. Mientras no se pudo leer no se
     manda nada al guardar: escribir una lista que no se llegó a cargar dejaría a la coordinadora
     sin alcance sin que nadie lo haya decidido. */
  const esCoordinador = usuario.rol === 'coordinador';
  const [lugares, setLugares] = useState([]);
  const [estadoLugares, setEstadoLugares] = useState(esCoordinador ? 'cargando' : 'listo');
  const [errorLugares, setErrorLugares] = useState(null);

  const cargarLugares = useCallback(async () => {
    if (!esCoordinador) return;
    setEstadoLugares('cargando');
    setErrorLugares(null);
    try {
      const datos = await llamarApiLugaresDeTrabajo(`/usuario/${usuario.id}`);
      setLugares(datos.lugares ?? []);
      setEstadoLugares('listo');
    } catch (err) {
      setErrorLugares(mensajeDeError(err, t));
      setEstadoLugares('error');
    }
  }, [esCoordinador, usuario.id, t]);

  useEffect(() => {
    cargarLugares();
  }, [cargarLugares]);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi(`/${usuario.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre, telefono }),
      });
      if (esCoordinador && estadoLugares === 'listo') {
        await llamarApiLugaresDeTrabajo(`/usuario/${usuario.id}`, {
          method: 'PUT',
          body: JSON.stringify({ lugares }),
        });
      }
      onActualizado();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  async function handleDarDeBaja() {
    // La cuenta no se borra: se desactiva, y guarda el motivo.
    const motivo = await confirmarDestructivo({ texto: t.usuarios_panel.confirmar_baja, motivo: true });
    if (!motivo) return;

    setBorrando(true);
    setError(null);
    setTraban(null);
    try {
      await llamarApi(`/${usuario.id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) });
      onActualizado();
    } catch (err) {
      if (Array.isArray(err.motivos) && err.motivos.length > 0) {
        setTraban({ motivos: err.motivos, turnos: err.turnos ?? [] });
      } else {
        setError(mensajeDeError(err, t));
      }
      setBorrando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{usuario.nombre}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        {traban && <TurnosQueTraban motivos={traban.motivos} turnos={traban.turnos} />}
        <div className="molde-formgrid">
          <FormField label={t.usuarios_panel.col_nombre} name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <FormField label={t.usuarios_panel.col_telefono} name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          {esCoordinador && (
            <div className="molde-ancho">
              <h3>{t.configuracion.lugares_alcance_titulo}</h3>
              <EstadoLista estado={estadoLugares} error={errorLugares} recargar={cargarLugares}>
                <ElegirLugares valor={lugares} onChange={setLugares} deshabilitado={guardando || borrando} />
              </EstadoLista>
            </div>
          )}
        </div>
        {esCoordinador && (
          <AusenciasDelCoordinador usuario={usuario} otrosCoordinadores={otrosCoordinadores} />
        )}
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={handleDarDeBaja} disabled={guardando || borrando}>
            {borrando ? t.comun.guardando : t.usuarios_panel.dar_de_baja}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={guardando || borrando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || borrando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* LAS CUENTAS DESACTIVADAS. Sólo para leer, y con una única acción: reactivar. Quién las ve lo
   decide la base, no esta pantalla; el filtro que lleva hasta acá sólo se le muestra a quien la
   base se las va a mostrar. */
function CuentasDesactivadas({ filtro, aviso, onReactivada }) {
  const { t, locale } = useLocale();
  const [cuentas, setCuentas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { usuarios: filas } = await llamarApi('/desactivadas');
      setCuentas(filas ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <div>
      <Cabecera titulo={t.usuarios_panel.titulo} />
      {aviso && <Alert variant="success">{aviso}</Alert>}

      <section className="panel-tarjeta">
        {filtro}
        <div className="panel-tarjeta-titulo">
          <h2>{t.usuarios_panel.filtro_desactivadas}</h2>
          {estado === 'listo' && <span className="panel-mini">{cuentas.length}</span>}
        </div>
        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && cuentas.length === 0}
          mensajeVacio={t.usuarios_panel.sin_desactivadas}
          recargar={recargar}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.usuarios_panel.col_nombre}</th>
                <th>{t.usuarios_panel.col_rol}</th>
                <th>{t.usuarios_panel.col_desactivada_en}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.nombre}</b></td>
                  <td><span className="badge badge-neutro">{t.usuarios_panel[`rol_${c.rol}`]}</span></td>
                  <td className="panel-mini">{new Date(c.desactivada_en).toLocaleString(locale)}</td>
                  <td>
                    <button type="button" className="panel-enlace" onClick={() => setAbierta(c)}>{t.usuarios_panel.ver}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {abierta && (
        <VerCuentaDesactivada
          cuenta={abierta}
          onClose={() => setAbierta(null)}
          onReactivada={() => {
            setAbierta(null);
            onReactivada();
            recargar();
          }}
        />
      )}
    </div>
  );
}

/* También la usa el Padrón para un Asistente desactivado: ahí `rol` es 'asistente' y `cuenta.id` es su
   usuario. */
export function VerCuentaDesactivada({ cuenta, rol = null, onClose, onReactivada }) {
  const { t, locale } = useLocale();
  const [reactivando, setReactivando] = useState(false);
  const modal = useModalAccesible(reactivando ? () => {} : onClose);
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [errorAlReactivar, setErrorAlReactivar] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      setDatos(await llamarApi(`/desactivadas/${cuenta.id}${rol ? `?rol=${rol}` : ''}`));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [cuenta.id, rol, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleReactivar() {
    setReactivando(true);
    setErrorAlReactivar(null);
    try {
      await llamarApi(`/${cuenta.id}/reactivar`, { method: 'POST' });
      onReactivada();
    } catch (err) {
      setErrorAlReactivar(mensajeDeError(err, t));
      setReactivando(false);
    }
  }

  const fecha = (valor) => (valor ? new Date(valor).toLocaleString(locale) : '—');
  const c = datos?.cuenta;
  const historial = datos?.historial ?? [];

  return (
    <div className="panel-modal-fondo" onClick={reactivando ? undefined : onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{cuenta.nombre}</h2>
        {errorAlReactivar && <Alert variant="error">{errorAlReactivar}</Alert>}
        <EstadoLista estado={estado} error={error} recargar={cargar}>
          {c && (
            <>
              <dl className="panel-detalle-lista">
                <dt>{t.usuarios_panel.col_usuario}</dt>
                <dd>{c.nombre_de_usuario || '—'}</dd>
                <dt>{t.usuarios_panel.col_email}</dt>
                <dd>{c.email || '—'}</dd>
                <dt>{t.usuarios_panel.col_telefono}</dt>
                <dd>{c.telefono || '—'}</dd>
                <dt>{t.usuarios_panel.col_rol}</dt>
                <dd>{t.usuarios_panel[`rol_${c.rol}`] || '—'}</dd>
                <dt>{t.usuarios_panel.col_alta}</dt>
                <dd>{fecha(c.created_at)}</dd>
                <dt>{t.usuarios_panel.col_desactivada_en}</dt>
                <dd>{fecha(c.desactivada_en)}</dd>
                <dt>{t.usuarios_panel.col_motivo}</dt>
                <dd>{c.motivo_de_la_desactivacion || '—'}</dd>
              </dl>

              <h3>{t.usuarios_panel.historial}</h3>
              <EstadoLista
                estado="listo"
                vacio={historial.length === 0}
                mensajeVacio={t.usuarios_panel.sin_historial}
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
                    {historial.map((fila) => (
                      <tr key={fila.id}>
                        <td className="panel-mini">{fecha(fila.created_at)}</td>
                        <td><b>{fila.usuarios?.nombre || '—'}</b></td>
                        <td>{nombreDeLaAccion(fila, t)}</td>
                        <td>{queCambio(fila, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EstadoLista>
            </>
          )}
        </EstadoLista>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={reactivando}>{t.comun.cerrar}</Button>
          <Button onClick={handleReactivar} disabled={reactivando || estado !== 'listo'}>
            {reactivando ? t.usuarios_panel.reactivando : t.usuarios_panel.reactivar}
          </Button>
        </div>
      </div>
    </div>
  );
}
