import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCierrePorInactividadDeLaPrestadora } from '../context/PerfilContext';
import { puntoDeLaSesion } from '../lib/cierrePorInactividad';
import { anotarActividad, anotarCierrePorInactividad, ultimaActividad } from '../lib/ultimaActividad';

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano.

// Lo que cuenta como actividad: tocar la pantalla, el teclado o el mouse, y desplazarse.
const EVENTOS = ['touchstart', 'pointerdown', 'keydown', 'wheel', 'scroll', 'mousemove'];
// Algunos eventos llegan cientos de veces por segundo; se anota como mucho uno por segundo.
const ANOTAR_CADA_MS = 1000;
const REVISAR_CADA_MS = 1000;

/* EL CIERRE DE LA APLICACIÓN POR INACTIVIDAD.

   Es el mismo que tiene el Panel, con la misma configuración de la Prestadora —encendido o
   apagado, y cuántos minutos—, que acá llega con el perfil (`PerfilContext.jsx`). El último
   minuto avisa; al cumplirse, cierra la sesión y deja anotado el motivo para la pantalla de
   ingreso. Cerrar lo hace `AuthContext.jsx`, que antes deja la constancia en el registro.

   La actividad se anota siempre, también con el cierre apagado: si la Prestadora lo enciende
   mientras alguien usa la aplicación, la cuenta arranca de lo último que esa persona hizo. */
export function useCierrePorInactividad() {
  const { cerrarPorInactividad } = useAuth();
  const config = useCierrePorInactividadDeLaPrestadora();
  const activo = config?.activo === true;
  const minutos = config?.minutos;
  const [porCerrar, setPorCerrar] = useState(false);
  const ultimoAnotado = useRef(0);
  const cerrando = useRef(false);
  // Se guarda en una referencia para que el reloj no se reinicie cada vez que el proveedor se dibuja.
  const cerrar = useRef(cerrarPorInactividad);
  cerrar.current = cerrarPorInactividad;

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
        cerrar.current();
        return;
      }
      setPorCerrar(punto === 'por_cerrar');
    }
    revisar();
    const reloj = setInterval(revisar, REVISAR_CADA_MS);
    return () => clearInterval(reloj);
  }, [activo, minutos]);

  const seguirUsando = useCallback(() => {
    anotarActividad();
    setPorCerrar(false);
  }, []);

  return { porCerrar, seguirUsando };
}
