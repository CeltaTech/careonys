import { llamadorDe } from './apiPanel';

/* El punto del mapa de un domicilio que el Panel guarda por su cuenta.
   ==========================================================================

   Quien carga el domicilio escribe la dirección y nada más: las coordenadas las calcula el backend,
   que es el único que habla con el servicio de direcciones. Va por POST porque la dirección es dato
   sensible y no viaja escrita en la dirección web.

   **Nunca impide guardar.** Si no se pudo ubicar la puerta, o el pedido no llegó, vuelven las dos en
   nulo y el domicilio se guarda igual: el texto es el dato, y lo que mide distancias se calla
   cuando faltan. */
const llamar = llamadorDe('/coordenadas');

const SIN_COORDENADAS = { lat: null, lng: null };

/** @param {object} partes  Las partes del domicilio, como las arma `CamposDeDomicilio`. */
export async function coordenadasDeDomicilio(partes) {
  try {
    const { lat, lng } = await llamar('', { method: 'POST', body: JSON.stringify(partes) });
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : SIN_COORDENADAS;
  } catch {
    return SIN_COORDENADAS;
  }
}
