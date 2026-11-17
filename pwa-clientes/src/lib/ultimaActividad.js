import { IDENTIDAD } from '../config/identidadProducto';

/* Cuándo se tocó la pantalla por última vez, y por qué se cerró la sesión.
   ==========================================================================

   Lo usan el Panel y las dos aplicaciones. Original en el Panel; las copias de las aplicaciones
   las mantiene `scripts/sincronizar_copias.mjs`. Cada una corre en su propia dirección, así que
   cada una tiene su propio almacenamiento y las claves no se cruzan.

   LA ÚLTIMA ACTIVIDAD se guarda en el almacenamiento local para que todas las pestañas abiertas en
   este navegador cuenten el mismo tiempo: quien trabaja en una no ve cerrarse la otra. Si el
   almacenamiento está bloqueado —ventana privada, permisos del navegador— se cuenta en memoria, y
   cada pestaña lleva su propia cuenta.

   EL MOTIVO DEL CIERRE se guarda en el almacenamiento de la pestaña, y lo lee una sola vez la
   pantalla de ingreso para mostrar el aviso. */

const CLAVE_ACTIVIDAD = `${IDENTIDAD.codigo}-ultima-actividad`;
const CLAVE_CIERRE = `${IDENTIDAD.codigo}-cierre-por-inactividad`;

let enMemoria = Date.now();

export function anotarActividad(ahora = Date.now()) {
  enMemoria = ahora;
  try {
    window.localStorage.setItem(CLAVE_ACTIVIDAD, String(ahora));
  } catch {
    // Sin almacenamiento, queda la cuenta en memoria.
  }
}

export function ultimaActividad() {
  try {
    const guardada = Number(window.localStorage.getItem(CLAVE_ACTIVIDAD));
    if (Number.isFinite(guardada) && guardada > 0) return Math.max(guardada, enMemoria);
  } catch {
    // Sin almacenamiento, vale la de memoria.
  }
  return enMemoria;
}

export function anotarCierrePorInactividad() {
  try {
    window.sessionStorage.setItem(CLAVE_CIERRE, '1');
  } catch {
    // Sin almacenamiento, la pantalla de ingreso aparece sin el aviso.
  }
}

export function huboCierrePorInactividad() {
  try {
    return window.sessionStorage.getItem(CLAVE_CIERRE) === '1';
  } catch {
    return false;
  }
}

// Se olvida al volver a entrar: el aviso es de la sesión que se cerró, no de la siguiente.
export function olvidarCierrePorInactividad() {
  try {
    window.sessionStorage.removeItem(CLAVE_CIERRE);
  } catch {
    // Sin almacenamiento no había nada guardado.
  }
}
