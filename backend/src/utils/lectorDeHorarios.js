import Anthropic from '@anthropic-ai/sdk';
import { registrarUsoIA } from './registrarUsoIA.js';
import { jsonDeRespuestaIA } from './respuestaIA.js';
import { MODELO_IA } from '../config/modeloIA.js';

// El lector de horarios de la importación
// ============================================================================
//
// Lee los días y el horario de un turno de guardia semanal tal como una Prestadora los escribió en
// su planilla: «L a V 8 a 16 hs», «lun-vie 08:00-16:00», «sáb y dom 20 a 8», «24x7». Vale para
// castellano, inglés y portugués.
//
// Primero lee un analizador fijo, sin IA, que entiende las formas comunes. Lo que ese analizador
// no entiende va a la IA, y lo que la IA devuelve se vuelve a comprobar acá: horas válidas y días
// del conjunto válido.
//
// **Nunca inventa.** «Mañanas», «a convenir» o un casillero vacío no dicen una hora: el resultado
// queda dudoso, con nulos en lo que no está escrito, y la importación le pide el dato a la
// Prestadora. Lo que sí está escrito con certeza se conserva: «lunes a viernes, mañanas» devuelve
// los cinco días, sin hora, y dudoso.
//
// Los días son los mismos que guarda la base en los turnos de guardia y en el cronograma de
// guardias: sin tilde y en minúscula.

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const TODOS = [...DIAS];
const HABILES = DIAS.slice(0, 5);
const FIN_DE_SEMANA = ['sabado', 'domingo'];

/** Cada forma escrita de un día, ya sin tildes y en minúscula, con el día que nombra. */
const NOMBRES_DE_DIAS = {
  lunes: ['lunes', 'lun', 'lu', 'l', 'monday', 'mon', 'mo', 'segunda', 'seg'],
  martes: ['martes', 'mar', 'ma', 'tuesday', 'tue', 'tues', 'tu', 'terca', 'ter'],
  miercoles: ['miercoles', 'mier', 'mie', 'mi', 'x', 'wednesday', 'wed', 'we', 'quarta', 'qua'],
  jueves: ['jueves', 'jue', 'ju', 'j', 'thursday', 'thu', 'thur', 'thurs', 'th', 'quinta', 'qui'],
  viernes: ['viernes', 'vie', 'vi', 'v', 'friday', 'fri', 'fr', 'sexta', 'sex'],
  sabado: ['sabado', 'sab', 'sa', 's', 'saturday', 'sat'],
  domingo: ['domingo', 'dom', 'd', 'sunday', 'sun', 'su'],
};
const DIA_DE_LA_PALABRA = new Map(
  Object.entries(NOMBRES_DE_DIAS).flatMap(([dia, formas]) => formas.map((f) => [f, dia])),
);

/** Frases que nombran un grupo de días. Se reemplazan antes de leer día por día. */
const GRUPOS_DE_DIAS = [
  [/\b(todos los dias|todos os dias|todo el ano|every ?day|daily|diario|diariamente|de lunes a lunes|7 dias)\b/g, '§todos'],
  [/\b(fines? de semana|fins? de semana|fim de semana|fds|week ?ends?)\b/g, '§finde'],
  [/\b(dias? (de semana|habiles|laborables|uteis)|weekdays?)\b/g, '§habiles'],
];
const DIAS_DEL_GRUPO = { '§todos': TODOS, '§finde': FIN_DE_SEMANA, '§habiles': HABILES };

/** Lo que dice que el horario no está fijado. Con cualquiera de estas, el resultado es dudoso. */
const VAGOS = /\b(a convenir|a definir|a combinar|a confirmar|a coordinar|segun necesidad|rotativos?|variables?|flexibles?|por la (manana|tarde|noche)|mananas?|tardes?|noches?|madrugadas?|mornings?|afternoons?|evenings?|nights?|to be agreed|tbd|tba|manhas?|noites?|sin dato|s\/d)\b/g;

