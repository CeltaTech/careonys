import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { useTenantSession } from '../context/TenantSessionContext';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { seAlcanzoElLimite, contraSuLimite } from '../lib/cuentaDeCorreo';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel${path}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}

/* Cuánto correo salió, contra el límite del servicio que lo despacha.

   Va acá porque es la única pantalla de nivel plataforma: el límite es de la cuenta entera,
   no de una Prestadora, y quien puede hacer algo al respecto es quien administra la
   plataforma.

   Carga aparte de la lista de Prestadoras, con sus propios cuatro estados: si la cuenta del
   correo falla, la lista tiene que seguir apareciendo igual. */
function ContadorDeCorreo() {
  const { t } = useLocale();
  const [correos, setCorreos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { correos: cuenta } = await llamarApi('/configuracion-plataforma/correos');
      setCorreos(cuenta);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <section>
      <h2>{t.prestadoras.correos_titulo}</h2>
      <p className="panel-explicacion">{t.prestadoras.correos_explicacion}</p>

      <EstadoLista
        estado={estado}
        error={error}
        recargar={cargar}
        vacio={estado === 'listo' && correos.del_mes === 0}
      >
        {seAlcanzoElLimite(correos) && <Alert variant="error">{t.prestadoras.correos_tope_alcanzado}</Alert>}
        <table className="panel-tabla">
          <tbody>
            <tr>
              <th>{t.prestadoras.correos_del_dia}</th>
              <td>{correos && contraSuLimite(correos.del_dia, correos.tope_diario, t.prestadoras)}</td>
            </tr>
            <tr>
              <th>{t.prestadoras.correos_del_mes}</th>
              <td>{correos && contraSuLimite(correos.del_mes, correos.tope_mensual, t.prestadoras)}</td>
            </tr>
          </tbody>
        </table>
      </EstadoLista>
    </section>
  );
}

export function Prestadoras() {
  const { t, locale } = useLocale();
  const { sesion, recargar: recargarSesion, salir } = useTenantSession();
  const [prestadoras, setPrestadoras] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [entrando, setEntrando] = useState(null);
  const [saliendo, setSaliendo] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [{ prestadoras: filas }] = await Promise.all([
        llamarApi('/prestadoras'),
        recargarSesion(),
      ]);
      setPrestadoras(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [recargarSesion, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function handleEntrar(prestadoraId) {
    setEntrando(prestadoraId);
    setError(null);
    try {
      await llamarApi('/sesion-tenant', {
        method: 'POST',
        body: JSON.stringify({ prestadora_id: prestadoraId }),
      });
      await recargarSesion();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setEntrando(null);
    }
  }

  async function handleSalir() {
    setSaliendo(true);
    setError(null);
    try {
      await salir();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <div>
      <h1>{t.prestadoras.titulo}</h1>

      {error && <Alert variant="error">{error}</Alert>}

      {sesion && (
        <Alert variant="info">
          <strong>{t.prestadoras.sesion_activa_titulo}:</strong> {sesion.prestadoras?.nombre_fantasia}
          {' — '}
          {t.prestadoras.sesion_activa_expira.replace('{hora}', new Date(sesion.expira_at).toLocaleTimeString(locale))}
          {' '}
          <Button variant="secondary" onClick={handleSalir} disabled={saliendo}>
            {saliendo ? t.prestadoras.saliendo : t.prestadoras.salir}
          </Button>
        </Alert>
      )}

      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && prestadoras.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.prestadoras.col_nombre}</th>
              <th>{t.prestadoras.col_estado}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prestadoras.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre_fantasia}</td>
                <td>{traducirValor(t.prestadoras, `estado_${p.estado}`)}</td>
                <td>
                  <Button
                    variant="secondary"
                    onClick={() => handleEntrar(p.id)}
                    disabled={Boolean(sesion) || entrando === p.id}
                  >
                    {entrando === p.id ? t.prestadoras.entrando : t.prestadoras.entrar}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      <ContadorDeCorreo />
    </div>
  );
}
