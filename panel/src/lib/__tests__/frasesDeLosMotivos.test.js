import { describe, expect, it, vi } from 'vitest';
import {
  alCambiarLasFrasesDeLosMotivos,
  anotarFrasesDeLosMotivos,
  conLosMotivosDeLaBase,
  frasesDeLosMotivosAnotadas,
  motivosEnElIdioma,
} from '../../i18n/frasesDeLosMotivos';
import { mensajeDeError } from '../errores';
import { T } from '../../i18n/translations';

const CLAVE = 'personas.error.la_persona_no_tiene_documento';
// Frases inventadas.
const DE_FABRICA = { clave: CLAVE, prestadora_id: null, i18n: { 'es-AR': 'Falta el documento.', en: 'The document is missing.' } };
const PROPIA = { clave: CLAVE, prestadora_id: 'prest-1', i18n: { 'es-AR': 'Cargue el documento primero.' } };

describe('motivosEnElIdioma', () => {
  it('toma la frase de fábrica en el idioma pedido', () => {
    expect(motivosEnElIdioma([DE_FABRICA], 'en')).toEqual({ la_persona_no_tiene_documento: 'The document is missing.' });
  });

  it('la frase propia de la Prestadora gana en su idioma', () => {
    expect(motivosEnElIdioma([DE_FABRICA, PROPIA], 'es-AR')).toEqual({ la_persona_no_tiene_documento: 'Cargue el documento primero.' });
  });

  it('sin la propia en ese idioma, va la de fábrica en ese idioma antes que el castellano', () => {
    expect(motivosEnElIdioma([PROPIA, DE_FABRICA], 'en')).toEqual({ la_persona_no_tiene_documento: 'The document is missing.' });
  });

  it('sin frase en el idioma pedido cae en el castellano', () => {
    expect(motivosEnElIdioma([DE_FABRICA], 'pt-BR')).toEqual({ la_persona_no_tiene_documento: 'Falta el documento.' });
  });

  it('sin filas no hay motivos', () => {
    expect(motivosEnElIdioma([], 'es-AR')).toEqual({});
    expect(motivosEnElIdioma(null, 'es-AR')).toEqual({});
  });
});

describe('conLosMotivosDeLaBase', () => {
  it('sin frases devuelve el mismo árbol', () => {
    const arbol = T['es-AR'];
    expect(conLosMotivosDeLaBase(arbol, {})).toBe(arbol);
  });

  it('suma la frase y conserva los motivos que ya estaban', () => {
    const arbol = conLosMotivosDeLaBase(T['es-AR'], { la_persona_no_tiene_documento: 'Falta el documento.' });
    expect(arbol.errores.motivos.la_persona_no_tiene_documento).toBe('Falta el documento.');
    expect(Object.keys(arbol.errores.motivos).length).toBe(Object.keys(T['es-AR'].errores.motivos).length + 1);
  });

  it('mensajeDeError muestra la frase cuando el backend manda ese motivo', () => {
    const t = conLosMotivosDeLaBase(T['es-AR'], motivosEnElIdioma([DE_FABRICA], 'es-AR'));
    const error = Object.assign(new Error('x'), { status: 409, motivo: 'la_persona_no_tiene_documento' });
    expect(mensajeDeError(error, t)).toBe('Falta el documento.');
  });

  it('mensajeDeError también la muestra cuando la levanta la base', () => {
    const t = conLosMotivosDeLaBase(T['es-AR'], motivosEnElIdioma([DE_FABRICA], 'es-AR'));
    expect(mensajeDeError({ code: 'P0001', message: 'la_persona_no_tiene_documento' }, t)).toBe('Falta el documento.');
  });
});

describe('el anotador', () => {
  it('avisa al cambiar y vuelve a vacío sin sesión', () => {
    const oyente = vi.fn();
    const darseDeBaja = alCambiarLasFrasesDeLosMotivos(oyente);
    anotarFrasesDeLosMotivos([DE_FABRICA]);
    expect(frasesDeLosMotivosAnotadas()).toEqual([DE_FABRICA]);
    anotarFrasesDeLosMotivos(null);
    expect(frasesDeLosMotivosAnotadas()).toEqual([]);
    expect(oyente).toHaveBeenCalledTimes(2);
    darseDeBaja();
    anotarFrasesDeLosMotivos([DE_FABRICA]);
    expect(oyente).toHaveBeenCalledTimes(2);
    anotarFrasesDeLosMotivos(null);
  });
});
