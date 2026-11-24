// Punto único de verdad para pasar de "fecha + hora escrita" a un momento real
// (regla 12 de CLAUDE.md §7).
//
// Parece de más, pero no lo es: un turno de guardia se guarda como una fecha (`2026-08-01`) y dos
// horas de reloj (`22:00` y `06:00`). Leído literal, ese turno de guardia "termina" ocho horas antes
// de empezar. El turno de guardia de noche es lo más común del rubro, así que cualquier cuenta que
// use `hora_fin` sin arreglar eso —cuántas horas duró, si ya pasaron dos horas del final,
// si se pisa con otra— da mal justamente en el caso más frecuente.
//
// Antes de este archivo, `TurnosGuardia.jsx` armaba la fecha de fin a mano y tenía ese error.
// Ahora la conversión está escrita una sola vez, acá.

const MS_POR_HORA = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL RELOJ DE LA PRESTADORA
//
// «Hoy», el día de un momento guardado y la hora de reloj de un turno de guardia se cuentan con la
// zona horaria de la Prestadora, nunca con el reloj del aparato ni en hora universal. Una
// coordinadora que mira el Panel desde otro país, o un aparato mal configurado, tiene que ver el
// mismo día que la casa del Paciente.
//
// DE DÓNDE SALE LA ZONA. De la zona horaria de la Prestadora, que la base guarda siempre. En el
// Panel la lee `context/EmpresaContext.jsx` con la sesión de quien entró y la anota acá con
// `anotarZonaHoraria`. Ninguna pantalla con sesión se abre hasta que está anotada
// (`components/layout/ProtectedRoute.jsx`). Es un solo dato y un solo escritor.
//
// SIN ZONA ANOTADA se cuenta con el reloj del aparato. Pasa en las copias de este archivo en las
// aplicaciones y en el backend, que todavía no anotan ninguna, y en las pruebas que no la anotan.

let zonaAnotada = null;

/** ¿Es el nombre de una zona de la base internacional de zonas horarias? */
function esZonaConocida(zona) {
  if (typeof zona !== 'string' || !zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/**
 * Anota la zona horaria de la Prestadora de esta sesión (`America/Argentina/Buenos_Aires`). Una
 * zona vacía o desconocida deja la anotación vacía: al salir de la sesión, la zona de la
 * Prestadora anterior no puede quedar colgada.
 */
export function anotarZonaHoraria(zona) {
  zonaAnotada = esZonaConocida(zona) ? zona : null;
}

/** La zona horaria anotada, o `null` si no hay ninguna. */
export function zonaHorariaAnotada() {
  return zonaAnotada;
}

/** Lo que marca el reloj de esa zona en ese momento, en números sueltos. */
function relojEnLaZona(momento, zona) {
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
  const parte = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return {
    anio: parte('year'),
    mes: parte('month'),
    dia: parte('day'),
    hora: parte('hour'),
    minuto: parte('minute'),
    segundo: parte('second'),
  };
}

/** El día (`2026-08-20`) de ese momento en esa zona. */
export function diaEnLaZona(momento, zona) {
  const r = relojEnLaZona(momento, zona);
  return `${r.anio}-${r.mes}-${r.dia}`;
}

/** Lo que marca el reloj de esa zona en ese momento, en milisegundos como si fuera hora universal. */
function relojComoUniversal(momento, zona) {
  const r = relojEnLaZona(momento, zona);
  return Date.UTC(+r.anio, +r.mes - 1, +r.dia, +r.hora, +r.minuto, +r.segundo);
}

/**
 * El momento real en que el reloj de esa zona marca ese día y esa hora. Es la misma cuenta que
 * hace el backend. Con un día o una hora que no se entienden devuelve un momento inválido, igual
 * que `new Date` con un texto que no es fecha.
 */
export function momentoEnLaZona(dia, hora, zona) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? '').slice(0, 10));
  const h = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(hora ?? ''));
  if (!d || !h) return new Date(NaN);
  const comoUniversal = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2], +(h[3] ?? 0));
  // `Date.UTC` acepta el mes 13 o las 99 horas y los pasa al mes o al día siguiente. Un día o una
  // hora que no existen no son una fecha: si al volver no dan lo mismo, no se entienden.
  const vuelta = new Date(comoUniversal);
  if (
    vuelta.getUTCMonth() !== +d[2] - 1 ||
    vuelta.getUTCDate() !== +d[3] ||
    vuelta.getUTCHours() !== +h[1] ||
    vuelta.getUTCMinutes() !== +h[2]
  ) {
    return new Date(NaN);
  }
  // Dos vueltas: la primera toma la diferencia de la zona en ese momento aproximado; la segunda la
  // corrige si en el medio la zona cambió de horario (verano e invierno).
  let momento = comoUniversal - (relojComoUniversal(new Date(comoUniversal), zona) - comoUniversal);
  momento = comoUniversal - (relojComoUniversal(new Date(momento), zona) - momento);
  return new Date(momento);
}

