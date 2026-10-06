import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { activarPush, desactivarPush, pushSoportado, suscripcionActual } from '../lib/push';
import { useSeVe } from '../context/PerfilContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { useAuth } from '../context/AuthContext';
import { pantallaPermitida } from '../lib/interruptorDeCadaPantalla';
import AvisoInstruccionPendiente from '../components/AvisoInstruccionPendiente';
import LlavesDeEsteAparato from '../components/LlavesDeEsteAparato';

// Una de las dos listas: qué ve esta persona y qué no. La de «qué no ve» pesa lo mismo que la
// otra a propósito. Quien es persona autorizada tiene que poder saber qué le
// falta sin tener que descubrirlo a los tropezones, buscando un botón que no está.
function ListaDeAccesos({ titulo, claves, etiquetas, vacio }) {
  return (
    <>
      <h3 className="pwa-card-dato">{titulo}</h3>
      {claves.length === 0 ? (
        <p className="guardia-card-detalle">{vacio}</p>
      ) : (
        <ul className="lista-tareas">
          {claves.map((clave) => (
            <li key={clave}>{traducirValor(etiquetas, clave)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MiPerfil() {
  const { t } = useLocale();
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();
  const { logout } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [notifActivas, setNotifActivas] = useState(false);
  const [notifCargando, setNotifCargando] = useState(false);
  const [notifError, setNotifError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .perfil()
      .then(({ perfil: data }) => {
        if (activo) setPerfil(data);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    if (pushSoportado()) {
      suscripcionActual().then((suscripcion) => {
        if (activo) setNotifActivas(!!suscripcion);
      });
    }
    return () => {
      activo = false;
    };
  }, []);

  async function alternarNotificaciones() {
    setNotifError('');
    setNotifCargando(true);
    try {
      if (notifActivas) {
        await desactivarPush();
        setNotifActivas(false);
      } else {
        if (Notification.permission === 'denied') {
          setNotifError(t.perfil.notificaciones_permiso_denegado);
          return;
        }
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
          setNotifError(t.perfil.notificaciones_permiso_denegado);
          return;
        }
        await activarPush();
        setNotifActivas(true);
      }
    } catch {
      setNotifError(t.perfil.notificaciones_error);
    } finally {
      setNotifCargando(false);
    }
  }

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!perfil) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  // El orden es el que mandó el backend, que es el del catálogo: dos personas autorizadas del mismo Cliente
  // leen su lista en el mismo orden y se pueden comparar renglón por renglón.
  const accesos = perfil.accesos ? Object.entries(perfil.accesos) : null;
  const loQueVe = accesos ? accesos.filter(([, permitido]) => permitido).map(([clave]) => clave) : [];
  const loQueNoVe = accesos ? accesos.filter(([, permitido]) => !permitido).map(([clave]) => clave) : [];

  return (
    <>
      <h1>{t.perfil.titulo}</h1>

      <AvisoInstruccionPendiente />
      <section className="pwa-card">
        <dl className="pwa-datos">
          <dt>{t.perfil.nombre}</dt>
          <dd>{perfil.nombre}</dd>
          {/* El correo es con lo que se entra. Está acá para que quien no se acuerda con cuál se
              anotó lo pueda mirar, que es lo único que hay para «recuperar el usuario». */}
          <dt>{t.perfil.email}</dt>
          <dd>{perfil.email}</dd>
          <dt>{t.perfil.telefono}</dt>
          <dd>{perfil.telefono || '—'}</dd>
          {/* El plan contratado es una condición comercial, no un dato del cuidado: va con el
              resto de lo que la Prestadora decide mostrar sobre el dinero. Hay Prestadoras que
              cobran por fuera de la aplicación y no quieren que aparezca acá. */}
          {seVe('cliente_pagos_y_suscripcion') && (
            <>
              <dt>{t.perfil.plan}</dt>
              <dd>{perfil.plan || '—'}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="pwa-card">
        <div className="pwa-acciones pwa-acciones-sola">
          {/* Lo que se le cobra al Cliente no cuelga de ningún Paciente: se factura al
              Cliente entero, y una misma factura puede tener renglones de más de una persona
              cuidada. El botón se pregunta lo mismo que la ruta, con la misma función, o quedaría
              un botón que rebota. */}
          {pantallaPermitida('facturas', seVe, puedeVer) && (
            <Link to="/facturas" className="btn">
              {t.facturas.titulo}
            </Link>
          )}
          {/* La biblioteca de la Prestadora no cuelga de un Paciente ni de una modalidad, y no
              muestra nada de nadie; donde la Prestadora no escribió nada, la pantalla lo dice. */}
          <Link to="/contenidos" className="btn">
            {t.contenidos.titulo}
          </Link>
        </div>
      </section>

      {/* Qué ve esta persona y qué no. Al titular se le dice que ve todo y se termina ahí: lo
          suyo no se configura, no hay instrucción que le pueda quitar nada, ni siquiera una
          propia. A cada persona autorizada se le muestran las dos listas enteras, sin nada
          que tocar. */}
      {(perfil.esTitular || accesos) && (
        <section className="pwa-card">
          <h2>{t.perfil.acceso_titulo}</h2>
          {perfil.esTitular ? (
            <p className="pwa-card-dato">{t.perfil.acceso_titular}</p>
          ) : (
            <>
              <ListaDeAccesos
                titulo={t.perfil.acceso_ve}
                claves={loQueVe}
                etiquetas={t.personas_autorizadas}
                vacio={t.perfil.acceso_ve_vacio}
              />
              <ListaDeAccesos
                titulo={t.perfil.acceso_no_ve}
                claves={loQueNoVe}
                etiquetas={t.personas_autorizadas}
                vacio={t.perfil.acceso_no_ve_vacio}
              />
            </>
          )}
        </section>
      )}

      <section className="pwa-card">
        <h2>{t.perfil.notificaciones_titulo}</h2>
        {!pushSoportado() ? (
          <div className="alert">{t.perfil.notificaciones_no_soportadas}</div>
        ) : (
          <div className="pwa-card-pie">
            <button type="button" className="btn btn-primary" disabled={notifCargando} onClick={alternarNotificaciones}>
              {notifCargando
                ? t.perfil.notificaciones_activando
                : notifActivas
                ? t.perfil.notificaciones_desactivar
                : t.perfil.notificaciones_activar}
            </button>
            {notifActivas && !notifCargando && <p className="mini mini-abajo">{t.perfil.notificaciones_activas}</p>}
            {notifError && <div className="alert alert-error" role="alert">{notifError}</div>}
          </div>
        )}
      </section>

      {/* Cómo se entra a esta aplicación y cómo se sale. Va acá abajo, junto con los mensajes al
          celular: son cosas de este aparato y no del cuidado de nadie. */}
      {/* Las llaves son una copia compartida con la otra aplicación y no se tocan desde acá: la
          tarjeta que las envuelve les acomoda el margen del título. */}
      <section className="pwa-card pwa-card-llaves">
        <LlavesDeEsteAparato />
      </section>
      <section className="pwa-card">
        <div className="pwa-acciones pwa-acciones-sola">
          <Link to="/mi-clave" className="btn">
            {t.auth.mi_clave}
          </Link>
          <button type="button" className="btn" onClick={logout}>
            {t.nav.cerrar_sesion}
          </button>
        </div>
      </section>
    </>
  );
}
