import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLocale } from '../i18n/LocaleContext';
import { usePrestadoraActual } from './usePrestadoraActual';
import { ESTADO_ACTIVO } from '../lib/candidatos';
import { pesosYTopesDe } from '../lib/perfilesDeCandidatos';
import { cargarDistanciasDeAsistentes } from '../lib/distanciasDeAsistentes';
import { cargarAsignacionesPendientes } from '../lib/asignarTurnoGuardia';
import {
  cargarPacientesDeTurnosGuardia,
  cargarTurnosGuardiaDePacientes,
  conPacientes,
  idsDePacientes,
} from '../lib/pacientesDeTurnoGuardia';
import { traerTodasLasFilas } from '../lib/traerTodasLasFilas';
import { advertenciasPara, rangoDeFechas, sugerenciasPara } from '../lib/sugerenciasDeAsistentes';
import { hoyISO } from '../lib/horarios';
import { mensajeDeError } from '../lib/errores';

/* Lo que hace falta traer de la base para proponer Asistentes para uno o varios turnos de guardia.

   Todo se lee con la sesión de quien mira: lo que la base no le deja ver no entra en la cuenta. El
   orden y las advertencias no se calculan acá, sino en `lib/sugerenciasDeAsistentes.js`.

   Recibe una de dos cosas:
   - `huecos`: los turnos de guardia ya armados, como el que se está creando y todavía no existe.
   - `idsHuecos`: los ids de turnos de guardia que ya existen, que se traen de la base con sus
     Pacientes y su modalidad.
   `serieId` deja sólo los turnos de guardia de ese turno fijo. `excluir` son Asistentes que no se
   ofrecen, como quien falta. */

const COLUMNAS_DEL_TURNO = 'id, asistente_id, paciente_id, serie_id, estado, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, canal_modalidad';
const COLUMNAS_DE_LA_AGENDA = 'id, asistente_id, paciente_id, serie_id, estado, fecha, hora_inicio, hora_fin, dias_hasta_el_fin';
const COLUMNAS_DEL_ASISTENTE = 'id, nombre, estado, cuenta_desactivada, disponible, horas_semanales, canales, disponibilidad';

/** Lo que identifica a un turno de guardia para saber si cambió y hay que volver a cargar. */
function claveDeHuecos(huecos, idsHuecos, serieId) {
  if (Array.isArray(idsHuecos)) return JSON.stringify({ ids: [...idsHuecos].sort(), serieId: serieId ?? null });
  return JSON.stringify({
    huecos: (huecos ?? []).map((h) => [h?.id ?? null, h?.fecha, h?.hora_inicio, h?.hora_fin, h?.dias_hasta_el_fin ?? 0, h?.canal_modalidad ?? null, idsDePacientes(h)]),
    serieId: serieId ?? null,
  });
}

