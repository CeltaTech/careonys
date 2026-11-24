// Punto único de verdad del COLOR DE UNA GUARDIA EN LA GRILLA (regla 12 de CLAUDE.md §7).
// ============================================================================
//
// Qué decide este archivo, y qué no.
//
// `lib/tonos.js` ya contesta una pregunta parecida, pero no la misma. Aquella contesta
// "¿de qué color se pinta esta PALABRA?" — `vencida` es roja, `pendiente` es naranja — y la
// contesta mirando la palabra sola. Este archivo contesta otra: **"¿cuánta urgencia tiene
// este turno de guardia AHORA?"**, y para eso mirar la palabra no alcanza.
//
// El ejemplo que obliga a separarlas: un hueco sin cubrir. La palabra "sin cubrir" siempre
// significa lo mismo, así que `tonos.js` siempre la pinta naranja, y hace bien. Pero un hueco
// de mañana a las 8 y un hueco de dentro de tres semanas no son la misma cosa para quien está
// mirando la grilla: el primero hay que taparlo hoy, el segundo puede esperar. La diferencia
// no está en ninguna columna de la base — está en el reloj. Una función que solo recibe una
// palabra no puede saberlo; esta recibe el turno de guardia entero y la hora actual.
//
// Por eso conviven: `tonos.js` para los carteles de estado de todo el Panel, este para el
// color del borde de cada turno de guardia en la grilla. Los dos usan **los mismos cinco tonos** —acá
// no se inventa ningún color— y este importa `TONO` de aquel, así que no hay dos listas de
// colores que puedan quedar desincronizadas.
//
// Cómo se usa desde una pantalla:
//   import { tonoDeTurnoGuardia } from '../../lib/semaforoTurnoGuardia';
//   <div className="grilla-chip" data-tono={tonoDeTurnoGuardia(g, ctx)}>
//
// El CSS tiene una regla por tono (`.grilla-chip[data-tono='critico']`, etc.) y ninguna
// pantalla escribe un color a mano.

import { TONO } from './tonos';
import { estaSinCubrir } from './cobertura';
import { inicioDeTurnoGuardia, finDeTurnoGuardia } from './horarios';

/**
 * Los umbrales de fábrica: con qué números arranca una Prestadora que todavía no configuró
 * nada.
 *
 * **No son los del producto, son el punto de partida.** Cada Prestadora los tiene en su
 * configuración y los cambia desde el Panel; de ahí los trae `umbralesDeLaPrestadora()`, que es
 * lo que el `UmbralesProvider` le pasa a cada pantalla. Estos quedan para el caso en que la
 * configuración todavía no exista —una Prestadora recién dada de alta— y para que ninguna
 * pantalla se quede sin poder pintar un chip mientras la consulta viaja.
 *
 * Están todos juntos acá, y **todas** las funciones de este archivo los reciben por parámetro,
 * para que no haya un segundo lugar donde alguien escriba «48» a mano.
 */
export const UMBRALES = {
  /** Un hueco a menos de estas horas de empezar ya es urgente. */
  horas_hueco_urgente: 48,
  /** Minutos de tolerancia desde la hora de inicio antes de decir que el Asistente llegó tarde. */
  minutos_tolerancia_llegada: 15,
  /** Horas después del fin sin cerrar el turno de guardia antes de considerarla un problema. */
  horas_para_cerrar: 2,
};

const MINUTOS_POR_HORA = 60;

