import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { esteAparatoGuardaLlaves, loCancelaronAMano } from '../lib/llaveDelDispositivo';
import { abrirSesionConLaHuella, hayAccesoGuardado, olvidarAccesoGuardado } from '../lib/accesoGuardado';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano. Lo único que cambia entre las dos aplicaciones es `lib/api.js`, que cada una
// tiene con su propia dirección.
//
// SE ENTRA CON EL NOMBRE DE USUARIO Y LA CONTRASEÑA. El nombre es único en todo el sistema, así que
// no hace falta decir de qué Prestadora es la cuenta: la marca de la Prestadora aparece después de
// entrar (`context/PerfilContext.jsx`).
//
// INGRESAR CON BIOMETRÍA abre la sesión que quedó guardada al cerrar (`lib/accesoGuardado.js`).

export default function Login() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hayLlave, setHayLlave] = useState(false);
  const [entrandoConLlave, setEntrandoConLlave] = useState(false);

  useEffect(() => {
    let vigente = true;
    esteAparatoGuardaLlaves()
      .then((puede) => {
        if (vigente) setHayLlave(puede && hayAccesoGuardado());
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    const { error: errorLogin } = await login(usuario, password);
    setEnviando(false);
    if (errorLogin) {
      setError(t.auth.error_credenciales);
    }
  }

  async function alEntrarConLlave() {
    setError('');
    setEntrandoConLlave(true);
    try {
      // Si sale bien no hay nada más que hacer acá: la sesión queda abierta y quien escucha los
      // cambios de sesión cambia de pantalla solo.
      const llaveId = await abrirSesionConLaHuella();
      try {
        await api.llaveUsada(llaveId);
      } catch (errorAviso) {
        // Un aparato revocado desde otro lado no abre: se olvida el acceso y se cierra la sesión.
        if (errorAviso?.status !== 404) return;
        olvidarAccesoGuardado();
        setHayLlave(false);
        await supabase.auth.signOut();
        setError(t.auth.llave_error);
      }
    } catch (errorLlave) {
      // Cancelar no es fallar. Quien cierra el pedido del aparato a propósito no necesita que le
      // avisen nada: la contraseña sigue estando ahí abajo. Lo demás deja de ofrecerse, porque la
      // sesión guardada ya no sirve.
      if (!loCancelaronAMano(errorLlave)) {
        setHayLlave(hayAccesoGuardado());
        setError(t.auth.llave_error);
      }
    } finally {
      setEntrandoConLlave(false);
    }
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        <h1>{t.auth.titulo}</h1>
        {/* El motivo queda atado a los dos campos y no a uno: no se dice cuál de los dos está
            mal, a propósito, porque decirlo le regalaría a cualquiera la mitad de la
            respuesta. Los dos quedan marcados y los dos leen el mismo motivo. */}
        {error && <div id="login-error" className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alEnviar}>
          <div className="form-field">
            <label htmlFor="usuario">{t.auth.usuario}</label>
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
                if (error) setError('');
              }}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">{t.auth.password}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={enviando || entrandoConLlave}>
            {enviando ? t.auth.ingresando : t.auth.ingresar}
          </button>
        </form>
        {hayLlave && (
          <>
            <div className="login-separador">{t.auth.llave_o}</div>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={alEntrarConLlave}
              disabled={entrandoConLlave || enviando}
            >
              {entrandoConLlave ? t.auth.llave_esperando : t.auth.llave_entrar}
            </button>
          </>
        )}
        <Link to="/recuperar-clave" className="login-recuperar">{t.auth.recuperar_link}</Link>
      </div>
    </div>
  );
}
