// Punto único de verdad del CIERRE DEL PANEL POR INACTIVIDAD.
// ============================================================================
//
// Cada Prestadora lo enciende o lo apaga y elige cuántos minutos sin tocar el mouse ni el teclado
// cierran la sesión. Lo de fábrica —encendido y 15 minutos— son los `DEFAULT` de las dos columnas
// de `prestadoras`, y no se escribe acá.
//
// Lo que vive acá son los bordes de lo que se puede guardar, que usan el casillero del Panel y la
// ruta del backend. La base los repite en su `CHECK`, porque no puede leer este archivo.
//
// Original en el Panel; la copia del backend la mantiene `scripts/sincronizar_copias.mjs`.

export const MINUTOS_DE_INACTIVIDAD = { minimo: 5, maximo: 120 };

// Cuánto antes del cierre aparece el aviso para seguir trabajando.
export const AVISO_ANTES_DEL_CIERRE_MS = 60 * 1000;

export function minutosValidos(minutos) {
  return Number.isInteger(minutos)
    && minutos >= MINUTOS_DE_INACTIVIDAD.minimo
    && minutos <= MINUTOS_DE_INACTIVIDAD.maximo;
}

// En qué punto está una sesión: 'activa', 'por_cerrar' (corre el último minuto) o 'cerrar'.
// Falla cerrado: sin un número de minutos válido no hay forma de saber cuánto falta, y se cierra.
export function puntoDeLaSesion(ultimaActividadMs, ahoraMs, minutos) {
  if (!minutosValidos(minutos) || !Number.isFinite(ultimaActividadMs)) return 'cerrar';
  const quieta = ahoraMs - ultimaActividadMs;
  const limite = minutos * 60 * 1000;
  if (quieta >= limite) return 'cerrar';
  if (quieta >= limite - AVISO_ANTES_DEL_CIERRE_MS) return 'por_cerrar';
  return 'activa';
}
