import { test } from 'node:test';
import assert from 'node:assert/strict';

// La conexión a la base se arma sola al importar, y `createClient` no acepta una dirección vacía.
// Acá no se consulta nada —las dos funciones probadas son puras—, pero el import la trae igual.
// Mismo recurso que en `accesosDePersonasAutorizadas.test.js`.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
const { turnosGuardiaDelMensaje, turnosGuardiaPorCliente } = await import('../avisoCambioDeAsistente.js');

// Las dos armadas del mensaje son puras, así que se prueban sin base de datos. Los datos son
// inventados (CLAUDE.md §6).
const TURNOS_GUARDIA = [
  { id: 'g-2', fecha: '2026-10-08', hora_inicio: '08:00', hora_fin: '16:00' },
  { id: 'g-1', fecha: '2026-10-07', hora_inicio: '22:00', hora_fin: '06:00' },
];

const PACIENTES = new Map([
  ['g-1', [{ id: 'p-1', nombre: 'Elena', cliente_id: 'f-1' }]],
  ['g-2', [
    { id: 'p-1', nombre: 'Elena', cliente_id: 'f-1' },
    { id: 'p-2', nombre: 'Aníbal', cliente_id: 'f-2' },
  ]],
]);

test('los turnos del Coordinador salen ordenados por cuándo ocurren', () => {
  const turnos_guardia = turnosGuardiaDelMensaje(TURNOS_GUARDIA, PACIENTES);
  assert.deepEqual(turnos_guardia.map((t) => t.fecha), ['2026-10-07', '2026-10-08']);
  assert.deepEqual(turnos_guardia[0], {
    fecha: '2026-10-07', horaInicio: '22:00', horaFin: '06:00', pacientes: ['Elena'],
  });
  assert.deepEqual(turnos_guardia[1].pacientes, ['Elena', 'Aníbal']);
});

test('sin guardias no hay turnos', () => {
  assert.deepEqual(turnosGuardiaDelMensaje([], new Map()), []);
  assert.deepEqual(turnosGuardiaDelMensaje(null, null), []);
});

test('un turno sin Pacientes cargados no rompe el aviso', () => {
  const turnos_guardia = turnosGuardiaDelMensaje([{ id: 'g-9', fecha: '2026-10-07', hora_inicio: '08:00', hora_fin: '16:00' }], new Map());
  assert.deepEqual(turnos_guardia[0].pacientes, []);
});

test('cada Cliente ve solamente sus turnos y sus Pacientes', () => {
  const porCliente = turnosGuardiaPorCliente(TURNOS_GUARDIA, PACIENTES);

  assert.deepEqual([...porCliente.keys()].sort(), ['f-1', 'f-2']);
  assert.deepEqual(porCliente.get('f-1').map((t) => t.fecha), ['2026-10-07', '2026-10-08']);
  assert.deepEqual(porCliente.get('f-2').map((t) => t.fecha), ['2026-10-08']);
  // El Cliente 2 no se entera de que en ese turno también hay otro Paciente.
  assert.deepEqual(porCliente.get('f-2')[0].pacientes, ['Aníbal']);
});

test('un turno que cubre a dos Pacientes del mismo Cliente se cuenta una sola vez', () => {
  const pacientes = new Map([['g-1', [
    { id: 'p-1', nombre: 'Elena', cliente_id: 'f-1' },
    { id: 'p-3', nombre: 'Rosa', cliente_id: 'f-1' },
  ]]]);
  const turnos_guardia = turnosGuardiaPorCliente([TURNOS_GUARDIA[1]], pacientes).get('f-1');

  assert.equal(turnos_guardia.length, 1);
  assert.deepEqual(turnos_guardia[0].pacientes, ['Elena', 'Rosa']);
});

test('un Paciente sin Cliente cargado no arma un destinatario vacío', () => {
  const pacientes = new Map([['g-1', [{ id: 'p-4', nombre: 'Sin cliente', cliente_id: null }]]]);
  assert.equal(turnosGuardiaPorCliente([TURNOS_GUARDIA[1]], pacientes).size, 0);
});
