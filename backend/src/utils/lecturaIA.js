/*
 * Las dos lecturas con IA de la importación.
 *
 * La de la estructura: un texto que no tiene forma de tabla conocida se lee entero, por partes,
 * y no sólo su comienzo. Cada parte devuelve sus renglones y cuántos contó, para que la
 * importación compare lo contado con lo leído.
 *
 * La de un documento: un PDF, una foto, un Word o un texto suelto se le entrega a la IA tal como
 * es —el PDF y la imagen van directo, sin pasar por texto— y la IA anota lo que encontró de
 * medicación o de valores normales de signos vitales, con la página y el fragmento de donde lo
 * sacó. Lo encontrado nunca se carga solo: la Prestadora lo confirma o lo descarta.
 *
 * Sin clave de la IA, las dos devuelven la advertencia `ia_no_configurada` y no inventan nada.
 */

import { MODELO_IA } from '../config/modeloIA.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { registrarUsoIA } from './registrarUsoIA.js';
import { TRATO_IA } from './tratoIA.js';
import { jsonDeRespuestaIA } from './respuestaIA.js';
import { obtenerCliente } from './importacionIA.js';

/** Cuánto texto lee la IA en cada parte. */
export const TAMANO_DE_CADA_PARTE = 12000;

/** El texto cortado en partes de a lo sumo `tamano` caracteres, sin partir un renglón. */
export function partesDelTexto(texto, tamano = TAMANO_DE_CADA_PARTE) {
  const partes = [];
  let actual = '';
  for (const renglon of texto.split(/(?<=\n)/)) {
    if (actual && actual.length + renglon.length > tamano) {
      partes.push(actual);
      actual = '';
    }
    if (renglon.length > tamano) {
      for (let i = 0; i < renglon.length; i += tamano) partes.push(renglon.slice(i, i + tamano));
      continue;
    }
    actual += renglon;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

// ─── La estructura de un texto ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_ESTRUCTURA = `Este asistente lee un archivo que una Prestadora de cuidado
domiciliario subió a ${IDENTIDAD.nombre} para importar sus datos, y que no tiene una forma de tabla
conocida: un listado con un formato propio, un texto exportado de otro sistema, registros con
etiquetas. El archivo llega por partes y cada parte se lee entera.

En la primera parte se decide si el archivo es una tabla de registros ("esTabla"): una serie de
renglones que tienen los mismos datos. Una carta, un informe o una historia clínica escrita de
corrido no es una tabla. Si es una tabla, se nombran sus columnas ("columnas") con el nombre que el
mismo archivo les da, o con uno descriptivo si no lo tiene.

En cada parte se devuelven todos los registros de esa parte ("filas"), cada uno con un valor por
columna, copiado tal como está escrito. Nunca se completa un valor que no está, nunca se corrige
uno y nunca se saltea un registro. Un registro que empieza en esta parte y sigue en la próxima se
devuelve en "incompleto" con lo que se leyó, y se completa en la próxima parte. "contados" es
cuántos registros tiene esta parte, contando también los que no se pudieron leer bien.

${TRATO_IA}

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"esTabla": true, "columnas": ["..."], "filas": [{"columna": "valor"}], "contados": 0, "incompleto": null}`;

async function pedirParte(anthropic, { prestadoraId, parte, numero, total, columnas, incompleto }) {
  const mensaje = numero === 1
    ? `Parte 1 de ${total}:\n${parte}`
    : `Parte ${numero} de ${total}. Columnas: ${JSON.stringify(columnas)}. Registro que venía de la parte anterior: ${JSON.stringify(incompleto)}\n${parte}`;
  const respuesta = await anthropic.messages.create({
    model: MODELO_IA,
    max_tokens: 16000,
    system: SYSTEM_PROMPT_ESTRUCTURA,
    messages: [{ role: 'user', content: mensaje }],
  });
  registrarUsoIA({ prestadoraId, modulo: 'importacion_estructura', modelo: MODELO_IA, respuestaAnthropic: respuesta });
  return jsonDeRespuestaIA(respuesta);
}

/**
 * Lee con IA un texto sin forma de tabla conocida, entero y por partes.
 * Devuelve `{ esTabla, hojas, advertencias }`; si no es tabla, `hojas` queda vacío y el archivo
 * sigue como documento.
 */
export async function leerEstructuraIA({ texto, prestadoraId }) {
  const anthropic = obtenerCliente();
  if (!anthropic) return { esTabla: false, hojas: [], advertencias: ['ia_no_configurada'] };

  const partes = partesDelTexto(texto);
  let columnas = [];
  let incompleto = null;
  let contados = 0;
  const filas = [];
  for (let i = 0; i < partes.length; i += 1) {
    const leido = await pedirParte(anthropic, {
      prestadoraId, parte: partes[i], numero: i + 1, total: partes.length, columnas, incompleto,
    });
    if (!leido) {
      // Una parte que la IA no devolvió legible no se puede dar por leída: el archivo sigue entero
      // como documento, y no se pierde nada.
      return { esTabla: false, hojas: [], advertencias: ['ia_sin_mapeo'] };
    }
    if (i === 0) {
      if (!leido.esTabla || !Array.isArray(leido.columnas) || !leido.columnas.length) {
        return { esTabla: false, hojas: [], advertencias: [] };
      }
      columnas = leido.columnas.map(String);
    }
    for (const fila of Array.isArray(leido.filas) ? leido.filas : []) {
      if (fila && typeof fila === 'object') filas.push(Object.fromEntries(columnas.map((c) => [c, fila[c] ?? ''])));
    }
    contados += Number.isInteger(leido.contados) && leido.contados >= 0 ? leido.contados : 0;
    incompleto = leido.incompleto && typeof leido.incompleto === 'object' ? leido.incompleto : null;
  }
  if (incompleto) {
    filas.push(Object.fromEntries(columnas.map((c) => [c, incompleto[c] ?? ''])));
  }
  return {
    esTabla: true,
    hojas: [{ indice: 0, nombre: 'datos', headers: columnas, filas, renglonesContados: contados }],
    advertencias: ['estructura_leida_por_ia'],
  };
}

// ─── Lo que se encuentra en un documento ────────────────────────────────────────────────────

/** Los signos vitales que la base acepta como valores normales de un Paciente. */
export const SIGNOS_VITALES = ['presion_sistolica', 'presion_diastolica', 'temperatura', 'saturacion', 'glucemia'];

const SYSTEM_PROMPT_DOCUMENTO = `Este asistente lee un documento de la historia anterior de un
Paciente que una Prestadora de cuidado domiciliario subió a ${IDENTIDAD.nombre}: una receta, un
resumen de alta, una indicación médica, un informe, una planilla escaneada. El documento se guarda
entero de todos modos; la tarea es anotar lo que dice de dos cosas, para que la Prestadora lo
confirme o lo descarte.

Medicación que el Paciente toma ("tipo": "medicacion"): "medicamento", "dosis", "frecuencia",
"via", "fechaDesde" y "fechaHasta" (AAAA-MM-DD) y "nota".

Valores normales de un signo vital de ese Paciente ("tipo": "rango_vital"): "signo", que es uno de
presion_sistolica, presion_diastolica, temperatura, saturacion o glucemia, con "valorMin",
"valorMax" y "unidad".

Se anota sólo lo que el documento dice. Un dato que no está queda vacío; nunca se completa con el
valor probable, nunca se corrige y nunca se deduce de otra cosa. En "donde" va la página (1 si el
documento no tiene páginas) y el fragmento del documento, copiado tal cual, del que sale lo anotado.
Si el documento no dice nada de esas dos cosas, la lista queda vacía.

${TRATO_IA}

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"hallazgos": [{"tipo": "medicacion", "valores": {"medicamento": "", "dosis": ""}, "donde": {"pagina": 1, "fragmento": ""}}]}`;

const CAMPOS_DEL_HALLAZGO = {
  medicacion: ['medicamento', 'dosis', 'frecuencia', 'via', 'fechaDesde', 'fechaHasta', 'nota'],
  rango_vital: ['signo', 'valorMin', 'valorMax', 'unidad'],
};

function texto(valor) {
  return valor == null ? '' : String(valor).trim();
}

/** Lo que devolvió la IA, reducido a la forma que se guarda. Lo que no tiene esa forma se deja. */
export function hallazgosValidos(lista) {
  if (!Array.isArray(lista)) return [];
  const validos = [];
  for (const h of lista) {
    const campos = CAMPOS_DEL_HALLAZGO[h?.tipo];
    if (!campos || !h.valores || typeof h.valores !== 'object') continue;
    const valores = Object.fromEntries(campos.map((c) => [c, texto(h.valores[c])]));
    if (h.tipo === 'medicacion' && !valores.medicamento) continue;
    if (h.tipo === 'rango_vital' && !SIGNOS_VITALES.includes(valores.signo)) continue;
    const pagina = Number.parseInt(h.donde?.pagina, 10);
    validos.push({
      tipo: h.tipo,
      valores,
      donde: { pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1, fragmento: texto(h.donde?.fragmento) },
    });
  }
  return validos;
}

async function pedirHallazgos(anthropic, prestadoraId, contenido) {
  const respuesta = await anthropic.messages.create({
    model: MODELO_IA,
    max_tokens: 8000,
    system: SYSTEM_PROMPT_DOCUMENTO,
    messages: [{ role: 'user', content: contenido }],
  });
  registrarUsoIA({ prestadoraId, modulo: 'importacion_documento', modelo: MODELO_IA, respuestaAnthropic: respuesta });
  const parseado = jsonDeRespuestaIA(respuesta);
  return parseado ? hallazgosValidos(parseado.hallazgos) : null;
}

/**
 * Lee un documento con IA y devuelve `{ hallazgos, advertencias }`.
 *
 * @param {object} documento lo que devolvió `leerArchivo`: `clase`, `tipoMedio` y `texto`.
 * @param {Buffer} buffer el archivo tal como se subió.
 */
export async function leerDocumentoIA({ documento, buffer, prestadoraId }) {
  const anthropic = obtenerCliente();
  if (!anthropic) return { hallazgos: [], advertencias: ['ia_no_configurada'] };

  if (documento.clase === 'pdf' || (documento.clase === 'imagen' && documento.tipoMedio)) {
    const bloque = documento.clase === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: documento.tipoMedio, data: buffer.toString('base64') } };
    const hallazgos = await pedirHallazgos(anthropic, prestadoraId, [bloque, { type: 'text', text: 'Documento adjunto.' }]);
    return hallazgos ? { hallazgos, advertencias: [] } : { hallazgos: [], advertencias: ['ia_sin_mapeo'] };
  }

  const contenido = texto(documento.texto);
  if (!contenido) return { hallazgos: [], advertencias: ['documento_sin_lectura'] };
  const hallazgos = [];
  const partes = partesDelTexto(contenido);
  for (let i = 0; i < partes.length; i += 1) {
    const deLaParte = await pedirHallazgos(anthropic, prestadoraId, `Parte ${i + 1} de ${partes.length}:\n${partes[i]}`);
    if (!deLaParte) return { hallazgos, advertencias: ['ia_sin_mapeo'] };
    hallazgos.push(...deLaParte);
  }
  return { hallazgos, advertencias: [] };
}
