import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';
import { MINIMO_DE_CARACTERES, claveAceptable } from '../lib/reglaDeClave';
import { usuarioBienEscrito } from '../lib/reglaDeUsuario';
import InfoDelCampo from '../components/InfoDelCampo';

const API_URL = import.meta.env.VITE_API_URL;

// Los tres motivos que contesta el backend son definitivos: con ese mismo enlace, reintentar no
// sirve nunca. Cuando llega uno, el formulario se retira en vez de quedar invitando a un intento
// que ya se sabe que va a fallar.
const MOTIVOS_SIN_REINTENTO = ['token_invalido', 'token_ya_usado', 'token_vencido'];

// Los dos que contesta el backend sobre el nombre elegido: van al pie de ese casillero.
const MOTIVOS_DEL_USUARIO = ['usuario_en_uso', 'usuario_mal_escrito'];

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano.
//
// Quien activa la cuenta elige acá su nombre de usuario y su contraseña, en un solo paso.

export default function ActivarCuenta() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  // El enlace sirve sólo si trae las dos cosas: la Prestadora dice en cuál se busca el código.
  const prestadora = searchParams.get('prestadora');
  const token = prestadora ? searchParams.get('token') : null;
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [motivoSinReintento, setMotivoSinReintento] = useState('');
  const [pidiendoEnlace, setPidiendoEnlace] = useState(false);
  const [enlaceNuevoEnviado, setEnlaceNuevoEnviado] = useState(false);
  // Los problemas de acá son de un campo concreto —el nombre mal escrito o ya usado, la contraseña
  // corta, la repetida que no coincide—, así que la advertencia se cuelga de ese campo y no de todo
  // el formulario: quien lo recorre con un lector de pantalla lo escucha al llegar ahí. Aparecen
  // todas a la vez al apretar el botón. Arriba queda el cartel general sólo para lo que contesta el
  // backend y no es de ningún campo en particular.
  const [erroresDeCampo, setErroresDeCampo] = useState({});

  const advertenciaDe = (campo) => erroresDeCampo[campo];
  // La advertencia se va apenas se corrige el campo, sin esperar a que se vuelva a apretar el botón.
  const limpiarAdvertencia = (campo) =>
    setErroresDeCampo((anteriores) => {
      if (!anteriores[campo]) return anteriores;
      const { [campo]: _quitada, ...demas } = anteriores;
      return demas;
    });
  // La pantalla salta al primero de los casilleros que hay que corregir.
  const mostrarErrores = (errores) => {
    setErroresDeCampo(errores);
    const primero = ['usuario', 'password', 'confirmacion'].find((campo) => errores[campo]);
    if (primero) document.getElementById(primero)?.focus();
  };
  const [activada, setActivada] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    const errores = {};
    if (!usuarioBienEscrito(usuario)) errores.usuario = t.auth.usuario_regla;
    if (!claveAceptable(password)) {
      errores.password = t.auth.activar_password_corta.replace('{{minimo}}', MINIMO_DE_CARACTERES);
    } else if (password !== confirmacion) {
      errores.confirmacion = t.auth.activar_no_coincide;
    }
    mostrarErrores(errores);
    if (Object.keys(errores).length > 0) return;

    setEnviando(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/activar-cuenta/${encodeURIComponent(prestadora)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, usuario: usuario.trim(), password }),
      });
      const resultado = await respuesta.json();
      // La explicación viene del backend, que es el único que sabe qué pasó: manda un motivo y
      // acá se busca la frase en las traducciones. Esta pantalla no compara códigos.
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setActivada(true);
    } catch (err) {
      if (MOTIVOS_DEL_USUARIO.includes(err?.motivo)) {
        mostrarErrores({ usuario: mensajeDeError(err, t, 'activar la cuenta') });
        return;
      }
      setError(mensajeDeError(err, t, 'activar la cuenta'));
      if (MOTIVOS_SIN_REINTENTO.includes(err?.motivo)) setMotivoSinReintento(err.motivo);
    } finally {
      setEnviando(false);
    }
  }

  // Un enlace nuevo, pedido desde acá cuando el de esta persona venció. El backend contesta siempre
  // lo mismo, haya mandado algo o no, así que la respuesta buena se muestra igual en todos los casos.
  async function pedirEnlaceNuevo() {
    setPidiendoEnlace(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/activar-cuenta/${encodeURIComponent(prestadora)}/enlace-nuevo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setEnlaceNuevoEnviado(true);
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedir un enlace nuevo'));
    } finally {
      setPidiendoEnlace(false);
    }
  }

  if (!token) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.activar_titulo}</h1>
          <div className="alert alert-error" role="alert">{t.auth.activar_token_invalido}</div>
        </div>
      </div>
    );
  }

  if (activada) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.activar_titulo}</h1>
          <div className="alert alert-info" role="status">{t.auth.activar_exito}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.ingresar}</Link>
        </div>
      </div>
    );
  }

  if (motivoSinReintento) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.activar_titulo}</h1>
          {enlaceNuevoEnviado
            ? <div className="alert alert-success" role="status">{t.auth.activar_enlace_nuevo_enviado}</div>
            : <div className="alert alert-error" role="alert">{error}</div>}
          {motivoSinReintento === 'token_ya_usado' && (
            <Link to="/login" className="btn btn-primary btn-full">{t.auth.ingresar}</Link>
          )}
          {motivoSinReintento === 'token_vencido' && !enlaceNuevoEnviado && (
            <button type="button" className="btn btn-primary btn-full" onClick={pedirEnlaceNuevo} disabled={pidiendoEnlace}>
              {t.auth.activar_enlace_nuevo}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        <h1>{t.auth.activar_titulo}</h1>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alEnviar} noValidate>
          <div className="form-field">
            <label htmlFor="usuario">
              {t.auth.usuario}
              <InfoDelCampo texto={t.auth.usuario_regla} etiqueta={t.auth.usuario_info} />
            </label>
            <input
              id="usuario"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value);
                limpiarAdvertencia('usuario');
              }}
              required
              aria-invalid={advertenciaDe('usuario') ? 'true' : undefined}
              aria-describedby={advertenciaDe('usuario') ? 'usuario-error' : undefined}
            />
            {advertenciaDe('usuario') && (
              <span className="form-error" id="usuario-error" role="alert">{advertenciaDe('usuario')}</span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="password">{t.auth.activar_password_nueva}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                limpiarAdvertencia('password');
              }}
              required
              aria-invalid={advertenciaDe('password') ? 'true' : undefined}
              aria-describedby={advertenciaDe('password') ? 'password-error' : undefined}
            />
            {advertenciaDe('password') && (
              <span className="form-error" id="password-error" role="alert">{advertenciaDe('password')}</span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="confirmacion">{t.auth.activar_password_confirmar}</label>
            <input
              id="confirmacion"
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => {
                setConfirmacion(e.target.value);
                limpiarAdvertencia('confirmacion');
              }}
              required
              aria-invalid={advertenciaDe('confirmacion') ? 'true' : undefined}
              aria-describedby={advertenciaDe('confirmacion') ? 'confirmacion-error' : undefined}
            />
            {advertenciaDe('confirmacion') && (
              <span className="form-error" id="confirmacion-error" role="alert">{advertenciaDe('confirmacion')}</span>
            )}
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
            {enviando ? t.auth.activar_enviando : t.auth.activar_confirmar}
          </button>
        </form>
      </div>
    </div>
  );
}
