/* El saldo de contactos de un paquete del Match.
   ====================================================

   QUÉ ES UN PAQUETE. Una de las formas de cobro que puede armar una Prestadora: un importe, sin
   período, y tantos contactos incluidos (`docs/PRD_07_Modalidad_Match.md` §3.3). Se paga una
   vez, no se renueva sola y no vence por calendario: lo que la sostiene es el saldo, y el saldo
   baja de a un Asistente.

   DE A UN ASISTENTE, NO DE A UNA MIRADA. Abierto el contacto de alguien, volver a mirarlo no
   descuenta otro. Quién ya está abierto lo dice `contactos_vistos_intermediacion`, y es lo que hace
   que cinco contactos alcancen para cinco Asistentes y no para tres mirados dos veces.

   LAS CUENTAS NO SE HACEN ACÁ. Sumar al saldo y restarle uno son dos funciones de la base
   (`sumar_contactos_al_saldo` y `consumir_contacto_intermediacion`). No es una
   preferencia de estilo: leer el saldo, restarle uno y volver a escribirlo son dos viajes, y dos
   ventanas abiertas a la vez descuentan una sola vez. Del lado de la base el descuento y la
   anotación pasan juntos, con la fila del acceso tomada.

   QUIÉN LLAMA A CADA UNA. La carga del saldo la hace la base adentro de
   `anotar_aviso_de_acceso_de_match`, cuando el software de cobranzas avisa que un paquete se
   pagó (`routes/avisoDeAccesoDeMatch.js`): así el cobro, el estado y los contactos quedan
   anotados en una sola operación. El descuento lo llama `contactoDelAsistente.js`, cuando el
   Cliente abre el contacto de un Asistente.

   QUÉ ACCESO ABRE CONTACTOS. Lo decide `elAccesoAbreContactos`, que es la misma regla que la base
   aplica antes de descontar (`interno.el_acceso_abre_contactos`): el vigente abre; el que está en
   período de gracia abre hasta el día anterior al de la suspensión; el dado de baja abre hasta el
   último día pagado; el suspendido y el vencido no abren. Si una cambia, cambia la otra. */

import { enLaPrestadora } from '../db/connection.js';

/** Por qué no se pudo abrir un contacto. Son códigos, no frases: la frase que lee la persona vive
 *  en las traducciones, en los tres idiomas (`celtatech\CLAUDE.md` §8, «un mensaje de error es
 *  texto visible»). */
export const MOTIVO_CONTACTO = {
  ACCESO_INEXISTENTE: 'acceso_inexistente',
  ACCESO_NO_VIGENTE: 'acceso_no_vigente',
  /** Ese acceso no se sostiene por saldo sino por una fecha. No se resuelve comprando un paquete. */
  ACCESO_SIN_SALDO: 'acceso_sin_saldo',
  SALDO_AGOTADO: 'saldo_agotado',
  NO_SE_PUDO_GUARDAR: 'no_se_pudo_guardar',
};

/** Los estados que puede tener guardados un acceso de Match. */
export const ESTADO_DEL_ACCESO = {
  VIGENTE: 'vigente',
  EN_GRACIA: 'en_gracia',
  SUSPENDIDA: 'suspendida',
  VENCIDA: 'vencida',
  CANCELADA: 'cancelada',
};

/**
 * ¿Este acceso abre contactos hoy? Es la misma regla que aplica la base antes de descontar, y
 * falla cerrado: un estado que no conoce o una fecha que falta contestan que no.
 *
 * Las fechas se comparan como texto `AAAA-MM-DD`, que es como las devuelve la base.
 *
 * @param {{estado?: string, suspension_desde?: string|null, vigente_hasta?: string|null}} acceso
 * @param {string} [hoy]  El día de hoy, `AAAA-MM-DD`, en hora universal como la base.
 */
export function elAccesoAbreContactos(acceso, hoy = new Date().toISOString().slice(0, 10)) {
  if (!acceso) return false;
  switch (acceso.estado) {
    case ESTADO_DEL_ACCESO.VIGENTE:
      return true;
    case ESTADO_DEL_ACCESO.EN_GRACIA:
      // La suspensión empieza ese día: el anterior es el último que abre.
      return Boolean(acceso.suspension_desde) && acceso.suspension_desde > hoy;
    case ESTADO_DEL_ACCESO.CANCELADA:
      // Dado de baja, sigue abriendo hasta el último día pagado inclusive.
      return Boolean(acceso.vigente_hasta) && acceso.vigente_hasta >= hoy;
    default:
      return false;
  }
}

/**
 * Abre el contacto de un Asistente contra el saldo de un acceso, y lo deja anotado.
 *
 * Un Asistente ya abierto contesta que sí y no descuenta nada: el contacto de cada persona se paga
 * una sola vez. `ya_estaba` dice cuál de los dos casos fue, para que quien llama pueda avisar que
 * se gastó un contacto sólo cuando se gastó de verdad.
 *
 * Lo abre el trabajo de la Prestadora del acceso: un acceso de otra Prestadora no se alcanza, y
 * contesta como si no existiera.
 *
 * @param {object} argumentos
 * @param {string} argumentos.prestadoraId
 * @param {string} argumentos.accesoId
 * @param {string} argumentos.asistenteId
 * @returns {Promise<{ok: boolean, ya_estaba?: boolean, saldo_contactos?: number, motivo?: string, detalle?: string}>}
 */
export async function abrirElContacto({ prestadoraId, accesoId, asistenteId }) {
  if (!prestadoraId) {
    return { ok: false, motivo: MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR, detalle: 'sin Prestadora' };
  }
  const { data, error } = await enLaPrestadora(prestadoraId, 'Abrir un contacto del Match', (db) => db
    .rpc('consumir_contacto_intermediacion', {
      p_acceso_id: accesoId,
      p_asistente_id: asistenteId,
    }));

  if (error) {
    return { ok: false, motivo: MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR, detalle: error.message };
  }
  // Falla cerrado: sin respuesta no se abre nada. Contestar que sí ante lo que no se entendió
  // sería regalar el contacto sin descontarlo.
  if (!data || typeof data !== 'object') {
    return { ok: false, motivo: MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR, detalle: 'respuesta vacía' };
  }
  if (!data.ok) {
    return { ok: false, motivo: data.motivo, saldo_contactos: data.saldo_contactos };
  }

  return { ok: true, ya_estaba: data.ya_estaba === true, saldo_contactos: data.saldo_contactos };
}
