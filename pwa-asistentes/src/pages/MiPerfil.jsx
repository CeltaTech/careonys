import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { activarPush, desactivarPush, pushSoportado, suscripcionActual } from '../lib/push';
import { traducirValor } from '../i18n/valores';
import { nombreTipo } from '../lib/tipoDeAsistente';
import Matricula from '../components/Matricula';
import CarpetaDePapeles from '../components/CarpetaDePapeles';
import Consentimientos from '../components/Consentimientos';
import LlavesDeEsteAparato from '../components/LlavesDeEsteAparato';

export default function MiPerfil() {
  const { t } = useLocale();
  const { logout } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [notifActivas, setNotifActivas] = useState(false);
  const [notifCargando, setNotifCargando] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [dispCargando, setDispCargando] = useState(false);
  const [dispError, setDispError] = useState('');

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

  // El interruptor de disponibilidad. Lo mueve el Asistente y nadie más: `estado` —lo que decide
  // la Prestadora— es otra cosa y se muestra arriba, sin tocar.
  //
  // Lo que queda en pantalla es lo que contestó el backend, no lo que se mandó. Si el pedido no
  // llegó, el interruptor tiene que seguir mostrando lo de antes: decirle a alguien que quedó no
  // disponible cuando en realidad no quedó es el único error que esta pantalla no puede cometer.
  async function alternarDisponibilidad() {
    setDispError('');
    setDispCargando(true);
    try {
      const ahora = perfil?.disponible_para_ofertas !== false;
      const { disponible_para_ofertas } = await api.cambiarDisponibilidad(!ahora);
      setPerfil((previo) => ({ ...previo, disponible_para_ofertas }));
    } catch (e) {
      setDispError(mensajeDeError(e, t, 'cambiar disponibilidad'));
    } finally {
      setDispCargando(false);
    }
  }

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

  // La salida va siempre, también cuando el perfil no se pudo leer: es la única forma de salir.
  const salir = (
    <button type="button" className="btn btn-full" onClick={logout}>
      {t.nav.cerrar_sesion}
    </button>
  );

  if (error) {
    return (
      <div>
        <div className="alert alert-error" role="alert">{error}</div>
        {salir}
      </div>
    );
  }
  if (!perfil) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  return (
    <div>
      <h1>{t.perfil.titulo}</h1>

      <section className="pwa-card">
        {/* La foto que ven las Familias. Va arriba de todo y sólo si hay: un recuadro vacío con
            la silueta de nadie no informa nada. Se mira y no se cambia —la carga la Prestadora,
            igual que el resto de sus datos—. */}
        {perfil.foto_url && <img className="foto-perfil" src={perfil.foto_url} alt={t.perfil.foto_alt} />}

        <dl className="lista-datos">
          <dt>{t.perfil.nombre}</dt>
          <dd>{perfil.nombre}</dd>
          <dt>{t.perfil.email}</dt>
          <dd>{perfil.email}</dd>
          <dt>{t.perfil.telefono}</dt>
          <dd>{perfil.telefono || '—'}</dd>
          <dt>{t.perfil.tipo}</dt>
          <dd>{nombreTipo(perfil.tipos_asistente, t)}</dd>
          {/* Cómo está contratado. Es lo que decide cómo cobra y qué le corresponde, y si quedó
              cargado al revés conviene que lo vea él, que es el único que lo sabe con certeza. */}
          <dt>{t.perfil.vinculo}</dt>
          <dd>{traducirValor(t.perfil, `vinculo_${perfil.tipo_vinculo}`)}</dd>
          <dt>{t.perfil.zonas}</dt>
          <dd>{(perfil.zonas || []).join(', ') || '—'}</dd>
          <dt>{t.perfil.estado}</dt>
          <dd>
            <span className={`badge badge-${perfil.estado}`}>{traducirValor(t.perfil, `estado_${perfil.estado}`)}</span>
          </dd>
        </dl>
      </section>

      {/* El interruptor de disponibilidad. Va inmediatamente después del estado que decide la
          Prestadora, y con su propio título, para que se vea que son dos cosas distintas: una la
          decide ella y la otra la decide él. */}
      <section className="pwa-card">
        <h2>{t.perfil.disponibilidad_titulo}</h2>
        <div className="mini">
          {perfil.disponible_para_ofertas !== false
            ? t.perfil.disponibilidad_disponible
            : t.perfil.disponibilidad_no_disponible}
        </div>
        <button type="button" className="btn btn-full pwa-card-pie" disabled={dispCargando} onClick={alternarDisponibilidad}>
          {dispCargando
            ? t.comun.guardando
            : perfil.disponible_para_ofertas !== false
            ? t.perfil.disponibilidad_ponerse_no_disponible
            : t.perfil.disponibilidad_ponerse_disponible}
        </button>
        {dispError && <div className="alert alert-error pwa-card-pie" role="alert">{dispError}</div>}
        {/* Lo que dijeron de su trabajo, y lo que él tiene para contestar (pendiente #85). Va acá
            y no en la barra de abajo porque no es trabajo del día: se mira cada tanto. */}
        <Link to="/calificaciones" className="btn btn-full pwa-card-pie">
          {t.perfil.ver_calificaciones}
        </Link>
      </section>

      {/* La Matrícula va antes que las notificaciones porque es lo único de esta
          pantalla que puede dejarlo sin trabajo. Si le corresponde y está trabada,
          tiene que ser lo primero que vea. Si su tipo no requiere Matrícula, este
          bloque no se dibuja. */}
      <Matricula />

      {/* Los papeles que le exige la Prestadora, y su Certificado de Aptitud. Van después de la
          Matrícula por la misma razón por la que ella va primero: la Matrícula lo traba hoy, y
          esto le avisa de lo que lo va a trabar. Si la Prestadora no exige ninguno y no hay
          Certificado, este bloque no se dibuja. */}
      <CarpetaDePapeles />

      <section className="pwa-card">
        <h2>{t.perfil.notificaciones_titulo}</h2>
        {!pushSoportado() ? (
          <div className="mini">{t.perfil.notificaciones_no_soportadas}</div>
        ) : (
          <>
            {notifActivas && !notifCargando && <div className="mini">{t.perfil.notificaciones_activas}</div>}
            <button type="button" className="btn btn-primary btn-full pwa-card-pie" disabled={notifCargando} onClick={alternarNotificaciones}>
              {notifCargando
                ? t.perfil.notificaciones_activando
                : notifActivas
                ? t.perfil.notificaciones_desactivar
                : t.perfil.notificaciones_activar}
            </button>
            {notifError && <div className="alert alert-error pwa-card-pie" role="alert">{notifError}</div>}
          </>
        )}
      </section>

      {/* Pendiente #102. Vive en Mi Perfil y no en una pantalla aparte a
          propósito: es algo que la persona tiene que poder volver a mirar
          cuando quiera, no un trámite de una sola vez que después desaparece. */}
      <Consentimientos />

      {/* Cómo se entra a esta aplicación, y cómo se sale. Va al final: son cosas de este aparato
          y no del trabajo. */}
      <section className="pwa-card">
        <h2>{t.auth.mi_clave}</h2>
        <Link to="/mi-clave" className="btn btn-full">
          {t.auth.mi_clave_titulo}
        </Link>
      </section>

      {/* Las llaves son una copia compartida con la otra aplicación: la tarjeta que las envuelve
          les acomoda el margen del título. */}
      <section className="pwa-card pwa-card-llaves">
        <LlavesDeEsteAparato />
      </section>

      {salir}
    </div>
  );
}
