import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLocale } from '../i18n/LocaleContext';
import { usePrestadoraActual } from './usePrestadoraActual';
import { claveDePacientes, ESTADO_ACTIVO } from '../lib/candidatos';
import { pesosYTopesDe } from '../lib/perfilesDeCandidatos';
import { cargarDistanciasDeAsistentes } from '../lib/distanciasDeAsistentes';
import { cargarAsignacionesPendientes } from '../lib/asignarTurnoGuardia';
import {
  cargarPacientesDeTurnosGuardia,
  conPacientes,
  idsDePacientes,
} from '../lib/pacientesDeTurnoGuardia';
import { traerTodasLasFilas } from '../lib/traerTodasLasFilas';
import { advertenciasPara, rangoDeFechas, sugerenciasPara } from '../lib/sugerenciasDeAsistentes';
import { mensajeDeError } from '../lib/errores';

/* Lo que hace falta traer de la base para proponer Asistentes para uno o varios turnos de guardia.

   Todo se lee con la sesión de quien mira: lo que la base no le deja ver no entra en la cuenta. El
   orden y las advertencias no se calculan acá, sino en `lib/sugerenciasDeAsistentes.js`.

   Recibe una de dos cosas:
   - `huecos`: los turnos de guardia ya armados, como el que se está creando y todavía no existe.
   - `idsHuecos`: los ids de turnos de guardia que ya existen, que se traen de la base con sus
     Pacientes y su modalidad.
   `serieId` deja sólo los turnos de guardia de ese turno fijo. `excluir` son Asistentes que no se
   ofrecen, como quien falta.

   `servicioId` y `turnoGuardiaId` son para los criterios del Servicio, que contesta la base. Un
   turno de guardia que ya existe trae su Servicio, así que sin `servicioId` se usa el suyo. */

const COLUMNAS_DEL_TURNO = 'id, asistente_id, paciente_id, servicio_id, serie_id, estado, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, canal_modalidad';
const COLUMNAS_DE_LA_AGENDA = 'id, asistente_id, paciente_id, serie_id, estado, fecha, hora_inicio, hora_fin, dias_hasta_el_fin';
const COLUMNAS_DEL_ASISTENTE = 'id, nombre, estado, cuenta_desactivada, disponible, horas_semanales, canales, disponibilidad';

