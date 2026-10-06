import { describe, expect, it } from 'vitest';
import {
  MODALIDAD,
  MODALIDADES,
  contarPorModalidad,
  modalidadesHabilitadas,
  modalidadesDelAsistente,
  trabajaEnModalidad,
  motivoDeModalidadDelError,
  mensajeDeModalidad,
  laOpcionAlcanzaLasModalidades,
} from '../modalidades';
import { T } from '../../i18n/translations';
import { opcionesDeFabrica } from '../../datos/listasDeOpciones';

const IDIOMAS = ['es-AR', 'en', 'pt-BR'];

describe('las modalidades de trabajo', () => {
  // Son dos: prestación directa e intermediación (Match). Trabajar con una empresa subcontratada
  // o tercerizada es un recurso dentro de la prestación directa, no una tercera modalidad.
  it('son dos, y no hay tercera', () => {
    expect(MODALIDADES).toEqual(['directa', 'match']);
    expect(Object.values(MODALIDAD)).toEqual(MODALIDADES);
  });
});

describe('modalidadesHabilitadas', () => {
  it('deja pasar solo las modalidades que la Prestadora tiene activas', () => {
    expect(modalidadesHabilitadas(['directa'])).toEqual(['directa']);
    expect(modalidadesHabilitadas(['match'])).toEqual(['match']);
    expect(modalidadesHabilitadas(['directa', 'match'])).toEqual(['directa', 'match']);
  });

  it('descarta lo que no es una modalidad de trabajo', () => {
    expect(modalidadesHabilitadas(['subcontratacion'])).toEqual(['directa']);
    expect(modalidadesHabilitadas(['match', 'subcontratacion'])).toEqual(['match']);
  });

  it('una Prestadora recién creada trabaja en directa', () => {
    expect(modalidadesHabilitadas([])).toEqual(['directa']);
    expect(modalidadesHabilitadas(null)).toEqual(['directa']);
    expect(modalidadesHabilitadas(undefined)).toEqual(['directa']);
  });

  it('devuelve siempre el mismo orden, no el de las modalidades', () => {
    expect(modalidadesHabilitadas(['match', 'directa'])).toEqual(['directa', 'match']);
  });
});

describe('modalidadesDelAsistente', () => {
  it('lee la columna vieja y devuelve la lista', () => {
    // La columna se sigue llamando `canales` porque lo guardado no se renombra. Este es el único lugar de la aplicación que la nombra.
    expect(modalidadesDelAsistente({ canales: ['directa'] })).toEqual(['directa']);
  });

  it('una ficha sin nada cargado no tiene ninguna modalidad', () => {
    expect(modalidadesDelAsistente({})).toEqual([]);
    expect(modalidadesDelAsistente({ canales: null })).toEqual([]);
    expect(modalidadesDelAsistente(null)).toEqual([]);
  });
});

describe('trabajaEnModalidad', () => {
  const soloDirecta = { canales: ['directa'] };
  const lasDos = { canales: ['directa', 'match'] };

  it('cruza la modalidad de la guardia contra la ficha del Asistente', () => {
    expect(trabajaEnModalidad(soloDirecta, MODALIDAD.DIRECTA)).toBe(true);
    expect(trabajaEnModalidad(soloDirecta, MODALIDAD.MATCH)).toBe(false);
    expect(trabajaEnModalidad(lasDos, MODALIDAD.MATCH)).toBe(true);
  });

  it('una guardia sin modalidad no cruza nada', () => {
    // Guardias viejas, anteriores a que la columna existiera: no se bloquea a nadie por eso.
    expect(trabajaEnModalidad(soloDirecta, null)).toBe(true);
    expect(trabajaEnModalidad(soloDirecta, undefined)).toBe(true);
  });

  it('un Asistente sin modalidades cargadas no trabaja en ninguna', () => {
    expect(trabajaEnModalidad({}, MODALIDAD.DIRECTA)).toBe(false);
    expect(trabajaEnModalidad({ canales: null }, MODALIDAD.DIRECTA)).toBe(false);
    expect(trabajaEnModalidad(null, MODALIDAD.DIRECTA)).toBe(false);
  });
});

