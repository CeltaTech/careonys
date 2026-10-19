import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano.
//
// Donde alguien que perdió su contraseña pide el enlace para elegir una nueva.
//
// SE PIDE CON EL NOMBRE DE USUARIO, y el enlace va al email que esa cuenta tiene declarado.
//
// LA RESPUESTA ES LA MISMA EXISTA EL USUARIO O NO, y eso no es un descuido de la pantalla: lo
// decide el backend, que contesta igual en los dos casos. Si contestara distinto, esta pantalla
// sería una forma de averiguar quién tiene cuenta, preguntando de a uno por vez, sin necesidad de
// tener sesión.
export default function RecuperarClave() {
  const { t } = useLocale();
  const [usuario, setUsuario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pedido, setPedido] = useState(false);

  async function alPedir(evento) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/recuperar-clave/pedir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim().toLowerCase() }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setPedido(true);
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedir el enlace para recuperar la contraseña'));
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.recuperar_titulo}</h1>
          <div className="alert alert-success" role="status">{t.auth.recuperar_listo}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.recuperar_volver}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        <h1>{t.auth.recuperar_titulo}</h1>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alPedir}>
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
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
            {enviando ? t.auth.recuperar_enviando : t.auth.recuperar_enviar}
          </button>
        </form>
        <Link to="/login" className="login-recuperar">{t.auth.recuperar_volver}</Link>
      </div>
    </div>
  );
}
