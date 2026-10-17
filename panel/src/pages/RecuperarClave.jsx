import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { FormField } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

// Donde alguien que perdió su clave pide el enlace para elegir una nueva.
//
// SE PIDE CON EL NOMBRE DE USUARIO, y el enlace va al correo que esa cuenta tiene declarado. La
// dirección de la página no se mira.
//
// LA RESPUESTA ES LA MISMA EXISTA EL USUARIO O NO, y eso no es un descuido de la pantalla: lo
// decide el backend, que contesta igual en los dos casos. Si contestara distinto, esta pantalla
// sería una forma de averiguar quién tiene cuenta, preguntando de a uno por vez, sin necesidad de
// tener sesión.
export function RecuperarClave() {
  const { t } = useLocale();
  const [usuario, setUsuario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [pedido, setPedido] = useState(false);

  async function handlePedir(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await fetch(`${API_URL}/api/recuperar-clave/pedir-del-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim().toLowerCase() }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setPedido(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.recuperar_titulo}</h1>
          <Alert variant="success">{t.auth.recuperar_listo}</Alert>
          <Link to="/login">{t.auth.recuperar_volver}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <form className="login-card" onSubmit={handlePedir}>
        <h1>{t.auth.recuperar_titulo}</h1>

        {error && <Alert variant="error">{error}</Alert>}

        <FormField
          label={t.auth.usuario}
          name="usuario"
          type="text"
          autoComplete="username"
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />

        <Button type="submit" disabled={enviando}>
          {enviando ? t.auth.recuperar_enviando : t.auth.recuperar_enviar}
        </Button>

        <Link to="/login">{t.auth.recuperar_volver}</Link>
      </form>
    </div>
  );
}
