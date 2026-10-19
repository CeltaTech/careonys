import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { escucharEnVivo, ASUNTOS } from '../lib/avisosEnVivo';
import { mensajeDeError } from '../lib/errores';

/* Las emergencias que todavía no se marcaron atendidas, miradas desde cualquier pantalla del Panel.
   ==========================================================================

   QUIÉN LAS CONSUME. El menú y la campanita, que las cuentan; Situación operativa y Comunicación,
   que muestran un renglón por cada una con quién la está atendiendo. Tomada o no, una emergencia
   sigue acá hasta que alguien la marca atendida.

   SIN EL TEXTO DEL ASISTENTE. Se piden sólo el identificador y la hora. Lo que escribió quien
   apretó el botón es dato de salud, y leerlo deja constancia; eso pasa en la sección Emergencias y
   en ningún otro lado. Pedirlo acá lo dejaría anotado cada vez que alguien abre cualquier pantalla.

   CÓMO SE ENTERA. Igual que los pedidos de autorización (`PedidosDeAutorizacionContext.jsx`): el canal en vivo
   avisa cuando entra una o se atiende una, y una vuelta espaciada cubre el día en que el canal se
   cae sin avisar. Las mismas reglas para cuándo no pregunta y para qué hacer si la consulta falla. */

const EmergenciasSinAtenderContext = createContext(null);

const CADA_CUANTO_MS = 2 * 60 * 1000;

export function EmergenciasSinAtenderProvider({ children }) {
  const { session } = useAuth();
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const hayQuePreguntar = Boolean(session) && Boolean(prestadoraId);

  const [emergencias, setEmergencias] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const enVueloRef = useRef(false);

  const recargar = useCallback(async () => {
    if (!hayQuePreguntar) {
      setEmergencias([]);
      setEstado('listo');
      setError(null);
      return;
    }
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    try {
      const { data, error: errorConsulta } = await supabase
        .from('emergencias_guardia')
        .select('id, reportado_at')
        .eq('prestadora_id', prestadoraId)
        .is('atendida_at', null)
        .order('reportado_at', { ascending: false });
      if (errorConsulta) throw errorConsulta;
      setEmergencias(data ?? []);
      setError(null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado((anterior) => (anterior === 'cargando' ? 'error' : anterior));
    } finally {
      enVueloRef.current = false;
    }
  }, [hayQuePreguntar, prestadoraId, t]);

  useEffect(() => {
    recargar();
    if (!hayQuePreguntar) return undefined;

    const reloj = setInterval(recargar, CADA_CUANTO_MS);
    const alVolverAMirar = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    document.addEventListener('visibilitychange', alVolverAMirar);
    const dejarDeEscuchar = escucharEnVivo(ASUNTOS.EMERGENCIAS_SIN_ATENDER, recargar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolverAMirar);
      dejarDeEscuchar();
    };
  }, [recargar, hayQuePreguntar]);

  return (
    <EmergenciasSinAtenderContext.Provider value={{ emergencias, estado, error, recargar }}>
      {children}
    </EmergenciasSinAtenderContext.Provider>
  );
}

export function useEmergenciasSinAtender() {
  const ctx = useContext(EmergenciasSinAtenderContext);
  if (!ctx) throw new Error('useEmergenciasSinAtender debe usarse dentro de EmergenciasSinAtenderProvider');
  return ctx;
}
