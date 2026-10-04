import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrestadoraActual } from './usePrestadoraActual';
import { useAlarmasTomadas } from './useAlarmasTomadas';
import { llamarApiEmergencias } from '../lib/apiEmergencias';
import { TIPOS_DE_ALARMA } from '../lib/alarmasTomadas';

/* Las emergencias que nadie está atendiendo, para la franja de arriba y el contador del menú.

   «Sin tomar» es: sin marcar atendida, y sin una toma en pie. Las dos cosas las decide lo mismo
   que usa la página de Emergencias —la ruta del backend y `useAlarmasTomadas`—, así que la franja
   y la página no pueden contar distinto.

   SE PREGUNTA SEGUIDO. Una emergencia no tiene canal en vivo, y es lo que menos puede esperar: por
   eso el ritmo es más corto que el de los pedidos de código. Si la consulta falla, queda lo que se
   había traído: una franja que desaparece por un corte de red diría que no pasa nada. */

const CADA_CUANTO_MS = 30 * 1000;

export function useEmergenciasSinTomar(activo) {
  const prestadoraId = usePrestadoraActual();
  const tomas = useAlarmasTomadas();
  const [emergencias, setEmergencias] = useState([]);
  const enVueloRef = useRef(false);
  const hayQuePreguntar = Boolean(activo) && Boolean(prestadoraId);
  const { recargar: recargarTomas } = tomas;

  const recargar = useCallback(async () => {
    if (!hayQuePreguntar) {
      setEmergencias([]);
      return;
    }
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    try {
      const [{ emergencias: filas }] = await Promise.all([
        llamarApiEmergencias('/?estado=sin_atender'),
        recargarTomas(),
      ]);
      setEmergencias(filas || []);
    } catch (err) {
      console.error('useEmergenciasSinTomar:', err?.message);
    } finally {
      enVueloRef.current = false;
    }
  }, [hayQuePreguntar, recargarTomas]);

  useEffect(() => {
    recargar();
    if (!hayQuePreguntar) return undefined;
    const reloj = setInterval(recargar, CADA_CUANTO_MS);
    const alVolverAMirar = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    document.addEventListener('visibilitychange', alVolverAMirar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolverAMirar);
    };
  }, [recargar, hayQuePreguntar]);

  const tomadas = tomas.tomadasDe(TIPOS_DE_ALARMA.EMERGENCIA);
  return emergencias.filter((emergencia) => !emergencia.atendida_at && !tomadas.has(emergencia.id));
}
