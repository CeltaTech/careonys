// El mensaje emergente: aparece con el texto del catálogo, sigue a la vista hasta el último
// milisegundo y se va solo a los cuatro segundos. La zona anunciable queda siempre puesta.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si `avisar` deja de avisar, si el mensaje no se
// va, si se va antes de tiempo, si la zona pierde `role="status"` o si la activación deja de
// llamar al mensaje emergente con la frase del catálogo, alguna de estas falla.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { avisar, MensajeEmergente, DURACION_MS } from '../mensajeEmergente.js';
import { T } from '../../i18n/translations.js';

const dibujar = () => renderToStaticMarkup(createElement(MensajeEmergente));

describe('mensaje emergente', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el catálogo trae la frase del enlace nuevo en los tres idiomas', () => {
    expect(T['es-AR'].auth.activar_enlace_nuevo_enviado).toBe('Le enviamos un nuevo enlace a su email.');
    expect(T.en.auth.activar_enlace_nuevo_enviado).toBe('We sent a new link to your email.');
    expect(T['pt-BR'].auth.activar_enlace_nuevo_enviado).toBe('Enviamos um novo link para o seu e-mail.');
  });

  it('la zona anunciable está puesta aunque no haya mensaje', () => {
    const html = dibujar();
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).not.toMatch(/class="mensaje-emergente"/);
  });

  it('aparece con el texto del catálogo y se va solo a los cuatro segundos', () => {
    vi.useFakeTimers();
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const texto = T[idioma].auth.activar_enlace_nuevo_enviado;
      avisar(texto);
      const visible = dibujar();
      expect(visible).toMatch(/class="mensaje-emergente"/);
      expect(visible).toContain(texto);

      vi.advanceTimersByTime(DURACION_MS - 1);
      expect(dibujar()).toContain(texto);

      vi.advanceTimersByTime(1);
      const despues = dibujar();
      expect(despues).not.toContain(texto);
      expect(despues).toMatch(/role="status"/);
    }
  });

  it('dura cuatro segundos', () => {
    expect(DURACION_MS).toBe(4000);
  });

  it('un texto vacío no muestra nada', () => {
    avisar('');
    avisar(undefined);
    expect(dibujar()).not.toMatch(/class="mensaje-emergente"/);
  });

  it('la activación de la cuenta avisa el enlace nuevo con el mensaje emergente', () => {
    const fuente = readFileSync(new URL('../../pages/ActivarCuenta.jsx', import.meta.url), 'utf8');
    expect(fuente).toContain('avisar(t.auth.activar_enlace_nuevo_enviado)');
  });
});
