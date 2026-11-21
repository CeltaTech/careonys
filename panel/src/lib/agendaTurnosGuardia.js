// Las cuentas de la GRILLA DE TURNOS DE GUARDIA que no dependen de la interfaz.
// ============================================================================
//
// Qué rango de días mira cada acercamiento, cómo se avanza y se retrocede, qué turnos de guardia
// tocan ese rango y qué pedazo de cada día ocupa un turno que dura más de uno. Está aparte de la
// grilla para poder probarlo sin dibujar nada, y para que la pantalla que pide los datos y la
// grilla que los dibuja usen exactamente el mismo rango.
//
// Las cuentas de inicio y de fin de un turno salen de `lib/horarios.js`, nunca de leer
// `hora_fin` literal: un turno de noche termina «antes» de empezar si se lo lee así.

import { finDeTurnoGuardia, horaDeReloj, inicioDeTurnoGuardia, momentoDelReloj, sumarDias } from './horarios';
import { estaSinCubrir } from './cobertura';
import { horarioCorrido } from './accionesMasivasTurnosGuardia';
import { IDENTIDAD } from '../config/identidadProducto';

const MS_POR_MINUTO = 60 * 1000;

/** Los cuatro acercamientos: un día, una semana, un mes, y las 24 horas de un día. */
export const ZOOMS = ['dia', 'semana', 'mes', 'linea'];

/** Las tres maneras de agrupar las filas. Es el mismo turno de guardia mirado desde otro lado. */
export const VISTAS = ['asistente', 'paciente', 'servicio'];

/**
 * Cuántos días dibuja la grilla como mucho. La causa es el mes: una cuadrícula de mes son seis
 * semanas de siete días cuando el mes empieza tarde en la semana y es largo. Ningún
 * acercamiento pide más.
 */
export const DIAS_DE_LA_CUADRICULA = 42;

const MS_POR_HORA = 60 * 60 * 1000;
const HORAS_DEL_DIA = 24;

/** El lunes de la semana de una fecha. La semana empieza el lunes, como en el calendario del rubro. */
export function lunesDeLaSemana(fecha) {
  const diaDeLaSemana = new Date(`${fecha}T12:00:00`).getDay(); // 0 domingo … 6 sábado
  const atras = (diaDeLaSemana + 6) % 7;
  return sumarDias(fecha, -atras);
}

/** El primer día del mes de una fecha. */
export function primeroDelMes(fecha) {
  return `${fecha.slice(0, 7)}-01`;
}

/** El último día del mes de una fecha. */
export function ultimoDelMes(fecha) {
  const [anio, mes] = fecha.slice(0, 7).split('-').map(Number);
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  return sumarDias(siguiente, -1);
}

/**
 * El rango de días que muestra un acercamiento, a partir del día que la persona está mirando.
 *
 * - Día y Línea de tiempo: ese día solo.
 * - Semana: de lunes a domingo.
 * - Mes: la cuadrícula entera, del lunes de la semana del 1 al domingo de la semana del último
 *   día. Los días de los meses vecinos se ven porque completan la semana.
 */
