import { describe, expect, it } from 'vitest';
import {
  SIN_ZONA,
  coordenadasDe,
  encuadre,
  mapaDelPadron,
  puntosDeLaZona,
  zonasDeUnAsistente,
} from '../mapaDelPadron';
import { T } from '../../i18n/translations';

const IDIOMAS = ['es-AR', 'en', 'pt-BR'];

// Datos inventados, como manda CLAUDE.md §6: ninguna persona real y ninguna dirección real entran
// en una prueba. Los puntos son de lugares públicos del conurbano, redondeados.

const ZONAS = [
  { id: 'zona-norte', codigo: 'norte', nombre: 'Zona Norte', lugares: ['lugar-norte'] },
  { id: 'zona-oeste', codigo: 'oeste', nombre: 'Zona Oeste', lugares: ['lugar-oeste'] },
  {
    id: 'zona-amplia',
    codigo: 'amplia',
    nombre: 'Área metropolitana',
    lugares: ['lugar-norte', 'lugar-oeste'],
  },
];

const asistente = (extra) => ({
  id: extra.id ?? 'a',
  nombre: extra.nombre ?? 'Nombre Inventado',
  estado: 'activo',
  lat: -34.47,
  lng: -58.51,
  ...extra,
});

const lugaresPorAsistente = (mapa) => (id) => mapa[id] ?? [];

describe('coordenadasDe', () => {
  it('devuelve el punto cuando los dos números están', () => {
    expect(coordenadasDe({ lat: -34.6, lng: -58.4 })).toEqual({ lat: -34.6, lng: -58.4 });
  });

  it('se calla cuando falta cualquiera de los dos', () => {
    expect(coordenadasDe({ lat: -34.6, lng: null })).toBeNull();
    expect(coordenadasDe({ lat: null, lng: -58.4 })).toBeNull();
    expect(coordenadasDe(null)).toBeNull();
    expect(coordenadasDe({ lat: 'a la vuelta', lng: -58.4 })).toBeNull();
  });

  it('no acepta un punto que no existe sobre la Tierra', () => {
    expect(coordenadasDe({ lat: -120, lng: -58.4 })).toBeNull();
    expect(coordenadasDe({ lat: -34.6, lng: 400 })).toBeNull();
  });

  // Una columna que quedó en cero no es una ubicación cargada, y dibujarla mandaría el mapa al
  // Golfo de Guinea con todo el Padrón adentro del encuadre.
  it('no toma el cero de las dos columnas como una ubicación', () => {
    expect(coordenadasDe({ lat: 0, lng: 0 })).toBeNull();
  });
});

describe('zonasDeUnAsistente', () => {
  it('devuelve todas las zonas que contienen alguno de sus lugares', () => {
    expect(zonasDeUnAsistente(['lugar-norte'], ZONAS).map((z) => z.id)).toEqual([
      'zona-norte',
      'zona-amplia',
    ]);
  });

  it('no cae en ninguna zona sin lugares cargados', () => {
    expect(zonasDeUnAsistente([], ZONAS)).toEqual([]);
    expect(zonasDeUnAsistente(null, ZONAS)).toEqual([]);
  });

  it('no cae en ninguna zona cuando sus lugares no están en ninguna', () => {
    expect(zonasDeUnAsistente(['lugar-sin-punto'], ZONAS)).toEqual([]);
  });
});

describe('encuadre', () => {
  it('devuelve el centro de lo que hay', () => {
    const marco = encuadre([
      { lat: -34, lng: -58 },
      { lat: -36, lng: -60 },
    ]);
    expect(marco.centro).toEqual({ lat: -35, lng: -59 });
    expect(marco.esUnSoloPunto).toBe(false);
  });

  it('avisa cuando todo cae en el mismo punto', () => {
    expect(encuadre([{ lat: -34, lng: -58 }]).esUnSoloPunto).toBe(true);
  });

  it('no hay nada que encuadrar sin puntos', () => {
    expect(encuadre([])).toBeNull();
    expect(encuadre(null)).toBeNull();
  });
});

