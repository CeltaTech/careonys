import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { IDENTIDAD } from '../config/identidadProducto';
import { MODALIDADES } from '../lib/modalidades';

const ModalidadesContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;

// Modalidades de trabajo activas de la Prestadora (directa/intermediacion —
// PRD_08_Dashboard_Modalidades.md, aprobado 2026-07-24). Se carga una vez por sesión, igual
// que PermisosContext, para que Layout.jsx sepa qué grupos de menú mostrar sin volver a
// pedirlo pantalla por pantalla.
//
// LAS TRES SITUACIONES SE DICEN POR SEPARADO —'cargando', 'error', 'listo'—, por el mismo motivo
// que en PermisosContext: antes una respuesta que no llegaba bien dejaba la lista
// vacía y `cargado` en falso para siempre, y quien miraba veía una espera que no terminaba nunca
// en vez de un error que se puede reintentar.
//
// Y `tieneModalidad` contesta que no mientras el estado no sea 'listo': una modalidad que no se
// pudo resolver no es una modalidad activa.

// CUÁL SE ESTÁ MIRANDO. Con las dos modalidades habilitadas, el Panel muestra una por vez, para
// que la información de una no se mezcle con la de la otra. La elección es de quien mira: se
// guarda en su navegador y no viaja a la base. Con una sola habilitada, se mira ésa.
const CLAVE_VISTA = `${IDENTIDAD.codigo}-panel-modalidad`;

function leerVista() {
  try {
    const guardada = localStorage.getItem(CLAVE_VISTA);
    return MODALIDADES.includes(guardada) ? guardada : MODALIDADES[0];
  } catch {
    return MODALIDADES[0];
  }
}

export function ModalidadesProvider({ children }) {
  const { usuario } = useAuth();
  const [modalidades, setModalidades] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [elegida, setElegida] = useState(leerVista);

  const cargar = useCallback(
    async (sigueValiendo = () => true) => {
      if (!usuario) {
        if (sigueValiendo()) {
          setModalidades([]);
          setEstado('cargando');
        }
        return;
      }
      if (sigueValiendo()) {
        setModalidades([]);
        setEstado('cargando');
      }
      try {
        const { data } = await supabase.auth.getSession();
        const respuesta = await fetch(`${API_URL}/api/panel/cuentas/modalidades-activas`, {
          headers: { Authorization: `Bearer ${data.session?.access_token}` },
        });
        if (!respuesta.ok) throw new Error('modalidades-activas');
        const resultado = await respuesta.json();
        if (!sigueValiendo()) return;
        setModalidades(resultado.modalidades || []);
        setEstado('listo');
      } catch {
        if (!sigueValiendo()) return;
        setModalidades([]);
        setEstado('error');
      }
    },
    [usuario],
  );

  useEffect(() => {
    let activo = true;
    cargar(() => activo);
    return () => {
      activo = false;
    };
  }, [cargar]);

  function tieneModalidad(modalidad) {
    if (estado !== 'listo') return false;
    return modalidades.includes(modalidad);
  }

  const activas = estado === 'listo' ? MODALIDADES.filter((m) => modalidades.includes(m)) : [];
  const ambas = activas.length > 1;
  const vista = ambas ? elegida : activas[0] ?? null;

  function elegirVista(modalidad) {
    if (!MODALIDADES.includes(modalidad)) return;
    setElegida(modalidad);
    try {
      localStorage.setItem(CLAVE_VISTA, modalidad);
    } catch {
      /* Sin almacenamiento la elección dura lo que dure la pestaña. */
    }
  }

  /** Si lo de esa modalidad se muestra ahora: está habilitada y es la que se está mirando. */
  function enVista(modalidad) {
    return vista === modalidad;
  }

  return (
    <ModalidadesContext.Provider
      value={{
        modalidades,
        tieneModalidad,
        ambas,
        vista,
        elegirVista,
        enVista,
        estado,
        cargado: estado === 'listo',
        recargar: () => cargar(),
      }}
    >
      {children}
    </ModalidadesContext.Provider>
  );
}

export function useModalidades() {
  const ctx = useContext(ModalidadesContext);
  if (!ctx) throw new Error('useModalidades debe usarse dentro de ModalidadesProvider');
  return ctx;
}
