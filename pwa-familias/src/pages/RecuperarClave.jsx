import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

// Donde alguien que olvidó su contraseña pide el enlace para elegir una nueva.
//
// SE PIDE EL CORREO Y NADA MÁS. El correo es el usuario, así que no hay dos cosas que recuperar,
// y de qué Prestadora es la cuenta lo resuelve el motor: quien olvidó la clave no tiene por qué
// saber cómo está organizado esto por dentro.
//
// LA RESPUESTA ES LA MISMA EXISTA EL CORREO O NO, y no es un descuido de la pantalla: lo decide
// el motor, que contesta igual en los dos casos. Si contestara distinto, esta pantalla sería una
// forma de averiguar quién tiene cuenta, preguntando de a un correo por vez y sin sesión.
export default function RecuperarClave() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pedido, setPedido] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/recuperar-clave/pedir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setPedido(true);
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedir el enlace de la contraseña'));
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.recuperar_titulo}</h1>
          <div className="alert alert-info" role="status">{t.auth.recuperar_listo}</div>
          <Link to="/login" className="btn btn-primary btn-full">{t.auth.recuperar_volver}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        <h1>{t.auth.recuperar_titulo}</h1>
        <p className="login-subtitulo">{t.auth.recuperar_subtitulo}</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alEnviar}>
          <div className="form-field">
            <label htmlFor="email">{t.auth.email}</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
            {enviando ? t.auth.recuperar_enviando : t.auth.recuperar_enviar}
          </button>
        </form>
        <Link to="/login">{t.auth.recuperar_volver}</Link>
      </div>
    </div>
  );
}
