import { describe, expect, it } from 'vitest';
import { CANAL, canalesHabilitados, trabajaEnCanal, motivoDeCanalDelError, mensajeDeCanal } from '../canales';
import { T } from '../../i18n/translations';

const IDIOMAS = ['es-AR', 'en', 'pt-BR'];

describe('canalesHabilitados', () => {
  it('deja pasar solo las modalidades que la Prestadora tiene activas', () => {
    expect(canalesHabilitados(['directa'])).toEqual(['directa']);
    expect(canalesHabilitados(['match'])).toEqual(['match']);
    expect(canalesHabilitados(['directa', 'match'])).toEqual(['directa', 'match']);
  });

  it('la subcontratación no es un canal de una persona', () => {
    // Es trabajo de otra empresa, con su propio plantel: nadie de nuestra base lo cubre.
    expect(canalesHabilitados(['subcontratacion'])).toEqual(['directa']);
    expect(canalesHabilitados(['directa', 'subcontratacion'])).toEqual(['directa']);
  });

  it('una Prestadora recién creada trabaja en directa', () => {
    expect(canalesHabilitados([])).toEqual(['directa']);
    expect(canalesHabilitados(null)).toEqual(['directa']);
    expect(canalesHabilitados(undefined)).toEqual(['directa']);
  });

  it('devuelve siempre el mismo orden, no el de las modalidades', () => {
    expect(canalesHabilitados(['match', 'directa'])).toEqual(['directa', 'match']);
  });
});

describe('trabajaEnCanal', () => {
  const soloDirecta = { canales: ['directa'] };
  const losDos = { canales: ['directa', 'match'] };

  it('cruza el canal de la guardia contra la ficha del Asistente', () => {
    expect(trabajaEnCanal(soloDirecta, CANAL.DIRECTA)).toBe(true);
    expect(trabajaEnCanal(soloDirecta, CANAL.MATCH)).toBe(false);
    expect(trabajaEnCanal(losDos, CANAL.MATCH)).toBe(true);
  });

  it('una guardia sin canal no cruza nada', () => {
    // Guardias viejas, anteriores a que la columna existiera: no se bloquea a nadie por eso.
    expect(trabajaEnCanal(soloDirecta, null)).toBe(true);
    expect(trabajaEnCanal(soloDirecta, undefined)).toBe(true);
  });

  it('un Asistente sin canales cargados no trabaja en ninguno', () => {
    expect(trabajaEnCanal({}, CANAL.DIRECTA)).toBe(false);
    expect(trabajaEnCanal({ canales: null }, CANAL.DIRECTA)).toBe(false);
    expect(trabajaEnCanal(null, CANAL.DIRECTA)).toBe(false);
  });

  it('la subcontratación no la cubre nadie del plantel propio', () => {
    expect(trabajaEnCanal(losDos, 'subcontratacion')).toBe(false);
  });
});

describe('motivoDeCanalDelError', () => {
  it('abre el rechazo que levanta la base al asignar una guardia', () => {
    expect(motivoDeCanalDelError({ message: 'canal_bloquea:match:' })).toEqual({
      motivo: 'bloquea',
      canal: 'match',
    });
  });

  it('abre el rechazo de guardar un canal que la Prestadora no tiene habilitado', () => {
    expect(motivoDeCanalDelError({ message: 'canal_no_habilitado:match:' })).toEqual({
      motivo: 'no_habilitado',
      canal: 'match',
    });
  });

  it('lee el texto crudo tal como llega, sin importar qué lo envuelva', () => {
    expect(motivoDeCanalDelError('canal_bloquea:directa:')).toEqual({ motivo: 'bloquea', canal: 'directa' });
    expect(
      motivoDeCanalDelError({ message: 'error de la base: canal_bloquea:directa: en guardias' })
    ).toEqual({ motivo: 'bloquea', canal: 'directa' });
  });

  it('no se confunde con otros errores', () => {
    expect(motivoDeCanalDelError({ message: 'matricula_bloquea:vencida:' })).toBeNull();
    expect(motivoDeCanalDelError({ code: '23505' })).toBeNull();
    expect(motivoDeCanalDelError(null)).toBeNull();
  });

  it('descarta un canal que no existe', () => {
    expect(motivoDeCanalDelError({ message: 'canal_bloquea:inventado:' })).toBeNull();
  });
});

describe('mensajeDeCanal', () => {
  it('arma la frase con el nombre del canal en el idioma de quien mira', () => {
    for (const idioma of IDIOMAS) {
      const tc = T[idioma].canales;
      const frase = mensajeDeCanal({ message: 'canal_bloquea:match:' }, tc);
      expect(frase).toContain(tc.match);
      expect(frase).not.toContain('{canal}');
      expect(frase).not.toContain('canal_bloquea');
    }
  });

  it('distingue el bloqueo de la guardia del canal no habilitado', () => {
    const tc = T['es-AR'].canales;
    expect(mensajeDeCanal({ message: 'canal_bloquea:directa:' }, tc)).toBe(
      tc.error_bloquea.replace('{canal}', tc.directa)
    );
    expect(mensajeDeCanal({ message: 'canal_no_habilitado:directa:' }, tc)).toBe(
      tc.error_no_habilitado.replace('{canal}', tc.directa)
    );
  });

  it('devuelve null cuando el error es otra cosa, para que la pantalla siga su camino', () => {
    expect(mensajeDeCanal({ message: 'Failed to fetch' }, T['es-AR'].canales)).toBeNull();
    expect(mensajeDeCanal({ message: 'canal_bloquea:directa:' }, undefined)).toBeNull();
  });
});

describe('los textos existen en los tres idiomas', () => {
  const CLAVES = ['etiqueta', 'ayuda', 'directa', 'match', 'falta_elegir', 'error_bloquea', 'error_no_habilitado'];

  it.each(IDIOMAS)('%s tiene el bloque de canales completo', (idioma) => {
    const tc = T[idioma].canales;
    expect(tc).toBeTruthy();
    for (const clave of CLAVES) {
      expect(typeof tc[clave], `falta ${clave} en ${idioma}`).toBe('string');
      expect(tc[clave].length).toBeGreaterThan(0);
    }
    expect(tc.error_bloquea).toContain('{canal}');
    expect(tc.error_no_habilitado).toContain('{canal}');
  });

  it.each(IDIOMAS)('%s explica por qué un candidato queda afuera por el canal', (idioma) => {
    const motivos = T[idioma].guardias.cobertura_panel;
    for (const clave of ['motivo_canal_directa', 'motivo_canal_match', 'motivo_canal_subcontratacion']) {
      expect(typeof motivos[clave], `falta ${clave} en ${idioma}`).toBe('string');
    }
  });
});
