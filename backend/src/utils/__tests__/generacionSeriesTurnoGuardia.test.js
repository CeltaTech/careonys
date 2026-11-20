/**
 * La tarea que mantiene generadas por delante los turnos de guardia de cada serie abierta: con qué
 * credencial trabaja y hasta dónde genera.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../generacionSeriesTurnoGuardia.js` recorre las Prestadoras de a una y
 * en cada una lee sus días de generación y sus series, y crea turnos de guardia. Lo que hay que sostener
 * acá es que todo lo de una Prestadora vaya con la credencial del trabajo de esa Prestadora y con
 * ninguna otra, y que el horizonte salga de lo que contesta la base para esa Prestadora.
 *
 * Con el sistema roto —una consulta con otra credencial, o la credencial de otra Prestadora— la
 * primera prueba da al revés.
 *
 * Se levanta la base de mentira igual que `estadoDeLaExtension.test.js`. Datos inventados, como
 * manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';
const SERIE = '11111111-1111-1111-1111-111111111111';

const PRESTADORAS = 'GET /rest/v1/prestadoras';
const SERIES = 'GET /rest/v1/series_turnos_guardia';
const PACIENTES_SERIE = 'GET /rest/v1/series_turnos_guardia_pacientes';
const ULTIMA = 'GET /rest/v1/turnos_guardia';
const CREAR = 'POST /rest/v1/turnos_guardia';
const ANOTAR = 'POST /rest/v1/turno_guardia_pacientes';

/**
 * Qué contesta la base a cada `MÉTODO /ruta`: un valor, o una función que recibe la llamada y
 * devuelve el valor (`undefined` es un error de la base). Cada prueba pisa lo que necesita.
 */
const respuestas = new Map();
/** Todo lo que se le pidió a la base. */
let llamadas = [];
/** Lo que quedó anotado del lado del servidor. Se junta para no ensuciar la salida. */
let anotados = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => (crudo += parte));
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const llamada = {
      clave,
      filtros: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    };
    llamadas.push(llamada);

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(llamada) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma en
// el momento en que se importa el archivo.
const { extenderLasSeriesDeUnaPrestadora, extenderSeriesTurnoGuardiaAbiertas } = await import('../generacionSeriesTurnoGuardia.js');
const { paraCadaPrestadora } = await import('../../db/connection.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  anotados = [];
});

const ZONA = 'America/Argentina/Buenos_Aires';
/** El 1 de marzo de 2026 a las 12:00 de Argentina (tres horas atrás de la hora universal). */
const MEDIODIA = new Date('2026-03-01T15:00:00Z');
/** El 1 de marzo de 2026 a las 22:30 de Argentina: en hora universal ya es el 2 de marzo. */
const NOCHE = new Date('2026-03-02T01:30:00Z');
/** El 1 de marzo de 2026 a las 06:00 de Argentina, antes de que empiece el turno de las 08:00. */
const MADRUGADA = new Date('2026-03-01T09:00:00Z');

/** La Prestadora, con `dias` de generación y una serie de todos los días sin turnos de guardia todavía. */
function prepararPrestadora(dias, { prestadora = {}, serie = {} } = {}) {
  respuestas.set(PRESTADORAS, [
    { estado: 'certificada', dias_generacion_series_turno_guardia: dias, zona_horaria: ZONA, ...prestadora },
  ]);
  respuestas.set(SERIES, serieDeTodosLosDias(serie));
  respuestas.set(PACIENTES_SERIE, []);
  respuestas.set(ULTIMA, []);
  respuestas.set(CREAR, (llamada) => llamada.cuerpo.map((_, i) => ({ id: `turno-guardia-${i}` })));
  respuestas.set(ANOTAR, []);
}

