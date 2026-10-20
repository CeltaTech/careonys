import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { llamarApiPanel } from '../lib/apiPanel';
import { esAdminOSuperior } from '../lib/roles';
import { cargaDeGenteBloqueada, pasosDeLaSegundaEtapa, pasosVisibles } from '../lib/puestaEnMarcha';

/* La puesta en marcha de una Prestadora nueva.
   ==========================================================================

   QUÉ CONTESTA. Qué le falta cargar a esta Prestadora, en dos etapas (`lib/puestaEnMarcha.js`):
   la configuración inicial —datos, zonas y precios— y después la gente. Lo consumen la guía de
   primeros pasos (`components/estado-actual/GuiaPrimerosPasos.jsx`, en Configuración > Puesta en
   marcha) y los botones que cargan Asistentes o Clientes, que van apagados mientras la
   configuración inicial no esté completa.

   LA CONFIGURACIÓN INICIAL LA CONTESTA EL BACKEND. Es el mismo criterio con el que el backend
   rechaza el alta y la importación de gente; acá no se copia, se pregunta. Se pregunta para
   cualquier rol del Panel con una Prestadora activa, porque un Coordinador al que su Prestadora
   le habilitó el alta o la importación también tiene que ver esos botones apagados.

   LA SEGUNDA ETAPA, SÓLO PARA QUIEN VE LA GUÍA. Admin_prestadora o Superadmin; con un
   Coordinador no se consulta, porque la guía no se le muestra.

   NO HAY TABLA DE HITOS. Todo se deriva en vivo de los mismos datos que cargan las pantallas de
   siempre: una columna «ya completó» podría decir que sí mientras la Prestadora borró sus zonas. */

const PuestaEnMarchaContext = createContext(null);

const COLUMNAS_ASISTENTES = 'id, tipo_asistente_id';
const COLUMNAS_CLIENTES = 'id, deleted_at';

export function PuestaEnMarchaProvider({ children }) {
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();

  // Un Superadmin ve la guía para informarse: es de la Prestadora que visita, no un trabajo suyo.
  const informativo = usuario?.rol === 'superadmin';
  const veLaGuia = esAdminOSuperior(usuario?.rol);
  const corresponde = Boolean(usuario?.rol) && Boolean(prestadoraId);

  const [estado, setEstado] = useState('cargando'); // cargando | error | listo
  const [configuracion, setConfiguracion] = useState(null);
  const [segundaEtapa, setSegundaEtapa] = useState([]);

  const cargar = useCallback(async () => {
    if (!corresponde) return;
    setEstado('cargando');
    try {
      // Las preguntas van juntas: son independientes, y encadenarlas haría esperar varias veces.
      const [config, equipo, gente, clientes] = await Promise.all([
        llamarApiPanel('/cuentas/configuracion-inicial'),
        veLaGuia ? llamarApiPanel('/usuarios').then((r) => r?.usuarios ?? []) : [],
        veLaGuia ? supabase.from('asistentes').select(COLUMNAS_ASISTENTES) : { data: [] },
        veLaGuia ? supabase.from('clientes').select(COLUMNAS_CLIENTES) : { data: [] },
      ]);
      if (gente?.error || clientes?.error) throw gente?.error ?? clientes?.error;
      setConfiguracion(config);
      setSegundaEtapa(
        pasosDeLaSegundaEtapa({
          gente: gente?.data ?? [],
          clientes: clientes?.data ?? [],
          hayCoordinador: equipo.some((u) => u.rol === 'coordinador'),
        }),
      );
      setEstado('listo');
    } catch {
      setConfiguracion(null);
      setEstado('error');
    }
  }, [corresponde, veLaGuia]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const valor = useMemo(() => {
    const listo = corresponde && estado === 'listo';
    const pasos = listo ? pasosVisibles(configuracion, segundaEtapa) : [];
    const faltan = pasos.filter((p) => !p.hecho);
    return {
      estado: corresponde ? estado : 'listo',
      veLaGuia,
      pasos,
      faltan,
      completos: listo && faltan.length === 0,
      configuracionCompleta: listo && configuracion?.completa === true,
      cargaDeGenteBloqueada: cargaDeGenteBloqueada(listo ? configuracion : null),
      informativo,
      recargar: cargar,
    };
  }, [corresponde, estado, configuracion, segundaEtapa, veLaGuia, informativo, cargar]);

  return <PuestaEnMarchaContext.Provider value={valor}>{children}</PuestaEnMarchaContext.Provider>;
}

export function usePuestaEnMarcha() {
  const ctx = useContext(PuestaEnMarchaContext);
  if (!ctx) throw new Error('usePuestaEnMarcha debe usarse dentro de PuestaEnMarchaProvider');
  return ctx;
}

/** Igual que `usePuestaEnMarcha`, pero vuelve a preguntar al abrir la pantalla que lo usa: la
 *  configuración inicial se completa en otras pantallas, y sin esto los botones de alta seguirían
 *  apagados hasta recargar el Panel entero. */
export function usePuestaEnMarchaAlDia() {
  const ctx = usePuestaEnMarcha();
  const { recargar } = ctx;
  useEffect(() => {
    recargar();
  }, [recargar]);
  return ctx;
}
