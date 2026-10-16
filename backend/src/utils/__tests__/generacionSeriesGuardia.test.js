/**
 * La tarea que mantiene generadas por delante las guardias de cada serie abierta: con qué
 * credencial trabaja y hasta dónde genera.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../generacionSeriesGuardia.js` recorre las Prestadoras de a una y
 * en cada una lee sus días de generación y sus series, y crea guardias. Lo que hay que sostener
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
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';
const SERIE = '11111111-1111-1111-1111-111111111111';

const PRESTADORAS = 'GET /rest/v1/prestadoras';
const SERIES = 'GET /rest/v1/series_guardias';
const PACIENTES_SERIE = 'GET /rest/v1/series_guardias_pacientes';
const ULTIMA = 'GET /rest/v1/guardias';
const CREAR = 'POST /rest/v1/guardias';
const ANOTAR = 'POST /rest/v1/guardia_pacientes';

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
const { extenderLasSeriesDeUnaPrestadora } = await import('../generacionSeriesGuardia.js');

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

const HOY = '2026-03-01';

/** La Prestadora, con `dias` de generación y una serie de todos los días sin guardias todavía. */
function prepararPrestadora(dias) {
  respuestas.set(PRESTADORAS, [{ dias_generacion_series_guardia: dias }]);
  respuestas.set(SERIES, serieDeTodosLosDias());
  respuestas.set(PACIENTES_SERIE, []);
  respuestas.set(ULTIMA, []);
  respuestas.set(CREAR, (llamada) => llamada.cuerpo.map((_, i) => ({ id: `guardia-${i}` })));
  respuestas.set(ANOTAR, []);
}

describe('la generación de las series de guardias', () => {
  it('todo lo de cada Prestadora va con la credencial del trabajo de esa Prestadora', async () => {
    prepararPrestadora(3);

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, HOY);

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

    await extenderLasSeriesDeUnaPrestadora(PRESTADORA, HOY);

    const creadas = llamadas.find((l) => l.clave === CREAR).cuerpo;
    assert.deepEqual(
      creadas.map((g) => g.fecha),
      ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'],
    );
    assert.ok(creadas.every((g) => g.prestadora_id === PRESTADORA && g.serie_id === SERIE));
  });
});

/** Una serie abierta que trabaja todos los días de la semana. */
function serieDeTodosLosDias() {
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
    },
  ];
}
