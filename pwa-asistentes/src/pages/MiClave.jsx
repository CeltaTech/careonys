import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { MINIMO_DE_CARACTERES, claveAceptable } from '../lib/reglaDeClave';

// Donde alguien que ya entró cambia su propia clave.
//
// SE PIDE LA ACTUAL ANTES DE CAMBIARLA, y se comprueba entrando con ella. Una sesión abierta no
// prueba que quien está delante del teléfono sea el dueño de la cuenta: puede ser cualquiera que
// lo agarró desbloqueado. Sin ese paso, el cambio de clave sería la forma más cómoda de quedarse
// con una cuenta ajena.
//
// No pasa por el motor: la clave se cambia contra el servicio de acceso, con la sesión de quien
// está pidiendo el cambio. Nadie puede cambiar así la de otro. Es el mismo camino que ya usa el
// Panel en `panel/src/pages/MiClave.jsx`.
export default function MiClave() {
  const { t } = useLocale();
  const { session } = useAuth();
  const [actual, setActual] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Cuál de los tres campos es el que está mal: el motivo queda atado a ese campo y se escucha al
  // pararse ahí, no solo arriba del todo.
  const [campoConError, setCampoConError] = useState('');
  const [cambiada, setCambiada] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    setCampoConError('');
    setCambiada(false);

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

    setGuardando(true);
    try {
      const { error: errorActual } = await supabase.auth.signInWithPassword({
        email: session?.user?.email,
        password: actual,
      });
      if (errorActual) {
        setError(t.auth.mi_clave_actual_mal);
        setCampoConError('actual');
        return;
      }

      const { error: errorCambio } = await supabase.auth.updateUser({ password });
      if (errorCambio) throw errorCambio;

      setActual('');
      setPassword('');
      setConfirmacion('');
      setCambiada(true);
    } catch (err) {
      // El texto crudo queda en la consola y a la pantalla va la frase del catálogo.
      console.error('MiClave:', err?.message);
      setError(t.errores.falla_del_sistema);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>{t.auth.mi_clave_titulo}</h1>

      {error && <div id="mi-clave-error" className="alert alert-error" role="alert">{error}</div>}
      {cambiada && <div className="alert alert-info" role="status">{t.auth.mi_clave_exito}</div>}

      <form onSubmit={alEnviar}>
        <div className="form-field">
          <label htmlFor="actual">{t.auth.mi_clave_actual}</label>
          <input
            id="actual"
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => {
              setActual(e.target.value);
              if (campoConError === 'actual') setCampoConError('');
            }}
            required
            aria-invalid={campoConError === 'actual' ? true : undefined}
            aria-describedby={campoConError === 'actual' ? 'mi-clave-error' : undefined}
          />
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
              if (campoConError === 'password') setCampoConError('');
            }}
            required
            aria-invalid={campoConError === 'password' ? true : undefined}
            aria-describedby={campoConError === 'password' ? 'mi-clave-error' : undefined}
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
            aria-describedby={campoConError === 'confirmacion' ? 'mi-clave-error' : undefined}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={guardando}>
          {guardando ? t.auth.mi_clave_guardando : t.auth.mi_clave_guardar}
        </button>
      </form>
    </div>
  );
}