/** Un número de la base sólo reemplaza al de fábrica si es un número y es mayor que cero. */
function numeroUtil(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Los umbrales de una Prestadora, armados con lo que ella ya tiene configurado.
 *
 * NO HAY TABLA NUEVA, Y ES A PROPÓSITO. Los tres números ya existen en la base, cada uno en la
 * tabla donde esa Prestadora los decidió:
 *
 *   horas_hueco_urgente        ← `configuracion_aviso_turno_guardia_sin_cubrir.horas_antes`
 *   minutos_tolerancia_llegada ← `configuracion_ausencia_automatica.minutos_tolerancia_checkin`
 *   horas_para_cerrar          ← `configuracion_escalada_coordinador.minutos_gracia_cierre_turno_guardia`
 *
 * Copiarlos a una tabla propia del semáforo daría dos números para la misma pregunta, y el día
 * que alguien cambie uno la grilla diría una cosa y el mensaje otra: el turno de guardia pintado de rojo a
 * las 48 horas mientras el mensaje sale a las 24. El color de la grilla y el mensaje al Coordinador
 * son la misma decisión mirada de dos maneras, así que salen del mismo número.
 *
 * QUE EL MENSAJE ESTÉ APAGADO NO APAGA EL COLOR. Dos de esas tablas tienen un `activo`, que dice
 * si sale el mensaje, no a partir de cuándo la situación es urgente. Una Prestadora que prefiere
 * mirar la grilla en vez de recibir correos sigue teniendo su umbral, y por eso acá no se mira.
 *
 * @param config `{ mensajeSinCubrir, ausenciaAutomatica, escaladaCoordinador }` — filas tal como
 *               salen de la base. Cualquiera puede faltar.
 */
export function umbralesDeLaPrestadora(config = {}) {
  const horasHueco = numeroUtil(config.mensajeSinCubrir?.horas_antes);
  const minutosLlegada = numeroUtil(config.ausenciaAutomatica?.minutos_tolerancia_checkin);
  const minutosCierre = numeroUtil(config.escaladaCoordinador?.minutos_gracia_cierre_turno_guardia);

  return {
    horas_hueco_urgente: horasHueco ?? UMBRALES.horas_hueco_urgente,
    minutos_tolerancia_llegada: minutosLlegada ?? UMBRALES.minutos_tolerancia_llegada,
    // La configuración lo guarda en minutos porque así se lo pregunta el Panel —«a los cuántos
    // minutos de terminada se avisa»—; el semáforo razona en horas. La cuenta se hace acá, una
    // sola vez, y no en cada pantalla.
    horas_para_cerrar: minutosCierre
      ? minutosCierre / MINUTOS_POR_HORA
      : UMBRALES.horas_para_cerrar,
  };
}

/**
 * Las situaciones posibles de un turno de guardia. Son más que los estados de la base porque tres de
 * ellas no son una columna sino una comparación con el reloj: `tarde`, `sin_cerrar` y
 * `hueco_urgente`. Esas tres son, justamente, las que hacen falta ver en una grilla.
 */
export const SITUACION = {
  HUECO_URGENTE: 'hueco_urgente',
  HUECO: 'hueco',
  AUSENTE: 'ausente',
  TARDE: 'tarde',
  SIN_CERRAR: 'sin_cerrar',
  EN_CURSO: 'en_curso',
  PROGRAMADA: 'programada',
  COMPLETADA: 'completada',
  // El Asistente dejó la guardia al relevo sin presentar el Reporte Diario. La salida está hecha;
  // falta el reporte.
  SALIDA_SIN_REPORTE: 'salida_sin_reporte',
  CANCELADA: 'cancelada',
};

/** Qué tono le toca a cada situación. Cinco tonos, ni uno más. */
const TONO_POR_SITUACION = {
  // Está roto y alguien tiene que actuar hoy.
  [SITUACION.HUECO_URGENTE]: TONO.CRITICO,
  [SITUACION.AUSENTE]: TONO.CRITICO,
  [SITUACION.TARDE]: TONO.CRITICO,
  [SITUACION.SIN_CERRAR]: TONO.CRITICO,

  // Falta cerrar algo, pero hay tiempo.
  [SITUACION.HUECO]: TONO.ATENCION,
  // Falta un documento, no una persona: nunca rojo.
  [SITUACION.SALIDA_SIN_REPORTE]: TONO.ATENCION,

  // Va bien.
  [SITUACION.EN_CURSO]: TONO.EXITO,

  // Es un dato, ni bueno ni malo.
  [SITUACION.PROGRAMADA]: TONO.INFO,

  // Ya no hay nada que hacer con esto.
  [SITUACION.COMPLETADA]: TONO.NEUTRO,
  [SITUACION.CANCELADA]: TONO.NEUTRO,
};

const MS_POR_MINUTO = 60 * 1000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;

/**
 * En qué situación está un turno de guardia en este momento.
 *
 * El orden de las preguntas importa y no es casual: **primero lo que ya terminó** (cancelada,
 * completada), porque un turno de guardia cerrado no puede estar "tarde" ni ser un hueco urgente por
 * más que el reloj diga lo que diga; **después el hueco**, porque sin Asistente ninguna
 * pregunta sobre el Asistente tiene sentido; y **al final las comparaciones con el reloj**.
 * Cambiar ese orden es lo que produce guardias del año pasado pintadas de rojo.
 *
 * @param guardia  la fila de `turnos_guardia`
 * @param ctx      `{ ahora?: Date, umbrales?: UMBRALES }` — ambos opcionales
 */
export function situacionDeTurnoGuardia(turno_guardia, ctx = {}) {
  if (!turno_guardia) return SITUACION.PROGRAMADA;

  const ahora = ctx.ahora ?? new Date();
  const u = { ...UMBRALES, ...(ctx.umbrales ?? {}) };

  // 1. Lo que ya está cerrado no vuelve a abrirse.
  if (turno_guardia.estado === 'cancelada') return SITUACION.CANCELADA;
  if (turno_guardia.estado === 'completada') return SITUACION.COMPLETADA;
  if (turno_guardia.estado === 'salida_sin_reporte') return SITUACION.SALIDA_SIN_REPORTE;
  if (turno_guardia.estado === 'ausente') return SITUACION.AUSENTE;
  // Interrumpido: mientras dure la pausa o la suspensión no se espera a nadie.
  if (turno_guardia.estado === 'pausada' || turno_guardia.estado === 'suspendida') return SITUACION.PROGRAMADA;

  // 2. El hueco. Lo que lo vuelve urgente es lo poco que falta para que empiece.
  if (estaSinCubrir(turno_guardia)) {
    const horasQueFaltan = (inicioDeTurnoGuardia(turno_guardia) - ahora) / MS_POR_HORA;
    return horasQueFaltan <= u.horas_hueco_urgente
      ? SITUACION.HUECO_URGENTE
      : SITUACION.HUECO;
  }

  // 3. Tiene Asistente. Ahora sí las preguntas sobre el reloj.
  const inicio = inicioDeTurnoGuardia(turno_guardia);
  const fin = finDeTurnoGuardia(turno_guardia);

  // Entró y no salió. Mientras el turno de guardia no terminó, eso es exactamente lo esperado.
  if (turno_guardia.checkin_at && !turno_guardia.checkout_at) {
    const horasPasadas = (ahora - fin) / MS_POR_HORA;
    return horasPasadas > u.horas_para_cerrar
      ? SITUACION.SIN_CERRAR
      : SITUACION.EN_CURSO;
  }

  // No entró todavía y la hora ya pasó: llegó tarde. Solo cuenta si el turno de guardia no terminó —
  // si ya terminó y nunca entró, eso es una ausencia, y quien la marca es el Panel, no la
  // grilla; hasta que alguien la marque se muestra como estaba, sin inventarle un estado.
  if (!turno_guardia.checkin_at && ahora > new Date(inicio.getTime() + u.minutos_tolerancia_llegada * MS_POR_MINUTO) && ahora < fin) {
    return SITUACION.TARDE;
  }

  return SITUACION.PROGRAMADA;
}

/**
 * Las situaciones en las que un turno de guardia ya no espera a ninguna persona en la casa.
 *
 * La salida sin Reporte Diario está acá: la salida está hecha y lo único que falta es el
 * reporte, igual que en un turno completado al que le falta. La ausente no está a propósito:
 * aunque el turno no se cumplió, alguien tiene que cubrirlo, así que sigue esperando algo.
 */
export const SITUACIONES_CERRADAS = new Set([
  SITUACION.COMPLETADA,
  SITUACION.SALIDA_SIN_REPORTE,
  SITUACION.CANCELADA,
]);

/**
 * ¿Este turno de guardia todavía espera algo? Es lo que cualquier pantalla quiere decir cuando habla de
 * "guardias activas": la Ficha del cliente, el conteo del Padrón y las que vengan.
 *
 * Está acá y no en cada pantalla porque es la misma pregunta: el día que se decida que una
 * ausente tampoco espera nada, tiene que cambiar en un solo lugar.
 */
export function estaActiva(turno_guardia, ctx = {}) {
  return !SITUACIONES_CERRADAS.has(situacionDeTurnoGuardia(turno_guardia, ctx));
}

/** El tono del turno de guardia. Es lo que va en `data-tono` del chip. */
export function tonoDeTurnoGuardia(turno_guardia, ctx = {}) {
  return TONO_POR_SITUACION[situacionDeTurnoGuardia(turno_guardia, ctx)] ?? TONO.NEUTRO;
}

/**
 * ¿Este turno de guardia pide una acción de alguien? Son las cinco situaciones críticas más el hueco
 * común. Sirve para ordenar: lo que pide acción va arriba.
 */
export function pideAccion(turno_guardia, ctx = {}) {
  const tono = tonoDeTurnoGuardia(turno_guardia, ctx);
  return tono === TONO.CRITICO || tono === TONO.ATENCION;
}

/**
 * Un número para ordenar: cuanto más chico, más arriba va. Los que piden acción primero,
 * los cerrados al fondo, y dentro de cada grupo el más temprano primero.
 */
export function ordenPorUrgencia(turno_guardia, ctx = {}) {
  const pesos = {
    [TONO.CRITICO]: 0,
    [TONO.ATENCION]: 1,
    [TONO.EXITO]: 2,
    [TONO.INFO]: 3,
    [TONO.NEUTRO]: 4,
  };
  return pesos[tonoDeTurnoGuardia(turno_guardia, ctx)] ?? 5;
}
