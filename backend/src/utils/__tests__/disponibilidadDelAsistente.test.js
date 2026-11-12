/**
 * Los horarios en que suele estar disponible un Asistente: qué se acepta, qué se copia de la
 * postulación y a qué Prestadora se ata la lista.
 *
 *   node --test src/utils/__tests__/disponibilidadDelAsistente.test.js
 *
 * La base es de mentira y anota los filtros que recibió. Qué filas deja ver la base real lo
 * deciden sus políticas, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  disponibilidadDeLaPostulacion,
  disponibilidadElegida,
  opcionesDeDisponibilidad,
} from '../disponibilidadDelAsistente.js';

const OPCIONES = [{ clave: 'manana' }, { clave: 'tarde' }, { clave: 'noche' }];

function baseDeMentira(filas) {
  const filtros = [];
  const consulta = {
    from(tabla) { filtros.push(['from', tabla]); return consulta; },
    select() { return consulta; },
    eq(c, v) { filtros.push(['eq', c, v]); return consulta; },
    is(c, v) { filtros.push(['is', c, v]); return consulta; },
    or(v) { filtros.push(['or', v]); return consulta; },
    order() { return Promise.resolve({ data: filas, error: null }); },
  };
  return { db: consulta, filtros };
}

describe('disponibilidadElegida', () => {
  it('acepta claves de la lista y quita las repetidas', () => {
    assert.deepEqual(disponibilidadElegida(['tarde', 'manana', 'tarde'], OPCIONES),
      { valida: true, guardar: ['tarde', 'manana'] });
  });

  it('ninguna elegida se guarda como nulo', () => {
    assert.deepEqual(disponibilidadElegida([], OPCIONES), { valida: true, guardar: null });
  });

  it('rechaza una clave que no está en la lista', () => {
    assert.deepEqual(disponibilidadElegida(['manana', 'madrugada'], OPCIONES), { valida: false });
  });

  it('rechaza lo que no es una lista de textos', () => {
    assert.equal(disponibilidadElegida('manana', OPCIONES).valida, false);
    assert.equal(disponibilidadElegida(null, OPCIONES).valida, false);
    assert.equal(disponibilidadElegida([1], OPCIONES).valida, false);
  });

  it('sin opciones no acepta ninguna', () => {
    assert.equal(disponibilidadElegida(['manana'], []).valida, false);
  });
});

describe('disponibilidadDeLaPostulacion', () => {
  it('separa las claves por coma, sin espacios ni repetidas', () => {
    assert.deepEqual(disponibilidadDeLaPostulacion('manana, noche,manana'), ['manana', 'noche']);
  });

  it('vacío o ausente queda nulo', () => {
    assert.equal(disponibilidadDeLaPostulacion(''), null);
    assert.equal(disponibilidadDeLaPostulacion(null), null);
    assert.equal(disponibilidadDeLaPostulacion(' , '), null);
  });
});

describe('opcionesDeDisponibilidad', () => {
  it('sin Prestadora no consulta y devuelve vacío', async () => {
    const { db, filtros } = baseDeMentira([{ clave: 'manana', i18n: {} }]);
    assert.deepEqual(await opcionesDeDisponibilidad(db, undefined), []);
    assert.equal(filtros.length, 0);
  });

  it('pide las del producto y las de esa Prestadora', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const { db, filtros } = baseDeMentira([{ clave: 'manana', i18n: { es: 'Mañana' }, orden: 1 }]);
    const opciones = await opcionesDeDisponibilidad(db, id);
    assert.deepEqual(opciones, [{ clave: 'manana', i18n: { es: 'Mañana' } }]);
    assert.deepEqual(filtros.find((f) => f[0] === 'or'), ['or', `prestadora_id.is.null,prestadora_id.eq.${id}`]);
    assert.ok(filtros.some((f) => f[0] === 'is' && f[1] === 'listas_de_opciones.prestadora_id'));
  });
});
