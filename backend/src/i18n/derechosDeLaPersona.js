import { IDENTIDAD } from '../config/identidadProducto.js';
import { frase } from './mensajesDelSistema.js';
import { enDia } from '../utils/comoSeDiceEnUnAviso.js';

/* El correo que avisa que vence el plazo para responder lo que una persona pidió sobre sus datos.
   ==============================================================================================

   ACÁ NO HAY NINGUNA FRASE ESCRITA. Viven en `mensajes_del_sistema`, en los tres idiomas, bajo
   `derechos_de_la_persona.*`; las siembra la migración de los derechos de la persona. Acá sólo se
   elige cuál va y qué fecha lleva cada marcador.

   EL CORREO NO NOMBRA A LA PERSONA. Va al correo de contacto de la Prestadora, y un nombre ahí es un
   dato personal que sale del sistema sin necesidad: quien lo lee entra al Panel y lo ve ahí. */

/** Los derechos que una persona puede pedir. Son las claves del catálogo de la base. */
export const DERECHOS_DE_LA_PERSONA = [
  'acceso',
  'copia_de_la_historia_clinica',
  'rectificacion',
  'supresion',
  'portabilidad',
  'oposicion',
];

/** El nombre de un derecho, dicho para ir adentro de una frase: «rectificación de datos». */
export function nombreDelDerecho(tipo, idioma, prestadoraId = null) {
  return frase(`derechos_de_la_persona.derecho.${tipo}`, idioma, {}, prestadoraId);
}

/**
 * El asunto y el texto del aviso.
 *
 * @param {string} idioma
 * @param {{tipo: string, recibidaEl: string, venceEl: string}} solicitud  los días, `AAAA-MM-DD`, en la
 *   zona horaria de la Prestadora
 * @param {string|null} [prestadoraId]  para alcanzar el texto propio de esa Prestadora
 * @returns {{asunto: string, texto: string}}
 */
export function avisoDeDerechoPorVencer(idioma, { tipo, recibidaEl, venceEl }, prestadoraId = null) {
  const valores = {
    derecho: nombreDelDerecho(tipo, idioma, prestadoraId),
    recibida: enDia(recibidaEl),
    fecha: enDia(venceEl),
  };
  const marca = frase('comun.marca', idioma, { producto: IDENTIDAD.nombre }, prestadoraId);
  return {
    asunto: frase('derechos_de_la_persona.aviso_de_vencimiento.asunto', idioma, valores, prestadoraId),
    texto: `${frase('derechos_de_la_persona.aviso_de_vencimiento.texto', idioma, valores, prestadoraId)}\n\n—\n${marca}`,
  };
}
