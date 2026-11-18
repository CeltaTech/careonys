/* Los Responsables de pagos de un Servicio, tal como los muestra y los carga la pantalla de lo
   comercial.

   Un Servicio puede tener varios Responsables de pagos al mismo tiempo, cada uno con su desde y su
   hasta. La factura sale a nombre del Contratante, salvo en los días en que un Responsable de pagos
   lleva la marca de que se le facture a él: esa marca la lleva uno solo por día, y la base lo hace
   cumplir. */

// Vigente: no tiene hasta, o su hasta es hoy o más adelante. Anterior: su hasta ya pasó. Uno que
// todavía no empezó también es vigente, porque nadie lo terminó.
export function separarPorVigencia(responsables, hoy) {
  const vigentes = [];
  const anteriores = [];
  for (const responsable of responsables ?? []) {
    if (responsable.vigente_hasta && responsable.vigente_hasta < hoy) anteriores.push(responsable);
    else vigentes.push(responsable);
  }
  const porDesde = (a, b) => (a.vigente_desde < b.vigente_desde ? -1 : a.vigente_desde > b.vigente_desde ? 1 : 0);
  vigentes.sort(porDesde);
  anteriores.sort((a, b) => -porDesde(a, b));
  return { vigentes, anteriores };
}

// El alta vacía, lista para cargar.
export const ALTA_VACIA = Object.freeze({
  persona_id: null,
  tipo: '',
  desde: '',
  factura_al_responsable: false,
});

// Los casilleros obligatorios del alta que están vacíos, en el orden en que se ven.
export function faltantesDelAlta(alta) {
  const faltan = [];
  if (!alta?.persona_id) faltan.push('persona_id');
  if (!alta?.desde) faltan.push('desde');
  return faltan;
}

// Lo que se manda al backend para dar de alta un Responsable de pagos.
export function cuerpoDelAlta(alta) {
  return {
    persona_id: alta.persona_id,
    tipo: alta.tipo || null,
    desde: alta.desde,
    factura_al_responsable: alta.factura_al_responsable === true,
  };
}

// El hasta que se manda: vacío quiere decir que sigue rigiendo.
export function hastaParaGuardar(texto) {
  return texto ? texto : null;
}

// Si el hasta elegido es anterior al desde. La base lo rechaza igual; acá se avisa antes de mandarlo.
export function hastaAntesDelDesde(desde, hasta) {
  return !!hasta && !!desde && hasta < desde;
}
