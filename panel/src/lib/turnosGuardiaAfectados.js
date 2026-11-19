// Qué turnos de guardia deja sin Asistente una ausencia.
//
// La columna `ausencias.turnos_guardia_afectados` existe desde el primer día y no la escribía nadie, así
// que una cobertura quedaba colgada de la ausencia y no de los turnos que esa ausencia dejó
// descubiertos: se sabía que la persona faltó, y no qué había que cubrir.
//
// ESTO ES UNA REGLA, NO UNA CONSULTA. Qué cuenta como afectada lo decide esta función y nadie
// más; quien la use trae los turnos de guardia de esa persona y pregunta acá. La consulta a la base vive en
// la pantalla, y así esta regla se puede probar sin base.

import { finEfectivoDeLaAusencia } from './ausenciaQueTapa.js';

/**
 * Los tres estados que una ausencia deja descubiertos. Son los turnos que todavía se van a
 * prestar: el programado, el que está corriendo en este momento —una ausencia puede empezar hoy— y
 * el pausado, porque la pausa es del servicio del Paciente y el día que se reanude la persona
 * sigue sin estar.
 *
 * Los otros tres no se tocan, y por el mismo motivo los tres: ya pasaron. Un turno de guardia completado
 * se prestó, una cancelada no existe más y una marcada como ausente ya registró que esa persona no
 * fue. Ninguna de las tres tiene nada que cubrir, y meterlas en la lista haría aparecer un
 * sustituto para un día que terminó.
 */
export const ESTADOS_QUE_UNA_AUSENCIA_DEJA_SIN_ASISTENTE = ['programada', 'activa', 'pausada'];

/**
 * Los identificadores de los turnos de guardia que quedan afectadas por el rango de una ausencia.
 *
 * `turnos_guardia` son las de esa persona, tal como vienen de la base: cada una con `id`, `fecha` y
 * `estado`. Una ausencia sin fecha de fin está abierta y alcanza a todo lo que venga después del
 * inicio; cuando se le cargue el fin, la lista se vuelve a calcular con este mismo cálculo.
 *
 * Las fechas se comparan como el texto `AAAA-MM-DD` que guarda la base. Convertirlas a fecha del
 * navegador las movería de día: una fecha sin hora se lee como medianoche en tiempo universal, y
 * al oeste del meridiano eso es el día anterior.
 */
export function turnosGuardiaAfectados(turnos_guardia, ausencia) {
  const desde = ausencia?.fecha_inicio;
  if (!desde) return [];
  const hasta = finEfectivoDeLaAusencia(ausencia);
  return (turnos_guardia ?? [])
    .filter((g) => ESTADOS_QUE_UNA_AUSENCIA_DEJA_SIN_ASISTENTE.includes(g?.estado))
    .filter((g) => typeof g?.fecha === 'string' && g.fecha >= desde && (hasta === null || g.fecha <= hasta))
    .map((g) => g.id);
}

/**
 * La lista de afectadas, más los turnos que esa misma ausencia ya hizo cubrir.
 *
 * Un turno cubierto pasa a nombre de quien lo hace, así que deja de aparecer entre los turnos de guardia de
 * quien faltó: preguntando sólo por las de esa persona, lo cubierto se pierde. Y esta lista se
 * vuelve a calcular el día que se cierra la ausencia, de modo que sin esto el cierre borraría
 * justamente los turnos que sí se resolvieron, que son la constancia de lo que tapó la licencia.
 *
 * Una cobertura vieja puede no decir de qué turno es: esa no suma ningún turno de guardia, porque no hay
 * ninguna que nombrar.
 */
export function sumarLasYaCubiertas(afectadas, coberturas) {
  const cubiertas = (coberturas ?? []).map((c) => c?.turno_guardia_original_id).filter(Boolean);
  return [...new Set([...(afectadas ?? []), ...cubiertas])];
}

/**
 * De los turnos de guardia que una ausencia dejó descubiertas, las que todavía no tienen sustituto.
 *
 * `coberturas` son las filas ya cargadas para esa ausencia, cada una con `turno_guardia_original_id`.
 * Una cobertura vieja puede no tener ese dato —hasta hoy se guardaba una sola fila por ausencia,
 * sin decir de qué turno—: esa no tapa ningún turno de guardia en particular, así que no descuenta
 * ninguna. Dar por cubierto un turno que nadie dijo que iba a cubrir es peor que pedir el
 * sustituto de nuevo.
 */
export function turnosGuardiaSinCubrir(afectadas, coberturas) {
  const cubiertas = new Set((coberturas ?? []).map((c) => c?.turno_guardia_original_id).filter(Boolean));
  return (afectadas ?? []).filter((id) => !cubiertas.has(id));
}
