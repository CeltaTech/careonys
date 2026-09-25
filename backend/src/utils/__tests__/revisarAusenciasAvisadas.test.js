/**
 * Que faltar avisando con tiempo y faltar de golpe no le lleguen igual a la Coordinadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El aviso de turno sin cubrir no ve esto: mira los turnos que no
 * tienen a nadie asignado, y el turno de una Asistente de licencia la sigue teniendo asignada. Si
 * este proceso se equivoca, nadie más lo tapa. Lo que tiene que garantizar:
 *
 *   1. LAS DOS CLASES SALEN COMO DOS AVISOS DISTINTOS. Una es una tarea para cuando se pueda, la
 *      otra es un turno que empieza enseguida. Con un solo aviso, apagar el ruido apagaría también
 *      la alarma.
 *   2. LA CLASE SE RECALCULA, NO SE CONGELA. Sale de una cuenta que se rehace en cada vuelta, así
 *      que corregir cuándo se supo, o el número de la Prestadora, la cambia — y entonces se vuelve
 *      a avisar, aunque ya se haya avisado recién.
 *   3. LA QUE LLEGÓ CON MARGEN NO INSISTE. Repetir cada dos horas algo que tiene tres días es el
 *      modo más rápido de que la Coordinadora deje de leer los avisos.
 *   4. LA QUE NO DEJA NINGÚN TURNO SIN NADIE NO AVISA NADA.
 *   5. CADA PRESTADORA SE MIRA CON SU PROPIO NÚMERO, y nunca con la configuración de otra. El
 *      proceso recorre de a una Prestadora por vez, así que con dos cargadas cada una tiene que
 *      recibir lo suyo y nada de la otra.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const ASISTENTE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASISTENTE_DE_LA_OTRA = '88888888-8888-8888-8888-888888888888';
const AUSENCIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AUSENCIA_DE_LA_OTRA = '77777777-7777-7777-7777-777777777777';
const GUARDIA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const GUARDIA_DE_LA_OTRA = '66666666-6666-6666-6666-666666666666';

const respuestas = new Map();
let llamadas = [];

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
    // Sin preparar, vacío: este proceso consulta media docena de tablas y la prueba sólo quiere
    // hablar de dos. Que las demás contesten vacío es lo mismo que decir «no hay nada cargado».
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : (preparada ?? []);

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// Después de las variables de entorno: la conexión se arma al importar.
const { revisarAusenciasAvisadas } = await import('../revisarAusenciasAvisadas.js');

after(() => baseFalsa.close());

/** Un momento de hoy, corrido las horas que se pidan. */
function enHoras(horas) {
  return new Date(Date.now() + horas * 60 * 60 * 1000);
}

/** La fecha de ese momento como la guarda la base, en hora local. */
function fecha(momento) {
  const corrida = new Date(momento.getTime() - momento.getTimezoneOffset() * 60000);
  return corrida.toISOString().slice(0, 10);
}

/** La hora de ese momento como la guarda la base. */
function hora(momento) {
  return `${String(momento.getHours()).padStart(2, '0')}:${String(momento.getMinutes()).padStart(2, '0')}:00`;
}

/** Lo que hay cargado en la base falsa, que el proceso recorre de a una Prestadora por vez. */
let prestadorasEnLaBase;
let ausenciasEnLaBase;
let guardiasEnLaBase;

/** De qué Prestadora es la consulta. Sin ese filtro la fila no sale: acá no hay RLS que valga. */
function prestadoraPedida(filtros) {
  return (filtros.get('prestadora_id') ?? '').replace(/^eq\./, '');
}

/** Las filas de la Prestadora que pidió la consulta, y ninguna de otra. */
function soloDeLaPrestadora(filtros, filas) {
  const prestadoraId = prestadoraPedida(filtros);
  if (!prestadoraId) return [];
  return filas.filter((fila) => fila.prestadora_id === prestadoraId);
}

