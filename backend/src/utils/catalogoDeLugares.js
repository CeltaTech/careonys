// La lista de lugares de una Prestadora, leída una sola vez y desde un solo lado.
//
// **Por qué no vive adentro de una ruta.** La misma lista la necesitan tres pantallas: la de
// Configuración, que la carga; el Legajo de la Asistente, donde se marca dónde acepta trabajar; y
// la de Usuarios, donde se fija hasta dónde llega una coordinadora. Las dos últimas las abre gente
// que no entra a Configuración, así que la lectura no puede quedar del lado de la configuración.
// Escrita tres veces, terminaría ordenando distinto o mostrando los apagados en una y no en otra.
//
// **Las zonas vienen con sus lugares porque la zona es el atajo para cargar.** En pantalla se
// marca una zona entera y después se desmarca lo que no; lo que queda guardado son los lugares.
// Para poder ofrecer ese atajo hace falta saber qué abarca cada zona, y eso se resuelve acá y no
// con una llamada más desde el navegador.
//
// **Cada función entra con la conexión que recibe**: la de la persona cuando hay una pidiendo, y
// la que ya usa el proceso cuando no. El filtro por Prestadora va escrito igual, porque quien llama
// puede pasar la llave maestra.

/** El país de esa Organización. Un lugar de una Prestadora argentina es argentino: el país no lo
 *  manda la pantalla, porque un valor que viaja en el pedido lo escribe quien llama. */
export async function paisDeLaPrestadora(db, prestadoraId) {
  const { data, error } = await db
    .from('prestadoras')
    .select('pais')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.pais ?? '').trim().toUpperCase() || null;
}

/** Todos los lugares de esa Organización, ordenados por nombre. Incluye los apagados: quien carga
 *  necesita verlos para volver a encenderlos, y quien elige necesita que un lugar apagado que ya
 *  estaba marcado siga teniendo nombre en pantalla. */
export async function lugaresDeLaPrestadora(db, prestadoraId) {
  const { data, error } = await db
    .from('lugares')
    .select('*')
    .eq('prestadora_id', prestadoraId)
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

/** Cómo se llama ese lugar, para armar el renglón del domicilio.
 *
 *  Va filtrado por Prestadora además de por identificador: el identificador viene del pedido, y un
 *  valor que viaja en el pedido lo escribe quien llama. Sin ese filtro, un identificador de otra
 *  Organización contestaría el nombre de un lugar ajeno.
 *
 *  Devuelve cadena vacía si no existe, para que el renglón se arme igual sin ese pedazo. */
export async function nombreDelLugar(db, lugarId, prestadoraId) {
  if (!lugarId) return '';
  const { data, error } = await db
    .from('lugares')
    .select('nombre')
    .eq('id', lugarId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.nombre ?? '');
}

/** Cómo se llaman esos lugares, ordenados por nombre.
 *
 *  Es lo que ven las pantallas de teléfono donde antes había palabras tecleadas: la lista que sale
 *  hacia afuera sigue siendo de nombres, pero ahora los nombres salen de la tabla de lugares
 *  y no de lo que alguien escribió a mano en cada Legajo de Asistente.
 *
 *  Filtrado por Prestadora, por el mismo motivo que `nombreDelLugar`. */
export async function nombresDeLugares(db, lugarIds, prestadoraId) {
  return (await lugaresPorNombre(db, lugarIds, prestadoraId)).map((lugar) => lugar.nombre);
}

/** Esos mismos lugares con su identificador, para las pantallas que además filtran por uno.
 *
 *  Lo que se elige es cuál lugar, no cómo se llama: dos localidades de provincias distintas se
 *  llaman igual, y un filtro por nombre las traería a las dos. */
export async function lugaresPorNombre(db, lugarIds, prestadoraId) {
  const buscados = [...new Set((lugarIds ?? []).filter(Boolean))];
  if (!buscados.length) return [];
  const { data, error } = await db
    .from('lugares')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', buscados)
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

/** Las zonas de cobertura de esa Organización con los lugares que abarca cada una. */
export async function zonasConSusLugares(db, prestadoraId) {
  const [{ data: zonas, error: errorZonas }, { data: cruces, error: errorCruces }] = await Promise.all([
    db.from('zonas_cobertura').select('id, codigo, nombre, activa').eq('prestadora_id', prestadoraId).order('nombre'),
    db.from('zona_lugares').select('zona_id, lugar_id').eq('prestadora_id', prestadoraId),
  ]);
  if (errorZonas) throw errorZonas;
  if (errorCruces) throw errorCruces;

  const porZona = new Map();
  for (const cruce of cruces ?? []) {
    if (!porZona.has(cruce.zona_id)) porZona.set(cruce.zona_id, []);
    porZona.get(cruce.zona_id).push(cruce.lugar_id);
  }
  return (zonas ?? []).map((zona) => ({ ...zona, lugares: porZona.get(zona.id) ?? [] }));
}

/** Lo que necesita cualquier pantalla donde se eligen lugares: la lista y el atajo por zona. */
export async function catalogoDeLugares(db, prestadoraId) {
  const [lugares, zonas] = await Promise.all([
    lugaresDeLaPrestadora(db, prestadoraId),
    zonasConSusLugares(db, prestadoraId),
  ]);
  return { lugares, zonas };
}
