import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { usePermisos } from './PermisosContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useLocale } from '../i18n/LocaleContext';
import { llamarApiPanel } from '../lib/apiPanel';
import { escucharEnVivo, ASUNTOS } from '../lib/avisosEnVivo';
import { mensajeDeError } from '../lib/errores';
import { esAdminOSuperior } from '../lib/roles';

/* Los números que están esperando que alguien los habilite, mirados desde cualquier pantalla.
   ==========================================================================

   QUÉ RESUELVE. Quien cambia su número lo carga y queda a la espera: ese número no sirve para
   recuperar la clave hasta que una persona lo habilita. Hasta acá había que ir a buscar a esa
   persona a mano, escribiendo su nombre en la pantalla de habilitar. Lo que falta no es una
   pantalla nueva: es que la espera **aparezca sola** en las tareas pendientes de quien la tiene a
   cargo.

   ES EL MISMO MOLDE QUE `PedidosDeCodigoContext.jsx`, y por las mismas razones: se entera por el
   canal en vivo, vuelve a preguntar cada tanto por si el canal se cayó en silencio, y es un
   contexto y no estado de la pantalla porque lo consumen dos —el contador del menú y la pantalla
   de habilitar—.

   QUIÉN VE QUÉ LO DECIDE EL BACKEND. Acá no hay ninguna regla de quién habilita a quién: la lista
   llega ya filtrada por la ruta, que niega lo que no corresponde aunque la pantalla lo pidiera.

   CUÁNDO NO PREGUNTA NADA. Sin sesión, sin Organización activa, y sin el permiso de habilitar: a
   quien no puede habilitar a nadie no le corresponde ninguna de estas tareas, y preguntar sería
   pedirle al backend que le conteste que no.

   NO HAY ESPERA POR TIEMPO. Nada de esta lista se vence ni se habilita solo: sale de la lista
   cuando alguien la habilita.

   SI LA CONSULTA FALLA, LA LISTA ANTERIOR SE QUEDA. */

const TelefonosEsperandoContext = createContext(null);

/* La red de abajo, no el camino normal: ver `PedidosDeCodigoContext.jsx`. */
const CADA_CUANTO_MS = 2 * 60 * 1000;

export function TelefonosEsperandoProvider({ children }) {
  const { session, usuario } = useAuth();
  const { t } = useLocale();
  const { puede } = usePermisos();
  const prestadoraId = usePrestadoraActual();
  const puedeHabilitar = esAdminOSuperior(usuario?.rol) || puede('habilitar_cambio_de_clave');
  const hayQuePreguntar = Boolean(session) && Boolean(prestadoraId) && puedeHabilitar;

  const [cuentas, setCuentas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const enVueloRef = useRef(false);

  const recargar = useCallback(async () => {
    if (!hayQuePreguntar) {
      setCuentas([]);
      setEstado('listo');
      setError(null);
      return;
    }
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    try {
      const respuesta = await llamarApiPanel('/habilitar-clave/pendientes');
      setCuentas(Array.isArray(respuesta?.cuentas) ? respuesta.cuentas : []);
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
    const dejarDeEscuchar = escucharEnVivo(ASUNTOS.TELEFONOS_ESPERANDO_HABILITACION, recargar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolverAMirar);
      dejarDeEscuchar();
    };
  }, [recargar, hayQuePreguntar]);

  return (
    <TelefonosEsperandoContext.Provider value={{ cuentas, estado, error, recargar, hayQuePreguntar }}>
      {children}
    </TelefonosEsperandoContext.Provider>
  );
}

export function useTelefonosEsperando() {
  const ctx = useContext(TelefonosEsperandoContext);
  if (!ctx) throw new Error('useTelefonosEsperando debe usarse dentro de TelefonosEsperandoProvider');
  return ctx;
}
