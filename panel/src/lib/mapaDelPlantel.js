// Punto único de verdad de QUÉ SE DIBUJA EN EL MAPA DEL PLANTEL (CLAUDE.md §8, regla del punto
// único de verdad).
// ============================================================================================
//
// La pregunta que contesta. Dos pantallas muestran el mismo mapa: la del plantel, donde se mira
// cómo está repartida la gente por zona, y la de una Solicitud, donde se mira quién queda cerca
// del lugar pedido. Las dos necesitan exactamente lo mismo —qué fichas tienen ubicación, en qué
// zona cae cada una, cómo encuadrar el mapa y, cuando hay un punto de referencia, a qué distancia
// queda cada una—. Escrito dos veces, un día una pantalla contaría a los inactivos y la otra no.
//
// Acá no hay nada de dibujo: ninguna librería de mapas, ningún color, ningún texto. Este archivo
// devuelve números y claves; el componente dibuja y las traducciones ponen las palabras.
//
// LO QUE ESTE ARCHIVO NO HACE, Y NO ES UN OLVIDO:
//
//   · No inventa una ubicación. Una ficha sin coordenadas se cuenta aparte y no se dibuja.
//     Ponerla en el centro de su localidad sería mostrar en un mapa algo que nadie ubicó.
//   · No arma ni devuelve ninguna dirección escrita. Al mapa llegan un par de números y nada
//     más: la dirección es dato sensible y no tiene por qué viajar hasta la pantalla
//     (CLAUDE.md §6).
//   · No calcula tiempo de viaje. La distancia es en línea recta, como en el resto del producto.
//
// LA ZONA, ACÁ, ES UNA FORMA DE AGRUPAR. Lo que la ficha del Asistente guarda son lugares, no
// zonas; la zona de cobertura es el conjunto de lugares que la Prestadora armó. Entonces un
// Asistente pertenece a toda zona que contenga alguno de sus lugares, y puede pertenecer a
// varias, o a ninguna. Agrupar para mostrar es distinto de guardar.

import { distanciaKm } from './distancia';
import { estaEnElPlantel, estaDisponibleParaOfertas } from './candidatos';
import { nombranLoMismo } from './textoComparable';

/**
 * El grupo de los que están en el plantel y no caen en ninguna zona de cobertura.
 *
 * Es una clave, no un texto: el nombre que se muestra sale de las traducciones. Existe porque
 * esconderlos haría que los números del mapa no cierren con el tamaño del plantel, y quien mire
 * no tendría forma de saber por qué faltan personas.
 */
export const SIN_ZONA = 'sin_zona';

/**
 * Las coordenadas de una fila —un Asistente, un lugar—, o `null` si no tiene una ubicación que
 * se pueda dibujar.
 *
 * Se descarta lo que no es un par de números válido, lo que cae fuera del rango que existe sobre
 * la Tierra, y el punto exacto (0, 0): ese par no es una ubicación cargada sino una columna que
 * quedó en cero, y queda en el Golfo de Guinea, a miles de kilómetros de cualquier plantel.
 */
// `Number(null)` da cero, y cero es un número perfectamente válido: una columna vacía se
// convertiría sola en una ubicación en el Golfo de Guinea. Lo que no es un número se descarta
// antes de convertirlo.
const numeroDe = (valor) => {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim()) return Number(valor);
  return NaN;
};

