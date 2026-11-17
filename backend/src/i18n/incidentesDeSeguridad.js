import { IDIOMA_POR_DEFECTO, IDIOMAS_SOPORTADOS } from './idiomas.js';

/* El texto del aviso de un incidente de seguridad.
   ================================================

   EL TEXTO NO VIVE ACÁ: vive en la base, en las plantillas de aviso de cada país, escrito en los
   tres idiomas del producto. Acá sólo se elige el idioma y se reemplazan los marcadores con los
   datos del incidente. Un país sin plantilla no tiene aviso, y esta función no inventa ninguno.

   LOS MARCADORES que puede llevar una plantilla son cuatro, escritos entre llaves:
   {ocurrido}, {conocido}, {descripcion} y {cantidad_de_pacientes}. Un marcador que no está en
   esta lista queda escrito tal cual, para que quien revisa el aviso lo vea y lo corrija en la
   plantilla, en vez de que desaparezca sin aviso.

   LAS FECHAS se escriben en el idioma del aviso y en la zona horaria de quien mira, que la manda
   su navegador: la base guarda el instante y el servidor no sabe en qué hora vive cada uno. Una
   zona que llegó mal no rompe el aviso: se escribe en la del servidor. */

const MARCADORES = ['ocurrido', 'conocido', 'descripcion', 'cantidad_de_pacientes'];

function zonaValida(zona, idioma) {
  if (typeof zona !== 'string' || !zona) return undefined;
  try {
    new Intl.DateTimeFormat(idioma, { timeZone: zona });
    return zona;
  } catch {
    return undefined;
  }
}

function fechaYHora(instante, idioma, timeZone) {
  if (!instante) return '';
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString(idioma, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  });
}

/** El idioma en el que sale el aviso: el pedido si es uno de los tres, si no el de por defecto. */
export function idiomaDelAviso(idioma) {
  return IDIOMAS_SOPORTADOS.includes(idioma) ? idioma : IDIOMA_POR_DEFECTO;
}

/**
 * El texto del aviso con los datos del incidente puestos. Sin plantilla, o sin texto en ningún
 * idioma, devuelve `null`: no hay aviso.
 *
 * @param {object} p
 * @param {{texto: Record<string,string>}|null} p.plantilla la fila de la plantilla del país
 * @param {string} p.idioma el idioma de la Prestadora
 * @param {string} [p.zona] la zona horaria de quien mira
 * @param {{ocurrido_at: string, conocido_at: string, descripcion: string}} p.incidente
 * @param {number} p.cantidadDePacientes
 * @returns {string|null}
 */
export function textoDelAviso({ plantilla, idioma, zona, incidente, cantidadDePacientes }) {
  const elegido = idiomaDelAviso(idioma);
  const texto = plantilla?.texto?.[elegido] ?? plantilla?.texto?.[IDIOMA_POR_DEFECTO];
  if (typeof texto !== 'string' || !texto.trim()) return null;

  const timeZone = zonaValida(zona, elegido);
  const valores = {
    ocurrido: fechaYHora(incidente?.ocurrido_at, elegido, timeZone),
    conocido: fechaYHora(incidente?.conocido_at, elegido, timeZone),
    descripcion: incidente?.descripcion ?? '',
    cantidad_de_pacientes: String(cantidadDePacientes ?? 0),
  };

  return texto.replace(/\{([a-z_]+)\}/g, (entero, nombre) =>
    (MARCADORES.includes(nombre) ? valores[nombre] : entero));
}
