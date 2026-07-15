import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;
const TenantSessionContext = createContext(null);

const POLLING_MS = 30 * 1000; // refleja el corte automático (inactividad o tope) sin recargar
const HEARTBEAT_MINIMO_MS = 60 * 1000; // no manda un heartbeat por cada click, uno por minuto alcanza

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
  const resultado = await respuesta.json();
  if (!respuesta.ok) throw new Error(resultado.error);
  return resultado;
}

export function TenantSessionProvider({ children }) {
  const { usuario } = useAuth();
  const puedeTenerSesion = ['admin_plataforma', 'superadmin'].includes(usuario?.rol);
  const [sesion, setSesion] = useState(null);
  const ultimoHeartbeatRef = useRef(0);

  const recargar = useCallback(async () => {
    if (!puedeTenerSesion) {
      setSesion(null);
      return;
    }
    try {
      const { sesion: sesionActiva } = await llamarApi('/sesion-tenant');
      setSesion(sesionActiva);
    } catch {
      setSesion(null);
    }
  }, [puedeTenerSesion]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Ítem D del pendiente #30: mientras hay sesión de tenant activa, el polling refleja el
  // corte automático (5 min de inactividad o tope de 60 min) sin que el usuario tenga que
  // hacer nada — así el banner desaparece solo.
  useEffect(() => {
    if (!sesion) return undefined;
    const intervalo = setInterval(recargar, POLLING_MS);
    return () => clearInterval(intervalo);
  }, [sesion, recargar]);

  // La actividad real del usuario (click/tecla) es lo que mantiene viva la sesión de
  // tenant — no alcanza con contar los requests al backend, porque buena parte del Panel
  // consulta Supabase directo con RLS sin pasar por el backend Express.
  useEffect(() => {
    if (!sesion) return undefined;

    function marcarActividad() {
      const ahora = Date.now();
      if (ahora - ultimoHeartbeatRef.current < HEARTBEAT_MINIMO_MS) return;
      ultimoHeartbeatRef.current = ahora;
      llamarApi('/sesion-tenant/actividad', { method: 'POST' }).catch(() => {});
    }

    window.addEventListener('click', marcarActividad);
    window.addEventListener('keydown', marcarActividad);
    return () => {
      window.removeEventListener('click', marcarActividad);
      window.removeEventListener('keydown', marcarActividad);
    };
  }, [sesion]);

  const salir = useCallback(async () => {
    await llamarApi('/sesion-tenant/salir', { method: 'POST' });
    await recargar();
  }, [recargar]);

  const renovar = useCallback(async () => {
    await llamarApi('/sesion-tenant/renovar', { method: 'POST' });
    await recargar();
  }, [recargar]);

  return (
    <TenantSessionContext.Provider value={{ sesion, recargar, salir, renovar }}>
      {children}
    </TenantSessionContext.Provider>
  );
}

export function useTenantSession() {
  const ctx = useContext(TenantSessionContext);
  if (!ctx) throw new Error('useTenantSession debe usarse dentro de TenantSessionProvider');
  return ctx;
}
