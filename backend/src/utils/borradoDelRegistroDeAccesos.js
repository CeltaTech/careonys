import { enLaPrestadora } from '../db/connection.js';

// EL BORRADO DEL REGISTRO DE ACCESOS QUE YA VENCIÓ.
//
// Cuánto se conserva el registro de quién leyó la información de salud lo fija cada país, como un
// renglón de `reglas_de_conservacion`. La base hace todo: elige el año vencido, deja el corte que
// mantiene comprobable la cadena, borra y lo anota en el registro de actividad
// (`borrar_consultas_a_hce_vencidas`). Acá sólo se la llama, de a una Prestadora por vez y con la
// credencial del trabajo de esa Prestadora: la base no deja borrar a nadie más.
//
// Un país sin plazo no borra nada. Una vuelta que falla no deja nada a medias —la función corre
// entera o no corre— y lo que no se borró hoy se borra mañana.
export async function borrarLoVencidoDelRegistroDeAccesos(prestadoraId) {
  if (!prestadoraId) return { borrados: [] };

  const { data, error } = await enLaPrestadora(prestadoraId, 'borrado del registro de accesos vencido', (db) =>
    db.rpc('borrar_consultas_a_hce_vencidas'));

  if (error) {
    console.error(`No se pudo borrar el registro de accesos vencido (prestadora ${prestadoraId}):`, error.message);
    return { borrados: [] };
  }
  return { borrados: data ?? [] };
}
