import { IDIOMA_POR_DEFECTO, idiomaDePais } from './idiomas.js';

/* En qué idioma escribe una Prestadora.
   ====================================

   Es la única consulta del backend que contesta esa pregunta. Sale del país configurado de la
   Prestadora, que es lo único que se sabe sobre dónde está la gente que va a leer el mensaje.

   SE PREGUNTA UNA VEZ POR VUELTA, no una vez por mensaje: los procesos de fondo recorren todas las
   Prestadoras y le mandan varios mensajes a cada una, y preguntar adentro del bucle serían decenas
   de consultas para obtener siempre la misma respuesta.

   NO SE GUARDA EN MEMORIA ENTRE VUELTAS. El país de una Prestadora se cambia desde Configuración,
   y una copia guardada haría que el mensaje siguiera saliendo en el idioma viejo hasta que alguien
   reiniciara el backend.

   ENTRA CON LA CONEXIÓN QUE RECIBE: la de la persona cuando hay una pidiendo, y la que ya usa el
   proceso cuando no. El filtro por Prestadora va escrito igual, porque quien llama puede pasar la
   llave maestra. */

/**
 * El idioma de una Prestadora. Si no se la encuentra o no tiene país, el de por defecto: un
 * mensaje que sale en castellano es mejor que un mensaje que no sale.
 *
 * @param {object} db conexión con la que se consulta
 * @param {string|null|undefined} prestadoraId
 * @returns {Promise<string>}
 */
export async function idiomaDeLaPrestadora(db, prestadoraId) {
  if (!prestadoraId) return IDIOMA_POR_DEFECTO;

  const { data, error } = await db
    .from('prestadoras')
    .select('pais')
    .eq('id', prestadoraId)
    .maybeSingle();

  if (error) {
    console.error(`Error resolviendo el idioma de la Prestadora ${prestadoraId}:`, error.message);
    return IDIOMA_POR_DEFECTO;
  }

  return idiomaDePais(data?.pais);
}
