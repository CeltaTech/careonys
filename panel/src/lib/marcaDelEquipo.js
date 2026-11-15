import { IDENTIDAD } from '../config/identidadProducto';

/* La marca de este aparato.
   ==========================================================================

   QUÉ ES. Un texto al azar que el backend emite y que este navegador guarda. Sirve para una sola
   cosa: que el backend pueda contestar «desde acá ya se entró antes» y no pedir el código del
   teléfono en cada entrada.

   QUÉ NO ES. No es una credencial y sola no deja entrar a nadie: se mira **después** de que la
   sesión ya está hecha. Y no es una huella del aparato: no se mira el navegador, ni la pantalla, ni
   dónde está esa persona. Nada de eso se consulta, y por eso este archivo no tiene con qué.

   DÓNDE SE GUARDA. En el almacenamiento local de este navegador, con el prefijo técnico del
   producto, que es el mismo que usan las demás cosas que persisten. Borrarlo no rompe nada: la
   próxima entrada se trata como si fuera desde un aparato nuevo, que es exactamente lo que es
   desde el punto de vista del backend.

   El almacenamiento local puede estar bloqueado —ventana privada, permisos del navegador—, y
   entonces las dos funciones no hacen nada y no se rompen. Quien esté en esa situación escribe el
   código en cada entrada, que es molesto pero seguro. */

// UNA POR CUENTA. Quien trabaja para dos Prestadoras tiene dos cuentas, y el backend reconoce el
// aparato por cuenta. Con un solo casillero para todas, la última pisaba a la anterior y una marca
// de una Organización viajaba adentro del pedido de otra.
const PREFIJO = `${IDENTIDAD.codigo}_marca_del_equipo`;

// El casillero de antes, compartido por todas las cuentas. Se borra al guardar la primera marca nueva.
const CLAVE_COMPARTIDA = PREFIJO;

function claveDe(cuentaId) {
  return cuentaId ? `${PREFIJO}_${cuentaId}` : null;
}

export function marcaGuardada(cuentaId) {
  const clave = claveDe(cuentaId);
  if (!clave) return null;
  try {
    return window.localStorage.getItem(clave) || null;
  } catch {
    return null;
  }
}

export function guardarMarca(cuentaId, marca) {
  const clave = claveDe(cuentaId);
  if (!clave || !marca) return;
  try {
    window.localStorage.setItem(clave, marca);
    window.localStorage.removeItem(CLAVE_COMPARTIDA);
  } catch {
    // Sin almacenamiento, este aparato vuelve a ser nuevo la próxima vez. No hay nada que hacer.
  }
}
