import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Cabecera } from '../components/ui/Cabecera';
import { llamarApiPanel } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';
import { EstadoLista } from '../components/layout/EstadoLista';
import { TelefonoDeLaCuenta } from '../components/cuenta/TelefonoDeLaCuenta';
import { useCuentaSegura } from '../components/cuenta/useCuentaSegura';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { MINIMO_DE_CARACTERES, claveAceptable } from '../lib/reglaDeClave';
import '../styles/molde-paginas.css';

/* LA PROPIA CUENTA.
   ==========================================================================

   Lo que es de quien está mirando la pantalla, todo junto: cambiar la clave, verificar el número
   que tiene cargado o cambiarlo, ver desde qué equipos entró y cerrar la sesión en todos.

   EL NÚMERO NO LLEGA HASTA ACÁ. El backend contesta si hay uno cargado y si está verificado, nada
   más: para verificarlo no hace falta leerlo, y para cambiarlo se escribe el nuevo.

   ESTO NO APARECE EN LA CONFIGURACIÓN DE LA PRESTADORA. Cómo se entra y cómo se recupera la clave
   es igual para todas y para todos los roles. */
export function MiCuenta() {
  const { t, locale } = useLocale();
  const { estado, error, datos, recargar } = useCuentaSegura();

  return (
    <div>
      <Cabecera titulo={t.nav.mi_cuenta} />

      <div className="molde-pila">
        <CambiarClave />
        <EstadoLista estado={estado} error={error} recargar={recargar}>
          {datos && (
            <div className="molde-pila">
              <TelefonoDeLaCuenta datos={datos} recargar={recargar} />
              <Equipos datos={datos} locale={locale} />
              <CerrarSesiones />
            </div>
          )}
        </EstadoLista>
      </div>
    </div>
  );
}

/* Cambiar la propia clave.

   SE PIDE LA ACTUAL ANTES DE CAMBIARLA, y se comprueba entrando con ella. Una sesión abierta no
   prueba que quien está delante de la pantalla sea el dueño de la cuenta: puede ser cualquiera
   que se sentó frente a una computadora desatendida. Sin ese paso, el cambio de clave sería la
   forma más cómoda de quedarse con una cuenta ajena.

   No pasa por el backend: la cuenta se cambia contra el servicio de acceso, con la sesión de quien
   está pidiendo el cambio. Nadie puede cambiar así la de otro. */
function CambiarClave() {
  const { t } = useLocale();
  const { session } = useAuth();
  const [actual, setActual] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [errorCampo, setErrorCampo] = useState(null);
  const [cambiada, setCambiada] = useState(false);

  const mensajeDe = (campo) => (errorCampo?.campo === campo ? errorCampo.texto : undefined);

  async function handleGuardar(evento) {
    evento.preventDefault();
    setError(null);
    setErrorCampo(null);
    setCambiada(false);

    if (!claveAceptable(password)) {
      setErrorCampo({
        campo: 'password',
        texto: t.auth.activar_password_corta.replace('{{minimo}}', MINIMO_DE_CARACTERES),
      });
      return;
    }
    if (password !== confirmacion) {
      setErrorCampo({ campo: 'confirmacion', texto: t.auth.activar_no_coincide });
      return;
    }

    setGuardando(true);
    try {
      const { error: errorActual } = await supabase.auth.signInWithPassword({
        email: session?.user?.email,
        password: actual,
      });
      if (errorActual) {
        setErrorCampo({ campo: 'actual', texto: t.auth.mi_clave_actual_mal });
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
      console.error('MiCuenta:', err?.message);
      setError(t.errores.falla_del_sistema);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.auth.mi_clave_titulo}</h2>
      </div>
      <form onSubmit={handleGuardar}>
        {error && <Alert variant="error">{error}</Alert>}
        {cambiada && <Alert variant="success">{t.auth.mi_clave_exito}</Alert>}

        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField
              label={t.auth.mi_clave_actual}
              name="actual"
              type="password"
              autoComplete="current-password"
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              error={mensajeDe('actual')}
            />
          </div>

          <FormField
            label={t.auth.activar_password_nueva}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={mensajeDe('password')}
          />

          <FormField
            label={t.auth.activar_password_confirmar}
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            error={mensajeDe('confirmacion')}
          />
        </div>

        <div className="molde-acciones">
          <Button type="submit" disabled={guardando}>
            {guardando ? t.auth.mi_clave_guardando : t.auth.mi_clave_guardar}
          </Button>
        </div>
      </form>
    </section>
  );
}

/* Desde qué aparatos se entró. No se muestra ningún dato del aparato —ni navegador, ni lugar—
   porque no se guarda ninguno: lo único que hay es cuándo fue la primera entrada y cuándo la
   última. */
function Equipos({ datos, locale }) {
  const { t } = useLocale();
  const fecha = (valor) => (valor ? new Date(valor).toLocaleString(locale) : '—');

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.cuenta_segura.equipos_titulo}</h2>
        <span className="panel-mini">{datos.equipos.length}</span>
      </div>
      <EstadoLista estado="listo" vacio={datos.equipos.length === 0} mensajeVacio={t.cuenta_segura.equipos_vacio}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.cuenta_segura.equipo_desde}</th>
              <th>{t.cuenta_segura.equipo_ultima}</th>
            </tr>
          </thead>
          <tbody>
            {datos.equipos.map((equipo) => (
              <tr key={equipo.id}>
                <td>{fecha(equipo.desde)}</td>
                <td>{fecha(equipo.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </section>
  );
}

/* Cerrar la sesión en todos los equipos. Se hace desde otro equipo y con la clave, que son las dos
   condiciones que no cumple quien se llevó el aparato. */
function CerrarSesiones() {
  const { t } = useLocale();
  const [claveActual, setClaveActual] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function cerrar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await llamarApiPanel('/cuenta-segura/cerrar-sesiones', {
        method: 'POST',
        body: JSON.stringify({ claveActual }),
      });
      setClaveActual('');
      // Esta sesión también se cerró: se vuelve a la entrada.
      window.location.reload();
    } catch (err) {
      setError(mensajeDeError(err, t, 'MiCuenta'));
      setEnviando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.cuenta_segura.cerrar_sesiones_titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <form onSubmit={cerrar}>
        <div className="molde-formgrid">
          <FormField
            label={t.cuenta_segura.clave_actual}
            name="claveActualCierre"
            type="password"
            autoComplete="current-password"
            required
            value={claveActual}
            onChange={(e) => setClaveActual(e.target.value)}
          />
        </div>
        <div className="molde-acciones">
          <Button type="submit" disabled={enviando || !claveActual}>
            {enviando ? t.comun.guardando : t.cuenta_segura.cerrar_sesiones}
          </Button>
        </div>
      </form>
    </section>
  );
}
