import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const PermisosContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;

// Permisos efectivos del usuario logueado (admin/superadmin: todo true; coordinador:
// según lo que haya configurado su Prestadora en Configuración > Permisos — motor
// backend/src/utils/permisos.js). Se carga una vez por sesión, no por pantalla.
export function PermisosProvider({ children }) {
  const { usuario } = useAuth();
  const [permisos, setPermisos] = useState({});
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      if (!usuario) {
        if (activo) {
          setPermisos({});
          setCargado(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/permisos-efectivos`, {
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      if (!respuesta.ok) return;
      const resultado = await respuesta.json();
      if (activo) {
        setPermisos(resultado.permisos || {});
        setCargado(true);
      }
    }

    cargar();

    return () => {
      activo = false;
    };
  }, [usuario]);

  function puede(accion) {
    return !!permisos[accion];
  }

  return <PermisosContext.Provider value={{ permisos, puede, cargado }}>{children}</PermisosContext.Provider>;
}

export function usePermisos() {
  const ctx = useContext(PermisosContext);
  if (!ctx) throw new Error('usePermisos debe usarse dentro de PermisosProvider');
  return ctx;
}