async function cargarHuecos(huecos, idsHuecos) {
  if (!Array.isArray(idsHuecos)) return (huecos ?? []).filter(Boolean);
  const ids = [...new Set(idsHuecos.filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('turnos_guardia').select(COLUMNAS_DEL_TURNO).in('id', ids);
  if (error) throw error;
  const mapa = await cargarPacientesDeTurnosGuardia(ids);
  return conPacientes(data ?? [], mapa, {});
}

async function cargarConfiguracion(prestadoraId) {
  const { data, error } = await supabase
    .from('configuracion_calculo_candidatos')
    .select('perfil, pesos, topes')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  // Sin configuración guardada, o si no se pudo leer, se ordena con los valores de fábrica: la
  // lista sigue sirviendo, y la configuración de la Prestadora sólo afina el orden.
  return pesosYTopesDe(error ? null : data);
}

/**
 * Los turnos de guardia de todo el Padrón en esos días. Un turno de guardia todavía sin aceptar
 * cuenta como de quien lo tiene pendiente: si se lo ofrece a esa persona para la misma hora, se
 * pisaría igual el día que lo acepte.
 */
async function cargarAgenda(prestadoraId, rango) {
  if (!rango) return [];
  const filas = await traerTodasLasFilas((desde, hasta) =>
    supabase
      .from('turnos_guardia')
      .select(COLUMNAS_DE_LA_AGENDA)
      .eq('prestadora_id', prestadoraId)
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta)
      .neq('estado', 'cancelada')
      .order('fecha')
      .order('id')
      .range(desde, hasta)
  );
  const sinAsistente = filas.filter((g) => !g.asistente_id);
  const pendientes = sinAsistente.length ? await cargarAsignacionesPendientes(sinAsistente) : new Map();
  return filas.map((g) => (g.asistente_id || !pendientes.has(g.id) ? g : { ...g, asistente_id: pendientes.get(g.id) }));
}

/** Los turnos de guardia ya hechos con estos Pacientes, para saber quién los conoce. */
async function cargarHistoria(idsPacientes) {
  if (!idsPacientes.length) return [];
  const filas = await cargarTurnosGuardiaDePacientes(idsPacientes, COLUMNAS_DE_LA_AGENDA, (c) =>
    // Los más recientes primero, hasta una página: alcanza para saber quién conoce la casa.
    c.lte('fecha', hoyISO()).not('asistente_id', 'is', null).neq('estado', 'cancelada').order('fecha', { ascending: false }).limit(1000)
  );
  const mapa = await cargarPacientesDeTurnosGuardia(filas.map((g) => g.id));
  return conPacientes(filas, mapa, {});
}

async function cargarAsistentes(prestadoraId) {
  return traerTodasLasFilas((desde, hasta) =>
    supabase
      .from('asistentes')
      .select(COLUMNAS_DEL_ASISTENTE)
      .eq('prestadora_id', prestadoraId)
      .eq('estado', ESTADO_ACTIVO)
      .eq('cuenta_desactivada', false)
      .order('nombre')
      .order('id')
      .range(desde, hasta)
  );
}

async function cargarAusencias(prestadoraId, rango) {
  if (!rango) return [];
  // Una ausencia que ya debía haber terminado y no tiene la vuelta anotada sigue abierta
  // (`finEfectivoDeLaAusencia`), así que entra aunque su fecha de fin sea anterior.
  return traerTodasLasFilas((desde, hasta) =>
    supabase
      .from('ausencias')
      .select('id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real')
      .eq('prestadora_id', prestadoraId)
      .lte('fecha_inicio', rango.hasta)
      .or(`fecha_fin.gte.${rango.desde},fecha_fin.is.null,fecha_vuelta_real.is.null`)
      .order('fecha_inicio')
      .order('id')
      .range(desde, hasta)
  );
}

async function cargarDocumentos(prestadoraId) {
  return traerTodasLasFilas((desde, hasta) =>
    supabase
      .from('documentos_asistente')
      .select('id, asistente_id, fecha_vencimiento')
      .eq('prestadora_id', prestadoraId)
      .not('fecha_vencimiento', 'is', null)
      .order('id')
      .range(desde, hasta)
  );
}

/** Junta dos listas de turnos de guardia sin repetir ninguno; la segunda manda. */
function juntar(...listas) {
  const porId = new Map();
  for (const g of listas.flat()) if (g?.id) porId.set(g.id, { ...(porId.get(g.id) ?? {}), ...g });
  return [...porId.values()];
}

/**
 * @returns {{
 *   estado: 'cargando' | 'error' | 'vacio' | 'listo',
 *   error: string | null,
 *   candidatos: object[],
 *   advertenciasDe: (asistenteId: string) => { clave: string, valores: object, grave: boolean }[],
 *   recargar: () => void,
 * }}
 */
export function useSugerenciasDeAsistentes({ huecos = null, idsHuecos = null, serieId = null, excluir = [] } = {}) {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [carga, setCarga] = useState({ estado: 'cargando', error: null, huecos: [], datos: null, configuracion: null });
  const pedido = useRef(0);

  const clave = claveDeHuecos(huecos, idsHuecos, serieId);
  // Lo que se usa adentro de la carga se lee de una referencia: los turnos de guardia llegan como
  // objetos nuevos en cada dibujo, y lo que decide si se vuelve a cargar es `clave`.
  const entrada = useRef({ huecos, idsHuecos, serieId });
  entrada.current = { huecos, idsHuecos, serieId };

  const recargar = useCallback(async () => {
    if (!prestadoraId) return;
    const numero = ++pedido.current;
    setCarga((c) => ({ ...c, estado: 'cargando', error: null }));
    try {
      const { huecos: dados, idsHuecos: ids, serieId: serie } = entrada.current;
      const [todos, configuracion] = await Promise.all([cargarHuecos(dados, ids), cargarConfiguracion(prestadoraId)]);
      const elegidos = serie ? todos.filter((h) => h.serie_id === serie) : todos;
      const rango = rangoDeFechas(elegidos, configuracion.topes);
      const idsPacientes = [...new Set(elegidos.flatMap((h) => idsDePacientes(h)))];

      const [asistentes, agenda, historia, ausencias, documentos] = await Promise.all([
        cargarAsistentes(prestadoraId),
        cargarAgenda(prestadoraId, rango),
        cargarHistoria(idsPacientes),
        cargarAusencias(prestadoraId, rango),
        cargarDocumentos(prestadoraId),
      ]);
      // La cercanía se calcula contra el primer turno de guardia: los de una misma ausencia o un
      // mismo turno fijo son de las mismas casas.
      const distancias = elegidos.length ? await cargarDistanciasDeAsistentes(elegidos[0], asistentes.map((a) => a.id)) : {};

      if (numero !== pedido.current) return;
      setCarga({
        estado: 'listo',
        error: null,
        huecos: elegidos,
        datos: { asistentes, turnos_guardia: juntar(agenda, historia), ausencias, documentos, distancias },
        configuracion,
      });
    } catch (e) {
      if (numero !== pedido.current) return;
      setCarga({ estado: 'error', error: mensajeDeError(e, t), huecos: [], datos: null, configuracion: null });
    }
    // `clave` está a propósito: es lo que dice que los turnos de guardia cambiaron.
  }, [prestadoraId, clave, t]);

  useEffect(() => { recargar(); }, [recargar]);

  const claveExcluidos = JSON.stringify([...(excluir ?? [])].filter(Boolean).sort());
  const candidatos = useMemo(() => {
    if (!carga.datos) return [];
    return sugerenciasPara(carga.huecos, { ...carga.datos, ahora: new Date() }, {
      pesos: carga.configuracion?.pesos,
      topes: carga.configuracion?.topes,
      excluir: JSON.parse(claveExcluidos),
    });
  }, [carga, claveExcluidos]);

  const advertenciasDe = useCallback(
    (asistenteId) =>
      carga.datos ? advertenciasPara(carga.huecos, asistenteId, carga.datos, { topes: carga.configuracion?.topes }) : [],
    [carga]
  );

  const estado = carga.estado === 'listo' && candidatos.length === 0 ? 'vacio' : carga.estado;
  return { estado, error: carga.error, candidatos, advertenciasDe, recargar };
}
