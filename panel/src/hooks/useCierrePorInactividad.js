import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { puntoDeLaSesion } from '../lib/cierrePorInactividad';
import { anotarActividad, anotarCierrePorInactividad, ultimaActividad } from '../lib/ultimaActividad';

// Lo que cuenta como actividad: tocar el mouse, el teclado o la pantalla, y desplazarse.
const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
// El mouse dispara cientos de eventos por segundo; se anota como mucho uno por segundo.
const ANOTAR_CADA_MS = 1000;
const REVISAR_CADA_MS = 1000;

/* EL CIERRE DEL PANEL POR INACTIVIDAD.

   Cuenta el tiempo sin actividad con la configuración de la Prestadora —encendido o apagado, y
   cuántos minutos—, que llega pegada al usuario (`AuthContext.jsx`). El último minuto avisa; al
   cumplirse, cierra la sesión de este navegador y deja anotado el motivo para la pantalla de
   ingreso.

   La actividad se anota siempre, también con el cierre apagado: si la Prestadora lo enciende
   mientras alguien trabaja, la cuenta arranca de lo último que esa persona hizo y no de antes.

   El cierre es sólo de este navegador (`scope: 'local'`): una persona con el Panel abierto en otro
   equipo no pierde esa sesión porque ésta se quedó quieta. */
export function useCierrePorInactividad() {
  const { usuario } = useAuth();
  const config = usuario?.cierrePorInactividad;
  const activo = config?.activo === true;
  const minutos = config?.minutos;
  const [porCerrar, setPorCerrar] = useState(false);
  const ultimoAnotado = useRef(0);
  const cerrando = useRef(false);

  useEffect(() => {
    function alActuar() {
      const ahora = Date.now();
      if (ahora - ultimoAnotado.current < ANOTAR_CADA_MS) return;
      ultimoAnotado.current = ahora;
      anotarActividad(ahora);
    }
    EVENTOS.forEach((evento) => window.addEventListener(evento, alActuar, { passive: true, capture: true }));
    return () => EVENTOS.forEach((evento) => window.removeEventListener(evento, alActuar, { capture: true }));
  }, []);

  useEffect(() => {
    if (!activo) {
      setPorCerrar(false);
      return undefined;
    }
    function revisar() {
      const punto = puntoDeLaSesion(ultimaActividad(), Date.now(), minutos);
      if (punto === 'cerrar') {
        if (cerrando.current) return;
        cerrando.current = true;
        anotarCierrePorInactividad();
        supabase.auth.signOut({ scope: 'local' });
        return;
      }
      setPorCerrar(punto === 'por_cerrar');
    }
    revisar();
    const reloj = setInterval(revisar, REVISAR_CADA_MS);
    return () => clearInterval(reloj);
  }, [activo, minutos]);

  const seguirTrabajando = useCallback(() => {
    anotarActividad();
    setPorCerrar(false);
  }, []);

  return { porCerrar, seguirTrabajando };
}