export function coordenadasDe(fila) {
  const lat = numeroDe(fila?.lat);
  const lng = numeroDe(fila?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * En qué zonas de cobertura cae alguien que acepta trabajar en esos lugares.
 *
 * Devuelve las zonas enteras y en el orden del catálogo, para que dos pantallas no las muestren
 * en orden distinto. Sin lugares cargados no cae en ninguna: no se sabe dónde trabaja, y
 * suponerlo sería inventar.
 */
export function zonasDeUnAsistente(lugaresDelAsistente, zonas) {
  const suyos = new Set((lugaresDelAsistente ?? []).filter(Boolean));
  if (suyos.size === 0) return [];
  return (zonas ?? []).filter((zona) => (zona?.lugares ?? []).some((id) => suyos.has(id)));
}

/**
 * El rectángulo que contiene a todos los puntos, con su centro. `null` sin ningún punto.
 *
 * El mapa se abre mirando lo que hay, no una ciudad escrita de antemano: una Prestadora de otra
 * provincia abriría el mapa lejos de su propia gente.
 */
export function encuadre(puntos) {
  const lista = (puntos ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (lista.length === 0) return null;

  let minLat = lista[0].lat;
  let maxLat = lista[0].lat;
  let minLng = lista[0].lng;
  let maxLng = lista[0].lng;
  for (const punto of lista) {
    if (punto.lat < minLat) minLat = punto.lat;
    if (punto.lat > maxLat) maxLat = punto.lat;
    if (punto.lng < minLng) minLng = punto.lng;
    if (punto.lng > maxLng) maxLng = punto.lng;
  }

  return {
    centro: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    limites: [
      { lat: minLat, lng: minLng },
      { lat: maxLat, lng: maxLng },
    ],
    // Un solo punto —o varios en el mismo lugar— no tiene rectángulo que encuadrar: quien dibuja
    // necesita saberlo para abrir con un acercamiento fijo en vez de acercarse al infinito.
    esUnSoloPunto: minLat === maxLat && minLng === maxLng,
  };
}

/**
 * Desde qué punto se mide la cercanía para una Solicitud, o `null` si no se puede saber.
 *
 * Se mira primero el lugar que alguien reconoció al leerla, que es lo que quedó guardado. Si no
 * hay ninguno, se prueba con la localidad que se escuchó por teléfono contra los nombres del
 * catálogo — y sólo vale si hay **una sola** ficha que la nombre: con dos, no se sabe cuál es, y
 * elegir la primera sería ordenar el plantel alrededor de un punto equivocado sin avisarlo.
 *
 * Devolver `null` no es un fallo: es que esta Solicitud todavía no tiene lugar. El mapa se
 * muestra igual, sin cercanía.
 */
export function puntoDeLaSolicitud(solicitud, lugares) {
  if (!solicitud) return null;
  const fichas = lugares ?? [];

  if (solicitud.lugar_id) {
    const reconocido = fichas.find((lugar) => lugar?.id === solicitud.lugar_id);
    const punto = coordenadasDe(reconocido);
    if (punto) return punto;
  }

  const parecidos = fichas.filter(
    (lugar) => nombranLoMismo(lugar?.nombre, solicitud.localidad) && coordenadasDe(lugar),
  );
  return parecidos.length === 1 ? coordenadasDe(parecidos[0]) : null;
}

/**
 * Todo lo que necesita el mapa del plantel activo.
 *
 * @param asistentes  el plantel entero tal como viene de la base. Quién sigue estando se decide
 *                    acá, con la misma regla que usa la lista de candidatos, y no en la consulta
 *                    de cada pantalla.
 * @param opciones    lugaresDe(id) → los lugares de esa ficha
 *                    zonas         → las zonas de cobertura con sus lugares
 *                    origen        → `{ lat, lng }` desde donde medir la cercanía, u `null`
 *
 * @returns { total, ubicadas, sinUbicar, puntos, grupos, encuadre }
 *
 * `total` es el plantel activo entero y `ubicadas` los que se pueden dibujar. Los dos números se
 * devuelven a propósito: un mapa con tres puntos sobre un plantel de cuarenta personas no dice lo
 * mismo que un mapa con tres puntos sobre un plantel de tres, y quien mira tiene que poder
 * distinguirlo sin ir a contar a otra pantalla.
 */
export function mapaDelPlantel(asistentes, opciones = {}) {
  const { lugaresDe = () => [], zonas = [], origen = null } = opciones;
  const plantel = (asistentes ?? []).filter(estaEnElPlantel);
  const puntoOrigen = coordenadasDe(origen);

  const grupos = new Map();
  const anotar = (id, nombre, ubicada) => {
    if (!grupos.has(id)) grupos.set(id, { id, nombre, total: 0, ubicadas: 0 });
    const grupo = grupos.get(id);
    grupo.total += 1;
    if (ubicada) grupo.ubicadas += 1;
  };

  const puntos = [];
  for (const asistente of plantel) {
    const susZonas = zonasDeUnAsistente(lugaresDe(asistente.id), zonas);
    const punto = coordenadasDe(asistente);

    if (susZonas.length === 0) anotar(SIN_ZONA, null, Boolean(punto));
    else for (const zona of susZonas) anotar(zona.id, zona.nombre, Boolean(punto));

    if (!punto) continue;

    // Cada persona se dibuja una vez, aunque caiga en dos zonas: un punto repetido en el mapa
    // sería una persona de más. Las zonas viajan con el punto, para que se puedan nombrar todas.
    puntos.push({
      id: asistente.id,
      nombre: asistente.nombre ?? '',
      lat: punto.lat,
      lng: punto.lng,
      disponible: estaDisponibleParaOfertas(asistente),
      zonas: susZonas.map((zona) => zona.id),
      nombresDeZonas: susZonas.map((zona) => zona.nombre),
      km: puntoOrigen ? distanciaKm(punto.lat, punto.lng, puntoOrigen.lat, puntoOrigen.lng) : null,
    });
  }

  // Con un punto de referencia, primero el más cerca. Sin él, por nombre: un orden estable es lo
  // que hace que la lista no baile entre dos recargas.
  puntos.sort((uno, otro) =>
    puntoOrigen ? uno.km - otro.km : String(uno.nombre).localeCompare(String(otro.nombre)),
  );

  // Las zonas, por nombre, y las que no caen en ninguna al final: es un grupo aparte y no una
  // zona más, así que no compite por el orden alfabético.
  const ordenados = [...grupos.values()].sort((uno, otro) => {
    if (uno.id === SIN_ZONA) return 1;
    if (otro.id === SIN_ZONA) return -1;
    return String(uno.nombre ?? '').localeCompare(String(otro.nombre ?? ''));
  });

  return {
    total: plantel.length,
    ubicadas: puntos.length,
    sinUbicar: plantel.length - puntos.length,
    puntos,
    grupos: ordenados,
    encuadre: encuadre(puntos),
  };
}

/** Los puntos que caen adentro de una zona. Sin zona elegida, todos. */
export function puntosDeLaZona(puntos, zonaId) {
  if (!zonaId) return puntos ?? [];
  if (zonaId === SIN_ZONA) return (puntos ?? []).filter((punto) => punto.zonas.length === 0);
  return (puntos ?? []).filter((punto) => punto.zonas.includes(zonaId));
}

/**
 * Las que quedan más cerca del punto de referencia, de la más cerca a la más lejos.
 *
 * Sólo las que tienen distancia medida: sin las dos puntas ubicadas no hay distancia, y ordenar
 * por una distancia inventada es peor que no ordenar.
 */
export function cercanasA(puntos, cuantas) {
  const medidas = (puntos ?? []).filter((punto) => Number.isFinite(punto?.km));
  const ordenadas = [...medidas].sort((uno, otro) => uno.km - otro.km);
  return Number.isFinite(cuantas) ? ordenadas.slice(0, cuantas) : ordenadas;
}