describe('motivoDeModalidadDelError', () => {
  it('abre el rechazo que levanta la base al asignar una guardia', () => {
    expect(motivoDeModalidadDelError({ message: 'modalidad_bloquea:match:' })).toEqual({
      motivo: 'bloquea',
      modalidad: 'match',
    });
  });

  it('abre el rechazo de guardar una modalidad que la Prestadora no tiene habilitada', () => {
    expect(motivoDeModalidadDelError({ message: 'modalidad_no_habilitada:match:' })).toEqual({
      motivo: 'no_habilitada',
      modalidad: 'match',
    });
  });

  it('lee el texto crudo tal como llega, sin importar qué lo envuelva', () => {
    expect(motivoDeModalidadDelError('modalidad_bloquea:directa:')).toEqual({
      motivo: 'bloquea',
      modalidad: 'directa',
    });
    expect(
      motivoDeModalidadDelError({ message: 'error de la base: modalidad_bloquea:directa: en guardias' })
    ).toEqual({ motivo: 'bloquea', modalidad: 'directa' });
  });

  it('no se confunde con otros errores', () => {
    expect(motivoDeModalidadDelError({ message: 'matricula_bloquea:vencida:' })).toBeNull();
    expect(motivoDeModalidadDelError({ code: '23505' })).toBeNull();
    expect(motivoDeModalidadDelError(null)).toBeNull();
  });

  it('no confunde la palabra vieja con la nueva', () => {
    // "canal" se retiró: en este producto un canal es por dónde sale un mensaje, no cómo
    // trabaja un Asistente. Si un rechazo viejo llegara igual, no se lo interpreta.
    expect(motivoDeModalidadDelError({ message: 'canal_bloquea:match:' })).toBeNull();
  });

  it('descarta una modalidad que no existe', () => {
    expect(motivoDeModalidadDelError({ message: 'modalidad_bloquea:inventada:' })).toBeNull();
  });
});

describe('mensajeDeModalidad', () => {
  it('arma la frase con el nombre de la modalidad en el idioma de quien mira', () => {
    for (const idioma of IDIOMAS) {
      const tm = T[idioma].modalidades;
      const frase = mensajeDeModalidad({ message: 'modalidad_bloquea:match:' }, tm);
      expect(frase).toContain(tm.match);
      expect(frase).not.toContain('{modalidad}');
      expect(frase).not.toContain('modalidad_bloquea');
    }
  });

  it('distingue el bloqueo de la guardia de la modalidad no habilitada', () => {
    const tm = T['es-AR'].modalidades;
    expect(mensajeDeModalidad({ message: 'modalidad_bloquea:directa:' }, tm)).toBe(
      tm.error_bloquea.replace('{modalidad}', tm.directa)
    );
    expect(mensajeDeModalidad({ message: 'modalidad_no_habilitada:directa:' }, tm)).toBe(
      tm.error_no_habilitada.replace('{modalidad}', tm.directa)
    );
  });

  it('devuelve null cuando el error es otra cosa, para que la pantalla siga su camino', () => {
    expect(mensajeDeModalidad({ message: 'Failed to fetch' }, T['es-AR'].modalidades)).toBeNull();
    expect(mensajeDeModalidad({ message: 'modalidad_bloquea:directa:' }, undefined)).toBeNull();
  });
});

describe('los textos existen en los tres idiomas', () => {
  const CLAVES = [
    'etiqueta',
    'directa',
    'match',
    'falta_elegir',
    'error_bloquea',
    'error_no_habilitada',
  ];

  it.each(IDIOMAS)('%s tiene el bloque de modalidades completo', (idioma) => {
    const tm = T[idioma].modalidades;
    expect(tm).toBeTruthy();
    for (const clave of CLAVES) {
      expect(typeof tm[clave], `falta ${clave} en ${idioma}`).toBe('string');
      expect(tm[clave].length).toBeGreaterThan(0);
    }
    // El marcador es una pieza del código, no una palabra traducible: se escribe igual en los
    // tres idiomas o el reemplazo no encuentra qué reemplazar.
    expect(tm.error_bloquea).toContain('{modalidad}');
    expect(tm.error_no_habilitada).toContain('{modalidad}');
  });

  it.each(IDIOMAS)('%s explica por qué un candidato queda afuera por la modalidad', (idioma) => {
    const motivos = T[idioma].guardias.cobertura_panel;
    for (const clave of [
      'motivo_modalidad_directa',
      'motivo_modalidad_match',
    ]) {
      expect(typeof motivos[clave], `falta ${clave} en ${idioma}`).toBe('string');
    }
  });
});

