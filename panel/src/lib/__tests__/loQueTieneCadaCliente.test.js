// Qué tiene cada Cliente y en qué estado queda, con las dos modalidades juntas.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si el acceso de Match deja de contar para el
// estado, falla «activo por Match»; si un estado desconocido se da por activo, falla la de fallar
// cerrado; si se agrupa mal, falla la primera. Datos inventados.

import { describe, it, expect } from 'vitest';
import { porCliente, estadoDelCliente } from '../loQueTieneCadaCliente.js';

describe('porCliente', () => {
  it('agrupa por Cliente y descarta lo que no tiene Cliente', () => {
    const mapa = porCliente([
      { id: 's1', cliente_id: 'c1' },
      { id: 's2', cliente_id: 'c2' },
      { id: 's3', cliente_id: 'c1' },
      { id: 's4', cliente_id: null },
    ]);
    expect([...mapa.keys()].sort()).toEqual(['c1', 'c2']);
    expect(mapa.get('c1').map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('sin filas da un mapa vacío', () => {
    expect(porCliente(undefined).size).toBe(0);
  });
});

describe('estadoDelCliente', () => {
  it('sin Servicios ni accesos no tiene estado', () => {
    expect(estadoDelCliente([], [])).toBe(null);
  });

  it('activo por un Servicio vigente', () => {
    expect(estadoDelCliente([{ estado: 'de_baja' }, { estado: 'vigente' }], [])).toBe('activo');
  });

  it('activo por un acceso de Match vigente, aunque no tenga Servicios', () => {
    expect(estadoDelCliente([], [{ estado: 'vigente' }])).toBe('activo');
  });

  it('de baja cuando tiene algo y nada está vigente', () => {
    expect(estadoDelCliente([{ estado: 'de_baja' }], [{ estado: 'vencida' }, { estado: 'cancelada' }])).toBe('de_baja');
  });

  it('un estado que no entiende no lo da por activo', () => {
    expect(estadoDelCliente([], [{ estado: 'algo_nuevo' }])).toBe('de_baja');
  });
});
