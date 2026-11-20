// El día y la hora de reloj que tiene una Prestadora en este momento.
//
// POR QUÉ EXISTE. El servidor cuenta en hora universal. Una Prestadora de Argentina está tres
// horas atrás: entre las 21 y las 24 de allá, la hora universal ya está en el día siguiente. Una
// tarea que tomara "hoy" del servidor creería que es mañana, y saltearía un día entero.
//
// DE DÓNDE SALE LA ZONA. De la columna `zona_horaria` de la Prestadora, que la base guarda siempre
// (no admite vacío y nace con la de Buenos Aires). Quien llama la lee con la credencial de esa
// Prestadora y se la pasa acá: este archivo no consulta nada.
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
