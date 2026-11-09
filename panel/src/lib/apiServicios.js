import { llamadorDe } from './apiPanel';

/* La baja y la reactivación de un Servicio.
   ==========================================================================

   Pasan por el backend y no van directo a la base porque la baja, si el Cliente tiene deuda, le
   avisa además a créditos y cobranzas por WhatsApp. El cambio de estado lo hace la base, en una
   sola operación (`dar_de_baja_el_servicio` y `reactivar_el_servicio`).

   @param {string} path  Lo que va después de `/api/panel/cuentas/servicio`, empezando con `/`. */
const llamar = llamadorDe('/cuentas/servicio');

export function darDeBajaElServicio(servicioId, { motivo, motivoDetalle, comprobaciones }) {
  return llamar(`/${servicioId}/baja`, {
    method: 'POST',
    body: JSON.stringify({ motivo, motivo_detalle: motivoDetalle, comprobaciones }),
  });
}

export function reactivarElServicio(servicioId, { motivo, motivoDetalle }) {
  return llamar(`/${servicioId}/reactivar`, {
    method: 'POST',
    body: JSON.stringify({ motivo, motivo_detalle: motivoDetalle }),
  });
}
