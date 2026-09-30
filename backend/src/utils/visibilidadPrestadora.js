import { clienteDelPedido } from '../db/connection.js';
import { visibilidadDeFabrica, visibilidadEfectiva } from './catalogoVisibilidad.js';

// Qué muestra hoy la aplicación de esta Prestadora. Es la única lectura de
// `configuracion_visibilidad_app` que hacen las dos aplicaciones, y devuelve siempre las
// dieciocho claves resueltas —no las filas crudas—, para que ninguna ruta tenga que acordarse
// del valor de fábrica por su cuenta (CLAUDE.md §7 regla 12).
//
// Entra con la conexión que recibe. El filtro por Prestadora va escrito igual: quien llama puede
// pasar la llave maestra, y ahí las políticas de la base no frenan nada.
export async function visibilidadDeLaPrestadora(db, prestadoraId) {
  if (!prestadoraId) {
    return visibilidadDeFabrica();
  }
  const { data } = await db
    .from('configuracion_visibilidad_app')
    .select('clave, visible')
    .eq('prestadora_id', prestadoraId);
  return visibilidadEfectiva(data);
}

// La Prestadora de quien está pidiendo. Los dos middlewares de sesión de teléfono
// —`requiereRolCliente` y `requiereRolAsistente`— dejan uno y solo uno de estos dos objetos,
// así que preguntar por los dos acá evita repetir la misma función una vez por aplicación.
function prestadoraDelPedido(req) {
  return req.usuarioCliente?.prestadoraId ?? req.usuarioAsistente?.prestadoraId ?? null;
}

// Lo mismo, pero contestando una sola vez por pedido: hay rutas que necesitan la lista dos
// veces (para cortar el acceso y después para armar la consulta) y no tiene sentido volver a
// preguntarle a la base en el mismo pedido.
//
// Con la credencial de quien pide: el Cliente, su personas autorizadas y el Asistente leen la configuración de
// su propia Prestadora.
export async function visibilidadDelPedido(req) {
  if (!req.visibilidadApp) {
    req.visibilidadApp = await visibilidadDeLaPrestadora(clienteDelPedido(req), prestadoraDelPedido(req));
  }
  return req.visibilidadApp;
}

// Corta el pedido cuando la Prestadora apagó esa función. Va en la cadena de la ruta, después
// del middleware de sesión.
//
// Es el candado del lado del backend: la aplicación ya sabe qué está apagado y no dibuja el
// botón, pero alguien puede llamar a la dirección igual desde el navegador. Sin esto, apagar
// una función sería una decoración.
export function exigeVisible(clave) {
  return async (req, res, next) => {
    const visibilidad = await visibilidadDelPedido(req);
    if (!visibilidad[clave]) {
      return res.status(403).json({ error: 'La Prestadora no tiene esta función activada', motivo: 'no_disponible' });
    }
    next();
  };
}
