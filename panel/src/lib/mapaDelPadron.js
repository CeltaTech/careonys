// Punto único de verdad de QUÉ SE DIBUJA EN EL MAPA DEL PADRÓN (CLAUDE.md §8, regla del punto
// único de verdad).
// ============================================================================================
//
// La pregunta que contesta: cómo está repartido el Padrón por zona —qué Legajos del Asistente
// tienen ubicación, en qué zona cae cada una y cómo encuadrar el mapa—. Escrito en la pantalla,
// un día el mapa contaría a los inactivos y la lista de al lado no.
//
// Acá no hay nada de dibujo: ninguna librería de mapas, ningún color, ningún texto. Este archivo
// devuelve números y claves; el componente dibuja y las traducciones ponen las palabras.
//
// LO QUE ESTE ARCHIVO NO HACE, Y NO ES UN OLVIDO:
//
//   · No inventa una ubicación. Un Legajo del Asistente sin coordenadas se cuenta aparte y no se dibuja.
//     Ponerla en el centro de su localidad sería mostrar en un mapa algo que nadie ubicó.
//   · No arma ni devuelve ninguna dirección escrita. Al mapa llegan un par de números y nada
//     más: la dirección es dato sensible y no tiene por qué viajar hasta la pantalla
//     (CLAUDE.md §6).
//
// LA ZONA, ACÁ, ES UNA FORMA DE AGRUPAR. Lo que el Legajo del Asistente guarda son lugares, no
// zonas; la zona de cobertura es el conjunto de lugares que la Prestadora armó. Entonces un
// Asistente pertenece a toda zona que contenga alguno de sus lugares, y puede pertenecer a
// varias, o a ninguna. Agrupar para mostrar es distinto de guardar.

import { estaEnElPadron, estaDisponibleParaOfertas } from './candidatos';

/**
 * El grupo de los que están en el Padrón y no caen en ninguna zona de cobertura.
 *
 * Es una clave, no un texto: el nombre que se muestra sale de las traducciones. Existe porque
 * esconderlos haría que los números del mapa no cierren con el tamaño del Padrón, y quien mire
 * no tendría forma de saber por qué faltan personas.
 */
export const SIN_ZONA = 'sin_zona';

/**
 * Las coordenadas de una fila —un Asistente, un lugar—, o `null` si no tiene una ubicación que
 * se pueda dibujar.
 *
 * Se descarta lo que no es un par de números válido, lo que cae fuera del rango que existe sobre
 * la Tierra, y el punto exacto (0, 0): ese par no es una ubicación cargada sino una columna que
 * quedó en cero, y queda en el Golfo de Guinea, a miles de kilómetros de cualquier Padrón.
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
 * Todo lo que necesita el mapa del Padrón activo.
 *
 * @param asistentes  el Padrón entero tal como viene de la base. Quién sigue estando se decide
 *                    acá, con la misma regla que usa la lista de candidatos, y no en la consulta
 *                    de cada pantalla.
 * @param opciones    lugaresDe(id) → los lugares del Legajo de ese Asistente
 *                    zonas         → las zonas de cobertura con sus lugares
 *
 * @returns { total, ubicadas, sinUbicar, puntos, grupos, encuadre }
 *
 * `total` es el Padrón activo entero y `ubicadas` los que se pueden dibujar. Los dos números se
 * devuelven a propósito: un mapa con tres puntos sobre un Padrón de cuarenta personas no dice lo
 * mismo que un mapa con tres puntos sobre un Padrón de tres, y quien mira tiene que poder
 * distinguirlo sin ir a contar a otra pantalla.
 */
export function mapaDelPadron(asistentes, opciones = {}) {
  const { lugaresDe = () => [], zonas = [] } = opciones;
  const padron = (asistentes ?? []).filter(estaEnElPadron);

  const grupos = new Map();
  const anotar = (id, nombre, ubicada) => {
    if (!grupos.has(id)) grupos.set(id, { id, nombre, total: 0, ubicadas: 0 });
    const grupo = grupos.get(id);
    grupo.total += 1;
    if (ubicada) grupo.ubicadas += 1;
  };

  const puntos = [];
  for (const asistente of padron) {
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
    });
  }

  // Por nombre: un orden estable es lo que hace que la lista no baile entre dos recargas.
  puntos.sort((uno, otro) => String(uno.nombre).localeCompare(String(otro.nombre)));

  // Las zonas, por nombre, y las que no caen en ninguna al final: es un grupo aparte y no una
  // zona más, así que no compite por el orden alfabético.
  const ordenados = [...grupos.values()].sort((uno, otro) => {
    if (uno.id === SIN_ZONA) return 1;
    if (otro.id === SIN_ZONA) return -1;
    return String(uno.nombre ?? '').localeCompare(String(otro.nombre ?? ''));
  });

  return {
    total: padron.length,
    ubicadas: puntos.length,
    sinUbicar: padron.length - puntos.length,
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
