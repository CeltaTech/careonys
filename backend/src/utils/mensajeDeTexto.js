// El mensaje de texto: el lugar hecho, y apagado.
// =====================================================================================
//
// QUÉ ES ESTE ARCHIVO. La parte del mensaje de texto que le toca a Careonys: saber si una
// Prestadora tiene proveedor cargado, y ser el único punto por el que un aviso saldría por esa vía.
// No hay ningún proveedor contratado y acá no está integrado ninguno: el hueco está marcado abajo,
// en `mandarPorElProveedor()`, y es lo único que queda por escribir el día que se contrate uno.
//
// POR QUÉ EXISTE HOY. Para que encender la vía sea cargar una configuración y nada más. La vía ya
// sale en la lista de la pantalla de Avisos, ya tiene su columna por aviso, ya tiene dónde vivir la
// configuración de cada Prestadora y ya está enganchada en la cascada. Lo que falta es el
// proveedor, no el producto.
//
// ES LA VÍA DÉBIL, Y ENTRA COMO RESPALDO. Un mensaje de texto no se cifra, viaja por la red
// telefónica, se lo puede desviar y llega sin ninguna constancia de quién lo mandó. Va después de
// WhatsApp y antes del correo, y nunca lleva nada que no pueda viajar en un mensaje: ni
// remuneraciones, ni causales de cese, ni información clínica, ni datos del Paciente.
//
// Y SI FALLA, EL AVISO SALE IGUAL. Ninguna falla de esta vía puede dejar un aviso sin mandar: quien
// llama cae al correo, que es exactamente lo que ya hace con WhatsApp.

import { supabase } from '../db/connection.js';

/**
 * Con qué proveedor manda mensajes de texto esta Prestadora, si es que tiene alguno.
 *
 * Devuelve `null` cuando no hay fila, cuando la fila está apagada o cuando no tiene proveedor
 * cargado. No se busca ninguno parecido ni se cae a un proveedor de la empresa: cada Prestadora
 * manda con lo suyo, y una credencial de una nunca alcanza los datos de otra.
 */
export async function proveedorDeMensajeDeTexto(prestadoraId) {
  if (!prestadoraId) return null;

  const { data } = await supabase
    .from('configuracion_mensaje_de_texto_prestadora')
    .select('proveedor, remitente, token_secret_id, activo')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (!data?.activo || !data.proveedor) return null;
  return data;
}

/** Si esta Prestadora tiene hoy con qué mandar un mensaje de texto. */
export async function hayProveedorDeMensajeDeTexto(prestadoraId) {
  return (await proveedorDeMensajeDeTexto(prestadoraId)) !== null;
}

/**
 * El envío contra el proveedor. Es el único hueco que queda por escribir.
 *
 * El día que se contrate uno, acá adentro va la llamada a su API —con el remitente y la credencial
 * que ya vienen en `proveedor`, leída de Vault con el mismo molde que el token de WhatsApp
 * (`leer_token_whatsapp`)— y nada más. No hace falta tocar ningún otro archivo: ni el catálogo de
 * avisos, ni la cascada, ni la pantalla.
 *
 * Mientras tanto avisa que no está escrito, en vez de decir que mandó algo que no mandó.
 */
async function mandarPorElProveedor() {
  throw new Error('mensaje_de_texto_sin_integracion');
}

/**
 * Manda un mensaje de texto suelto. Hoy no sale ninguno.
 *
 * @throws `mensaje_de_texto_sin_proveedor` si la Prestadora no tiene proveedor cargado, y
 *   `mensaje_de_texto_sin_integracion` si lo tiene pero todavía no está escrito el envío.
 */
export async function enviarMensajeDeTexto({ prestadoraId, telefono, texto }) {
  const proveedor = await proveedorDeMensajeDeTexto(prestadoraId);
  if (!proveedor) throw new Error('mensaje_de_texto_sin_proveedor');

  return mandarPorElProveedor({ proveedor, telefono, texto });
}

/**
 * Manda el aviso de un evento por mensaje de texto, si esa vía está encendida y hay con qué.
 *
 * Es el gemelo de `avisarPorWhatsapp()` y tiene la misma forma a propósito: las dos condiciones
 * —la Prestadora encendió la vía para ese aviso, y tiene proveedor— están escritas una sola vez y
 * no en cada proceso que avisa.
 *
 * @returns {Promise<boolean>} si el mensaje salió. Falso con la vía apagada, sin teléfono o sin
 *   proveedor cargado, que es el caso de todas las Prestadoras hoy.
 * @throws lo que devuelva el proveedor. Quien llama decide si eso cae a otra vía o sólo se registra.
 */
export async function avisarPorMensajeDeTexto({ config, prestadoraId, telefono, texto }) {
  if (!config?.mensaje_de_texto_activo || !telefono) return false;

  const proveedor = await proveedorDeMensajeDeTexto(prestadoraId);
  if (!proveedor) return false;

  await mandarPorElProveedor({ proveedor, telefono, texto });
  return true;
}
