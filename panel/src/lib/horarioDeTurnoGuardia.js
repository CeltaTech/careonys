// Punto único de verdad para ESCRIBIR EL HORARIO DE UN TURNO DE GUARDIA en la interfaz.
// ============================================================================
//
// El turno de guardia se guarda como un día, dos horas de reloj y cuántos días después termina.
// Escrito a secas —«22:00–06:00»— no dice que termina al día siguiente, y uno de 72 horas que va
// de lunes 08:00 a jueves 08:00 se lee «08:00–08:00», que parece no durar nada. Por eso el
// horario se escribe siempre acá: con el día en que empieza, el día en que termina cuando no es
// el mismo, y la duración en horas.
//
// Las cuentas del momento de inicio y de fin no se repiten acá: salen de `lib/horarios.js`.

import { diaDelMomento, finDeTurnoGuardia, horasDeTurnoGuardia, hoyISO, sumarDias } from './horarios';
import { con } from './textos';

/** El día de un momento, `AAAA-MM-DD`, en el reloj de la Prestadora. */
export function fechaDelMomento(momento) {
  return diaDelMomento(momento);
}

/** `08:00:00` → `08:00`. La base guarda los segundos y la interfaz no los muestra nunca. */
export function horaCorta(hora) {
  return String(hora ?? '').slice(0, 5);
}

/** El día en que termina el turno de guardia, `AAAA-MM-DD`. */
export function diaEnQueTermina(turno_guardia) {
  return fechaDelMomento(finDeTurnoGuardia(turno_guardia));
}

/** ¿Termina otro día que el que empieza? */
export function terminaOtroDia(turno_guardia) {
  return diaEnQueTermina(turno_guardia) !== turno_guardia.fecha;
}

/**
 * La duración escrita: `8 h`, `7,5 h`, `72 h`. Con un decimal como mucho, y con la coma o el
 * punto que usa el idioma. Sin plantilla o con una duración que no se pudo calcular, vacío.
 */
export function textoDeLaDuracion(turno_guardia, { locale, plantilla }) {
  const horas = horasDeTurnoGuardia(turno_guardia);
  if (!Number.isFinite(horas) || !plantilla) return '';
  const numero = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(horas * 10) / 10);
  return con(plantilla, { horas: numero });
}

/**
 * Un día escrito para la persona: «Hoy», «Mañana», o el día de la semana con el número y el mes.
 *
 * @param {string} fecha  `AAAA-MM-DD`
 * @param {object} opciones  `locale`, `hoy` (la fecha de hoy; se pide para que una pantalla
 *                           entera mire el mismo día) y `textos` con `hoy` y `manana`.
 */
export function textoDelDia(fecha, { locale, hoy = hoyISO(), textos = {} }) {
  if (textos.hoy && fecha === hoy) return textos.hoy;
  if (textos.manana && fecha === sumarDias(hoy, 1)) return textos.manana;
  return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Las piezas del horario, para quien necesita armarlo a su manera.
 *
 * `diaFin` es `null` cuando termina el mismo día que empieza: no se escribe dos veces el mismo día.
 */
export function piezasDelHorario(turno_guardia, opciones) {
  const diaFin = terminaOtroDia(turno_guardia) ? textoDelDia(diaEnQueTermina(turno_guardia), opciones) : null;
  return {
    dia: textoDelDia(turno_guardia.fecha, opciones),
    desde: horaCorta(turno_guardia.hora_inicio),
    diaFin,
    hasta: horaCorta(turno_guardia.hora_fin),
    duracion: textoDeLaDuracion(turno_guardia, { locale: opciones.locale, plantilla: opciones.textos?.duracion }),
  };
}

/**
 * El horario entero en una línea.
 *
 *   «Hoy 08:00–16:00 · 8 h»
 *   «Hoy 22:00 – Mañana 06:00 · 8 h»
 *   «lun 3 nov 08:00 – jue 6 nov 08:00 · 72 h»
 *
 * Con `conDia: false` no se escribe el día de inicio, para donde el día ya está a la vista —la
 * columna de la grilla—; el de fin se escribe igual si es otro.
 *
 * @param {object} opciones  `locale`, `hoy`, `textos` con `hoy`, `manana` y `duracion` (la
 *                           plantilla `{horas} h`), `conDia` y `conDuracion`.
 */
export function textoDelHorario(turno_guardia, opciones) {
  const { conDia = true, conDuracion = true } = opciones;
  const p = piezasDelHorario(turno_guardia, opciones);
  const inicio = conDia ? `${p.dia} ${p.desde}` : p.desde;
  const tramo = p.diaFin ? `${inicio} – ${p.diaFin} ${p.hasta}` : `${inicio}–${p.hasta}`;
  return conDuracion && p.duracion ? `${tramo} · ${p.duracion}` : tramo;
}
