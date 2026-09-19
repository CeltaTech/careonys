import crypto from 'node:crypto';
import { supabase } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';

// UN CELULAR ES DE UNA SOLA PERSONA; UNA LÍNEA FIJA SE COMPARTE.
//
// QUÉ RESUELVE. El mismo número en dos personas es normal cuando es la línea de la casa, y no lo es
// cuando es un celular: un celular identifica a una persona, y dos cuentas con el mismo celular son
// dos cuentas que se recuperan con el mismo teléfono. Hasta acá la base aceptaba las dos cosas.
//
// QUIÉN LO IMPIDE DE VERDAD. La base, con un índice único
// (`supabase/migrations/20261004100000_un_celular_es_de_una_sola_persona.sql`). Esto es la segunda
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
// EL NÚMERO NO SALE POR NINGÚN LADO. Es dato sensible (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`
// §4): no se registra, no viaja en ninguna dirección, no entra en ningún mensaje de error y no se
// escribe para depurar. Por eso el aviso que sale de acá es un motivo pelado, sin detalle: el
// detalle se escribe en el registro del servidor (`errorConMotivo.js`), y ahí tampoco puede haber
// un teléfono.

// La Prestadora sin identificar —el Superadmin— se agrupa aparte, igual que en el índice de la base.
const SIN_PRESTADORA = null;

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
export async function prefijosDeCelular() {
  const { data, error } = await supabase
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

/** Lo mismo, yendo a buscar el catálogo. */
export async function esUnCelular(telefono) {
  return esUnCelularSegun(await prefijosDeCelular(), telefono);
}

/**
 * La huella con la que la base compara dos números, calculada igual que del otro lado.
 *
 * EL NÚMERO NO VIAJA. Lo que va en la consulta es esto, nunca el teléfono: una consulta lleva sus
 * filtros en la dirección, y un teléfono escrito en una dirección es un teléfono que se filtra. La
 * columna `usuarios.telefono_comparable` la calcula la base con la misma cuenta
 * (`interno.numero_comparable`), y por eso las dos tienen que dar lo mismo: dígitos, y `md5`.
 */
export function huellaComparable(telefono) {
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
 * @param {string} [p.prestadoraId]  La Prestadora de la cuenta. Sin ella se compara contra las que
 *                                   tampoco tienen (el Superadmin), igual que el índice de la base.
 * @param {string} [p.usuarioId]     La cuenta que se está cambiando, para no chocar consigo misma.
 */
export async function exigirQueElCelularSeaDeUnaSolaPersona({ telefono, prestadoraId, usuarioId }) {
  const escrito = String(telefono ?? '').trim();
  if (!escrito) return;

  if (!esUnCelularSegun(await prefijosDeCelular(), escrito)) return;

  const huella = huellaComparable(escrito);
  if (!huella) return;

  let consulta = supabase
    .from('usuarios')
    .select('id')
    .eq('telefono_comparable', huella)
    .eq('telefono_es_celular', true)
    .limit(1);

  consulta = prestadoraId
    ? consulta.eq('prestadora_id', prestadoraId)
    : consulta.is('prestadora_id', SIN_PRESTADORA);

  if (usuarioId) consulta = consulta.neq('id', usuarioId);

  const { data, error } = await consulta;

  // Falla cerrada otra vez: no poder comprobar no es haber comprobado que no está.
  if (error) throw new Error(`No se pudo comprobar si el celular ya esta cargado: ${error.message}`);

  if ((data ?? []).length > 0) throw new ErrorConMotivo('celular_de_otra_persona');
}
