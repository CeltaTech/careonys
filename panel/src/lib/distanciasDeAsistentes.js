// A cuántos metros vive cada Asistente del Paciente más cercano de una guardia.
//
// La cuenta la hace la base, con la función `distancias_de_asistentes_a_pacientes`, porque el
// domicilio del Asistente sólo lo ve quien tiene el permiso de verlo y la distancia la necesita
// también la Coordinadora que no lo tiene. Al navegador llega sólo el número, redondeado a cien
// metros: ninguna coordenada del Asistente sale de la base.
//
// La base contesta únicamente por los Asistentes y los Pacientes que quien pide ya puede ver, y
// sólo al personal de la Prestadora. Un Asistente sin domicilio ubicado en el mapa, o una guardia
// cuyos Pacientes no lo tienen, no vuelve en la respuesta: la lista de candidatos se calla sobre
// la cercanía en ese caso, que es lo que corresponde.

import { supabase } from './supabaseClient';
import { idsDePacientes } from './pacientesDeGuardia';

/**
 * Trae las distancias de los Asistentes hasta el Paciente más cercano de la guardia `hueco`.
 *
 * @param hueco          la fila de `guardias` que hay que cubrir, con `fecha` y sus Pacientes.
 * @param idsAsistentes  los Asistentes por los que se pregunta.
 * @returns {Promise<Record<string, number>>} id de Asistente → metros. Vacío si no hay a quién
 *   preguntar o si la consulta falló: sin distancia, la lista de candidatos no dice nada de la
 *   cercanía y todo lo demás sigue igual.
 */
export async function cargarDistanciasDeAsistentes(hueco, idsAsistentes) {
  const asistentes = [...new Set((idsAsistentes ?? []).filter(Boolean))];
  const pacientes = [...new Set(idsDePacientes(hueco ?? {}).filter(Boolean))];
  if (!hueco?.fecha || asistentes.length === 0 || pacientes.length === 0) return {};

  const { data, error } = await supabase.rpc('distancias_de_asistentes_a_pacientes', {
    p_asistentes: asistentes,
    p_pacientes: pacientes,
    p_fecha: hueco.fecha,
  });
  // Un error acá no voltea la pantalla: la lista se arma igual, sin hablar de cercanía.
  if (error) return {};

  const distancias = {};
  for (const fila of data ?? []) {
    const metros = Number(fila?.metros);
    if (fila?.asistente_id && Number.isFinite(metros)) distancias[fila.asistente_id] = metros;
  }
  return distancias;
}