/** Palabras que no cambian nada: se saltean al leer los días. */
const RELLENO = new Set([
  'de', 'del', 'desde', 'los', 'las', 'la', 'el', 'en', 'dias', 'dia', 'horario', 'horarios', 'turno',
  'hs', 'h', 'hrs', 'from', 'the', 'on', 'days', 'day', 'da', 'das', 'dos', 'os', 'feira', 'semana',
  'cada', 'por', 'of', 'semanal',
]);
const SEPARADOR_DE_LISTA = new Set([',', '/', ';', '&', '+', 'y', 'e', 'and']);
const SEPARADOR_DE_RANGO = new Set(['a', 'al', '-', 'hasta', 'to', 'through', 'thru', 'till', 'until', 'ate']);

// Una hora escrita: «8», «08:00», «8.30», «8hs», «8 h 30», «8am», «4 p.m.».
const HORA = String.raw`(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(?:hs|hrs|horas|hora|h)?\.?\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?`;
const RANGO_DE_HORAS = new RegExp(
  String.raw`(?:\b(?:de|desde|das|from|entre)\s+)?(?:las\s+)?\b${HORA}\s*(?:-|–|—|\ba\b|\bal\b|\bhasta\b|\bto\b|\bate\b|\bas\b|\by\b(?=\s*(?:las\s+)?\d))\s*(?:las\s+)?${HORA}`,
  'g',
);
const SIEMPRE = /\b(24\s*[x\/*]\s*7|7\s*[x\/*]\s*24)\b/g;
const VEINTICUATRO_HORAS = /\b(?:las\s+)?24\s*(?:hs|hrs|horas|hora|h)\b\.?/g;

/** El resultado de un horario que no se pudo leer con certeza. */
export function horarioDudoso(parcial = {}) {
  return {
    dias: parcial.dias ?? null,
    horaInicio: parcial.horaInicio ?? null,
    horaFin: parcial.horaFin ?? null,
    diasHastaElFin: parcial.horaInicio && parcial.horaFin ? (parcial.diasHastaElFin ?? 0) : 0,
    dudoso: true,
  };
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const dosCifras = (n) => String(n).padStart(2, '0');

/** «8», «30», «pm» → minutos desde la medianoche, o null si no es una hora del día. */
function minutosDe(horaTexto, minutosTexto, sufijo) {
  let hora = Number(horaTexto);
  const minutos = minutosTexto === undefined ? 0 : Number(minutosTexto);
  if (!Number.isInteger(hora) || !Number.isInteger(minutos) || minutos > 59) return null;
  if (sufijo) {
    if (hora < 1 || hora > 12) return null;
    const tarde = sufijo.startsWith('p');
    if (hora === 12) hora = tarde ? 12 : 0;
    else if (tarde) hora += 12;
  }
  if (hora === 24 && minutos === 0) return 24 * 60;
  if (hora > 23) return null;
  return hora * 60 + minutos;
}

const textoDeMinutos = (m) => `${dosCifras(Math.floor((m % 1440) / 60))}:${dosCifras(m % 60)}`;

/** Inicio y fin en minutos → las horas guardables y si el turno termina al día siguiente. */
function horarioDe(inicio, fin) {
  if (inicio === 24 * 60) return null;
  const finReal = fin % 1440;
  return {
    horaInicio: textoDeMinutos(inicio),
    horaFin: textoDeMinutos(finReal),
    diasHastaElFin: fin === 24 * 60 || finReal <= inicio ? 1 : 0,
  };
}

/** Lee los días de lo que quedó del texto. Devuelve null si aparece algo que no es un día. */
function leerDias(texto) {
  const dias = new Set();
  const fichas = texto
    .replace(/-?\bfeira\b/g, ' ')
    .replace(/([,;/&+\-–—])/g, ' $1 ')
    .replace(/[–—]/g, '-')
    .replace(/\./g, ' ')
    .split(' ')
    .filter(Boolean);

  let anterior = null;
  let enRango = false;
  for (const ficha of fichas) {
    if (RELLENO.has(ficha)) continue;
    if (DIAS_DEL_GRUPO[ficha]) {
      if (enRango) return null;
      DIAS_DEL_GRUPO[ficha].forEach((d) => dias.add(d));
      anterior = null;
      continue;
    }
    if (SEPARADOR_DE_LISTA.has(ficha)) {
      if (enRango) return null;
      anterior = null;
      continue;
    }
    if (SEPARADOR_DE_RANGO.has(ficha)) {
      if (!anterior || enRango) return null;
      enRango = true;
      continue;
    }
    const dia = DIA_DE_LA_PALABRA.get(ficha);
    if (!dia) return null;
    if (enRango) {
      let i = DIAS.indexOf(anterior);
      const hasta = DIAS.indexOf(dia);
      while (i !== hasta) {
        i = (i + 1) % 7;
        dias.add(DIAS[i]);
      }
      enRango = false;
      anterior = null;
    } else {
      dias.add(dia);
      anterior = dia;
    }
  }
  if (enRango) return null;
  return DIAS.filter((d) => dias.has(d));
}

/**
 * El analizador fijo, sin IA. Devuelve el resultado, o null cuando hay algo escrito que no
 * entiende: ése es el caso que va a la IA.
 */
function analizar(texto) {
  let resto = normalizar(texto);
  if (!/[a-z0-9]/.test(resto)) return horarioDudoso();

  let vago = false;
  resto = resto.replace(VAGOS, () => {
    vago = true;
    return ' ';
  });

  let horario = null;
  let todosLosDias = false;
  let horariosEncontrados = 0;

  resto = resto.replace(SIEMPRE, () => {
    todosLosDias = true;
    horariosEncontrados += 1;
    horario = { horaInicio: '00:00', horaFin: '00:00', diasHastaElFin: 1 };
    return ' ';
  });

  let horaInvalida = false;
  resto = resto.replace(RANGO_DE_HORAS, (_, h1, m1, s1, h2, m2, s2) => {
    horariosEncontrados += 1;
    const inicio = minutosDe(h1, m1, s1?.replace(/[\s.]/g, ''));
    const fin = minutosDe(h2, m2, s2?.replace(/[\s.]/g, ''));
    const leido = inicio === null || fin === null ? null : horarioDe(inicio, fin);
    if (!leido) horaInvalida = true;
    else horario = leido;
    return ' ';
  });

  resto = resto.replace(VEINTICUATRO_HORAS, () => {
    horariosEncontrados += 1;
    horario = { horaInicio: '00:00', horaFin: '00:00', diasHastaElFin: 1 };
    return ' ';
  });

  // Los grupos de días van antes de buscar cifras sueltas, porque «7 días» trae una.
  resto = ` ${resto} `;
  for (const [patron, marca] of GRUPOS_DE_DIAS) resto = resto.replace(patron, ` ${marca} `);

  // Quedaron cifras sueltas: una hora sola, una fecha, algo que el analizador no sabe leer.
  if (/\d/.test(resto)) return null;
  if (horaInvalida) return null;

  const diasLeidos = leerDias(resto);
  if (diasLeidos === null) return null;
  const dias = todosLosDias ? TODOS : diasLeidos;

  // Dos horarios distintos en el mismo renglón no caben en un solo turno de guardia semanal.
  if (horariosEncontrados > 1) return horarioDudoso({ dias: dias.length ? dias : null });

  const resultado = {
    dias: dias.length ? dias : null,
    horaInicio: horario?.horaInicio ?? null,
    horaFin: horario?.horaFin ?? null,
    diasHastaElFin: horario?.diasHastaElFin ?? 0,
  };
  if (vago || !resultado.dias || !horario) return horarioDudoso(resultado);
  return { ...resultado, dudoso: false };
}

/**
 * Lee días y horario sin IA, de un solo texto o de dos casilleros separados. Devuelve el
 * resultado, o null si hay algo escrito que el analizador no entiende: en ese caso el texto
 * (los dos casilleros unidos con un espacio) se le pasa a `lectorDeHorarios`.
 */
export function leerHorarioSinIA(textoDias, textoHorario) {
  const texto = [textoDias, textoHorario].filter((t) => t !== undefined && t !== null).join(' ');
  return analizar(texto);
}

const SYSTEM_PROMPT_HORARIOS = `Este asistente lee los días de la semana y el horario de un turno
de guardia semanal fijo, tal como una Prestadora de cuidado domiciliario los escribió a mano en una
planilla, en castellano, inglés o portugués, y que no se reconocieron como estaban escritos.

Por cada pedido se devuelven:
- "dias": la lista de los días que el texto nombra, con estos valores exactos y ningún otro:
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo". Si el texto no dice
  qué días son, o puede querer decir más de una cosa, queda null.
- "horaInicio" y "horaFin": la hora de entrada y la de salida en formato HH:MM de 24 horas. Si el
  turno dura las 24 horas, las dos son "00:00". Si el texto no dice una hora exacta de entrada y
  otra de salida («mañanas», «a convenir», «turno noche», una sola hora, dos horarios distintos),
  las dos quedan null.

Se devuelve sólo lo que está escrito. Nunca se completa con un valor probable ni se deduce una
hora de una palabra como «mañana» o «noche»: un dato inventado programa guardias que nadie pidió.
Lo que queda en null se le pregunta a la Prestadora.

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"resultados": [{"clave": "la misma del pedido", "dias": null, "horaInicio": null, "horaFin": null}]}`;

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lo que devolvió la IA para un pedido, comprobado. Lo que no pasa la comprobación queda nulo. */
function validarRespuesta(propuesta) {
  let dias = null;
  if (Array.isArray(propuesta?.dias) && propuesta.dias.length > 0) {
    const todosValidos = propuesta.dias.every((d) => DIAS.includes(d));
    if (todosValidos) dias = DIAS.filter((d) => propuesta.dias.includes(d));
  }
  let horario = null;
  const { horaInicio, horaFin } = propuesta ?? {};
  if (HORA_VALIDA.test(horaInicio ?? '') && HORA_VALIDA.test(horaFin ?? '')) {
    const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    horario = { horaInicio, horaFin, diasHastaElFin: minutos(horaFin) <= minutos(horaInicio) ? 1 : 0 };
  }
  const resultado = { dias, ...(horario ?? { horaInicio: null, horaFin: null, diasHastaElFin: 0 }) };
  if (!dias || !horario) return horarioDudoso(resultado);
  return { ...resultado, dudoso: false };
}

/**
 * Devuelve una función que recibe los textos de horario de una planilla y devuelve un Map
 * texto → { dias, horaInicio, horaFin, diasHastaElFin, dudoso }. La IA se llama una sola vez
 * por tanda, y sólo con los textos que el analizador fijo no entendió. Sin clave de la IA, o si
 * la IA falla, esos textos quedan dudosos: se le pide el dato a la Prestadora.
 *
 * `dependencias` existe para las pruebas: el cliente de la IA y el medidor de consumo.
 */
export function lectorDeHorarios({ prestadoraId }, dependencias = {}) {
  const anthropic = 'cliente' in dependencias ? dependencias.cliente : obtenerCliente();
  const registrarUso = dependencias.registrarUso ?? registrarUsoIA;

  return async (textos) => {
    const resultados = new Map();
    const pendientes = [];
    for (const texto of new Set(textos ?? [])) {
      const leido = analizar(texto);
      if (leido) resultados.set(texto, leido);
      else pendientes.push(texto);
    }
    if (pendientes.length === 0) return resultados;

    let propuestas = [];
    if (anthropic) {
      try {
        const pedidos = pendientes.map((texto, i) => ({ clave: String(i), texto: String(texto) }));
        const respuesta = await anthropic.messages.create({
          model: MODELO_IA,
          max_tokens: Math.min(8000, 200 + pedidos.length * 60),
          system: SYSTEM_PROMPT_HORARIOS,
          messages: [{ role: 'user', content: JSON.stringify({ pedidos }) }],
        });
        registrarUso({ prestadoraId, modulo: 'importacion_horarios', modelo: MODELO_IA, respuestaAnthropic: respuesta });
        const parseado = jsonDeRespuestaIA(respuesta);
        propuestas = Array.isArray(parseado?.resultados) ? parseado.resultados : [];
      } catch (err) {
        // Sólo el motivo: el texto de la planilla puede traer datos de una persona.
        console.error('lectorDeHorarios: la IA no respondió:', err?.message);
        propuestas = [];
      }
    }

    const porClave = new Map(propuestas.map((p) => [String(p?.clave), p]));
    pendientes.forEach((texto, i) => {
      const propuesta = porClave.get(String(i));
      resultados.set(texto, propuesta ? validarRespuesta(propuesta) : horarioDudoso());
    });
    return resultados;
  };
}

let cliente = null;
function obtenerCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
}