/**
 * Una ausencia cuyo primer turno empieza dentro de las horas indicadas, y que se supo hace las
 * horas indicadas. Las dos cosas juntas son lo que decide la clase.
 *
 * Carga también la Prestadora: el proceso arranca por la lista de Prestadoras certificadas y
 * después entra de a una, así que una ausencia de una Prestadora que no está cargada no se mira.
 */
function escenario({
  turnoEnHoras,
  supoHaceHoras,
  prestadoraId = PRESTADORA,
  ausenciaId = AUSENCIA,
  asistenteId = ASISTENTE,
  guardiaId = GUARDIA,
  ...resto
}) {
  const inicio = enHoras(turnoEnHoras);
  if (!prestadorasEnLaBase.some((p) => p.id === prestadoraId)) prestadorasEnLaBase.push({ id: prestadoraId });
  ausenciasEnLaBase.push({
    id: ausenciaId,
    prestadora_id: prestadoraId,
    asistente_id: asistenteId,
    fecha_inicio: fecha(enHoras(-24)),
    fecha_fin: null,
    avisada_en: enHoras(-supoHaceHoras).toISOString(),
    created_at: enHoras(-supoHaceHoras).toISOString(),
    aviso_ausencia_at: null,
    aviso_ausencia_veces: 0,
    aviso_ausencia_clase: null,
    ...resto,
  });
  guardiasEnLaBase.push({
    id: guardiaId,
    prestadora_id: prestadoraId,
    asistente_id: asistenteId,
    paciente_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    fecha: fecha(inicio),
    hora_inicio: hora(inicio),
    hora_fin: '23:59:00',
    estado: 'programada',
  });
}

/** Todos los avisos que se pidieron: qué evento y para qué Prestadora. */
function avisosPedidos() {
  return llamadas
    .filter((l) => l.clave === 'GET /rest/v1/configuracion_notificaciones')
    .map((l) => ({
      evento: l.filtros.get('evento')?.replace(/^eq\./, ''),
      prestadoraId: prestadoraPedida(l.filtros),
    }));
}

/** Qué evento se pidió avisar, o `undefined` si no se avisó nada. */
function eventoAvisado() {
  return avisosPedidos()[0]?.evento;
}

/** Lo que el proceso marcó en la ausencia, o `undefined` si no marcó nada. */
function loMarcado() {
  return llamadas.find((l) => l.clave === 'PATCH /rest/v1/ausencias')?.cuerpo;
}

/** Todo lo que el proceso marcó, con el filtro con el que lo marcó. */
function loQueSeMarco() {
  return llamadas
    .filter((l) => l.clave === 'PATCH /rest/v1/ausencias')
    .map((l) => ({
      cuerpo: l.cuerpo,
      ausenciaId: (l.filtros.get('id') ?? '').replace(/^eq\./, ''),
      prestadoraId: prestadoraPedida(l.filtros),
    }));
}

/** Las consultas a una tabla, en el orden en que se hicieron. */
function consultasA(tabla) {
  return llamadas.filter((l) => l.clave === `GET /rest/v1/${tabla}`);
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  prestadorasEnLaBase = [];
  ausenciasEnLaBase = [];
  guardiasEnLaBase = [];

  respuestas.set('GET /rest/v1/prestadoras', () => prestadorasEnLaBase);
  respuestas.set('GET /rest/v1/ausencias', (filtros) => soloDeLaPrestadora(filtros, ausenciasEnLaBase));
  respuestas.set('GET /rest/v1/guardias', (filtros) => soloDeLaPrestadora(filtros, guardiasEnLaBase));
  // Apagado en la configuración de la Prestadora: el aviso no sale por ningún lado y la prueba
  // igual ve cuál se pidió. Lo que se mira acá es la decisión, no el envío.
  respuestas.set('GET /rest/v1/configuracion_notificaciones', () => [{ activo: false }]);
});

// ---------------------------------------------------------------------------------------

