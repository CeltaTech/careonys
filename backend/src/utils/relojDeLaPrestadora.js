import { sumarDias } from './fechas.js';

// El día y la hora de reloj que tiene una Prestadora en este momento.
//
// POR QUÉ EXISTE. El servidor cuenta en hora universal. Una Prestadora de Argentina está tres
// horas atrás: entre las 21 y las 24 de allá, la hora universal ya está en el día siguiente. Una
// tarea que tomara "hoy" del servidor creería que es mañana, y saltearía un día entero.
//
// DE DÓNDE SALE LA ZONA. De la columna `zona_horaria` de la Prestadora, que la base guarda siempre
// (no admite vacío y nace con la de Buenos Aires). Quien llama la lee con la credencial de esa
// Prestadora y se la pasa acá, o usa `zonaDeLaPrestadora`, al final de este archivo.
//
// FALLA CERRADO. Una zona vacía o que no existe no cae a la hora del servidor: corta, para que la
// tarea no trabaje con un día equivocado.

/**
 * El día (`2026-08-20`) y la hora de reloj (`22:30`, de 24 horas) de ese momento en esa zona.
 *
 * @param {Date} ahora
 * @param {string} zona  la zona horaria de la Prestadora, como `America/Argentina/Buenos_Aires`
 * @returns {{dia: string, hora: string}}
 */
export function diaYHoraEnLaZona(ahora, zona) {
  if (typeof zona !== 'string' || !zona) throw new Error('diaYHoraEnLaZona: falta la zona horaria');
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) throw new Error('diaYHoraEnLaZona: el momento no es válido');

  // `formatToParts` con números sueltos: no depende de cómo escribe la fecha ningún idioma.
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const parte = (tipo) => partes.find((p) => p.type === tipo)?.value;

  return {
    dia: `${parte('year')}-${parte('month')}-${parte('day')}`,
    hora: `${parte('hour')}:${parte('minute')}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL CAMINO DE VUELTA: de un día y una hora de reloj de la Prestadora a un momento real.
//
// Un turno de guardia se guarda como un día (`2026-08-20`) y dos horas de reloj (`08:00`,
// `16:00`), sin huso: son las horas de la casa del Paciente. Convertirlas con `new Date` sin
// huso las lee en la hora del servidor, que cuenta en hora universal: un turno de las 08:00 de
// Argentina quedaba a las 05:00 de allá, y todo lo que se mide contra él —el recordatorio
// previo, la llegada demorada, el aviso de turno sin cubrir, el turno que no se cerró— salía
// tres horas corrido. Acá se lee en la zona de la Prestadora.
//
// Las cuentas de pantalla siguen en `horarios.js`, que es copia del Panel y corre en el aparato
// de quien mira: ahí el huso del aparato es el que corresponde.

/** Lo que el reloj de esa zona marca en ese momento, en milisegundos como si fuera hora universal. */
function relojComoUniversal(momento, zona) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(momento);
  const n = (tipo) => Number(partes.find((p) => p.type === tipo)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
}

/**
 * El momento real en que el reloj de esa zona marca ese día y esa hora.
 *
 * @param {string} dia   `2026-08-20`
 * @param {string} hora  `08:00` o `08:00:00`
 * @param {string} zona  la zona horaria de la Prestadora
 * @returns {Date}
 */
export function momentoEnLaZona(dia, hora, zona) {
  if (typeof zona !== 'string' || !zona) throw new Error('momentoEnLaZona: falta la zona horaria');
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? '').slice(0, 10));
  const h = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(hora ?? ''));
  if (!d || !h) throw new Error('momentoEnLaZona: el día o la hora no son válidos');

  const comoUniversal = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2], +(h[3] ?? 0));
  // Dos vueltas: la primera toma la diferencia de la zona en ese momento aproximado; la segunda la
  // corrige si en el medio la zona cambió de horario (verano e invierno).
  let momento = comoUniversal - (relojComoUniversal(new Date(comoUniversal), zona) - comoUniversal);
  momento = comoUniversal - (relojComoUniversal(new Date(momento), zona) - momento);
  return new Date(momento);
}

/** El día (`2026-08-20`) de ese momento en la zona de la Prestadora. */
export function diaEnLaZona(momento, zona) {
  return diaYHoraEnLaZona(momento, zona).dia;
}

/** Momento real en que empieza el turno de guardia, leído en la zona de la Prestadora. */
export function inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona) {
  return momentoEnLaZona(turno_guardia.fecha, turno_guardia.hora_inicio, zona);
}

/**
 * Momento real en que termina el turno de guardia, leído en la zona de la Prestadora.
 *
 * Misma regla que `finDeTurnoGuardia` de `horarios.js`: manda `dias_hasta_el_fin`; si no viene,
 * una hora de fin menor o igual a la de inicio quiere decir que termina al día siguiente.
 */
export function finDeTurnoGuardiaEnLaZona(turno_guardia, zona) {
  const dias = Number(turno_guardia?.dias_hasta_el_fin);
  if (turno_guardia?.dias_hasta_el_fin != null && Number.isFinite(dias) && dias >= 0) {
    return momentoEnLaZona(sumarDias(turno_guardia.fecha, dias), turno_guardia.hora_fin, zona);
  }
  const inicio = inicioDeTurnoGuardiaEnLaZona(turno_guardia, zona);
  const fin = momentoEnLaZona(turno_guardia.fecha, turno_guardia.hora_fin, zona);
  return fin <= inicio ? momentoEnLaZona(sumarDias(turno_guardia.fecha, 1), turno_guardia.hora_fin, zona) : fin;
}

/**
 * La zona horaria de la Prestadora, leída con la conexión de esa misma Prestadora.
 *
 * Falla cerrado: si la base no contesta o no trae zona, corta. Una tarea que siguiera con la hora
 * del servidor avisaría a deshora, que es justo lo que este archivo viene a evitar.
 *
 * @param {object} db  la conexión de la Prestadora (`enLaPrestadora`) o el cliente del trabajo
 *                     programado que ya está adentro de `paraCadaPrestadora`
 */
export async function zonaDeLaPrestadora(db, prestadoraId) {
  if (!prestadoraId) throw new Error('zonaDeLaPrestadora: falta la Prestadora');
  const { data, error } = await db.from('prestadoras').select('zona_horaria').eq('id', prestadoraId).maybeSingle();
  if (error) throw new Error(`zonaDeLaPrestadora: no se pudo leer la zona horaria (${error.message})`);
  if (!data?.zona_horaria) throw new Error('zonaDeLaPrestadora: la Prestadora no tiene zona horaria');
  return data.zona_horaria;
}
