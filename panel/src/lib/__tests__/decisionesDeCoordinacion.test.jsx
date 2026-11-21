// Las decisiones del Coordinador y el veto: qué se le pide al backend, cómo se nombra cada decisión
// y qué ve cada uno en pantalla.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si una clase que la base anota se queda sin nombre
// en algún idioma, falla la de los nombres; si el veto dejara de mandar el motivo, falla la de los
// pedidos; y si la página del Coordinador dejara de mostrar el motivo, falla la de la página.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { T } from '../../i18n/translations.js';

const pedidos = [];
vi.mock('../apiPanel', () => ({
  llamarApiPanel: (path, opciones) => {
    pedidos.push({ path, opciones });
    return Promise.resolve({ decisiones: [{ id: 'd-1' }], vetadas: [{ id: 'd-2' }], ok: true });
  },
}));

let contexto;
vi.mock('../../i18n/LocaleContext', () => ({
  useLocale: () => ({ t: T['es-AR'], locale: 'es-AR' }),
}));
vi.mock('../../context/VetosSinVerContext', () => ({
  useVetosSinVer: () => contexto,
}));

const lib = await import('../decisionesDeCoordinacion.js');
const { textoDelCambio } = await import('../../pages/servicios/DecisionesDelServicio.jsx');
const { DecisionesVetadas } = await import('../../pages/DecisionesVetadas.jsx');

// Las clases que anota la base (la restricción de la tabla de decisiones).
const CLASES = ['cobertura', 'asignacion', 'interrupcion', 'turno_guardia_recurrente', 'equipo', 'tareas', 'prestacion', 'servicio', 'turno_guardia'];
// Los motivos con los que la base y el backend rechazan un veto.
const MOTIVOS = ['sin_permiso', 'dato_invalido', 'decision_inexistente', 'decision_ya_vetada', 'decision_cambiada_despues', 'falta_el_motivo'];

describe('Las decisiones del Coordinador', () => {
  beforeEach(() => { pedidos.length = 0; });

  it('cada clase que anota la base tiene nombre en los tres idiomas, y una nueva cae a la genérica', () => {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const t = T[idioma];
      for (const clase of CLASES) {
        expect(t.decisiones[`clase_${clase}`], `${idioma} ${clase}`).toBeTruthy();
        expect(lib.nombreDeLaClase(clase, t)).toBe(t.decisiones[`clase_${clase}`]);
      }
      expect(lib.nombreDeLaClase('una_clase_nueva', t)).toBe(t.decisiones.clase_otra);
    }
  });

  it('cada motivo de rechazo del veto tiene su frase en los tres idiomas', () => {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      for (const motivo of MOTIVOS) {
        const frase = T[idioma].errores.motivos[motivo] ?? T[idioma].errores[motivo];
        expect(frase, `${idioma} ${motivo}`).toBeTruthy();
      }
    }
  });

  it('pide al backend lo que corresponde, y el veto lleva el motivo', async () => {
    expect(await lib.decisionesDelServicio('s-1')).toEqual([{ id: 'd-1' }]);
    await lib.vetarDecision('d-1', 'El horario es el pactado');
    expect(await lib.vetosSinVer()).toEqual([{ id: 'd-2' }]);
    await lib.marcarVetoVisto('d-2');
    expect(pedidos.map((p) => [p.path, p.opciones?.method ?? 'GET'])).toEqual([
      ['/decisiones/servicio/s-1', 'GET'],
      ['/decisiones/d-1/vetar', 'POST'],
      ['/decisiones/vetadas-sin-ver', 'GET'],
      ['/decisiones/d-2/visto', 'PATCH'],
    ]);
    expect(JSON.parse(pedidos[1].opciones.body)).toEqual({ motivo: 'El horario es el pactado' });
  });

  it('el renglón de un cambio dice la operación, el día, el horario y el Asistente de antes y de después', () => {
    const d = T['es-AR'].decisiones;
    const texto = textoDelCambio({
      operacion: 'cambio', fecha: '2027-04-10', hora_inicio: '08:00:00', hora_fin: '16:00:00',
      asistente_antes: 'a-1', asistente_antes_nombre: 'Ana Inventada',
      asistente_despues: null, asistente_despues_nombre: null,
    }, d, 'es-AR');
    expect(texto).toBe(`${d.operacion_cambio} · 10/4/2027 · 08:00–16:00 · Ana Inventada → ${d.sin_asistente}`);
    expect(textoDelCambio({ operacion: 'alta' }, d, 'es-AR')).toBe(d.operacion_alta);
  });
});

describe('La página de decisiones vetadas del Coordinador', () => {
  const dibujar = () => renderToStaticMarkup(
    <StaticRouter location="/decisiones-vetadas"><DecisionesVetadas /></StaticRouter>,
  );

  it('muestra el Servicio, la decisión y el motivo del veto', () => {
    contexto = {
      estado: 'listo', error: null, recargar: () => {}, marcarVista: () => {},
      vetadas: [{ id: 'd-2', clase: 'asignacion', servicio_id: 's-1', servicio_etiqueta: 'Cuidado nocturno', decidida_at: '2027-04-10T12:00:00Z', vetada_at: '2027-04-11T12:00:00Z', motivo_del_veto: 'El horario es el pactado' }],
    };
    const html = dibujar();
    expect(html).toContain('Cuidado nocturno');
    expect(html).toContain('href="/servicios/s-1"');
    expect(html).toContain(T['es-AR'].decisiones.clase_asignacion);
    expect(html).toContain('El horario es el pactado');
    expect(html).toContain(T['es-AR'].decisiones.marcar_visto);
  });

  it('sin decisiones vetadas, dice que no hay', () => {
    contexto = { estado: 'listo', error: null, recargar: () => {}, marcarVista: () => {}, vetadas: [] };
    expect(dibujar()).toContain(T['es-AR'].decisiones.sin_vetadas);
  });
});