/** Lo que identifica a un turno de guardia para saber si cambió y hay que volver a cargar. */
function claveDeHuecos(huecos, idsHuecos, serieId, servicioId, turnoGuardiaId) {
  const delServicio = { servicioId: servicioId ?? null, turnoGuardiaId: turnoGuardiaId ?? null };
  if (Array.isArray(idsHuecos)) return JSON.stringify({ ids: [...idsHuecos].sort(), serieId: serieId ?? null, ...delServicio });
  return JSON.stringify({
    huecos: (huecos ?? []).map((h) => [h?.id ?? null, h?.servicio_id ?? null, h?.fecha, h?.hora_inicio, h?.hora_fin, h?.dias_hasta_el_fin ?? 0, h?.canal_modalidad ?? null, idsDePacientes(h)]),
    serieId: serieId ?? null,
    ...delServicio,
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

/**
 * Cuántas veces atendió cada Asistente a cada grupo de Pacientes de estos turnos de guardia. La
 * cuenta la hace la base, entera y sin tope, una vez por grupo distinto.
 *
 * @returns {Promise<Map<string, Map<string, number>>>} clave del grupo → Asistente → cantidad.
 */
async function cargarContinuidad(huecos) {
  const grupos = new Map();
  for (const h of huecos) {
    const ids = idsDePacientes(h);
    if (ids.length) grupos.set(claveDePacientes(ids), ids);
  }
  const resultado = new Map();
  await Promise.all([...grupos.entries()].map(async ([clave, ids]) => {
    const { data, error } = await supabase.rpc('asistentes_que_atendieron_a_pacientes', { p_pacientes: ids });
    if (error) throw error;
    resultado.set(clave, new Map((data ?? []).map((fila) => [fila.asistente_id, fila.cantidad])));
  }));
  return resultado;
}

/**
 * Qué turno de guardia se le pasa a la base para un Servicio: el pedido, si es de ese Servicio;
 * si no, el único turno de guardia que ya existe de ese Servicio. Con varios, ninguno, y la base
 * mira el Servicio entero.
 */
function turnoParaLosCriterios(servicio, huecos, turnoGuardiaId) {
  const delServicio = huecos.filter((h) => h.servicio_id === servicio && h.id);
  if (turnoGuardiaId && (delServicio.some((h) => h.id === turnoGuardiaId) || !huecos.some((h) => h.id))) return turnoGuardiaId;
  return delServicio.length === 1 ? delServicio[0].id : null;
}

/**
 * Los criterios del Servicio para cada Asistente: una llamada por Servicio.
 *
 * Si la base no contesta —error o sin permiso—, ese Servicio queda sin fila y sus criterios no
 * opinan: la lista sigue sirviendo con el resto de la cuenta.
 *
 * @returns {Promise<Map<string, Map<string, object>>>} Servicio → Asistente → fila.
 */
async function cargarCriterios(servicios, huecos, turnoGuardiaId, asistentes, topes) {
  const resultado = new Map();
  const ids = asistentes.map((a) => a.id).filter(Boolean);
  if (!servicios.length || !ids.length) return resultado;
  const meses = Math.round(Number(topes?.meses_de_antecedentes));
  await Promise.all(servicios.map(async (servicio) => {
    const { data, error } = await supabase.rpc('criterios_de_candidatas', {
      p_servicio: servicio,
      p_asistentes: ids,
      p_turno_guardia: turnoParaLosCriterios(servicio, huecos, turnoGuardiaId),
      p_meses_de_antecedentes: Number.isFinite(meses) ? meses : null,
    });
    if (error) {
      console.error(error);
      return;
    }
    resultado.set(servicio, new Map((data ?? []).map((fila) => [fila.asistente_id, fila])));
  }));
  return resultado;
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

/**
 * @returns {{
 *   estado: 'cargando' | 'error' | 'vacio' | 'listo',
 *   error: string | null,
 *   candidatos: object[],
 *   advertenciasDe: (asistenteId: string) => { clave: string, valores: object, grave: boolean }[],
 *   recargar: () => void,
 * }}
 */
export function useSugerenciasDeAsistentes({
  huecos = null,
  idsHuecos = null,
  serieId = null,
  servicioId = null,
  turnoGuardiaId = null,
  excluir = [],
} = {}) {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [carga, setCarga] = useState({ estado: 'cargando', error: null, huecos: [], datos: null, configuracion: null });
  const pedido = useRef(0);

  const clave = claveDeHuecos(huecos, idsHuecos, serieId, servicioId, turnoGuardiaId);
  // Lo que se usa adentro de la carga se lee de una referencia: los turnos de guardia llegan como
  // objetos nuevos en cada dibujo, y lo que decide si se vuelve a cargar es `clave`.
  const entrada = useRef({ huecos, idsHuecos, serieId, servicioId, turnoGuardiaId });
  entrada.current = { huecos, idsHuecos, serieId, servicioId, turnoGuardiaId };

  const recargar = useCallback(async () => {
    if (!prestadoraId) return;
    const numero = ++pedido.current;
    setCarga((c) => ({ ...c, estado: 'cargando', error: null }));
    try {
      const { huecos: dados, idsHuecos: ids, serieId: serie, servicioId: servicio, turnoGuardiaId: turno } = entrada.current;
      const [todos, configuracion] = await Promise.all([cargarHuecos(dados, ids), cargarConfiguracion(prestadoraId)]);
      const elegidos = (serie ? todos.filter((h) => h.serie_id === serie) : todos)
        .map((h) => (h.servicio_id || !servicio ? h : { ...h, servicio_id: servicio }));
      // Sin `servicioId`, el Servicio sale de los turnos de guardia; si son de varios, uno por cada uno.
      const servicios = [...new Set([servicio, ...elegidos.map((h) => h.servicio_id)].filter(Boolean))];
      const rango = rangoDeFechas(elegidos, configuracion.topes);

      const [asistentes, agenda, continuidad, ausencias, documentos] = await Promise.all([
        cargarAsistentes(prestadoraId),
        cargarAgenda(prestadoraId, rango),
        cargarContinuidad(elegidos),
        cargarAusencias(prestadoraId, rango),
        cargarDocumentos(prestadoraId),
      ]);
      // La cercanía se calcula contra el primer turno de guardia: los de una misma ausencia o un
      // mismo turno fijo son de las mismas casas.
      const [distancias, criterios] = await Promise.all([
        elegidos.length ? cargarDistanciasDeAsistentes(elegidos[0], asistentes.map((a) => a.id)) : {},
        cargarCriterios(servicios, elegidos, turno, asistentes, configuracion.topes),
      ]);

      if (numero !== pedido.current) return;
      setCarga({
        estado: 'listo',
        error: null,
        huecos: elegidos,
        datos: {
          asistentes,
          turnos_guardia: agenda,
          continuidad,
          ausencias,
          documentos,
          distancias,
          criterios,
          servicio_id: servicio ?? (servicios.length === 1 ? servicios[0] : null),
        },
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
