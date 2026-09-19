// El fondo del mapa: de dónde salen los cuadraditos y qué dice la línea de atribución.
// ---------------------------------------------------------------------------------
//
// QUÉ ES ESTO. Un mapa se dibuja en dos capas. Abajo va el fondo —las calles, los ríos, los
// nombres de las localidades—, que llega del servidor de mapas en cuadraditos de imagen. Arriba
// se dibujan los puntos, y eso lo hace el navegador con lo que ya tiene cargado.
//
// POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL COMPONENTE. La dirección del servidor de mapas y el texto de
// la atribución son configuración: cambian el día que se cambie de proveedor, sin que el mapa
// cambie en nada. Escritos adentro del componente serían un valor operativo metido en el código
// (CLAUDE.md §8, «nunca hardcodear»). Cada valor se puede pisar con una variable de entorno sin
// tocar este archivo.
//
// POR QUÉ ESTE PROVEEDOR. No pide cuenta, ni credencial, ni pago. Y sobre todo: los cuadraditos
// se piden por pedazo de territorio, nunca por persona. El servidor de mapas ve que alguien miró
// el norte del conurbano; no ve —ni puede ver— dónde vive nadie del plantel. Los puntos se
// dibujan encima, ya en el navegador, y no salen del producto (CLAUDE.md §6).
//
// LA ATRIBUCIÓN NO ES OPCIONAL. Es la condición de uso de los datos del mapa, y el componente la
// muestra siempre.

const desdeElEntorno = (clave, valorPorDefecto) => {
  const valor = import.meta.env?.[clave];
  return typeof valor === 'string' && valor.trim() ? valor.trim() : valorPorDefecto;
};

export const MAPA_DE_FONDO = {
  // De dónde se piden los cuadraditos. `{z}/{x}/{y}` es el pedazo de territorio y el acercamiento.
  cuadraditos: desdeElEntorno(
    'VITE_MAPA_CUADRADITOS',
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  ),
  // La línea que va abajo a la derecha. Es texto del proveedor y por eso no se traduce.
  atribucion: desdeElEntorno('VITE_MAPA_ATRIBUCION', '© OpenStreetMap'),
  // Hasta dónde deja acercar el proveedor.
  zoomMaximo: 19,
  // Con cuánto acercamiento se abre cuando hay un solo punto y no hay nada que encuadrar.
  zoomDeUnPunto: 13,
  // Un respiro alrededor de los puntos, para que ninguno quede pegado al borde.
  margenDelEncuadre: 32,
  // La altura del recuadro del mapa. Es una medida de presentación y sale de acá, no del cálculo.
  alto: '420px',
};
