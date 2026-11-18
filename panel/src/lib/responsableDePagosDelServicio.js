/* El Responsable de pagos de un Servicio, tal como lo elige la pantalla de lo comercial.

   La factura sale siempre a nombre del Contratante. La Prestadora puede indicar, para un Servicio
   puntual, que salga a nombre del Responsable de pagos: esa indicación va con el Responsable de
   pagos, desde el mismo día, y sin Responsable de pagos no existe. */

// La indicación que se guarda: encendida sólo si hay a quién facturarle.
export function facturaAlResponsable(form) {
  return !!form?.pagador_persona_id && form?.factura_al_responsable === true;
}

// Si lo elegido en la pantalla es distinto de lo que rige hoy: otra persona, otro tipo, u otra
// indicación de a nombre de quién sale la factura. Cualquiera de las tres pide desde qué día rige.
export function cambiaElResponsableDePagos(form, deHoy) {
  return (form?.pagador_persona_id || null) !== (deHoy?.pagador_persona_id || null)
    || (form?.pagador_tipo || '') !== (deHoy?.pagador_tipo || '')
    || facturaAlResponsable(form) !== (deHoy?.factura_al_responsable === true);
}
