import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';
import { guardarMarca, leerMarcaGuardada, olvidarMarca } from '../lib/marcaGuardada';
import { esteAparatoGuardaLlaves, loCancelaronAMano } from '../lib/llaveDelDispositivo';
import {
  abrirSesionConLaHuella,
  hayAccesoGuardado,
  olvidarAccesoGuardado,
  rotuloDelAccesoGuardado,
} from '../lib/accesoGuardado';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano. Lo único que cambia entre las dos aplicaciones es `lib/api.js`, que cada una
// tiene con su propia dirección.
//
// PRIMERO LA PRESTADORA, DESPUÉS LA CUENTA. Con el mismo correo, cada Prestadora tiene su propia
// cuenta (`lib/correoDeAcceso.js`), así que antes del correo hace falta saber de cuál se trata. El
// código queda anotado en el teléfono junto con la marca, y mientras esté ahí no se vuelve a pedir.
//
// INGRESAR CON BIOMETRÍA abre la sesión que quedó guardada al cerrar (`lib/accesoGuardado.js`), y
// se ofrece sólo para la Prestadora de esa sesión.

const API_URL = import.meta.env.VITE_API_URL;

async function prestadoraDelCodigo(codigo) {
  const respuesta = await fetch(`${API_URL}/api/publico/${encodeURIComponent(codigo)}/marca`);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, datos);
  return datos;
}

export default function Login() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const [estado, setEstado] = useState('cargando');
  const [prestadora, setPrestadora] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorCodigo, setErrorCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hayLlave, setHayLlave] = useState(false);
  const [entrandoConLlave, setEntrandoConLlave] = useState(false);

  // Si se llega desde el enlace de un correo, la Prestadora viene en la dirección. Si no, se usa la
  // que el teléfono tenga anotada, o la del acceso guardado. En los dos casos se pasa directo al
  // correo.
  useEffect(() => {
    let vigente = true;
    (async () => {
      const pedida = (searchParams.get('prestadora') || '').trim();
      const guardada = await leerMarcaGuardada();
      const rotulo = pedida || guardada?.rotulo || rotuloDelAccesoGuardado();
      if (!rotulo) {
        if (vigente) setEstado('listo');
        return;
      }
      try {
        const datos = await prestadoraDelCodigo(rotulo);
        if (pedida || !guardada) await guardarMarca({ nombre: datos.nombre, logoUrl: datos.logoUrl, rotulo: datos.rotulo });
        const puede = await esteAparatoGuardaLlaves();
        if (!vigente) return;
        setPrestadora(datos);
        setHayLlave(puede && hayAccesoGuardado(datos.rotulo));
      } catch (err) {
        // Un código anotado que ya no existe se olvida. Lo demás queda escrito en el casillero,
        // para no tener que tipearlo de nuevo.
        if (err?.status === 404 && !pedida) await olvidarMarca();
        else if (vigente) setCodigo(rotulo);
      } finally {
        if (vigente) setEstado('listo');
      }
    })();
    return () => {
      vigente = false;
    };
    // Sólo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alBuscarPrestadora(evento) {
    evento.preventDefault();
    setErrorCodigo('');
    setEnviando(true);
    try {
      const datos = await prestadoraDelCodigo(codigo.trim());
      await guardarMarca({ nombre: datos.nombre, logoUrl: datos.logoUrl, rotulo: datos.rotulo });
      setHayLlave((await esteAparatoGuardaLlaves()) && hayAccesoGuardado(datos.rotulo));
      setPrestadora(datos);
    } catch (err) {
      setErrorCodigo(err?.status === 404 ? t.auth.codigo_desconocido : mensajeDeError(err, t, 'buscar la Prestadora'));
    } finally {
      setEnviando(false);
    }
  }

  async function alCambiarPrestadora() {
    await olvidarMarca();
    setPrestadora(null);
    setHayLlave(false);
    setCodigo('');
    setPassword('');
    setError('');
  }

  async function alEnviar(evento) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    const { error: errorLogin } = await login(prestadora.prestadoraId, email, password);
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
        setHayLlave(hayAccesoGuardado(prestadora?.rotulo));
        setError(t.auth.llave_error);
      }
    } finally {
      setEntrandoConLlave(false);
    }
  }

  if (estado === 'cargando') {
    return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  }

  if (!prestadora) {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <h1>{t.auth.titulo}</h1>
          <form onSubmit={alBuscarPrestadora}>
            <div className="form-field">
              <label htmlFor="codigo">{t.auth.codigo_prestadora}</label>
              <input
                id="codigo"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value);
                  if (errorCodigo) setErrorCodigo('');
                }}
                required
                aria-invalid={errorCodigo ? true : undefined}
                aria-describedby={errorCodigo ? 'codigo-error' : undefined}
              />
              {errorCodigo && (
                <span className="form-error" id="codigo-error" role="alert">{errorCodigo}</span>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
              {enviando ? t.auth.buscando : t.auth.continuar}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-pantalla">
      <div className="login-card">
        {/* La Prestadora va arriba, igual que adentro de la aplicación: es con quien se está
            entrando. */}
        {prestadora.logoUrl ? (
          <img className="logo-prestadora" src={prestadora.logoUrl} alt={prestadora.nombre || ''} />
        ) : (
          <p className="nombre-prestadora">{prestadora.nombre || ''}</p>
        )}
        <h1>{t.auth.titulo}</h1>
        {/* El motivo queda atado a los dos campos y no a uno: no se dice cuál de los dos está
            mal, a propósito, porque decirlo le regalaría a cualquiera la mitad de la
            respuesta. Los dos quedan marcados y los dos leen el mismo motivo. */}
        {error && <div id="login-error" className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={alEnviar}>
          <div className="form-field">
            <label htmlFor="email">{t.auth.email}</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
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
        <button
          type="button"
          className="btn btn-secondary btn-full login-otra-prestadora"
          onClick={alCambiarPrestadora}
          disabled={enviando || entrandoConLlave}
        >
          {t.auth.cambiar_prestadora}
        </button>
      </div>
    </div>
  );
}
