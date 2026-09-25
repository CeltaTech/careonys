/* Los mensajes del sistema: el texto vive en la base, no en este archivo.
   =======================================================================

   POR QUÉ EXISTE. Hasta acá, cada mensaje que sale del backend era una función con las frases
   escritas adentro, en los tres idiomas. Cambiar una coma era cambiar el archivo y publicar una
   versión nueva. La decisión tomada es que los mensajes del sistema vivan todos juntos en una
   tabla, editable desde afuera por API, y eso es lo que resuelve este archivo.

   QUÉ ES CADA COSA. Este archivo guarda las frases y las entrega; `avisos.js` sigue decidiendo
   cuál va, en qué orden y con qué números. La redacción es dato; el armado es código, porque en
   castellano el plazo se dice «hace 20 minutos» y en inglés «20 minutes ago», y eso no lo resuelve
   ningún marcador.

   LOS DOS PISOS son los mismos que los de las listas de opciones: lo que trae el producto —en los
   tres idiomas— y lo que escribe cada Prestadora para su gente, en el idioma en que lo escribió.
   Cuando una Prestadora no escribió nada, o escribió en otro idioma, sale el texto del producto.

   LOS MARCADORES son `{{nombre}}`, los mismos que ya usan las traducciones de las pantallas. Quien
   arma el mensaje pasa los valores; acá se reemplazan y nada más.

   FALLO CERRADO Y SIN HUECO. Una frase que falta —porque la tabla no se cargó, porque nadie la
   sembró, porque falta un idioma— no devuelve nada: avisa una vez por consola y deja una marca a
   la vista, exactamente como hace `src/i18n/faltaLaFrase.js` del lado de las pantallas. Un
   mensaje con un hueco mudo sale igual y nadie se entera; uno con la marca se ve. */

import { IDIOMA_POR_DEFECTO, IDIOMAS_SOPORTADOS, normalizarIdioma } from './idiomas.js';

/* Lo cargado. Una clave, sus tres idiomas del producto, y lo que haya escrito cada Prestadora.
   Es un objeto plano y no una consulta por mensaje: un mensaje se arma mientras se está mandando
   un correo, y ahí no hay lugar para esperar a la base. */
const MENSAJES = new Map();

/** Cuándo se cargó lo que hay. Nulo mientras nadie haya cargado nada. */
let cargadoEl = null;

/** Lo que se ve en el lugar de la frase que falta. */
function marcaDeFaltante(clave, idioma) {
  return process.env.NODE_ENV === 'production' ? '—' : `[falta: ${clave} en ${idioma}]`;
}

const yaAvisado = new Set();

function avisar(clave, idioma) {
  const ruta = `${clave} en ${idioma}`;
  if (yaAvisado.has(ruta)) return;
  yaAvisado.add(ruta);
  console.warn(`Falta el mensaje del sistema: ${ruta}`);
}

/**
 * Carga las filas leídas de `mensajes_del_sistema`. Reemplaza lo que hubiera: el catálogo entero
 * se rehace de una vez, para que una edición hecha afuera no conviva con la versión anterior.
 *
 * @param {Array<{clave: string, i18n: object, prestadora_id?: string|null, activo?: boolean}>} filas
 */
export function sembrarMensajesDelSistema(filas) {
  MENSAJES.clear();
  yaAvisado.clear();
  for (const fila of filas ?? []) {
    if (fila?.activo === false) continue;
    const clave = fila?.clave;
    if (!clave || !fila?.i18n || typeof fila.i18n !== 'object') continue;

    let entrada = MENSAJES.get(clave);
    if (!entrada) {
      entrada = { producto: {}, propias: new Map() };
      MENSAJES.set(clave, entrada);
    }

    if (fila.prestadora_id) {
      entrada.propias.set(fila.prestadora_id, { ...fila.i18n });
    } else {
      entrada.producto = { ...fila.i18n };
    }
  }
  cargadoEl = new Date();
}

/** Si hay algo cargado. Sirve para que quien arranca el backend sepa si la carga salió o no. */
export function hayMensajesCargados() {
  return cargadoEl !== null && MENSAJES.size > 0;
}

/** Las claves cargadas, para que una comprobación pueda recorrerlas. */
export function clavesCargadas() {
  return [...MENSAJES.keys()];
}

/** El texto crudo de una clave, sin marcadores resueltos, o nulo si no está. */
function textoCrudo(clave, idioma, prestadoraId) {
  const entrada = MENSAJES.get(clave);
  if (!entrada) return null;

  // El piso de arriba primero: lo que escribió esa Prestadora, en el idioma en que se le habla a
  // esta persona. Si ella escribió en otro idioma, no se le traduce lo suyo ni se le mezcla medio
  // texto de cada uno: sale el del producto, que sí está en los tres.
  if (prestadoraId) {
    const propio = entrada.propias.get(prestadoraId)?.[idioma];
    if (typeof propio === 'string' && propio.trim() !== '') return propio;
  }

  const delProducto = entrada.producto?.[idioma];
  return typeof delProducto === 'string' && delProducto.trim() !== '' ? delProducto : null;
}

const MARCADOR = /\{\{(\w+)\}\}/g;

/**
 * La frase de una clave, en un idioma, con los marcadores resueltos.
 *
 * @param {string} clave  la clave del mensaje, tal como está guardada
 * @param {string} idioma  uno de los tres; cualquier otro cae en el de por defecto
 * @param {object} [valores]  qué va en cada marcador
 * @param {string|null} [prestadoraId]  para alcanzar el texto propio de esa Prestadora
 * @returns {string}
 */
export function frase(clave, idioma, valores = {}, prestadoraId = null) {
  const idiomaFirme = normalizarIdioma(idioma);
  const crudo = textoCrudo(clave, idiomaFirme, prestadoraId);

  if (crudo === null) {
    avisar(clave, idiomaFirme);
    return marcaDeFaltante(clave, idiomaFirme);
  }

  return crudo.replace(MARCADOR, (_, nombre) => {
    if (!(nombre in valores) || valores[nombre] === null || valores[nombre] === undefined) {
      avisar(`${clave}.{{${nombre}}}`, idiomaFirme);
      return marcaDeFaltante(`${clave}.{{${nombre}}}`, idiomaFirme);
    }
    return String(valores[nombre]);
  });
}

export { IDIOMA_POR_DEFECTO, IDIOMAS_SOPORTADOS };
