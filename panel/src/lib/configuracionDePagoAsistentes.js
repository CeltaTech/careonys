import { llamarApiConfiguracion } from './apiConfiguracion';
import { soloLoQueCorreDelPago } from './formaDePago';

/* Guardar cómo se le paga a los Asistentes, con el ajuste por índice del valor del Legajo.
   ==========================================================================

   La regla de pago lleva dos cosas: si se prorratea el monto fijo y el ajuste por índice. Las dos
   viajan juntas al backend en un solo guardado, con la frecuencia, y el backend las revisa y guarda
   la regla entera. Al leer, el backend devuelve las dos en la misma regla.

   - regla: lo del prorrateo, como lo devuelve el backend.
   - ajuste: lo que devuelve `ajusteDeLaReglaQueSePuedeGuardar`, sólo lo que difiere de fábrica. */
export async function guardarConfiguracionDePago({ regla, frecuencia, ajuste }) {
  await llamarApiConfiguracion('/pago-asistentes', {
    method: 'PUT',
    body: JSON.stringify({ regla: reglaConAjuste(regla, ajuste), frecuencia }),
  });
}

// La regla que viaja: el prorrateo, filtrado como lo filtra el backend, y el ajuste. La regla leída
// trae también el ajuste que regía al abrir la pantalla; se descarta, porque el que vale es el que
// quedó en los casilleros del ajuste.
export function reglaConAjuste(regla, ajuste) {
  return { ...soloLoQueCorreDelPago(regla), ...(ajuste ?? {}) };
}
