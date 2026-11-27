import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FICHA_NOMBRE, conSusFichas } from '../lib/fichaDelPaciente';
import { usePrestadoraActual } from './usePrestadoraActual';

/* Las personas de la Prestadora que se pueden elegir en una lista.
   ==========================================================================

   Un casillero que nombra a alguien que ya está cargado es una lista y no texto libre. Este punto
   único arma esas listas —Pacientes, Asistentes y Clientes— con el nombre con que se los reconoce,
   ordenadas por nombre. Cada lista se pide sólo si se la nombra en `clases`, y la base decide qué
   filas ve quien consulta.

   El Cliente se nombra por quien contrata, como en su Ficha. */

function porNombre(a, b) {
  return a.nombre.localeCompare(b.nombre);
}

async function leerPacientes(prestadoraId) {
  const { data, error } = await supabase
    .from('pacientes')
    .select(`id, cliente_id, ${FICHA_NOMBRE}`)
    .eq('prestadora_id', prestadoraId)
    .is('deleted_at', null);
  if (error) throw error;
  return conSusFichas(data ?? [])
    .map((p) => ({ id: p.id, nombre: p.nombre || '—' }))
    .sort(porNombre);
}

async function leerAsistentes(prestadoraId) {
  const { data, error } = await supabase.from('asistentes').select('id, nombre').eq('prestadora_id', prestadoraId);
  if (error) throw error;
  return (data ?? []).map((a) => ({ id: a.id, nombre: a.nombre || '—' })).sort(porNombre);
}

async function leerClientes(prestadoraId) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, personas!clientes_contratante_de_la_misma_prestadora(nombre_visible)')
    .eq('prestadora_id', prestadoraId);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, nombre: c.personas?.nombre_visible || '—' })).sort(porNombre);
}

const LECTORES = { paciente: leerPacientes, asistente: leerAsistentes, cliente: leerClientes };

/**
 * @param {string[]} clases  Cuáles listas pedir: 'paciente', 'asistente', 'cliente'.
 * @returns {{ estado: 'cargando'|'error'|'listo', listas: Record<string, {id, nombre}[]>, error }}
 */
export function usePersonasParaElegir(clases) {
  const prestadoraId = usePrestadoraActual();
  const clave = [...clases].sort().join(',');
  const [resultado, setResultado] = useState({ estado: 'cargando', listas: {}, error: null });

  useEffect(() => {
    if (!prestadoraId || !clave) return undefined;
    let vigente = true;
    setResultado({ estado: 'cargando', listas: {}, error: null });
    const pedidas = clave.split(',').filter((clase) => LECTORES[clase]);
    Promise.all(pedidas.map((clase) => LECTORES[clase](prestadoraId)))
      .then((listas) => {
        if (vigente) setResultado({ estado: 'listo', listas: Object.fromEntries(pedidas.map((clase, i) => [clase, listas[i]])), error: null });
      })
      .catch((error) => {
        if (vigente) setResultado({ estado: 'error', listas: {}, error });
      });
    return () => {
      vigente = false;
    };
  }, [prestadoraId, clave]);

  return resultado;
}
