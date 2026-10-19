import { enLaPrestadora } from '../db/connection.js';

// EL TOPE DE PEDIDOS DE CLAVE NUEVA.
//
// QUÉ RESUELVE. Pedir una clave nueva no exige sesión —quien llega ahí perdió justamente la forma
// de tener una—, así que la puerta la abre cualquiera desde afuera. Sin tope, cualquiera le llena
// la casilla de correo a una persona repitiendo el pedido, y cada mensaje lo paga la Prestadora.
// El tope del backend (`middleware/topeDePedidos.js`) no sirve acá: cuenta por persona con sesión.
//
// SE CUENTA POR CUENTA. La persona pide con su nombre de usuario, que es único en todo el sistema,
// así que cada pedido apunta a una sola cuenta, de una sola Prestadora. El renglón que queda dice
// qué cuenta pidió, nunca a qué email se mandó nada.
//
// UN NOMBRE SIN CUENTA NO SE CUENTA, y no hace falta: no hay a quién mandarle nada, así que no hay
// casilla que llenar. Lo que no se puede averiguar por acá es si el nombre existe, y eso lo cuida
// la respuesta, que es siempre la misma (`routes/recuperarClave.js`).
//
// CON QUÉ CREDENCIAL. Contar y anotar van con la credencial del trabajo de la Prestadora de la
// cuenta, que la base acota a ella: el tope de una no puede leer ni escribir los pedidos de otra.
//
// Es el mismo molde que `codigoAlTelefono.js` usa para el código al teléfono, con la misma forma de
// fallar: cerrado.

const TOPE_POR_HORA_POR_OMISION = 5;

/**
 * Cuántos pedidos de clave nueva se le aceptan como mucho a una misma cuenta en una hora.
 *
 * Se lee en cada pedido y no una sola vez al arrancar, para que cambiarlo no obligue a reiniciar y
 * para que las pruebas puedan moverlo. Un valor vacío, no entero o menor que uno se trata como si
 * no estuviera: es el caso corriente del renglón puesto y sin completar.
 */
export function topeDePedidosDeClavePorHora() {
  const texto = String(process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA ?? '').trim();
  if (!texto) return TOPE_POR_HORA_POR_OMISION;

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 1) {
    console.warn(
      'topeDePedidosDeClave: TOPE_PEDIDOS_DE_CLAVE_POR_HORA no es un entero mayor que cero; se usa el valor de fábrica',
    );
    return TOPE_POR_HORA_POR_OMISION;
  }
  return numero;
}

async function pedidosEnLaUltimaHora(prestadoraId, usuarioId) {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await enLaPrestadora(prestadoraId, 'contar pedidos de clave nueva', (db) =>
    db
      .from('pedidos_de_clave_nueva')
      .select('id', { count: 'exact', head: true })
      .eq('prestadora_id', prestadoraId)
      .eq('usuario_id', usuarioId)
      .gte('pedido_en', desde),
  );

  if (error) {
    // Falla cerrado: un tope que se saltea cuando la base no contesta no es un tope.
    console.error('topeDePedidosDeClave: no se pudieron contar los pedidos:', error.message);
    return Number.POSITIVE_INFINITY;
  }
  return Number.isFinite(count) ? count : Number.POSITIVE_INFINITY;
}

/**
 * ¿Esta cuenta ya pidió de más durante la última hora?
 *
 * @returns {Promise<boolean>} verdadero cuando no corresponde mandar nada.
 */
export async function seAgotaronLosPedidosDeClave(prestadoraId, usuarioId) {
  // Falla cerrado: sin saber de qué cuenta se trata, no se manda nada.
  if (!prestadoraId || !usuarioId) return true;
  const cuantos = await pedidosEnLaUltimaHora(prestadoraId, usuarioId);
  return cuantos >= topeDePedidosDeClavePorHora();
}

/**
 * Anota el pedido, para que el próximo lo cuente.
 *
 * Se anota antes de mandar nada: un envío que falló ya gastó el intento.
 */
export async function anotarPedidoDeClave(prestadoraId, usuarioId) {
  if (!prestadoraId || !usuarioId) return;
  const { error } = await enLaPrestadora(prestadoraId, 'anotar un pedido de clave nueva', (db) =>
    db
      .from('pedidos_de_clave_nueva')
      .insert({ prestadora_id: prestadoraId, usuario_id: usuarioId }),
  );
  if (error) {
    console.error('topeDePedidosDeClave: no se pudo anotar el pedido:', error.message);
  }
}
