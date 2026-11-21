import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { marcarVetoVisto, vetosSinVer } from '../lib/decisionesDeCoordinacion';

/* Las decisiones del Coordinador que la administración vetó y él todavía no vio.
   ==========================================================================

   QUIÉN LAS CONSUME. El menú y la campanita, que las cuentan, y la página de decisiones vetadas,
   que las muestra con su motivo. Al marcarla vista, la decisión sale de las dos a la vez.

   SÓLO PARA EL COORDINADOR. La administración es quien veta: no tiene vetos que recibir, y no se
   le pregunta.

   CÓMO SE ENTERA. Una vuelta espaciada y cada vez que se vuelve a mirar la pestaña del navegador,
   igual que las emergencias sin atender. Un veto no es urgente: el correo y el WhatsApp ya le
   llegaron al Coordinador. */

const VetosSinVerContext = createContext(null);

const CADA_CUANTO_MS = 5 * 60 * 1000;

export function VetosSinVerProvider({ children }) {
  const { session, usuario } = useAuth();
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const hayQuePreguntar = Boolean(session) && Boolean(prestadoraId) && usuario?.rol === 'coordinador';

  const [vetadas, setVetadas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const enVueloRef = useRef(false);

  const recargar = useCallback(async () => {
    if (!hayQuePreguntar) {
      setVetadas([]);
      setEstado('listo');
      setError(null);
      return;
    }
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    try {
      setVetadas(await vetosSinVer());
      setError(null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado((anterior) => (anterior === 'cargando' ? 'error' : anterior));
    } finally {
      enVueloRef.current = false;
    }
  }, [hayQuePreguntar, t]);

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

  /** Marca vista una decisión vetada y la saca de la lista. Tira si la base no la marcó. */
  const marcarVista = useCallback(async (decisionId) => {
    await marcarVetoVisto(decisionId);
    setVetadas((anteriores) => anteriores.filter((v) => v.id !== decisionId));
  }, []);

  return (
    <VetosSinVerContext.Provider value={{ vetadas, estado, error, recargar, marcarVista }}>
      {children}
    </VetosSinVerContext.Provider>
  );
}

export function useVetosSinVer() {
  const ctx = useContext(VetosSinVerContext);
  if (!ctx) throw new Error('useVetosSinVer debe usarse dentro de VetosSinVerProvider');
  return ctx;
}
