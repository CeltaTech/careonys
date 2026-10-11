import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { Cabecera } from '../components/ui/Cabecera';
import { llamarApiPanel } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';
import { esAdminOSuperior } from '../lib/roles';
import { MINIMO_DE_CARACTERES, claveAceptable } from '../lib/reglaDeClave';
import { EstadoLista } from '../components/layout/EstadoLista';
import { TelefonoDeLaCuenta } from '../components/cuenta/TelefonoDeLaCuenta';
import { useCuentaSegura } from '../components/cuenta/useCuentaSegura';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import '../styles/molde-paginas.css';

/* LA SEGURIDAD DE LA PROPIA CUENTA, en una sola página y tres bloques: Contraseña, Verificación
   de identidad, y Dispositivos y sesiones.

   EL ADMINISTRADOR VE SÓLO EL TERCERO. Su cuenta es de CeltaTech, que es quien le da y le cambia
   la contraseña y el teléfono (`CLAUDE.md` del producto, §5). El backend le cierra esas dos puertas
   igual: esconderlas acá es para no ofrecer lo que no puede usar, no la defensa.

   EL NÚMERO NO LLEGA HASTA ACÁ. El backend contesta si hay uno cargado y si está verificado, nada
   más: para verificarlo no hace falta leerlo, y para cambiarlo se escribe el nuevo.

   ESTO NO APARECE EN LA CONFIGURACIÓN DE LA PRESTADORA. Cómo se entra y cómo se recupera la clave
   es igual para todas y para todos los roles. */
export function Seguridad() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const { estado, error, datos, recargar } = useCuentaSegura();
  const cuentaPropia = !esAdminOSuperior(usuario?.rol);

  return (
    <div>
      <Cabecera titulo={t.cuenta_segura.titulo} />

      <EstadoLista estado={estado} error={error} recargar={recargar}>
        {datos && (
          <div className="molde-pila">
            {cuentaPropia && <Contrasena />}
            {cuentaPropia && <TelefonoDeLaCuenta datos={datos} recargar={recargar} />}
            <DispositivosYSesiones datos={datos} locale={locale} />
          </div>
        )}
      </EstadoLista>
    </div>
  );
}

/* Cambiar la contraseña. Pide la actual: una sesión abierta no prueba que quien está delante sea
   el dueño de la cuenta. Va por el backend, que mira el rol antes de cambiar nada. */
function Contrasena() {
  const { t } = useLocale();
  const [actual, setActual] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [errorCampo, setErrorCampo] = useState(null);
  const [cambiada, setCambiada] = useState(false);

  const mensajeDe = (campo) => (errorCampo?.campo === campo ? errorCampo.texto : undefined);

  async function guardar(evento) {
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
      await llamarApiPanel('/cuenta-segura/clave', {
        method: 'POST',
        body: JSON.stringify({ claveActual: actual, claveNueva: password }),
      });
      setActual('');
      setPassword('');
      setConfirmacion('');
      setCambiada(true);
    } catch (err) {
      if (err?.motivo === 'clave_actual_incorrecta') {
        setErrorCampo({ campo: 'actual', texto: t.auth.mi_clave_actual_mal });
      } else {
        setError(mensajeDeError(err, t, 'Seguridad'));
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.cuenta_segura.clave_titulo}</h2>
      </div>
      <form onSubmit={guardar}>
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

/* Desde qué dispositivos se entró, y el botón para cerrar todas las sesiones. No se muestra ningún
   dato del dispositivo —ni navegador, ni lugar— porque no se guarda ninguno: sólo cuándo fue la
   primera entrada y cuándo la última.

   Cerrar todas las sesiones pide la contraseña: se hace desde otro dispositivo y con la clave, que
   son las dos condiciones que no cumple quien se llevó el aparato. */
function DispositivosYSesiones({ datos, locale }) {
  const { t } = useLocale();
  const [claveActual, setClaveActual] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const fecha = (valor) => (valor ? new Date(valor).toLocaleString(locale) : '—');

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
      setError(mensajeDeError(err, t, 'Seguridad'));
      setEnviando(false);
    }
  }

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
