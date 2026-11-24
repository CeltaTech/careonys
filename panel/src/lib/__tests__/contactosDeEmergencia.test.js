import { describe, expect, it } from 'vitest';
import {
  agregarPersona,
  agregarPersonaNueva,
  bajar,
  cuerpoDelPedido,
  deLaRespuesta,
  faltantesDeLaPersonaNueva,
  hayCambios,
  lugaresDe,
  quitar,
  sePuedeAgregar,
  subir,
  textoDelError,
  yaEstaEnLaLista,
} from '../contactosDeEmergencia';

// Personas inventadas.
const ANA = { prioridad: 2, personaId: 'p-ana', nombre: 'Ana Pérez', telefonos: ['1155550001'], esContratante: true };
const LUIS = { prioridad: 1, personaId: 'p-luis', nombre: 'Luis Gómez', telefonos: null, esPaciente: true, esPersonaAutorizada: true };

const TEXTOS = {
  contratante: 'Contratante',
  paciente: 'Paciente',
  responsable_de_pagos: 'Responsable de pagos',
  persona_autorizada: 'Persona autorizada',
  error: { demasiados: 'Demasiados', repetido: 'Repetido', inexistente: 'Inexistente', faltan_datos: 'Faltan', telefono_invalido: 'Teléfono' },
};

describe('deLaRespuesta', () => {
  it('ordena por prioridad y deja teléfonos y clave', () => {
    const lista = deLaRespuesta([ANA, LUIS]);
    expect(lista.map((c) => c.personaId)).toEqual(['p-luis', 'p-ana']);
    expect(lista[0].telefonos).toEqual([]);
    expect(lista[0].clave).toBe('p-luis');
  });

  it('sin contactos da una lista vacía', () => {
    expect(deLaRespuesta(undefined)).toEqual([]);
  });
});

describe('subir, bajar y quitar', () => {
  const lista = deLaRespuesta([ANA, LUIS]);

  it('sube y baja de a un lugar', () => {
    expect(subir(lista, 1).map((c) => c.personaId)).toEqual(['p-ana', 'p-luis']);
    expect(bajar(lista, 0).map((c) => c.personaId)).toEqual(['p-ana', 'p-luis']);
  });

  it('en los bordes no cambia nada', () => {
    expect(subir(lista, 0)).toBe(lista);
    expect(bajar(lista, 1)).toBe(lista);
  });

  it('quita el renglón pedido', () => {
    expect(quitar(lista, 0).map((c) => c.personaId)).toEqual(['p-ana']);
  });
});

describe('agregar', () => {
  it('suma una persona de Contactos al final', () => {
    const lista = agregarPersona([], { personaId: 'p-ana', nombre: 'Ana Pérez' }, 3);
    expect(lista).toEqual([{ personaId: 'p-ana', nombre: 'Ana Pérez', telefonos: [], clave: 'p-ana' }]);
    expect(yaEstaEnLaLista(lista, 'p-ana')).toBe(true);
  });

  it('no repite ni pasa el máximo', () => {
    const una = agregarPersona([], { personaId: 'p-ana', nombre: 'Ana Pérez' }, 1);
    expect(agregarPersona(una, { personaId: 'p-ana', nombre: 'Ana Pérez' }, 3)).toBe(una);
    expect(agregarPersona(una, { personaId: 'p-luis', nombre: 'Luis Gómez' }, 1)).toBe(una);
    expect(sePuedeAgregar(una, 1)).toBe(false);
  });

  it('una persona nueva necesita nombre, apellido y teléfono', () => {
    expect(faltantesDeLaPersonaNueva({ nombre: ' ', apellido: 'Ríos', telefono: '' })).toEqual(['nombre', 'telefono']);
    expect(agregarPersonaNueva([], { nombre: 'Eva', apellido: '', telefono: '1' }, 'n1', 3)).toEqual([]);
  });

  it('suma una persona nueva sin identificador', () => {
    const [nueva] = agregarPersonaNueva([], { nombre: ' Eva ', apellido: 'Ríos', telefono: '1155550002' }, 'n1', 3);
    expect(nueva).toMatchObject({ nueva: true, clave: 'n1', personaId: null, nombre: 'Eva Ríos', telefonos: ['1155550002'] });
  });
});

describe('cuerpoDelPedido', () => {
  it('manda la lista entera en orden, con las personas nuevas por sus datos', () => {
    const lista = agregarPersonaNueva(deLaRespuesta([LUIS]), { nombre: 'Eva', apellido: 'Ríos', telefono: '1155550002' }, 'n1', 3);
    expect(cuerpoDelPedido(lista)).toEqual({
      contactos: [{ personaId: 'p-luis' }, { nombre: 'Eva', apellido: 'Ríos', telefono: '1155550002' }],
    });
  });
});

describe('hayCambios', () => {
  const guardada = deLaRespuesta([ANA, LUIS]);

  it('la misma lista no tiene cambios', () => {
    expect(hayCambios([...guardada], guardada)).toBe(false);
  });

  it('el orden, una persona menos o una nueva son cambios', () => {
    expect(hayCambios(subir(guardada, 1), guardada)).toBe(true);
    expect(hayCambios(quitar(guardada, 0), guardada)).toBe(true);
    const conNueva = agregarPersonaNueva(quitar(guardada, 1), { nombre: 'Eva', apellido: 'Ríos', telefono: '1' }, 'n1', 3);
    expect(hayCambios(conNueva, guardada)).toBe(true);
  });
});

describe('lugaresDe', () => {
  it('nombra cada rol con el texto de la base', () => {
    expect(lugaresDe(LUIS, TEXTOS)).toEqual(['Paciente', 'Persona autorizada']);
    expect(lugaresDe({ personaId: 'x' }, TEXTOS)).toEqual([]);
  });
});

describe('textoDelError', () => {
  it('traduce los rechazos de los contactos con el texto de la base', () => {
    expect(textoDelError({ motivo: 'contacto_de_emergencia_repetido' }, TEXTOS)).toBe('Repetido');
    expect(textoDelError({ motivo: 'demasiados_contactos_de_emergencia' }, TEXTOS)).toBe('Demasiados');
    expect(textoDelError({ motivo: 'telefono_invalido' }, TEXTOS)).toBe('Teléfono');
  });

  it('otro motivo, o sin texto, queda para mensajeDeError', () => {
    expect(textoDelError({ motivo: 'la_persona_no_tiene_documento' }, TEXTOS)).toBeNull();
    expect(textoDelError({ motivo: 'contacto_de_emergencia_repetido' }, {})).toBeNull();
    expect(textoDelError(null, TEXTOS)).toBeNull();
  });
});
