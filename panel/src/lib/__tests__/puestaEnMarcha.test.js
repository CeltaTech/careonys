import { describe, expect, it } from 'vitest';
import { cargaDeGenteBloqueada, pasosDeLaSegundaEtapa, pasosVisibles, RUTA_DE_CADA_PASO } from '../puestaEnMarcha';

/* La guía de primeros pasos y el apagado de los botones de alta. La configuración inicial llega
   como la contesta el backend (`GET /api/panel/cuentas/configuracion-inicial`). Datos inventados. */

const configuracion = (hechos) => {
  const pasos = ['datos', 'zonas', 'precios'].map((clave) => ({ clave, hecho: hechos.includes(clave) }));
  return { pasos, completa: pasos.every((p) => p.hecho) };
};

const SEGUNDA = pasosDeLaSegundaEtapa({ gente: [], clientes: [], hayCoordinador: false });

describe('la guía de primeros pasos', () => {
  it('con la configuración inicial incompleta muestra tres pasos: datos, zonas y precios', () => {
    const pasos = pasosVisibles(configuracion(['datos']), SEGUNDA);
    expect(pasos.map((p) => p.clave)).toEqual(['datos', 'zonas', 'precios']);
  });

  it('ya no tiene el paso de la modalidad', () => {
    const pasos = pasosVisibles(configuracion(['datos', 'zonas', 'precios']), SEGUNDA);
    expect(pasos.map((p) => p.clave)).not.toContain('modalidad');
    expect(Object.keys(RUTA_DE_CADA_PASO)).not.toContain('modalidad');
  });

  it('la etapa 2 no aparece mientras falte cualquiera de los tres', () => {
    for (const hechos of [[], ['datos'], ['datos', 'zonas'], ['zonas', 'precios'], ['datos', 'precios']]) {
      const claves = pasosVisibles(configuracion(hechos), SEGUNDA).map((p) => p.clave);
      expect(claves).not.toContain('gente');
      expect(claves).not.toContain('cliente');
    }
  });

  it('con la configuración inicial completa aparece la etapa 2, después de la primera', () => {
    const pasos = pasosVisibles(configuracion(['datos', 'zonas', 'precios']), SEGUNDA);
    expect(pasos.map((p) => p.clave)).toEqual(['datos', 'zonas', 'precios', 'gente', 'tipos', 'cliente', 'equipo']);
    expect(pasos.every((p) => typeof p.ruta === 'string')).toBe(true);
  });

  it('sin respuesta del backend no muestra nada', () => {
    expect(pasosVisibles(null, SEGUNDA)).toEqual([]);
  });

  it('la etapa 2 se deriva de lo cargado', () => {
    const vacia = pasosDeLaSegundaEtapa({ gente: [], clientes: [], hayCoordinador: false });
    expect(vacia.filter((p) => p.hecho).map((p) => p.clave)).toEqual(['tipos']);
    const llena = pasosDeLaSegundaEtapa({
      gente: [{ id: 'a', tipo_asistente_id: 't' }],
      clientes: [{ id: 'c', deleted_at: null }],
      hayCoordinador: true,
    });
    expect(llena.every((p) => p.hecho)).toBe(true);
    const sinClasificar = pasosDeLaSegundaEtapa({ gente: [{ id: 'a', tipo_asistente_id: null }] });
    expect(sinClasificar.find((p) => p.clave === 'tipos').hecho).toBe(false);
  });
});

describe('los botones que cargan Asistentes o Clientes', () => {
  it('van apagados mientras falte algo de la configuración inicial', () => {
    expect(cargaDeGenteBloqueada(configuracion([]))).toBe(true);
    expect(cargaDeGenteBloqueada(configuracion(['datos', 'zonas']))).toBe(true);
  });

  it('se encienden con la configuración inicial completa', () => {
    expect(cargaDeGenteBloqueada(configuracion(['datos', 'zonas', 'precios']))).toBe(false);
  });

  it('fallan cerrado: sin respuesta, o con una respuesta que no dice exactamente completa, van apagados', () => {
    expect(cargaDeGenteBloqueada(null)).toBe(true);
    expect(cargaDeGenteBloqueada(undefined)).toBe(true);
    expect(cargaDeGenteBloqueada({ pasos: [], completa: 'true' })).toBe(true);
  });
});
