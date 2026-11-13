/**
 * El ajuste periódico por índice de un Servicio: qué rige y qué se guarda.
 *
 *   npx vitest run src/lib/__tests__/ajustePorIndice.test.js
 *
 * Qué daría con el sistema roto: si lo que coincide con la Prestadora se guardara tal cual, el
 * Servicio quedaría pegado a un valor que la Prestadora cree poder cambiar; si «ninguno» se
 * guardara null cuando la Prestadora tiene índice, el Servicio heredaría el índice que se le quiso
 * sacar; si sin regla conocida se guardara null, se perdería lo elegido; si los meses escondidos se
 * revisaran, un casillero que no se ve frenaría el guardado. Todo eso falla acá.
 */
import { describe, expect, it } from 'vitest';
import {
  ajusteQueRige,
  ajusteQueSePuedeGuardar,
  casillerosDelAjuste,
  mesDeLaFecha,
  MESES_MAXIMO,
  MESES_MINIMO,
} from '../ajustePorIndice';

const CON_INDICE = { indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: 3, ajuste_por_indice: 'automatico' };

describe('ajusteQueRige', () => {
  it('sin nada, rige la fábrica: ningún índice, un mes, revisión previa', () => {
    expect(ajusteQueRige(null, null)).toEqual({
      indice_de_actualizacion: null,
      meses_entre_actualizaciones: 1,
      ajuste_por_indice: 'revision_previa',
    });
  });

  it('el Servicio pisa a la Prestadora, y «ninguno» saca el índice', () => {
    expect(ajusteQueRige(CON_INDICE, { meses_entre_actualizaciones: '6' }).meses_entre_actualizaciones).toBe(6);
    expect(ajusteQueRige(CON_INDICE, { indice_de_actualizacion: 'ninguno' }).indice_de_actualizacion).toBeNull();
  });

  it('un casillero vacío o ilegible no pisa nada', () => {
    expect(ajusteQueRige(CON_INDICE, { meses_entre_actualizaciones: '' }).meses_entre_actualizaciones).toBe(3);
    expect(ajusteQueRige(CON_INDICE, { meses_entre_actualizaciones: '6x' }).meses_entre_actualizaciones).toBe(3);
  });
});

describe('casillerosDelAjuste', () => {
  it('muestra lo que rige, con «ninguno» como opción', () => {
    expect(casillerosDelAjuste(null, null)).toEqual({
      indice_de_actualizacion: 'ninguno',
      meses_entre_actualizaciones: '1',
      ajuste_por_indice: 'revision_previa',
    });
    expect(casillerosDelAjuste(CON_INDICE, { meses_entre_actualizaciones: 12 })).toEqual({
      indice_de_actualizacion: 'ipc',
      meses_entre_actualizaciones: '12',
      ajuste_por_indice: 'automatico',
    });
  });
});

describe('ajusteQueSePuedeGuardar', () => {
  it('lo que coincide con lo de arriba se guarda null', () => {
    expect(ajusteQueSePuedeGuardar(CON_INDICE, casillerosDelAjuste(CON_INDICE, null))).toEqual({
      ok: true,
      valores: { indice_de_actualizacion: null, meses_entre_actualizaciones: null, ajuste_por_indice: null },
    });
  });

  it('lo distinto se guarda', () => {
    expect(
      ajusteQueSePuedeGuardar(CON_INDICE, { indice_de_actualizacion: 'cvs', meses_entre_actualizaciones: '6', ajuste_por_indice: 'revision_previa' })
    ).toEqual({
      ok: true,
      valores: { indice_de_actualizacion: 'cvs', meses_entre_actualizaciones: 6, ajuste_por_indice: 'revision_previa' },
    });
  });

  it('«ninguno» se guarda cuando la Prestadora tiene índice, y null cuando no tiene', () => {
    const elegido = { indice_de_actualizacion: 'ninguno', meses_entre_actualizaciones: '3', ajuste_por_indice: 'automatico' };
    expect(ajusteQueSePuedeGuardar(CON_INDICE, elegido).valores.indice_de_actualizacion).toBe('ninguno');
    expect(ajusteQueSePuedeGuardar(null, elegido).valores.indice_de_actualizacion).toBeNull();
  });

  it('sin índice que rija, los meses y el ajuste van null y no se revisan', () => {
    expect(ajusteQueSePuedeGuardar(null, { indice_de_actualizacion: 'ninguno', meses_entre_actualizaciones: '99', ajuste_por_indice: 'automatico' })).toEqual({
      ok: true,
      valores: { indice_de_actualizacion: null, meses_entre_actualizaciones: null, ajuste_por_indice: null },
    });
  });

  it('meses fuera de los bordes se rechazan diciendo cuál', () => {
    const elegido = { indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: String(MESES_MAXIMO + 1), ajuste_por_indice: 'automatico' };
    expect(ajusteQueSePuedeGuardar(null, elegido)).toEqual({ ok: false, clave: 'meses_entre_actualizaciones' });
    expect(ajusteQueSePuedeGuardar(null, { ...elegido, meses_entre_actualizaciones: String(MESES_MINIMO - 1) }).ok).toBe(false);
    expect(ajusteQueSePuedeGuardar(null, { ...elegido, meses_entre_actualizaciones: '3', ajuste_por_indice: 'otro' })).toEqual({ ok: false, clave: 'ajuste_por_indice' });
  });

  it('sin la regla de la Prestadora, se guarda lo elegido aunque coincida con la fábrica', () => {
    const elegido = { indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: '1', ajuste_por_indice: 'revision_previa' };
    expect(ajusteQueSePuedeGuardar(undefined, elegido).valores).toEqual({
      indice_de_actualizacion: 'ipc',
      meses_entre_actualizaciones: 1,
      ajuste_por_indice: 'revision_previa',
    });
  });
});

describe('mesDeLaFecha', () => {
  it('corta el día como texto, sin zona horaria', () => {
    expect(mesDeLaFecha('2026-03-01')).toBe('03/2026');
    expect(mesDeLaFecha(null)).toBe('');
  });
});
