import crypto from 'node:crypto';
import { enLaPrestadora } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';

// UN CELULAR ES DE UNA SOLA PERSONA; UNA LÍNEA FIJA SE COMPARTE.
//
// QUÉ RESUELVE. El mismo número en dos personas es normal cuando es la línea de la casa, y no lo es
// cuando es un celular: un celular identifica a una persona, y dos cuentas con el mismo celular son
// dos cuentas que se recuperan con el mismo teléfono. Hasta acá la base aceptaba las dos cosas.
//
// QUIÉN LO IMPIDE DE VERDAD. La base, con el índice único
// `un_celular_es_de_una_sola_persona` sobre `usuarios`. Esto es la segunda
// red, y existe por una sola razón: para que quien está cargando el dato lea una frase entendible
// en su idioma en lugar de un choque de base clasificado como «ya existe un registro con esos
// datos». Si este archivo no existiera, el número repetido se rechazaría igual.
//
// CÓMO SE RECONOCE UN CELULAR. Depende del país, así que no está escrito acá: sale del catálogo
// `catalogo_prefijos_de_celular`, con el país en la clave. Agregar un país es cargar filas. Un
// número que no empieza con ningún prefijo cargado no es un celular reconocido, y entonces se
// permite repetido, que es el trato de la línea fija.
//
// ES POR PRESTADORA. La misma persona tiene una cuenta en cada Prestadora en la que trabaja, y en
// las dos lleva su celular. Lo que no puede pasar es que adentro de una Prestadora dos personas
// distintas lleven el mismo.
//
// CON QUÉ CREDENCIAL. Las otras cuentas no son de quien pregunta, así que no las puede leer con la
// suya: las lee el trabajo de esa Prestadora, que ve sólo las cuentas de la suya. Por eso la
// Prestadora es obligatoria, y sin ella la comprobación falla cerrada.
//
// EL NÚMERO NO SALE POR NINGÚN LADO. Es dato sensible (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`
// §4): no se registra, no viaja en ninguna dirección, no entra en ningún mensaje de error y no se
// escribe para depurar. Por eso lo que sale de acá es un motivo pelado, sin detalle: el
// detalle se escribe en el registro del servidor (`errorConMotivo.js`), y ahí tampoco puede haber
// un teléfono.

/** Sólo los dígitos, que es la forma en la que el catálogo guarda los prefijos. */
export function digitosDelTelefono(telefono) {
  return String(telefono ?? '').replace(/[^\d]/g, '');
}

/**
 * Con qué empieza un celular en cada país, leído de la base.
 *
 * FALLA CERRADA: si el catálogo no se puede leer, no se supone que el número es fijo — se levanta el
 * error y el pedido termina en «falla del sistema». Suponer sería justamente dejar pasar el caso que
 * no se entendió.
 */
export async function prefijosDeCelular(db) {
  const { data, error } = await db
    .from('catalogo_prefijos_de_celular')
    .select('prefijo')
    .eq('activo', true);

  if (error) throw new Error(`No se pudo leer el catalogo de prefijos de celular: ${error.message}`);

  return (data ?? []).map((fila) => digitosDelTelefono(fila.prefijo)).filter(Boolean);
}

/** Si ese número es un celular según los prefijos que estén cargados. */
export function esUnCelularSegun(prefijos, telefono) {
  const digitos = digitosDelTelefono(telefono);
  if (!digitos) return false;
  return (prefijos ?? []).some((prefijo) => prefijo && digitos.startsWith(prefijo));
}

/**
 * El identificador de verificación con el que la base compara dos números, calculado igual que del otro lado.
 *
 * EL NÚMERO NO VIAJA. Lo que va en la consulta es esto, nunca el teléfono: una consulta lleva sus
 * filtros en la dirección, y un teléfono escrito en una dirección es un teléfono que se filtra. La
 * columna `usuarios.telefono_comparable` la calcula la base con la misma cuenta
 * (`interno.numero_comparable`), y por eso las dos tienen que dar lo mismo: dígitos, y `md5`.
 */
export function verificadorComparable(telefono) {
  const digitos = digitosDelTelefono(telefono);
  if (!digitos) return null;
  return crypto.createHash('md5').update(digitos).digest('hex');
}

/**
 * Levanta `celular_de_otra_persona` si ese celular ya está en otra cuenta de la misma Prestadora.
 *
 * Con un número que no es celular reconocido no hace nada: la línea fija de una casa se repite.
 *
 * @param {object} p
 * @param {string} p.telefono        El número tal como lo escribieron.
 * @param {string} p.prestadoraId    La Prestadora de la cuenta.
 * @param {string} [p.usuarioId]     La cuenta que se está cambiando, para no chocar consigo misma.
 */
export async function exigirQueElCelularSeaDeUnaSolaPersona({ telefono, prestadoraId, usuarioId }) {
  const escrito = String(telefono ?? '').trim();
  if (!escrito) return;

  // Falla cerrada: sin Prestadora no hay contra qué cuentas comparar.
  if (!prestadoraId) throw new Error('No se pudo comprobar si el celular ya esta cargado: falta la Prestadora');

  await enLaPrestadora(prestadoraId, 'comprobar que el celular sea de una sola persona', (db) =>
    comprobarEnLaPrestadora(db, { escrito, prestadoraId, usuarioId })
  );
}

async function comprobarEnLaPrestadora(db, { escrito, prestadoraId, usuarioId }) {
  if (!esUnCelularSegun(await prefijosDeCelular(db), escrito)) return;

  const verificador = verificadorComparable(escrito);
  if (!verificador) return;

  let consulta = db
    .from('usuarios')
    .select('id')
    .eq('telefono_comparable', verificador)
    .eq('telefono_es_celular', true)
    .eq('prestadora_id', prestadoraId)
    .limit(1);

  if (usuarioId) consulta = consulta.neq('id', usuarioId);

  const { data, error } = await consulta;

  // Falla cerrada otra vez: no poder comprobar no es haber comprobado que no está.
  if (error) throw new Error(`No se pudo comprobar si el celular ya esta cargado: ${error.message}`);

  if ((data ?? []).length > 0) throw new ErrorConMotivo('celular_de_otra_persona');
}