/** El momento real de un día y una hora de reloj de la Prestadora. */
export function momentoDelReloj(dia, hora) {
  if (zonaAnotada) return momentoEnLaZona(dia, hora, zonaAnotada);
  return new Date(`${dia}T${hora}`);
}

const conCero = (n) => String(n).padStart(2, '0');

/**
 * La hora de reloj de la Prestadora en ese momento, `08:05`, de 24 horas y sin depender del
 * idioma. Es la que se guarda en un turno de guardia. `null` con un momento que no se entiende.
 */
export function horaDeReloj(momento) {
  const fecha = momento instanceof Date ? momento : new Date(momento);
  if (Number.isNaN(fecha.getTime())) return null;
  if (zonaAnotada) {
    const r = relojEnLaZona(fecha, zonaAnotada);
    return `${r.hora}:${r.minuto}`;
  }
  return `${conCero(fecha.getHours())}:${conCero(fecha.getMinutes())}`;
}

/**
 * Un momento con la forma que pide una caja de fecha y hora (`2026-09-16T14:30`), en el reloj de
 * la Prestadora. Vacío cuando no hay momento o no se entiende: una caja no puede quedar con
 * «undefined».
 */
export function momentoParaElCampo(momento) {
  if (!momento) return '';
  const fecha = momento instanceof Date ? momento : new Date(momento);
  if (Number.isNaN(fecha.getTime())) return '';
  return `${diaDelMomento(fecha)}T${horaDeReloj(fecha)}`;
}

/**
 * Lo que se escribió en una caja de fecha y hora (`2026-09-16T14:30`), leído en el reloj de la
 * Prestadora, como el momento real que se guarda. `null` cuando no se entiende.
 */
export function momentoDelCampo(valor) {
  if (!valor) return null;
  const texto = String(valor);
  const momento = momentoDelReloj(texto.slice(0, 10), texto.slice(11));
  return Number.isNaN(momento.getTime()) ? null : momento;
}

/** Momento en que el turno de guardia empieza, en el reloj de la Prestadora. */
export function inicioDeTurnoGuardia(turno_guardia) {
  return momentoDelReloj(turno_guardia.fecha, turno_guardia.hora_inicio);
}

/**
 * Momento en que el turno de guardia termina.
 *
 * Manda `dias_hasta_el_fin`, que dice cuántos días después de `fecha` termina el turno: 0 el
 * mismo día, 1 al siguiente, 4 cuatro días después. No tiene tope: es lo que hace posibles los
 * turnos de guardia de varios días seguidos que cubre una sola Asistente.
 *
 * Cuando ese dato no viene se cae en la regla anterior: si la hora de fin es menor o igual a la
 * de inicio, el turno de guardia cruza la medianoche y termina al día siguiente. Esa regla cubre la
 * guardia de noche y no sabe de nada más largo, así que es sólo la red para los turnos cargados
 * antes de que la duración se escribiera.
 */
export function finDeTurnoGuardia(turno_guardia) {
  const dias = Number(turno_guardia?.dias_hasta_el_fin);
  if (turno_guardia?.dias_hasta_el_fin != null && Number.isFinite(dias) && dias >= 0) {
    return momentoDelReloj(sumarDias(turno_guardia.fecha, dias), turno_guardia.hora_fin);
  }
  const inicio = inicioDeTurnoGuardia(turno_guardia);
  const fin = momentoDelReloj(turno_guardia.fecha, turno_guardia.hora_fin);
  return fin <= inicio ? momentoDelReloj(sumarDias(turno_guardia.fecha, 1), turno_guardia.hora_fin) : fin;
}

/** Cuánto dura, en horas. Sirve para sumar la carga semanal de un Asistente. */
export function horasDeTurnoGuardia(turno_guardia) {
  return (finDeTurnoGuardia(turno_guardia) - inicioDeTurnoGuardia(turno_guardia)) / MS_POR_HORA;
}

/**
 * ¿Estos dos turnos de guardia se pisan?
 *
 * Se tocan por el borde no cuenta: una que termina 14:00 y otra que empieza 14:00 no se
 * superponen. Por eso las comparaciones son estrictas.
 */
export function seSuperponen(a, b) {
  return inicioDeTurnoGuardia(a) < finDeTurnoGuardia(b) && inicioDeTurnoGuardia(b) < finDeTurnoGuardia(a);
}

/** Horas de descanso entre el fin de un turno de guardia y el inicio de otra. Negativo = se pisan. */
export function horasDeDescansoEntre(anterior, siguiente) {
  return (inicioDeTurnoGuardia(siguiente) - finDeTurnoGuardia(anterior)) / MS_POR_HORA;
}

/**
 * La fecha de hoy de la Prestadora, en el formato en que la guarda la base: `2026-08-01`. Es el
 * único lugar del Panel que dice qué día es hoy.
 */
export function hoyISO() {
  return diaDelMomento(new Date());
}

/** Suma (o resta, con número negativo) días a una fecha `2026-08-01`. */
export function sumarDias(fechaISO, dias) {
  const f = new Date(`${fechaISO}T00:00:00`);
  f.setDate(f.getDate() + dias);
  const corrida = new Date(f.getTime() - f.getTimezoneOffset() * 60000);
  return corrida.toISOString().slice(0, 10);
}

