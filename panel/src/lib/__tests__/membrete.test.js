/**
 * El membrete de los documentos: dónde queda el logo, sin deformarse, y dónde empieza el texto.
 *
 *   npx vitest run src/lib/__tests__/membrete.test.js
 *
 * Qué daría con el sistema roto: un logo estirado a la medida del recuadro, un documento sin logo
 * que se corre de lugar, o un texto que arranca encima del logo.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../apiPanel', () => ({ llamadorDe: () => vi.fn() }));
const { dibujarMembrete, tamanoDelLogo } = await import('../membrete');

function documentoDeMentira() {
  return {
    dibujos: [],
    textos: [],
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setDrawColor: vi.fn(),
    line: vi.fn(),
    text(texto, x, y) { this.textos.push({ texto, x, y }); },
    addImage(datos, formato, x, y, ancho, alto) { this.dibujos.push({ formato, x, y, ancho, alto }); },
  };
}

describe('tamanoDelLogo', () => {
  it('un logo ancho lo ataja el ancho, sin deformarse', () => {
    const { ancho, alto } = tamanoDelLogo(1000, 100);
    expect(ancho).toBeCloseTo(50);
    expect(alto).toBeCloseTo(5);
  });
  it('un logo alto lo ataja el alto, sin deformarse', () => {
    const { ancho, alto } = tamanoDelLogo(200, 400);
    expect(alto).toBeCloseTo(16);
    expect(ancho).toBeCloseTo(8);
  });
  it('sin medidas no hay logo', () => {
    expect(tamanoDelLogo(0, 0)).toBeNull();
  });
});

describe('dibujarMembrete', () => {
  it('sin logo escribe el nombre y el título donde siempre', () => {
    const doc = documentoDeMentira();
    const y = dibujarMembrete(doc, { logo: null }, { nombre: 'Cuidar del Sur', titulo: 'Constancia' });
    expect(doc.dibujos).toEqual([]);
    expect(doc.textos).toEqual([
      { texto: 'CUIDAR DEL SUR', x: 20, y: 20 },
      { texto: 'Constancia', x: 20, y: 28 },
    ]);
    expect(y).toBe(42);
  });

  it('con logo lo dibuja arriba a la izquierda, el nombre al lado y el texto debajo', () => {
    const doc = documentoDeMentira();
    const y = dibujarMembrete(doc, { logo: { datos: 'data:', formato: 'PNG', ancho: 200, alto: 400 } }, { nombre: 'Cuidar del Sur', titulo: 'Constancia' });
    expect(doc.dibujos).toHaveLength(1);
    const logo = doc.dibujos[0];
    expect(logo.x).toBe(20);
    expect(logo.alto).toBeCloseTo(16);
    expect(doc.textos[0].x).toBeGreaterThan(logo.x + logo.ancho);
    expect(doc.textos[1].y).toBeGreaterThan(logo.y + logo.alto);
    expect(y).toBeGreaterThan(doc.textos[1].y);
  });
});