describe('mapaDelPadron', () => {
  const lugaresDe = lugaresPorAsistente({
    norte: ['lugar-norte'],
    oeste: ['lugar-oeste'],
    ambas: ['lugar-norte', 'lugar-oeste'],
    suelta: ['lugar-sin-punto'],
  });

  it('deja afuera a quien ya no trabaja en la Prestadora', () => {
    const resultado = mapaDelPadron(
      [
        asistente({ id: 'norte', nombre: 'Aaa' }),
        asistente({ id: 'oeste', nombre: 'Bbb', estado: 'cesado' }),
        asistente({ id: 'suelta', nombre: 'Ccc', estado: 'inactivo' }),
      ],
      { lugaresDe, zonas: ZONAS },
    );
    expect(resultado.total).toBe(1);
    expect(resultado.puntos.map((p) => p.id)).toEqual(['norte']);
  });

  // El número de gente ubicada no dice lo mismo solo que acompañado del tamaño del Padrón.
  it('cuenta aparte a quien no tiene ubicación cargada, y no lo dibuja', () => {
    const resultado = mapaDelPadron(
      [
        asistente({ id: 'norte', nombre: 'Aaa' }),
        asistente({ id: 'oeste', nombre: 'Bbb', lat: null, lng: null }),
      ],
      { lugaresDe, zonas: ZONAS },
    );
    expect(resultado.total).toBe(2);
    expect(resultado.ubicadas).toBe(1);
    expect(resultado.sinUbicar).toBe(1);
    expect(resultado.puntos).toHaveLength(1);
  });

  it('dibuja una sola vez a quien cae en dos zonas, y las nombra a las dos', () => {
    const resultado = mapaDelPadron([asistente({ id: 'ambas' })], {
      lugaresDe,
      zonas: ZONAS,
    });
    expect(resultado.puntos).toHaveLength(1);
    expect(resultado.puntos[0].zonas).toEqual(['zona-norte', 'zona-oeste', 'zona-amplia']);
  });

  it('agrupa por zona y cuenta cada grupo', () => {
    const resultado = mapaDelPadron(
      [
        asistente({ id: 'norte', nombre: 'Aaa' }),
        asistente({ id: 'oeste', nombre: 'Bbb', lat: -34.65, lng: -58.62 }),
        asistente({ id: 'suelta', nombre: 'Ccc', lat: null, lng: null }),
      ],
      { lugaresDe, zonas: ZONAS },
    );
    const porId = Object.fromEntries(resultado.grupos.map((g) => [g.id, g]));
    expect(porId['zona-norte']).toMatchObject({ total: 1, ubicadas: 1 });
    expect(porId['zona-amplia']).toMatchObject({ total: 2, ubicadas: 2 });
    expect(porId[SIN_ZONA]).toMatchObject({ total: 1, ubicadas: 0 });
  });

  // Esconder a los que no caen en ninguna zona haría que los números del mapa no cierren con el
  // tamaño del Padrón, y nadie podría saber por qué falta gente.
  it('deja último al grupo de los que no caen en ninguna zona', () => {
    const resultado = mapaDelPadron(
      [asistente({ id: 'suelta', nombre: 'Aaa' }), asistente({ id: 'oeste', nombre: 'Bbb' })],
      { lugaresDe, zonas: ZONAS },
    );
    expect(resultado.grupos.at(-1).id).toBe(SIN_ZONA);
  });

  it('ordena por nombre', () => {
    const resultado = mapaDelPadron(
      [asistente({ id: 'oeste', nombre: 'Zzz' }), asistente({ id: 'norte', nombre: 'Aaa' })],
      { lugaresDe, zonas: ZONAS },
    );
    expect(resultado.puntos.map((p) => p.nombre)).toEqual(['Aaa', 'Zzz']);
  });

  it('respeta el interruptor que movió la propia persona', () => {
    const resultado = mapaDelPadron(
      [
        asistente({ id: 'norte', nombre: 'Aaa', disponible_para_ofertas: false }),
        asistente({ id: 'oeste', nombre: 'Bbb' }),
      ],
      { lugaresDe, zonas: ZONAS },
    );
    expect(resultado.puntos.map((p) => p.disponible)).toEqual([false, true]);
  });

  it('no se cae sin Padrón ni sin catálogo', () => {
    expect(mapaDelPadron(null).puntos).toEqual([]);
    expect(mapaDelPadron([asistente({})]).grupos.map((g) => g.id)).toEqual([SIN_ZONA]);
  });
});

describe('puntosDeLaZona', () => {
  const puntos = [
    { id: 'uno', zonas: ['zona-norte', 'zona-amplia'] },
    { id: 'dos', zonas: ['zona-oeste'] },
    { id: 'tres', zonas: [] },
  ];

  it('sin zona elegida están todos', () => {
    expect(puntosDeLaZona(puntos, '')).toHaveLength(3);
  });

  it('elegida una zona quedan los suyos', () => {
    expect(puntosDeLaZona(puntos, 'zona-amplia').map((p) => p.id)).toEqual(['uno']);
  });

  it('el grupo de los que no caen en ninguna zona también se puede mirar solo', () => {
    expect(puntosDeLaZona(puntos, SIN_ZONA).map((p) => p.id)).toEqual(['tres']);
  });
});

describe('el mapa habla los tres idiomas', () => {
  const CLAVES = [
    'titulo',
    'cuantas',
    'sin_zona',
    'sin_ubicacion',
    'vacio_sin_ubicacion',
    'vacio_ayuda',
  ];

  it.each(IDIOMAS)('%s tiene todos los textos del mapa', (idioma) => {
    const textos = T[idioma].mapa_del_padron;
    expect(textos).toBeTruthy();
    for (const clave of CLAVES) {
      expect(typeof textos[clave], `falta ${clave} en ${idioma}`).toBe('string');
      expect(textos[clave].length).toBeGreaterThan(0);
    }
  });

  // Los números se reemplazan al mostrarlos: una traducción sin el marcador dejaría el cartel
  // diciendo una frase sin ningún número adentro.
  it.each(IDIOMAS)('%s conserva los marcadores que se reemplazan', (idioma) => {
    const textos = T[idioma].mapa_del_padron;
    expect(textos.cuantas).toContain('{ubicadas}');
    expect(textos.cuantas).toContain('{total}');
    expect(textos.sin_ubicacion).toContain('{n}');
  });
});
