import { test } from 'node:test';
import assert from 'node:assert/strict';

const { unaPorUna } = await import('../revisarNotificacionesCoordinador.js');

// Pasó con la Prestadora de demostración: el despachante de correo rechazó un envío (429) y la
// vuelta entera se cortaba ahí, sin revisar ni escalar las alarmas que venían detrás.
test('la alarma cuyo aviso falla no frena a las que siguen', async () => {
  const revisadas = [];
  const errores = [];
  const consola = console.error;
  console.error = (...partes) => errores.push(partes.join(' '));
  try {
    await unaPorUna([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'incidente de relevo', async (alarma) => {
      if (alarma.id === 'b') throw new Error('El despachante rechazó el envío (429)');
      revisadas.push(alarma.id);
    });
  } finally {
    console.error = consola;
  }

  assert.deepEqual(revisadas, ['a', 'c']);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /incidente de relevo \(b\).*429/);
});
