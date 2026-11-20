/**
 * Que el aviso de ausencias cuente los días y las horas con el reloj de la Prestadora y no con el
 * del servidor.
 *
 *   npm test --prefix backend
 *
 * El servidor corre en hora universal. Una Prestadora de Buenos Aires está tres horas atrás: el
 * turno de las 00:30 de allá se leía como de las 21:30 del día anterior, y entre las 21 y las 24
 * de allá el servidor ya cuenta el día siguiente.
 *
 * Lo que tiene que garantizar:
 *
 *   1. EL TURNO QUE EMPEZÓ HACE 22 HORAS TODAVÍA SE AVISA. Contado con el reloj del servidor
 *      parecía de hace 25 y quedaba afuera del día en que taparlo sirve.
 *   2. EL ÚLTIMO DÍA DE LA AUSENCIA NO SE PREGUNTA POR LA VUELTA. A las 22:30 de Buenos Aires
 *      todavía es ese día.
 *   3. SIN ZONA HORARIA LA PRESTADORA NO SE REVISA, y la otra sí.
 */
process.env.TZ = 'UTC';

const { strict: assert } = await import('node:assert');
const { after, afterEach, beforeEach, describe, it, mock } = await import('node:test');
const { createServer } = await import('node:http');
const { prepararCredencialDePrueba } = await import('../../__tests__/credencialDePrueba.js');

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const ASISTENTE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AUSENCIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TURNO_GUARDIA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

// Las 22:30 del 1 de marzo en Buenos Aires: para el servidor ya es 2 de marzo.
const AHORA = Date.parse('2026-03-02T01:30:00Z');

const respuestas = new Map();
let llamadas = [];
let prestadorasEnLaBase;
let ausenciasEnLaBase;
let turnosGuardiaEnLaBase;

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
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { adentro } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const revisarAusenciasAvisadas = adentro((await import('../revisarAusenciasAvisadas.js')).revisarAusenciasAvisadas);

after(() => baseFalsa.close());

/** De qué Prestadora es la consulta. Sin ese filtro la fila no sale. */
function prestadoraPedida(filtros) {
  return (filtros.get('prestadora_id') ?? '').replace(/^eq\./, '');
}

function soloDeLaPrestadora(filtros, filas) {
  const prestadoraId = prestadoraPedida(filtros);
  if (!prestadoraId) return [];
  return filas.filter((fila) => fila.prestadora_id === prestadoraId);
}

/** Una ausencia de un Asistente, sin vuelta anotada, que se supo hace 48 horas. */
function ausencia(prestadoraId, datos) {
  return {
    id: `${AUSENCIA}-${prestadoraId}`,
    prestadora_id: prestadoraId,
    asistente_id: ASISTENTE,
    usuario_id: null,
    fecha_inicio: '2026-02-27',
    fecha_fin: null,
    fecha_vuelta_real: null,
    avisada_en: '2026-02-28T01:30:00Z',
    created_at: '2026-02-28T01:30:00Z',
    aviso_ausencia_at: null,
    aviso_ausencia_veces: 0,
    aviso_ausencia_clase: null,
    pregunta_vuelta_at: null,
    pregunta_vuelta_veces: 0,
    ...datos,
  };
}

/** El turno de las 00:30 del 1 de marzo en Buenos Aires: empezó hace 22 horas. */
function turnoDeLaMadrugada(prestadoraId) {
  return {
    id: `${TURNO_GUARDIA}-${prestadoraId}`,
    prestadora_id: prestadoraId,
    asistente_id: ASISTENTE,
    paciente_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    fecha: '2026-03-01',
    hora_inicio: '00:30:00',
    hora_fin: '08:00:00',
    estado: 'programada',
  };
}

/** Qué eventos se pidió avisar, y para qué Prestadora. */
function mensajesPedidos() {
  return llamadas
    .filter((l) => l.clave === 'GET /rest/v1/configuracion_notificaciones')
    .map((l) => ({ evento: l.filtros.get('evento')?.replace(/^eq\./, ''), prestadoraId: prestadoraPedida(l.filtros) }));
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  prestadorasEnLaBase = [{ id: PRESTADORA, zona_horaria: BUENOS_AIRES }];
  ausenciasEnLaBase = [];
  turnosGuardiaEnLaBase = [];
  respuestas.set('GET /rest/v1/prestadoras', () => prestadorasEnLaBase);
  respuestas.set('GET /rest/v1/ausencias', (filtros) => soloDeLaPrestadora(filtros, ausenciasEnLaBase));
  respuestas.set('GET /rest/v1/turnos_guardia', (filtros) => soloDeLaPrestadora(filtros, turnosGuardiaEnLaBase));
  // Apagado: el mensaje no sale por ningún lado y la prueba igual ve cuál se pidió.
  respuestas.set('GET /rest/v1/configuracion_notificaciones', () => [{ activo: false }]);
  // Sólo el reloj: los temporizadores siguen siendo los de verdad, y la base falsa contesta.
  mock.timers.enable({ apis: ['Date'], now: AHORA });
});

afterEach(() => mock.timers.reset());

describe('los días y las horas son los de la Prestadora', () => {
  it('el turno que empezó hace 22 horas todavía se avisa', async () => {
    ausenciasEnLaBase.push(ausencia(PRESTADORA));
    turnosGuardiaEnLaBase.push(turnoDeLaMadrugada(PRESTADORA));

    await revisarAusenciasAvisadas();

    const avisos = mensajesPedidos().filter((m) => m.evento.startsWith('ausencia_'));
    assert.equal(avisos.length, 1, 'el turno de la madrugada se dio por pasado hace más de un día');
  });

  it('el último día de la ausencia no se pregunta por la vuelta', async () => {
    ausenciasEnLaBase.push(ausencia(PRESTADORA, { fecha_fin: '2026-03-01' }));

    await revisarAusenciasAvisadas();

    const preguntas = mensajesPedidos().filter((m) => m.evento === 'vuelta_de_ausencia_sin_confirmar');
    assert.equal(preguntas.length, 0, 'preguntó por la vuelta el mismo día en que la ausencia termina');
  });

  it('el día siguiente al último sí se pregunta por la vuelta', async () => {
    ausenciasEnLaBase.push(ausencia(PRESTADORA, { fecha_fin: '2026-02-28' }));

    await revisarAusenciasAvisadas();

    const preguntas = mensajesPedidos().filter((m) => m.evento === 'vuelta_de_ausencia_sin_confirmar');
    assert.equal(preguntas.length, 1);
  });

  it('sin zona horaria la Prestadora no se revisa, y la otra sí', async () => {
    prestadorasEnLaBase = [
      { id: OTRA_PRESTADORA, zona_horaria: null },
      { id: PRESTADORA, zona_horaria: BUENOS_AIRES },
    ];
    ausenciasEnLaBase.push(ausencia(PRESTADORA), ausencia(OTRA_PRESTADORA));
    turnosGuardiaEnLaBase.push(turnoDeLaMadrugada(PRESTADORA), turnoDeLaMadrugada(OTRA_PRESTADORA));

    await revisarAusenciasAvisadas();

    const consultadas = llamadas.filter((l) => l.clave === 'GET /rest/v1/ausencias').map((l) => prestadoraPedida(l.filtros));
    assert.deepEqual(consultadas, [PRESTADORA], 'revisó la Prestadora sin zona horaria');
  });
});