describe('cómo llega la falta', () => {
  it('avisada con tres días de margen sale como tarea', async () => {
    escenario({ turnoEnHoras: 72, supoHaceHoras: 0 });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), 'ausencia_avisada_con_tiempo');
    assert.equal(loMarcado().aviso_ausencia_clase, 'con_tiempo');
  });

  it('con el turno empezando en dos horas sale como alarma', async () => {
    escenario({ turnoEnHoras: 2, supoHaceHoras: 0 });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), 'ausencia_de_golpe');
    assert.equal(loMarcado().aviso_ausencia_clase, 'de_golpe');
  });

  it('la que no deja ningún turno sin nadie no avisa nada', async () => {
    escenario({ turnoEnHoras: 2, supoHaceHoras: 0 });
    guardiasEnLaBase = [];
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), undefined, 'avisó por una ausencia que no deja ningún hueco');
    assert.equal(loMarcado(), undefined);
  });

  it('el turno que ya pasó hace días no se avisa: taparlo ya no sirve de nada', async () => {
    escenario({ turnoEnHoras: -72, supoHaceHoras: 96 });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), undefined);
  });
});

describe('cuándo se vuelve a avisar', () => {
  it('la que llegó con margen se dice una sola vez', async () => {
    escenario({
      turnoEnHoras: 72,
      supoHaceHoras: 0,
      aviso_ausencia_at: enHoras(-12).toISOString(),
      aviso_ausencia_veces: 1,
      aviso_ausencia_clase: 'con_tiempo',
    });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), undefined, 'repitió una tarea que no cambió');
  });

  it('si se corrige cuándo se supo, avisa de nuevo aunque ya se haya avisado recién', async () => {
    // Entró como tarea porque nadie había cargado cuándo avisaron, y después la Coordinadora
    // corrigió: avisaron hace un rato, no hace días. Callarla porque «ya se avisó» dejaría el
    // turno de esta tarde tratado como algo que puede esperar.
    escenario({
      turnoEnHoras: 1,
      supoHaceHoras: 1,
      aviso_ausencia_at: new Date().toISOString(),
      aviso_ausencia_veces: 1,
      aviso_ausencia_clase: 'con_tiempo',
    });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), 'ausencia_de_golpe');
    assert.equal(loMarcado().aviso_ausencia_veces, 2);
  });

  it('la urgente no se repite antes de que pase el intervalo', async () => {
    escenario({
      turnoEnHoras: 2,
      supoHaceHoras: 1,
      aviso_ausencia_at: enHoras(-0.5).toISOString(),
      aviso_ausencia_veces: 1,
      aviso_ausencia_clase: 'de_golpe',
    });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), undefined);
  });

  it('la urgente vuelve a avisar pasado el intervalo', async () => {
    escenario({
      turnoEnHoras: 2,
      supoHaceHoras: 5,
      aviso_ausencia_at: enHoras(-5).toISOString(),
      aviso_ausencia_veces: 3,
      aviso_ausencia_clase: 'de_golpe',
    });
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), 'ausencia_de_golpe');
    assert.equal(loMarcado().aviso_ausencia_veces, 4);
  });
});

