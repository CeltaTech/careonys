// La Guía de primeros pasos: cada paso pendiente es una fila entera que lleva a su ruta, sin
// botón con texto; un paso completado no lleva a ningún lado; y quien mira sin poder hacer
// (Superadmin de visita) no tiene filas que se toquen.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si vuelve un botón con texto, si la fila deja de
// ser enlace, si apunta a otra ruta, si un completado se vuelve tocable o si el Superadmin recibe
// enlaces, alguna de estas falla. Se dibuja con el catálogo real y las rutas reales.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { T } from '../../../i18n/translations.js';
import { pasosVisibles, pasosDeLaSegundaEtapa, RUTA_DE_CADA_PASO } from '../../../lib/puestaEnMarcha.js';

let estadoGuia;

vi.mock('../../../i18n/LocaleContext', () => ({
  useLocale: () => ({ t: T['es-AR'], locale: 'es-AR' }),
}));
vi.mock('../../../context/PuestaEnMarchaContext', () => ({
  usePuestaEnMarchaAlDia: () => estadoGuia,
}));
vi.mock('../PropuestaDesdePlanilla', () => ({ PropuestaDesdePlanilla: () => null }));

const { GuiaPrimerosPasos } = await import('../GuiaPrimerosPasos.jsx');

const textos = T['es-AR'].guia_primeros_pasos;

function armar({ informativo = false } = {}) {
  // Primera etapa completa; en la segunda, hay Asistentes clasificados pero ningún Cliente ni
  // Coordinador: dos pasos hechos de la segunda etapa y dos pendientes.
  const configuracion = {
    completa: true,
    pasos: [
      { clave: 'datos', hecho: true },
      { clave: 'zonas', hecho: true },
      { clave: 'precios', hecho: true },
    ],
  };
  const segunda = pasosDeLaSegundaEtapa({ gente: [{ tipo_asistente_id: 'x' }], clientes: [], hayCoordinador: false });
  const pasos = pasosVisibles(configuracion, segunda);
  estadoGuia = {
    estado: 'listo',
    veLaGuia: true,
    pasos,
    faltan: pasos.filter((p) => !p.hecho),
    completos: false,
    informativo,
    recargar: () => {},
  };
}

function primeraEtapaPendiente() {
  const configuracion = {
    completa: false,
    pasos: [
      { clave: 'datos', hecho: true },
      { clave: 'zonas', hecho: false },
      { clave: 'precios', hecho: false },
    ],
  };
  const pasos = pasosVisibles(configuracion, []);
  estadoGuia = {
    estado: 'listo',
    veLaGuia: true,
    pasos,
    faltan: pasos.filter((p) => !p.hecho),
    completos: false,
    informativo: false,
    recargar: () => {},
  };
}

const dibujar = () =>
  renderToStaticMarkup(
    <StaticRouter location="/">
      <GuiaPrimerosPasos />
    </StaticRouter>,
  );

const enlaces = (html) => [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);

describe('Guía de primeros pasos', () => {
  beforeEach(() => armar());

  it('no tiene botones con texto', () => {
    const html = dibujar();
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/class="[^"]*\bbtn\b/);
  });

  it('cada paso pendiente es un enlace a su ruta, nombrado por su título y con la flecha', () => {
    const html = dibujar();
    const todos = enlaces(html);
    expect(todos).toHaveLength(2);
    for (const clave of ['cliente', 'equipo']) {
      const enlace = todos.find((a) => a.includes(`aria-labelledby="guia-paso-${clave}-titulo"`));
      expect(enlace, clave).toBeTruthy();
      expect(enlace).toContain(`href="${RUTA_DE_CADA_PASO[clave]}"`);
      expect(enlace).toContain(`aria-describedby="guia-paso-${clave}-consecuencia"`);
      expect(html).toContain(`id="guia-paso-${clave}-titulo">${textos[`paso_${clave}_titulo`]}</b>`);
      expect(html).toContain(textos[`paso_${clave}_consecuencia`]);
    }
    expect(html.match(/class="panel-fila-flecha"/g)).toHaveLength(2);
  });

  it('un paso completado no es enlace, no lleva flecha y dice Completado', () => {
    const html = dibujar();
    for (const clave of ['datos', 'zonas', 'precios', 'gente', 'tipos']) {
      expect(enlaces(html).some((a) => a.includes(`guia-paso-${clave}-titulo`)), clave).toBe(false);
    }
    expect(html.match(new RegExp(`>${textos.paso_completado}<`, 'g'))).toHaveLength(5);
  });

  it('en la primera etapa, lo pendiente también es fila tocable', () => {
    primeraEtapaPendiente();
    const html = dibujar();
    const todos = enlaces(html);
    expect(todos).toHaveLength(2);
    expect(todos.some((a) => a.includes(`href="${RUTA_DE_CADA_PASO.precios}"`))).toBe(true);
  });

  it('el Superadmin de visita ve la guía sin filas que se toquen', () => {
    armar({ informativo: true });
    const html = dibujar();
    expect(enlaces(html)).toHaveLength(0);
    expect(html).not.toMatch(/panel-fila-flecha/);
    expect(html).toContain(textos.paso_cliente_titulo);
    expect(html).toContain(textos.paso_cliente_consecuencia);
  });

  it('ya no quedan textos de botón de los pasos en ningún idioma', () => {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const claves = Object.keys(T[idioma].guia_primeros_pasos).filter((k) => /^paso_.*_cta$/.test(k));
      expect(claves, idioma).toEqual([]);
    }
  });
});