export function rangoDeVista(zoom, ancla) {
  if (zoom === 'semana') {
    const desde = lunesDeLaSemana(ancla);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if (zoom === 'mes') {
    const desde = lunesDeLaSemana(primeroDelMes(ancla));
    const hasta = sumarDias(lunesDeLaSemana(ultimoDelMes(ancla)), 6);
    return { desde, hasta };
  }
  return { desde: ancla, hasta: ancla };
}

/**
 * El día que se mira después de apretar «anterior» (`paso` -1) o «siguiente» (`paso` 1).
 * En Mes se pasa al 1 del mes vecino, para que un 31 no salte dos meses.
 */
export function moverAncla(zoom, ancla, paso) {
  if (zoom === 'semana') return sumarDias(ancla, 7 * paso);
  if (zoom === 'mes') {
    const [anio, mes] = ancla.slice(0, 7).split('-').map(Number);
    const total = anio * 12 + (mes - 1) + paso;
    const nuevoAnio = Math.floor(total / 12);
    const nuevoMes = (total % 12) + 1;
    return `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-01`;
  }
  return sumarDias(ancla, paso);
}

/** Los días de un rango, en orden, sin pasar el tope de la cuadrícula. */
export function diasDelRango(desde, hasta) {
  const tope = hasta ?? desde;
  const dias = [];
  for (let i = 0; i < DIAS_DE_LA_CUADRICULA; i += 1) {
    const dia = sumarDias(desde, i);
    // Las fechas 'AAAA-MM-DD' se comparan bien como texto: ordenan igual que como fechas.
    if (dia > tope) break;
    dias.push(dia);
  }
  return dias.length ? dias : [desde];
}

/**
 * Desde qué fecha de inicio hay que pedir a la base para no perder los turnos que empezaron antes
 * del rango y todavía siguen adentro. Un turno de guardia no tiene tope de días, así que el margen
 * no es fijo: es la cantidad de días que dura el turno más largo que empieza antes del rango
 * (`diasDelMasLargo`, sus días hasta el fin). Sin ese dato, o con uno que no se entiende, la
 * consulta arranca el mismo día del rango.
 */
export function desdeDeLaConsulta(desde, diasDelMasLargo = 0) {
  const dias = Number.isInteger(diasDelMasLargo) && diasDelMasLargo > 0 ? diasDelMasLargo : 0;
  return sumarDias(desde, -dias);
}

/**
 * Cómo queda un turno de guardia soltado en otra hora de la línea de tiempo.
 *
 * El inicio pasa a esa hora del día que se mira, con los mismos minutos que tenía, y el fin viaja
 * con él: la duración no cambia. Si el fin cae otro día que antes —un turno de 20:00 a 23:00
 * soltado a las 23 termina a las 02:00 del día siguiente—, cambian los días hasta el fin, y se
 * devuelven para guardarlos junto con las horas.
 *
 * @returns {{ horaInicio, horaFin, diasHastaElFin } | null} `null` si el turno, el día o la hora
 *          no se entienden.
 */
export function horarioSoltadoEnLaHora(turno_guardia, dia, hora) {
  if (!turno_guardia || !dia || !Number.isInteger(Number(hora))) return null;
  const inicio = inicioDeTurnoGuardia(turno_guardia);
  if (Number.isNaN(inicio.getTime())) return null;
  const minutosDeLaHora = horaDeReloj(inicio).slice(3);
  const nuevoInicio = momentoDelReloj(dia, `${String(Number(hora)).padStart(2, '0')}:${minutosDeLaHora}`);
  if (Number.isNaN(nuevoInicio.getTime())) return null;
  const corrimiento = Math.round((nuevoInicio.getTime() - inicio.getTime()) / MS_POR_MINUTO);
  const comoQueda = horarioCorrido(turno_guardia, corrimiento);
  if (!comoQueda) return null;
  return {
    horaInicio: comoQueda.hora_inicio,
    horaFin: comoQueda.hora_fin,
    diasHastaElFin: comoQueda.dias_hasta_el_fin,
  };
}

/** El momento en que empieza un día y el momento en que empieza el siguiente. */
function bordesDelDia(dia) {
  return {
    arranque: momentoDelReloj(dia, '00:00').getTime(),
    cierre: momentoDelReloj(sumarDias(dia, 1), '00:00').getTime(),
  };
}

/**
 * ¿El turno de guardia ocupa algún momento entre dos momentos? Uno que dura cero horas cuenta
 * en el momento en que empieza: si no, desaparecería de la grilla.
 */
function ocupaEntre(turno_guardia, arranque, cierre) {
  const inicio = inicioDeTurnoGuardia(turno_guardia).getTime();
  const fin = Math.max(finDeTurnoGuardia(turno_guardia).getTime(), inicio + 1);
  return inicio < cierre && fin > arranque;
}

/** ¿El turno de guardia toca algún día del rango, aunque haya empezado antes? */
export function tocaElRango(turno_guardia, desde, hasta) {
  return ocupaEntre(turno_guardia, bordesDelDia(desde).arranque, bordesDelDia(hasta ?? desde).cierre);
}

/** ¿El turno de guardia ocupa algún momento de ese día? */
export function tocaElDia(turno_guardia, dia) {
  const { arranque, cierre } = bordesDelDia(dia);
  return ocupaEntre(turno_guardia, arranque, cierre);
}

/**
 * El pedazo de cada día que ocupa un turno de guardia, de punta a punta.
 *
 * Un turno de lunes 08:00 a jueves 08:00 da cuatro tramos: lunes de 8 a 24, martes y miércoles
 * enteros, jueves de 0 a 8. Cada tramo dice si el turno viene del día anterior y si sigue al
 * siguiente, para que la grilla lo dibuje como una sola pieza y no como cuatro turnos.
 *
 * @returns {Array<{fecha, desdeHora, hastaHora, empiezaAntes, sigueDespues}>} sólo los días de
 *          `dias` que el turno toca. Las horas van de 0 a 24, con decimales si hace falta.
 */
export function tramosDelTurno(turno_guardia, dias) {
  const inicio = inicioDeTurnoGuardia(turno_guardia).getTime();
  const fin = Math.max(finDeTurnoGuardia(turno_guardia).getTime(), inicio);
  const tramos = [];
  for (const fecha of dias) {
    const { arranque, cierre } = bordesDelDia(fecha);
    if (!tocaElDia(turno_guardia, fecha)) continue;
    tramos.push({
      fecha,
      desdeHora: Math.max(0, (inicio - arranque) / MS_POR_HORA),
      hastaHora: Math.min(HORAS_DEL_DIA, (fin - arranque) / MS_POR_HORA),
      empiezaAntes: inicio < arranque,
      sigueDespues: fin > cierre,
    });
  }
  return tramos;
}

/**
 * Cuántos turnos de guardia sin cubrir toca cada día. Un turno cancelado no cuenta: ya no hay que
 * cubrirlo. Un turno de tres días sin cubrir cuenta en los tres: los tres días tienen el hueco.
 *
 * @returns {Map<string, number>} sólo los días con al menos uno.
 */
export function sinCubrirPorDia(turnos_guardia, dias) {
  const cuenta = new Map();
  for (const g of turnos_guardia) {
    if (g.estado === 'cancelada' || !estaSinCubrir(g)) continue;
    for (const dia of dias) {
      if (tocaElDia(g, dia)) cuenta.set(dia, (cuenta.get(dia) ?? 0) + 1);
    }
  }
  return cuenta;
}

/** La fila de un turno de guardia en la vista por Servicio. Todo turno tiene su Servicio en la base. */
export function filaDeServicio(turno_guardia) {
  return turno_guardia?.servicio_id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Lo que la persona eligió ver —lista o grilla, acercamiento, vista— se recuerda en este aparato,
// por cada cuenta. Es comodidad y nada más: si el navegador no deja guardar (ventana privada,
// datos borrados), se vuelve al valor de arranque sin romper nada.
// ---------------------------------------------------------------------------------------------

const PREFIJO_PREFERENCIA = `${IDENTIDAD.codigo}.turnos_guardia`;

function clavePreferencia(nombre, usuarioId) {
  return `${PREFIJO_PREFERENCIA}.${nombre}.${usuarioId ?? 'anonimo'}`;
}

/** Lee una preferencia. Si no está, no es una de las permitidas o no se puede leer, el valor de arranque. */
export function leerPreferencia(nombre, usuarioId, permitidos, porDefecto) {
  try {
    const valor = window.localStorage.getItem(clavePreferencia(nombre, usuarioId));
    return permitidos.includes(valor) ? valor : porDefecto;
  } catch {
    return porDefecto;
  }
}

/** Guarda una preferencia. Si el navegador no deja, no pasa nada: la próxima vez se arranca de cero. */
export function guardarPreferencia(nombre, usuarioId, valor) {
  try {
    window.localStorage.setItem(clavePreferencia(nombre, usuarioId), valor);
  } catch {
    // Sin dónde guardar, la elección vale mientras la pantalla esté abierta.
  }
}
