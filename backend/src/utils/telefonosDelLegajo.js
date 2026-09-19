import { supabase } from '../db/connection.js';
import { huellaComparable } from './celularDeUnaSolaPersona.js';

// CUÁL DE LOS TELÉFONOS DE UNA FICHA ES EL PREFERIDO PARA LLAMAR.
//
// LA REGLA. Una ficha del Padrón puede tener varios teléfonos de contacto, y todos sirven. El
// preferido es **el que esa Persona usa en su cuenta**, porque es el que atiende: es el que eligió
// para que el producto la encuentre. Ser el preferido no apaga a ninguno de los demás.
//
// POR QUÉ NO SE GUARDA UNA MARCA. Porque el dato ya está guardado del otro lado, en la cuenta. Una
// marca escrita a mano acá diría lo mismo dos veces, y el día que esa Persona cambie el teléfono
// de su cuenta las dos dejarían de coincidir sin que nadie se entere: quedaría señalado como
// preferido un número al que ya no atiende. Se deduce cada vez que se lee, y por eso se deduce en
// un solo lugar, que es este archivo.
//
// SIN CUENTA NO HAY PREFERIDO. Una obra social no tiene cuenta; una Familia recién cargada
// tampoco. No se inventa ninguno: la lista sale entera y sin nada señalado, que es exactamente lo
// que se sabe.
//
// EL NÚMERO NO VIAJA EN NINGUNA CONSULTA. Lo que se compara es la huella —dígitos y `md5`—, que la
// base calcula con `interno.numero_comparable` y este lado con `huellaComparable`, escrita una sola
// vez en `celularDeUnaSolaPersona.js`. Un teléfono escrito en una dirección es un teléfono que se
// filtra (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md` §4).
//
// Y ESTO NO TIENE NADA QUE VER CON LA REGLA DEL CELULAR ÚNICO. Aquélla impide que dos cuentas de
// la misma Prestadora compartan un celular. Acá no se impide nada: sólo se mira si alguno de estos
// números coincide con el de alguna cuenta, para señalarlo.

/**
 * Las huellas de los teléfonos de cuentas de esa Prestadora que aparecen en esta lista.
 *
 * Se pregunta por las huellas que hay, y no por todas las cuentas: así la consulta no crece con el
 * tamaño de la Prestadora.
 */
async function huellasQueSonDeUnaCuenta(huellas, prestadoraId) {
  const buscadas = [...new Set((huellas ?? []).filter(Boolean))];
  if (buscadas.length === 0 || !prestadoraId) return new Set();

  const { data, error } = await supabase
    .from('usuarios')
    .select('telefono_comparable')
    .eq('prestadora_id', prestadoraId)
    .in('telefono_comparable', buscadas);

  // Falla cerrada: no haber podido comprobar no es haber comprobado que no hay ninguno. Se
  // devuelve la lista sin nada señalado, que es no saber, y nunca una señal inventada.
  if (error) {
    console.error('No se pudo resolver el telefono preferido:', error.message);
    return new Set();
  }

  return new Set((data ?? []).map((fila) => fila.telefono_comparable).filter(Boolean));
}

/**
 * La misma lista, con `preferido` puesto en el que corresponda.
 *
 * `telefonos` son las filas tal como salen de la base, ya acotadas a la Prestadora por quien
 * consulta. Vuelven en el mismo orden y con una sola cosa agregada.
 *
 * ES UNO SOLO POR FICHA. Si una Persona tuviera dos cuentas con dos números distintos y los dos
 * estuvieran cargados en su ficha, queda señalado el más antiguo de los dos. «El de preferencia»
 * es uno, y elegirlo por antigüedad hace que la pantalla muestre siempre lo mismo.
 */
export async function conElPreferidoMarcado(telefonos, prestadoraId) {
  const filas = telefonos ?? [];
  if (filas.length === 0) return [];

  const huellaDe = new Map(filas.map((fila) => [fila.id, huellaComparable(fila.telefono)]));
  const deUnaCuenta = await huellasQueSonDeUnaCuenta([...huellaDe.values()], prestadoraId);

  // Uno por ficha, y el más antiguo cuando hay más de uno que coincide.
  const elegido = new Map();
  for (const fila of filas) {
    const huella = huellaDe.get(fila.id);
    if (!huella || !deUnaCuenta.has(huella)) continue;
    const anterior = elegido.get(fila.legajo_id);
    if (!anterior || String(fila.created_at) < String(anterior.created_at)) elegido.set(fila.legajo_id, fila);
  }

  return filas.map((fila) => ({ ...fila, preferido: elegido.get(fila.legajo_id)?.id === fila.id }));
}

/** Lo que llega de afuera: se recorta, y una cadena de espacios es vacío. */
export function telefonoLimpio(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}
