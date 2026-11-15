/**
 * La marca del aparato se guarda una por cuenta: la de una Prestadora no pisa la de otra.
 *
 *   npx vitest run src/lib/__tests__/marcaDelEquipo.test.js
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { IDENTIDAD } from '../../config/identidadProducto';
import { guardarMarca, marcaGuardada } from '../marcaDelEquipo';

function almacenDePrueba() {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    claves: () => [...datos.keys()],
  };
}

describe('marca del equipo', () => {
  let almacen;
  beforeEach(() => {
    almacen = almacenDePrueba();
    globalThis.window = { localStorage: almacen };
  });

  it('cada cuenta guarda y lee la suya', () => {
    guardarMarca('cuenta-a', 'marca-a');
    guardarMarca('cuenta-b', 'marca-b');
    expect(marcaGuardada('cuenta-a')).toBe('marca-a');
    expect(marcaGuardada('cuenta-b')).toBe('marca-b');
  });

  it('sin cuenta no lee ni guarda nada', () => {
    guardarMarca(null, 'marca');
    expect(almacen.claves()).toEqual([]);
    expect(marcaGuardada(null)).toBeNull();
  });

  it('no lee el casillero compartido de antes, y lo borra al guardar', () => {
    const compartida = `${IDENTIDAD.codigo}_marca_del_equipo`;
    almacen.setItem(compartida, 'marca-vieja');
    expect(marcaGuardada('cuenta-a')).toBeNull();
    guardarMarca('cuenta-a', 'marca-a');
    expect(almacen.getItem(compartida)).toBeNull();
  });

  it('con el almacenamiento bloqueado no se rompe', () => {
    globalThis.window = { get localStorage() { throw new Error('bloqueado'); } };
    expect(() => guardarMarca('cuenta-a', 'marca')).not.toThrow();
    expect(marcaGuardada('cuenta-a')).toBeNull();
  });
});