describe('la generación de las series de guardias', () => {
  it('todo lo de cada Prestadora va con la credencial del trabajo de esa Prestadora', async () => {
    prepararPrestadora(3);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.deepEqual(
      [...new Set(llamadas.map((l) => l.clave))].sort(),
      [ANOTAR, CREAR, PACIENTES_SERIE, PRESTADORAS, SERIES, ULTIMA].sort(),
    );
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
  });

  it('genera hasta los días de generación de la Prestadora', async () => {
    prepararPrestadora(5);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    const creadas = llamadas.find((l) => l.clave === CREAR).cuerpo;
    assert.deepEqual(
      creadas.map((g) => g.fecha),
      ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'],
    );
    assert.ok(creadas.every((g) => g.prestadora_id === PRESTADORA && g.serie_id === SERIE));
  });

  it('a las 22:30 de Argentina el día sigue siendo el de la Prestadora, no el de la hora universal', async () => {
    prepararPrestadora(5);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, NOCHE);

    // Con la hora universal, hoy sería el 2 y generaría del 3 al 7.
    assert.deepEqual(
      llamadas.find((l) => l.clave === CREAR).cuerpo.map((g) => g.fecha),
      ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'],
    );
  });

  it('una serie cuyo último turno de guardia es de hace dos meses genera desde hoy, nunca en el pasado', async () => {
    prepararPrestadora(3);
    respuestas.set(ULTIMA, [{ fecha: '2026-01-01' }]);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.deepEqual(
      llamadas.find((l) => l.clave === CREAR).cuerpo.map((g) => g.fecha),
      ['2026-03-02', '2026-03-03', '2026-03-04'],
    );
  });

  it('incluye hoy cuando el turno de guardia todavía no empezó en la hora de la Prestadora', async () => {
    prepararPrestadora(2);
    respuestas.set(ULTIMA, [{ fecha: '2026-01-01' }]);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MADRUGADA);

    assert.deepEqual(
      llamadas.find((l) => l.clave === CREAR).cuerpo.map((g) => g.fecha),
      ['2026-03-01', '2026-03-02', '2026-03-03'],
    );
  });

  it('no genera antes del día desde el que rige la serie', async () => {
    prepararPrestadora(5, { serie: { vigente_desde: '2026-03-04' } });

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.deepEqual(
      llamadas.find((l) => l.clave === CREAR).cuerpo.map((g) => g.fecha),
      ['2026-03-04', '2026-03-05', '2026-03-06'],
    );
  });

  it('sigue a partir del último turno de guardia cuando ya hay generados por delante', async () => {
    prepararPrestadora(5);
    respuestas.set(ULTIMA, [{ fecha: '2026-03-04' }]);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.deepEqual(
      llamadas.find((l) => l.clave === CREAR).cuerpo.map((g) => g.fecha),
      ['2026-03-05', '2026-03-06'],
    );
  });

  it('una Prestadora que no está certificada no genera nada', async () => {
    prepararPrestadora(5, { prestadora: { estado: 'en_revision' } });

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.equal(llamadas.some((l) => l.clave === CREAR), false);
  });

  it('una zona horaria que no existe no cae a la hora del servidor: no genera nada', async () => {
    prepararPrestadora(5, { prestadora: { zona_horaria: 'Zona/Inventada' } });

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, MEDIODIA);

    assert.equal(llamadas.some((l) => l.clave === CREAR), false);
    assert.ok(anotados.some((a) => a.includes('zona horaria')));
  });
});

describe('cuántas veces por día corre la generación', () => {
  const TRES = [
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000003',
  ];
  const RECORRER = 'POST /rest/v1/rpc/prestadoras_a_recorrer';

  it('con tres Prestadoras da tres vueltas, una por Prestadora, y no nueve', async () => {
    prepararPrestadora(1);
    respuestas.set(RECORRER, TRES);

    // Lo mismo que hace `programar` en server.js con `conLaPrestadora`.
    await paraCadaPrestadora('extender las series de guardias', (prestadoraId) =>
      extenderSeriesTurnoGuardiaAbiertas(prestadoraId, MEDIODIA),
    );

    const vueltas = llamadas.filter((l) => l.clave === SERIES);
    assert.equal(vueltas.length, 3);
    assert.deepEqual(vueltas.map((l) => l.credencial.prestadora_id).sort(), [...TRES].sort());
    assert.equal(llamadas.filter((l) => l.clave === RECORRER).length, 1);
  });

  it('sin Prestadora no trabaja callada: avisa que se la programó mal', async () => {
    await assert.rejects(() => extenderSeriesTurnoGuardiaAbiertas(undefined, MEDIODIA));
  });

  it('server.js la programa adentro del pasaje diario, recibiendo la Prestadora', () => {
    const servidor = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    assert.match(servidor, /programar\(pasajeDiarioDeTurnosGuardia,[^)]*conLaPrestadora: true/);
    const pasaje = readFileSync(new URL('../pasajeDiarioDeTurnosGuardia.js', import.meta.url), 'utf8');
    assert.match(pasaje, /generar = extenderSeriesTurnoGuardiaAbiertas/);
  });
});

/** Una serie abierta que trabaja todos los días de la semana. */
function serieDeTodosLosDias(cambios = {}) {
  return [
    {
      id: SERIE,
      asistente_id: null,
      paciente_id: 'paciente-1',
      dias_semana: ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'],
      hora_inicio: '08:00',
      hora_fin: '16:00',
      dias_hasta_el_fin: 0,
      modalidad: null,
      vigente_desde: '2026-01-01',
      ...cambios,
    },
  ];
}
