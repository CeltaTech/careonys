// El mensaje emergente: aparece con el texto del catálogo, sigue a la vista hasta el último
// milisegundo y se va solo a los cuatro segundos. La zona anunciable queda siempre puesta.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si `avisar` deja de avisar, si el mensaje no se
// va, si se va antes de tiempo, si la zona pierde `role="status"` o si la activación deja de
// llamar al mensaje emergente con la frase del catálogo, alguna de estas falla.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { avisar, MensajeEmergente, DURACION_MS } from '../mensajeEmergente.js';
import { T } from '../../i18n/translations.js';

const dibujar = () => renderToStaticMarkup(createElement(MensajeEmergente));

test('el catálogo trae la frase del enlace nuevo en los tres idiomas', () => {
  assert.equal(T['es-AR'].auth.activar_enlace_nuevo_enviado, 'Le enviamos un nuevo enlace a su email.');
  assert.equal(T.en.auth.activar_enlace_nuevo_enviado, 'We sent a new link to your email.');
  assert.equal(T['pt-BR'].auth.activar_enlace_nuevo_enviado, 'Enviamos um novo link para o seu e-mail.');
});

test('la zona anunciable está puesta aunque no haya mensaje', () => {
  const html = dibujar();
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /class="mensaje-emergente"/);
});

test('aparece con el texto del catálogo y se va solo a los cuatro segundos', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const texto = T[idioma].auth.activar_enlace_nuevo_enviado;
      avisar(texto);
      const visible = dibujar();
      assert.match(visible, /class="mensaje-emergente"/);
      assert.ok(visible.includes(texto), `no se dibujó «${texto}»`);

      mock.timers.tick(DURACION_MS - 1);
      assert.ok(dibujar().includes(texto), 'se fue antes de tiempo');

      mock.timers.tick(1);
      const despues = dibujar();
      assert.ok(!despues.includes(texto), 'no se fue solo');
      assert.match(despues, /role="status"/);
    }
  } finally {
    mock.timers.reset();
  }
});

test('dura cuatro segundos', () => {
  assert.equal(DURACION_MS, 4000);
});

test('un texto vacío no muestra nada', () => {
  avisar('');
  avisar(undefined);
  assert.doesNotMatch(dibujar(), /class="mensaje-emergente"/);
});

test('la activación de la cuenta avisa el enlace nuevo con el mensaje emergente', () => {
  const fuente = readFileSync(new URL('../../pages/ActivarCuenta.jsx', import.meta.url), 'utf8');
  assert.ok(fuente.includes('avisar(t.auth.activar_enlace_nuevo_enviado)'));
});
