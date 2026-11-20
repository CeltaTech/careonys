import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasajeDiarioDeTurnosGuardia } from '../pasajeDiarioDeTurnosGuardia.js';

test('primero genera los turnos de guardia y después hace la cuenta', async () => {
  const orden = [];
  await pasajeDiarioDeTurnosGuardia('p1', {
    generar: async (id) => { await new Promise((r) => setTimeout(r, 5)); orden.push(`generar ${id}`); },
    contar: async (id) => { orden.push(`contar ${id}`); },
  });
  assert.deepEqual(orden, ['generar p1', 'contar p1']);
});

test('si la generación falla, la cuenta corre igual y el error se informa', async () => {
  const orden = [];
  await assert.rejects(
    pasajeDiarioDeTurnosGuardia('p1', {
      generar: async () => { throw new Error('falló la generación'); },
      contar: async () => { orden.push('contar'); },
    }),
    /falló la generación/,
  );
  assert.deepEqual(orden, ['contar']);
});

test('sin Prestadora no corre nada', async () => {
  let corrio = false;
  await assert.rejects(
    pasajeDiarioDeTurnosGuardia(undefined, { generar: async () => { corrio = true; }, contar: async () => { corrio = true; } }),
    /falta la Prestadora/,
  );
  assert.equal(corrio, false);
});
