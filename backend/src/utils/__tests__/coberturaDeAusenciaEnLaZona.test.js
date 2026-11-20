/**
 * Que el trabajo programado de las coberturas cuente «hoy» con el reloj de la Prestadora y no con
 * el del servidor.
 *
 *   npm test --prefix backend
 *
 * El servidor corre en hora universal. Una Prestadora de Buenos Aires está tres horas atrás: entre
 * las 21 y las 24 de allá, para el servidor ya es el día siguiente. Contado así, el turno de esa
 * noche quedaba afuera de la cobertura y la vuelta anotada para mañana se daba por cumplida hoy.
 *
 * Lo que tiene que garantizar:
 *
 *   1. A LAS 22:30 DE BUENOS AIRES SE CUBRE DESDE ESE DÍA, no desde el siguiente.
 *   2. LA VUELTA ANOTADA PARA MAÑANA NO DEVUELVE HOY LOS TURNOS AL TITULAR.
 *   3. SIN ZONA HORARIA LA PRESTADORA NO SE PROCESA.
 */
process.env.TZ = 'UTC';

const { strict: assert } = await import('node:assert');
const { after, afterEach, beforeEach, describe, it, mock } = await import('node:test');
const { createServer } = await import('node:http');
const { prepararCredencialDePrueba } = await import('../../__tests__/credencialDePrueba.js');

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TITULAR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COBERTURA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

// Las 22:30 del 1 de marzo en Buenos Aires: para el servidor ya es 2 de marzo.
const AHORA = Date.parse('2026-03-02T01:30:00Z');

const respuestas = new Map();
let llamadas = [];
let zonaCargada;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });
    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : (preparada ?? []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { extenderCoberturasDeAusencia } = await import('../coberturaDeAusencia.js');

after(() => baseFalsa.close());

/** La Prestadora certificada, y su zona cuando se la piden sola: esa consulta espera una fila. */
function prestadoraCargada(filtros) {
  if (filtros.get('select') === 'zona_horaria') return { zona_horaria: zonaCargada };
  return [{ id: PRESTADORA }];
}

/** Una cobertura aceptada de una ausencia con las fechas que se pidan. */
function coberturaDe(ausencia) {
  return [{
    id: COBERTURA,
    prestadora_id: PRESTADORA,
    serie_id: 'serie-1',
    asistente_sustituto_id: 'sustituto-1',
    ausencias: { id: 'ausencia-1', asistente_id: TITULAR, fecha_vuelta_real: null, ...ausencia },
  }];
}

/** La consulta de los turnos de guardia del titular que se van a cubrir. */
function lecturaDeLosTurnosACubrir() {
  return llamadas.find((l) => l.clave === 'GET /rest/v1/turnos_guardia' && l.filtros.get('serie_id'));
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  zonaCargada = BUENOS_AIRES;
  respuestas.set('GET /rest/v1/prestadoras', prestadoraCargada);
  // Sólo el reloj: los temporizadores siguen siendo los de verdad, y la base falsa contesta.
  mock.timers.enable({ apis: ['Date'], now: AHORA });
});

afterEach(() => mock.timers.reset());

describe('el día del trabajo programado es el de la Prestadora', () => {
  it('a las 22:30 de Buenos Aires cubre desde ese mismo día', async () => {
    respuestas.set('GET /rest/v1/coberturas_de_ausencia', coberturaDe({ fecha_inicio: '2026-02-25', fecha_fin: '2026-03-05' }));

    await extenderCoberturasDeAusencia(PRESTADORA);

    const lectura = lecturaDeLosTurnosACubrir();
    assert.ok(lectura, 'no llegó a leer los turnos a cubrir');
    assert.equal(lectura.filtros.get('fecha'), 'gte.2026-03-01', 'el turno de esta noche quedó afuera de la cobertura');
  });

  it('la vuelta anotada para mañana no devuelve hoy los turnos al titular', async () => {
    respuestas.set('GET /rest/v1/coberturas_de_ausencia', coberturaDe({
      fecha_inicio: '2026-02-25',
      fecha_fin: '2026-03-05',
      fecha_vuelta_real: '2026-03-02',
    }));

    await extenderCoberturasDeAusencia(PRESTADORA);

    const lectura = lecturaDeLosTurnosACubrir();
    assert.ok(lectura, 'dio la ausencia por terminada un día antes');
    assert.equal(lectura.filtros.getAll('fecha')[0], 'gte.2026-03-01');
  });

  it('sin zona horaria la Prestadora no se procesa', async () => {
    zonaCargada = null;
    respuestas.set('GET /rest/v1/coberturas_de_ausencia', coberturaDe({ fecha_inicio: '2026-02-25', fecha_fin: '2026-03-05' }));

    await assert.rejects(extenderCoberturasDeAusencia(PRESTADORA));

    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/coberturas_de_ausencia').length, 0);
  });
});
