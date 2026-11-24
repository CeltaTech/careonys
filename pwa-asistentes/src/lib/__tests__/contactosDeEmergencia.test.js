// Los contactos de emergencia del turno de guardia en curso. Datos inventados.

import test from 'node:test';
import assert from 'node:assert/strict';
import { contactosDelPaciente, pacientesConContactos, enlaceDeLlamada } from '../contactosDeEmergencia.js';

const PACIENTE_A = 'paciente-a';
const PACIENTE_B = 'paciente-b';

test('los contactos salen en orden de prioridad aunque lleguen desordenados', () => {
  const porPaciente = {
    [PACIENTE_A]: [
      { prioridad: 3, nombre: 'Tercera Inventada', telefonos: ['1155550003'] },
      { prioridad: 1, nombre: 'Primera Inventada', telefonos: ['1155550001'] },
      { prioridad: 2, nombre: 'Segundo Inventado', telefonos: ['1155550002'] },
    ],
  };
  assert.deepEqual(
    contactosDelPaciente(porPaciente, PACIENTE_A).map((c) => c.nombre),
    ['Primera Inventada', 'Segundo Inventado', 'Tercera Inventada'],
  );
});

test('un contacto sin ningún teléfono que se pueda llamar no se muestra', () => {
  const porPaciente = {
    [PACIENTE_A]: [
      { prioridad: 1, nombre: 'Sin Teléfono', telefonos: [] },
      { prioridad: 2, nombre: 'Teléfono Vacío', telefonos: ['', '  '] },
      { prioridad: 3, nombre: 'Con Teléfono', telefonos: ['', '1155550003'] },
    ],
  };
  assert.deepEqual(contactosDelPaciente(porPaciente, PACIENTE_A), [
    { prioridad: 3, nombre: 'Con Teléfono', telefonos: ['1155550003'] },
  ]);
});

test('fuera del turno de guardia en curso llega vacío y no hay contactos', () => {
  assert.deepEqual(contactosDelPaciente({}, PACIENTE_A), []);
  assert.deepEqual(contactosDelPaciente(undefined, PACIENTE_A), []);
  assert.deepEqual(pacientesConContactos([{ id: PACIENTE_A }], {}), []);
});

test('el Paciente sin contactos no aparece y el que tiene sí', () => {
  const pacientes = [{ id: PACIENTE_A, nombre: 'Paciente A' }, { id: PACIENTE_B, nombre: 'Paciente B' }];
  const porPaciente = { [PACIENTE_B]: [{ prioridad: 1, nombre: 'Contacto Inventado', telefonos: ['1155550001'] }] };
  const resultado = pacientesConContactos(pacientes, porPaciente);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].paciente.id, PACIENTE_B);
  assert.equal(resultado[0].contactos[0].nombre, 'Contacto Inventado');
});

test('el enlace de llamada deja sólo las cifras y el signo más del principio', () => {
  assert.equal(enlaceDeLlamada('11 5555-0001'), 'tel:1155550001');
  assert.equal(enlaceDeLlamada('+54 9 11 5555 0001'), 'tel:+5491155550001');
  assert.equal(enlaceDeLlamada('(011) 5555-0001'), 'tel:01155550001');
  assert.equal(enlaceDeLlamada(''), '');
  assert.equal(enlaceDeLlamada('sin cifras'), '');
  assert.equal(enlaceDeLlamada(null), '');
});