describe('contarPorModalidad', () => {
  it('cuenta cada fila en su modalidad', () => {
    const guardias = [
      { canal_modalidad: MODALIDAD.DIRECTA },
      { canal_modalidad: MODALIDAD.DIRECTA },
      { canal_modalidad: MODALIDAD.MATCH },
    ];
    expect(contarPorModalidad(guardias, (g) => g.canal_modalidad)).toEqual({
      directa: 2,
      match: 1,
    });
  });

  // Un renglón que falta se lee como "acá no se miró"; lo que se quiere decir es "acá no hay nada".
  it('devuelve las dos modalidades aunque no haya ninguna fila', () => {
    expect(Object.keys(contarPorModalidad([], () => null))).toEqual(MODALIDADES);
  });

  it('cuenta dos veces a quien trabaja en las dos modalidades', () => {
    const asistentes = [{ canales: [MODALIDAD.DIRECTA, MODALIDAD.MATCH] }];
    expect(contarPorModalidad(asistentes, modalidadesDelAsistente)).toEqual({
      directa: 1,
      match: 1,
    });
  });

  // Preferible que la suma de los renglones quede por debajo del total antes que inventarle un
  // renglón a un valor que este archivo no conoce.
  it('no cuenta en ningún lado lo que viene con una modalidad desconocida o sin ninguna', () => {
    const filas = [{ m: 'lo_que_sea' }, { m: 'subcontratacion' }, { m: null }, {}];
    expect(contarPorModalidad(filas, (f) => f.m)).toEqual({
      directa: 0,
      match: 0,
    });
  });

  it('no se cae cuando la consulta no trajo nada', () => {
    expect(contarPorModalidad(undefined, (f) => f.m).directa).toBe(0);
  });
});

/* Hay opciones de catálogo que sólo sirven en algunas modalidades de trabajo. El caso que la
   trajo: el medio de pago que recibe el dinero en bloque y lo reparte, que existe en prestación
   directa y no en Match, porque ahí el Cliente le paga al Asistente y la Prestadora no toca ese
   dinero. Lo que no se puede saltear es el disparador de la base; esto es lo mismo del lado de
   la pantalla, para no ofrecer algo que va a volver rechazado. */
describe('laOpcionAlcanzaLasModalidades', () => {
  it('una opción sin marca alcanza a todas, que es lo que valía antes de que la marca existiera', () => {
    expect(laOpcionAlcanzaLasModalidades({ clave: 'transferencia' }, ['match'])).toBe(true);
    expect(laOpcionAlcanzaLasModalidades({ clave: 'efectivo', modalidades: null }, ['match'])).toBe(
      true,
    );
    expect(laOpcionAlcanzaLasModalidades({ modalidades: [] }, ['match'])).toBe(true);
  });

  it('una opción marcada alcanza sólo a las modalidades que nombra', () => {
    const opcion = { clave: 'pago_en_bloque', modalidades: ['directa'] };
    expect(laOpcionAlcanzaLasModalidades(opcion, ['directa'])).toBe(true);
    expect(laOpcionAlcanzaLasModalidades(opcion, ['match'])).toBe(false);
  });

  // Lo que se paga no se puede partir en dos: la mitad que vino de Match no la centraliza nadie.
  it('una sola modalidad que quede afuera alcanza para que la opción no sirva', () => {
    const opcion = { clave: 'pago_en_bloque', modalidades: ['directa'] };
    expect(laOpcionAlcanzaLasModalidades(opcion, ['directa', 'match'])).toBe(false);
  });

  it('sin ninguna modalidad en juego no hay nada que deje afuera', () => {
    const opcion = { clave: 'pago_en_bloque', modalidades: ['directa'] };
    expect(laOpcionAlcanzaLasModalidades(opcion, [])).toBe(true);
    expect(laOpcionAlcanzaLasModalidades(opcion, undefined)).toBe(true);
  });
});

/* Y que el catálogo guardado en el archivo diga lo mismo que la migración que lo siembra. Si se
   despegaran, el desplegable sin internet ofrecería algo que la base rechaza. */
describe('los medios de pago al Asistente que trae el producto', () => {
  const medios = opcionesDeFabrica('medios_de_pago_al_asistente');

  it('el que reparte en bloque está, y atado a prestación directa', () => {
    const enBloque = medios.find((o) => o.clave === 'pago_en_bloque');
    expect(enBloque).toBeTruthy();
    expect(enBloque.modalidades).toEqual(['directa']);
    IDIOMAS.forEach((idioma) => expect(String(enBloque.i18n[idioma] ?? '').trim()).not.toBe(''));
  });

  it('los que ya estaban siguen alcanzando a todas las modalidades', () => {
    ['transferencia', 'efectivo'].forEach((clave) => {
      expect(medios.find((o) => o.clave === clave).modalidades).toBe(null);
    });
  });
});

/* La frase que ve quien intentó pagar con un medio que su modalidad no admite, en los tres
   idiomas. Un mensaje de error es texto visible y se traduce como cualquier otro. */
describe('la frase del medio que no alcanza la modalidad', () => {
  it('está escrita en los tres idiomas', () => {
    IDIOMAS.forEach((idioma) => {
      const frase = T[idioma].errores.motivos.medio_de_pago_fuera_de_la_modalidad;
      expect(String(frase ?? '').trim()).not.toBe('');
    });
  });
});
