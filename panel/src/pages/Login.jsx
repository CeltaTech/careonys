import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { huboCierrePorInactividad, olvidarCierrePorInactividad } from '../lib/ultimaActividad';
import { FormField } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

const API_URL = import.meta.env.VITE_API_URL;

// LA PRESTADORA SALE DEL CORREO DE LA CUENTA.
//
// Una cuenta del Panel es de una sola Prestadora, así que el correo alcanza para saber de cuál es.
// La dirección de la página no se mira: el Panel tiene una sola.
//
// Primero se le pregunta al backend con qué correo se le habla al servicio de acceso
// (`lib/correoDeAcceso.js`). Si con ése no entra, se prueba con el correo tal como se escribió,
// que es como quedan las cuentas que crea CeltaTech.
//
// AL ENTRAR NO SE INSINÚA NADA. Correo que no existe y clave equivocada fallan por el mismo camino
// y con el mismo mensaje.
//
// La línea al pie —«con la tecnología de …»— va siempre.
export function Login() {
  const { t } = useLocale();
  const { login, session, usuario } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [cerradaPorInactividad] = useState(huboCierrePorInactividad);

  // AuthContext actualiza session/usuario de forma asíncrona (listener
  // onAuthStateChange), no en el mismo tick en que login() resuelve — navegar
  // a "/" inmediatamente después de login() usaba el estado viejo (todavía sin
  // sesión) y ProtectedRoute rebotaba de vuelta acá. Se redirige recién cuando
  // el estado de auth ya está resuelto de verdad.
  useEffect(() => {
    if (session && usuario) {
      navigate('/', { replace: true });
    }
  }, [session, usuario, navigate]);

  async function handleSubmit(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch(`${API_URL}/api/ingreso-al-panel/correo-de-acceso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!respuesta.ok) throw new Error(`correo-de-acceso ${respuesta.status}`);
      const { correo } = await respuesta.json();

      let { error: errorLogin } = await login(correo, password);
      if (errorLogin) ({ error: errorLogin } = await login(email.trim().toLowerCase(), password));
      if (!errorLogin) olvidarCierrePorInactividad();
      if (errorLogin) {
        setError(t.auth.error_credenciales);
        setEnviando(false);
      }
    } catch (err) {
      // El mismo mensaje que cualquier otro fallo de entrada: acá no se distingue nada.
      console.error('Login:', err?.message);
      setError(t.auth.error_credenciales);
      setEnviando(false);
    }
  }

  const pie = <p className="login-pie">{t.auth.con_tecnologia_de}</p>;

  return (
    <div className="login-pantalla">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{t.auth.titulo}</h1>

        {error && <Alert variant="error">{error}</Alert>}
        {!error && cerradaPorInactividad && <Alert variant="info">{t.auth.cerrada_por_inactividad}</Alert>}

        <FormField
          label={t.auth.email}
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label={t.auth.password}
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" disabled={enviando}>
          {enviando ? t.auth.ingresando : t.auth.ingresar}
        </Button>

        <Link to="/recuperar-clave">{t.auth.recuperar_link}</Link>
        {pie}
      </form>
    </div>
  );
}