/**
 * Cuántos días de calendario van de una fecha `2026-08-01` a otra. Negativo si la segunda es
 * anterior, y `null` si falta alguna o no se entiende. Es la cuenta inversa de `sumarDias`: con
 * ella, una fecha de fin elegida en el calendario se vuelve los días hasta el fin que guarda la
 * base. Se cuenta a mediodía para que un cambio de horario de verano no corra el resultado.
 */
export function diasEntre(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return null;
  const desde = Date.parse(`${desdeISO}T12:00:00`);
  const hasta = Date.parse(`${hastaISO}T12:00:00`);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return null;
  return Math.round((hasta - desde) / (24 * 60 * 60 * 1000));
}

/**
 * El día de un momento guardado, en la zona horaria de la Prestadora. Una fecha que ya viene
 * escrita como día (`2026-08-01`) se devuelve tal cual: no tiene hora, así que no hay huso que
 * aplicarle, y pasarla por `new Date` la correría un día en los husos de menos de cero.
 */
export function diaDelMomento(momento) {
  if (!momento) return null;
  if (typeof momento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(momento.slice(0, 10)) && !momento.includes('T')) {
    return momento.slice(0, 10);
  }
  const fecha = new Date(momento);
  if (Number.isNaN(fecha.getTime())) return null;
  if (zonaAnotada) return diaEnLaZona(fecha, zonaAnotada);
  const corrida = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return corrida.toISOString().slice(0, 10);
}

/**
 * Cuántos días hace que algo está esperando. Es sólo para mostrar: cuánto tiempo lleva abierto
 * es lo que dice cuál mirar primero, y por eso se cuenta en días enteros y nunca da negativo
 * —algo anotado con fecha de mañana lleva esperando cero días, no menos uno—.
 *
 * Se cuenta de día a día y no de hora a hora a propósito: quien mira la pantalla piensa en
 * «hace tres días», no en «hace 67 horas», y contar las horas haría que la misma fila diga dos
 * y tres según a qué hora se la mire.
 */
export function diasDeEspera(desde, hasta = hoyISO()) {
  const inicio = diaDelMomento(desde);
  const fin = diaDelMomento(hasta);
  if (!inicio || !fin) return null;
  const unDia = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((Date.parse(`${fin}T00:00:00`) - Date.parse(`${inicio}T00:00:00`)) / unDia));
}

/**
 * La hora de reloj de un momento guardado (`2026-09-09T14:19:03Z` → `14:19`), en la zona horaria
 * de la Prestadora, que es la misma en la que está escrito el horario del turno de guardia.
 *
 * RELOJ DE 24 HORAS EN LOS TRES IDIOMAS, a propósito. El horario de un turno de guardia sale de la base
 * escrito así —`08:00` a `16:00`— y no hay forma de escribirlo de otra manera. Dejar que el
 * idioma elija pondría «Llegó a las 08:03 a. m.» justo debajo de «08:00 - 16:00»: dos relojes
 * distintos en la misma tarjeta, que es lo que hace dudar de si llegó tarde o no.
 *
 * Devuelve cadena vacía cuando no hay momento. Un momento que falta no se dibuja como `—` acá:
 * quien llama decide qué dice cuando no hay dato, porque «no se sabe» y «no pasó» son cosas
 * distintas y esta función no puede saber cuál es.
 */
export function horaDelMomento(momento, locale) {
  if (!momento) return '';
  const fecha = new Date(momento);
  if (Number.isNaN(fecha.getTime())) return '';
  const opciones = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (zonaAnotada) opciones.timeZone = zonaAnotada;
  return fecha.toLocaleTimeString(locale, opciones);
}

/**
 * La fecha y la hora de un momento guardado (`2026-11-24T20:52:36Z` → `24/11/2026, 17:52:36`), en
 * la zona horaria de la Prestadora y con el orden de la fecha que pide el idioma.
 *
 * RELOJ DE 24 HORAS SIEMPRE, por la misma razón que `horaDelMomento`. Y además porque, sin decirlo,
 * el castellano de Argentina escribe la hora con reloj de 12 y sin «a. m.» ni «p. m.»: las 17:52
 * salen como «05:52», que se lee como de madrugada.
 *
 * Devuelve cadena vacía cuando no hay momento: quien llama decide qué dice cuando no hay dato.
 */
export function fechaYHoraDelMomento(momento, locale) {
  if (!momento) return '';
  const fecha = new Date(momento);
  if (Number.isNaN(fecha.getTime())) return '';
  const opciones = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  };
  if (zonaAnotada) opciones.timeZone = zonaAnotada;
  return fecha.toLocaleString(locale, opciones);
}

/**
 * Corre una hora de reloj una cantidad de minutos, dando la vuelta al día si hace falta.
 * `correrHora('23:30', 60)` → `'00:30'`. La usa la acción de "correr el horario" de a muchas.
 */
export function correrHora(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = (((h * 60 + m + minutos) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
