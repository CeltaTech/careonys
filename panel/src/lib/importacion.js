/* La importación, sin la pantalla.
   ==========================================================================

   Lo que la pantalla de importación, la guía de primeros pasos y la lista de importaciones
   comparten: qué clases se pueden importar, cómo se arma el envío de confirmación y cómo se
   nombra el renglón que no se cargó. Vive acá para que ninguna de las tres tenga su propia copia.

   Un archivo puede traer varias hojas, y cada hoja tiene su propia asignación de columnas. Una
   columna sin asignar no se pierde: se guarda en la ficha de la persona, y la pantalla lo dice así. */

import { llamadorDe } from './apiPanel';

export const llamarApiImportacion = llamadorDe('/importacion');

/** Lo que se puede importar, en el orden en que se ofrece. */
export const TIPOS_DE_IMPORTACION = ['asistente', 'cliente', 'servicio', 'medicacion', 'rangos_vitales', 'historia', 'documento'];

/** Las clases que pasan por la revisión antes de quedar operables. */
export const TIPOS_CON_REVISION = new Set(['asistente', 'cliente', 'servicio']);

/** Las hojas que trae el análisis. Una respuesta sin hojas —un documento— devuelve una lista vacía. */
export function hojasDelAnalisis(analisis) {
  return Array.isArray(analisis?.hojas) ? analisis.hojas : [];
}

/** La asignación de columnas propuesta para cada hoja, por su índice. */
export function asignacionesPropuestas(analisis) {
  return Object.fromEntries(hojasDelAnalisis(analisis).map((hoja) => [hoja.indice, { ...(hoja.mapeoPropuesto ?? {}) }]));
}

/** La clase propuesta de cada hoja, por su índice. Sólo la Historia anterior la usa. */
export function clasesPropuestas(analisis) {
  const clases = analisis?.clasesDeHoja ?? [];
  return Object.fromEntries(
    hojasDelAnalisis(analisis).map((hoja) => [
      hoja.indice,
      clases.includes(hoja.clasePropuesta) ? hoja.clasePropuesta : (clases.includes('otro') ? 'otro' : clases[0] ?? null),
    ]),
  );
}

/** Cuántos renglones trae el archivo entre todas sus hojas. */
export function renglonesDelAnalisis(analisis) {
  return hojasDelAnalisis(analisis).reduce(
    (total, hoja) => total + (Number(hoja.renglonesContados) || hoja.filas?.length || 0),
    0,
  );
}

/**
 * La frase de una advertencia. El backend manda dos cosas: un código —`ia_sin_mapeo`— que se
 * traduce acá, o un texto breve que escribió la IA al leer el archivo, que se muestra tal cual.
 * Un código sin frase propia cae a la frase general, nunca a un guion.
 */
export function fraseDeAdvertencia(advertencia, t) {
  const texto = String(advertencia ?? '').trim();
  const frases = t?.importacion?.advertencias ?? {};
  if (!/^[a-z_]+$/.test(texto)) return texto;
  return Object.hasOwn(frases, texto) ? frases[texto] : frases.otra;
}

/** Las advertencias de todas las hojas, cada una con el nombre de su hoja. */
export function advertenciasDelAnalisis(analisis) {
  return hojasDelAnalisis(analisis).flatMap((hoja) =>
    (hoja.advertencias ?? []).map((texto) => ({ hoja: hoja.nombre, texto })),
  );
}

/**
 * El envío de confirmación, en varias partes: el archivo o el texto vuelven a viajar, porque el
 * backend guarda el original con el lote.
 */
export function formularioDeConfirmacion({ tipo, origen, analisis, asignaciones, clases, pacienteId }) {
  const cuerpo = new FormData();
  cuerpo.append('tipo', tipo);
  if (origen?.archivo) cuerpo.append('archivo', origen.archivo);
  else cuerpo.append('texto', origen?.texto ?? '');
  if (analisis?.esDocumento) {
    cuerpo.append('pacienteId', pacienteId ?? '');
    cuerpo.append('hojas', JSON.stringify([]));
    return cuerpo;
  }
  const hojas = hojasDelAnalisis(analisis).map((hoja) => ({
    indice: hoja.indice,
    mapeo: asignaciones?.[hoja.indice] ?? {},
    clase: clases?.[hoja.indice] ?? null,
  }));
  cuerpo.append('hojas', JSON.stringify(hojas));
  return cuerpo;
}

/** El envío de análisis: el archivo, o el texto pegado. */
export function formularioDeAnalisis({ tipo, origen }) {
  const cuerpo = new FormData();
  cuerpo.append('tipo', tipo);
  if (origen?.archivo) cuerpo.append('archivo', origen.archivo);
  else cuerpo.append('texto', origen?.texto ?? '');
  return cuerpo;
}

/** Si hay algo para mandar: un archivo elegido o un texto que no esté en blanco. */
export function hayOrigen(origen) {
  return Boolean(origen?.archivo) || Boolean(origen?.texto?.trim());
}

// Qué dice una fila en el campo que se le pide, con la asignación ya revisada. Es la misma lectura
// que hace el backend, para nombrar a la persona del renglón que no se cargó.
function valorDeLaFila(fila, mapeo, campo) {
  const columna = Object.keys(mapeo ?? {}).find((col) => mapeo[col] === campo);
  const valor = columna ? fila?.[columna] : undefined;
  return valor === '' || valor == null ? '' : String(valor).trim();
}

/** El nombre de la persona de un renglón, si la asignación lo dice. */
export function nombreDeLaFila(fila, mapeo, tipo) {
  if (tipo === 'asistente') return valorDeLaFila(fila, mapeo, 'nombre');
  const contacto = [valorDeLaFila(fila, mapeo, 'nombreContacto'), valorDeLaFila(fila, mapeo, 'apellidoContacto')]
    .filter(Boolean)
    .join(' ');
  return contacto || valorDeLaFila(fila, mapeo, 'nombrePaciente') || valorDeLaFila(fila, mapeo, 'nombreAsistente');
}

/**
 * El renglón al que se refiere un error de la confirmación. El error trae el número de renglón y,
 * cuando el archivo tiene varias hojas, el índice de la hoja; sin índice es la primera.
 */
export function renglonDelError(error, analisis, asignaciones) {
  const hojas = hojasDelAnalisis(analisis);
  const hoja = hojas.find((una) => una.indice === error.hoja) ?? hojas[0];
  if (!hoja) return { hoja: null, fila: null, mapeo: {} };
  return { hoja, fila: hoja.filas?.[error.fila - 1] ?? null, mapeo: asignaciones?.[hoja.indice] ?? {} };
}

/** Las clases de pedido que no se contestan con un valor escrito sino con una acción propia. */
export const PEDIDOS_CON_RESPUESTA_PROPIA = new Set(['persona', 'hallazgo', 'receta', 'firma_medicacion', 'renglones']);

/**
 * Lo que encontró la IA en un documento y espera confirmación: los valores, sin la clase ni el
 * lugar donde se encontró, que se muestran aparte.
 */
export function valoresDelHallazgo(hallazgo) {
  if (!hallazgo || typeof hallazgo !== 'object') return {};
  if (hallazgo.valores && typeof hallazgo.valores === 'object') return { ...hallazgo.valores };
  return Object.fromEntries(Object.entries(hallazgo).filter(([clave]) => clave !== 'tipo' && clave !== 'donde'));
}
