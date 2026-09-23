import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';
import { MINIMO_DE_CARACTERES, claveAceptable } from '../lib/reglaDeClave';

const API_URL = import.meta.env.VITE_API_URL;

// Los tres motivos que contesta el motor son definitivos: con ese mismo enlace, reintentar no
// sirve nunca, así que el formulario se retira en vez de invitar a un intento que va a fallar.
const MOTIVOS_SIN_REINTENTO = ['token_invalido', 'token_ya_usado', 'token_vencido'];

// Donde se elige la clave nueva, con el enlace que llegó por correo.
//
// Es la hermana de `ActivarCuenta`: el mismo formulario contra otra puerta del motor. Se escriben
// aparte porque no son lo mismo —una enciende una cuenta que nunca se usó y la otra reemplaza la
// clave de una que está en uso—, y los enlaces de una no sirven en la otra.
//
// LA APARIENCIA ES LA MÍNIMA A PROPÓSITO. Lo que hace falta hoy es que el enlace del correo
// llegue a algún lado: sin esta pantalla, quien olvida la clave cae en el inicio sin aviso y
// queda afuera. El recorrido se acomoda cuando llegue la maqueta.
export default function ClaveNueva() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [motivoSinReintento, setMotivoSinReintento] = useState('');
  // Cuál de los dos campos es el que está mal, igual que en la activación: el motivo queda atado
  // a ese campo y se escucha al pararse ahí, no solo arriba del todo.
  const [campoConError, setCampoConError] = useState('');
  const [cambiada, setCambiada] = useState(false);
  const [requiereCodigo, setRequiereCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');

  /* EL SEGUNDO FACTOR SE PREGUNTA ACÁ Y NO AL PEDIR EL ENLACE. Preguntarlo antes contestaría si
     ese correo tiene cuenta y si tiene número verificado; acá el enlace ya probó que quien llegó
     lee ese correo, así que no se filtra nada nuevo. El enlace viaja en el cuerpo y no en la
     dirección: una dirección queda escrita en el historial del navegador. */
  useEffect(() => {
    if (!token) return undefined;
    let vigente = true;

    (async () => {
      try {
        const respuesta = await fetch(`${API_URL}/api/recuperar-clave/segundo-factor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const resultado = await respuesta.json().catch(() => ({}));
        if (!vigente || !respuesta.ok) return;
        if (resultado.requiereCodigo) setRequiereCodigo(true);
      } catch (err) {
        // Que esto falle no puede trabar el cambio de clave: el motor vuelve a exigir el código
        // al canjear, así que lo que se pierde es el casillero, no el control.
        console.error('ClaveNueva:', err?.message);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [token]);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    setCampoConError('');

    if (!claveAceptable(password)) {
      setError(t.auth.activar_password_corta.replace('{{minimo}}', MINIMO_DE_CARACTERES));
      setCampoConError('password');
      return;
    }
    if (password !== confirmacion) {
      setError(t.auth.activar_no_coincide);
      setCampoConError('confirmacion');
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/recuperar-clave/canjear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, codigo: codigo || null }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setCambiada(true);
    } catch (err) {
      setError(mensajeDeError(err, t, 'cambiar la contraseña'));
      if (MOTIVOS_SIN_REINTENTO.includes(err?.motivo)) setMotivoSinReintento(err.motivo);
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.clave_nueva_titulo}</h1>
          <div className="alert alert-error" role="alert">{t.auth.clave_nueva_token_invalido}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.ingresar}</Link>
        </div>
      </div>
    );
  }

  if (cambiada) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.clave_nueva_titulo}</h1>
          <div className="alert alert-info" role="status">{t.auth.clave_nueva_exito}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.ingresar}</Link>
        </div>
      </div>
    );
  }

  if (motivoSinReintento) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.clave_nueva_titulo}</h1>
          <div className="alert alert-error" role="alert">{error}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.ingresar}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        <h1>{t.auth.clave_nueva_titulo}</h1>
        <p className="login-subtitulo">{t.auth.clave_nueva_subtitulo}</p>
        {error && <div id="clave-nueva-error" className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alEnviar}>
          <div className="form-field">
            <label htmlFor="password">{t.auth.activar_password_nueva}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (campoConError === 'password') setCampoConError('');
              }}
              required
              aria-invalid={campoConError === 'password' ? true : undefined}
              aria-describedby={campoConError === 'password' ? 'clave-nueva-error' : undefined}
            />
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
                if (campoConError === 'confirmacion') setCampoConError('');
              }}
              required
              aria-invalid={campoConError === 'confirmacion' ? true : undefined}
              aria-describedby={campoConError === 'confirmacion' ? 'clave-nueva-error' : undefined}
            />
          </div>
          {requiereCodigo && (
            <div className="form-field">
              <label htmlFor="codigo">{t.auth.clave_nueva_codigo}</label>
              <input
                id="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
              />
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={enviando || (requiereCodigo && !codigo)}
          >
            {enviando ? t.auth.clave_nueva_guardando : t.auth.clave_nueva_confirmar}
          </button>
        </form>
      </div>
    </div>
  );
}
