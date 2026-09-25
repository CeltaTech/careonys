// La regla de la vía «mensaje de texto»: sale en la lista, y no se puede elegir sin proveedor.
// =====================================================================================
//
// Es el punto único de verdad de esa condición. La pantalla que configura los mensajes del sistema
// dibuja la casilla con lo que
// contesta el backend, y el backend guarda lo que dice este archivo: la misma decisión no está escrita
// dos veces. Función pura, sin base de datos, para que se pueda probar sola
// (utils/__tests__/viaMensajeDeTexto.test.js).
//
// POR QUÉ LA VÍA SALE EN LA LISTA AUNQUE NO SE PUEDA ELEGIR. Porque esconderla sería esconder que
// existe: quien configura los mensajes de su Prestadora tiene que ver que el mensaje de texto es una
// posibilidad y que hoy está apagada, no encontrarse con una columna que aparece un día sin mensaje.
//
// POR QUÉ ADMITE LOS MISMOS MENSAJES QUE WHATSAPP. Porque entra como su respaldo, en el mismo punto
// de decisión (`notificarCoordinador()`, utils/whatsapp.js). Un mensaje que no pasa por ahí —los que
// llaman derecho a `enviarEmailCoordinador()`— no mira ninguna de las dos columnas, así que
// dibujarle la casilla sería ofrecer algo que no ocurre. De ahí que esto se deduzca de
// `admite_whatsapp` en vez de repetirse mensaje por mensaje en el catálogo: son la misma condición, y
// dos listas que tienen que coincidir siempre terminan no coincidiendo.

/** Si el producto sabe mandar este mensaje por mensaje de texto. */
export function admiteMensajeDeTexto(mensaje) {
  return mensaje?.admite_whatsapp === true;
}

/**
 * Si esta Prestadora puede elegir hoy esa vía para ese mensaje.
 *
 * Falla cerrado por los dos lados: sin mensaje, o con cualquier cosa que no sea exactamente
 * «hay proveedor», la respuesta es que no. Nunca se compara contra un valor que pueda venir vacío.
 */
export function sePuedeElegirMensajeDeTexto({ mensaje, hayProveedor }) {
  return admiteMensajeDeTexto(mensaje) && hayProveedor === true;
}

/**
 * Qué se guarda en la columna del mensaje, venga lo que venga del navegador.
 *
 * Sin proveedor cargado se guarda apagado aunque el pedido diga encendido: dejarlo prendido haría
 * creer que el mensaje sale por ahí, y no sale. La restricción de la base sostiene lo mismo un piso
 * más abajo (supabase/migrations/20261004090000_...).
 */
export function mensajeDeTextoQueSeGuarda({ mensaje, hayProveedor, pedido }) {
  return sePuedeElegirMensajeDeTexto({ mensaje, hayProveedor }) ? Boolean(pedido) : false;
}
