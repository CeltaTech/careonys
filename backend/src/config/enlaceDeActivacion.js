// LOS PLAZOS DEL ENLACE DE ACTIVACIÓN.
//
// Cuántos días sirve el enlace que llega por correo para activar una cuenta, y cuántos días después
// de emitido, si sigue sin usarse, sale solo un recordatorio con un enlace nuevo. Los dos son
// configuración: salen de variables de entorno, y si no están o vienen mal cargadas rige el valor
// de fábrica.
//
// Se leen en cada uso y no una sola vez al arrancar, para que cambiarlos no obligue a reiniciar y
// para que las pruebas puedan moverlos. Un valor vacío, no entero o menor que uno se trata como si
// no estuviera: es el caso corriente del renglón puesto y sin completar.

const DIAS_DE_VALIDEZ_POR_OMISION = 7;
const DIAS_HASTA_EL_RECORDATORIO_POR_OMISION = 3;

function diasDeLaVariable(nombre, porOmision) {
  const texto = String(process.env[nombre] ?? '').trim();
  if (!texto) return porOmision;

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 1) {
    console.warn(`enlaceDeActivacion: ${nombre} no es un entero mayor que cero; se usa el valor de fábrica`);
    return porOmision;
  }
  return numero;
}

/** Cuántos días sirve un enlace de activación desde que se emite. */
export function diasDeValidezDelEnlaceDeActivacion() {
  return diasDeLaVariable('DIAS_DE_VALIDEZ_DEL_ENLACE_DE_ACTIVACION', DIAS_DE_VALIDEZ_POR_OMISION);
}

/** Cuántos días después de emitido un enlace sin usar sale el recordatorio, una sola vez por cuenta. */
export function diasHastaElRecordatorioDeActivacion() {
  return diasDeLaVariable('DIAS_HASTA_EL_RECORDATORIO_DE_ACTIVACION', DIAS_HASTA_EL_RECORDATORIO_POR_OMISION);
}