describe('cada Prestadora con lo suyo', () => {
  it('pregunta la configuración de la Prestadora de la ausencia, no de cualquiera', async () => {
    escenario({ turnoEnHoras: 2, supoHaceHoras: 0, prestadoraId: OTRA_PRESTADORA });
    await revisarAusenciasAvisadas();
    const pregunta = llamadas.find((l) => l.clave === 'GET /rest/v1/configuracion_ausencias');
    assert.equal(pregunta.filtros.get('prestadora_id'), `eq.${OTRA_PRESTADORA}`);
  });

  it('busca las guardias de esa Prestadora y sólo de los que faltan', async () => {
    escenario({ turnoEnHoras: 2, supoHaceHoras: 0 });
    await revisarAusenciasAvisadas();
    const pregunta = llamadas.find((l) => l.clave === 'GET /rest/v1/guardias');
    assert.equal(pregunta.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.match(pregunta.filtros.get('asistente_id') ?? '', new RegExp(ASISTENTE));
  });

  it('con otro número configurado, la misma falta cambia de clase', async () => {
    // El mismo turno a tres días: de fábrica es una tarea; para una Prestadora que quiere
    // enterarse con una semana de anticipación, es urgente.
    escenario({ turnoEnHoras: 72, supoHaceHoras: 0 });
    respuestas.set('GET /rest/v1/configuracion_ausencias', () => [
      { regla: { horas_para_considerarla_con_tiempo: 168 } },
    ]);
    await revisarAusenciasAvisadas();
    assert.equal(eventoAvisado(), 'ausencia_de_golpe');
  });

  it('con dos Prestadoras cargadas, cada una recibe lo suyo y nada de la otra', async () => {
    // Una falta que se puede acomodar en tres días y otra que deja sin nadie el turno de dentro de
    // dos horas. Son de Prestadoras distintas: si el proceso las mezclara, una Coordinadora vería
    // el turno de la otra empresa.
    escenario({ turnoEnHoras: 72, supoHaceHoras: 0 });
    escenario({
      turnoEnHoras: 2,
      supoHaceHoras: 0,
      prestadoraId: OTRA_PRESTADORA,
      ausenciaId: AUSENCIA_DE_LA_OTRA,
      asistenteId: ASISTENTE_DE_LA_OTRA,
      guardiaId: GUARDIA_DE_LA_OTRA,
    });

    await revisarAusenciasAvisadas();

    // Dos avisos, uno por Prestadora, y cada uno con la clase que le corresponde a su falta.
    assert.deepEqual(
      [...avisosPedidos()].sort((a, b) => a.prestadoraId.localeCompare(b.prestadoraId)),
      [
        { evento: 'ausencia_avisada_con_tiempo', prestadoraId: PRESTADORA },
        { evento: 'ausencia_de_golpe', prestadoraId: OTRA_PRESTADORA },
      ].sort((a, b) => a.prestadoraId.localeCompare(b.prestadoraId))
    );

    // Y cada marca quedó en la ausencia de su Prestadora, con el filtro de esa Prestadora puesto.
    const marcas = loQueSeMarco();
    assert.equal(marcas.length, 2);
    const dePrestadora = marcas.find((m) => m.prestadoraId === PRESTADORA);
    const deLaOtra = marcas.find((m) => m.prestadoraId === OTRA_PRESTADORA);
    assert.equal(dePrestadora.ausenciaId, AUSENCIA);
    assert.equal(dePrestadora.cuerpo.aviso_ausencia_clase, 'con_tiempo');
    assert.equal(deLaOtra.ausenciaId, AUSENCIA_DE_LA_OTRA);
    assert.equal(deLaOtra.cuerpo.aviso_ausencia_clase, 'de_golpe');

    // Se entró de a una: cada vuelta preguntó por su Prestadora, nunca por las dos juntas.
    assert.deepEqual(
      consultasA('ausencias').map((l) => prestadoraPedida(l.filtros)).sort(),
      [PRESTADORA, OTRA_PRESTADORA].sort()
    );

    // Y los turnos de cada una se buscaron sólo con los ausentes de esa Prestadora.
    for (const consulta of consultasA('guardias')) {
      const asistentes = consulta.filtros.get('asistente_id') ?? '';
      const propio = prestadoraPedida(consulta.filtros) === PRESTADORA ? ASISTENTE : ASISTENTE_DE_LA_OTRA;
      const ajeno = propio === ASISTENTE ? ASISTENTE_DE_LA_OTRA : ASISTENTE;
      assert.match(asistentes, new RegExp(propio));
      assert.doesNotMatch(asistentes, new RegExp(ajeno));
    }
  });
});
