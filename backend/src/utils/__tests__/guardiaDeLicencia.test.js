/**
 * Durante su licencia, el Asistente no tiene guardias.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/guardiaDeLicencia.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Lo que decide esta función es qué guardias desaparecen de la
 * aplicación del Asistente, cuáles no puede abrir y cuáles no le mandan recordatorio. Si contesta
 * de más, deja a alguien sin su trabajo; si contesta de menos, le ofrece una guardia que ya está
 * del lado del Coordinador para cubrir.
 *
 * La base es de mentira y contesta por HTTP como la de verdad, así que además de mirar el
 * resultado se mira **qué se le pidió**: la consulta de ausencias no puede traer la columna
 * `tipo`, porque por qué alguien está de licencia es información de salud y no sale del legajo
 * (CLAUDE.md §6).
 *
 * Con el sistema roto —sin la comprobación, o leyendo la licencia sin mirar el día— las pruebas
 * de «la licencia que la tapa» y «la que ya terminó» dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const ASISTENTE = '22222222-2222-2222-2222-222222222222';
const OTRO_ASISTENTE = '33333333-3333-3333-3333-333333333333';

/** Lo que la base contesta, si contesta con error, y lo que se le preguntó. */
let ausencias = [];
let falla = false;
let pedidos = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    pedidos.push({
      ruta: url.pathname,
      parametros: url.searchParams,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });

    if (falla) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'falla de prueba' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(url.pathname === '/rest/v1/ausencias' ? ausencias : []));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { guardiasEnLicencia } = await import('../guardiaDeLicencia.js');

/** Turno de mañana del martes, todavía sin empezar. */
const GUARDIA = {
  id: 'g-1',
  asistente_id: ASISTENTE,
  fecha: '2026-10-06',
  hora_inicio: '08:00',
  hora_fin: '16:00',
  dias_hasta_el_fin: 0,
  estado: 'programada',
  checkin_at: null,
};

/** El mismo turno pero de noche: arranca el martes a las 22:00 y termina el miércoles a las 06:00. */
const GUARDIA_DE_NOCHE = { ...GUARDIA, id: 'g-2', hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 };

const licencia = (fecha_inicio, fecha_fin = null, asistente_id = ASISTENTE) => ({ asistente_id, fecha_inicio, fecha_fin });

/** Los `id` que la función esconde, ordenados para comparar. */
const escondidas = async (guardias) => [...(await guardiasEnLicencia(PRESTADORA, guardias))].sort();

describe('guardiasEnLicencia', () => {
  beforeEach(() => {
    ausencias = [];
    falla = false;
    pedidos = [];
  });

  after(() => baseFalsa.close());

  it('sin ninguna licencia registrada, no esconde nada', async () => {
    assert.deepEqual(await escondidas([GUARDIA]), []);
  });

  it('esconde la guardia que cae en la licencia', async () => {
    ausencias = [licencia('2026-10-05', '2026-10-09')];
    assert.deepEqual(await escondidas([GUARDIA]), ['g-1']);
  });

  it('una licencia que terminó antes de la guardia no la esconde', async () => {
    ausencias = [licencia('2026-09-28', '2026-10-02')];
    assert.deepEqual(await escondidas([GUARDIA]), []);
  });

  it('cuando el Coordinador anota la vuelta, la guardia reaparece', async () => {
    // Anotar la vuelta el martes deja como último día de licencia el lunes.
    ausencias = [licencia('2026-10-01', '2026-10-05')];
    assert.deepEqual(await escondidas([GUARDIA]), []);
  });

  it('una licencia sin fecha de vuelta sigue abierta y la esconde', async () => {
    ausencias = [licencia('2026-10-01')];
    assert.deepEqual(await escondidas([GUARDIA]), ['g-1']);
  });

  it('la licencia que empieza al día siguiente parte al medio la guardia de noche', async () => {
    // Arranca el miércoles, y la de noche termina el miércoles a las 06:00. Mirar sólo el día en
    // que empieza la guardia dejaría pasar justo el turno más común del rubro.
    ausencias = [licencia('2026-10-07', '2026-10-10')];
    assert.deepEqual(await escondidas([GUARDIA, GUARDIA_DE_NOCHE]), ['g-2']);
  });

  it('una guardia que ya empezó no se esconde', async () => {
    ausencias = [licencia('2026-10-05', '2026-10-09')];
    assert.deepEqual(await escondidas([{ ...GUARDIA, estado: 'activa', checkin_at: '2026-10-06T08:02:00Z' }]), []);
  });

  it('la licencia de otro Asistente no esconde las guardias de éste', async () => {
    ausencias = [licencia('2026-10-05', '2026-10-09', OTRO_ASISTENTE)];
    assert.deepEqual(await escondidas([GUARDIA]), []);
  });

  it('si no se pudieron leer las licencias, las guardias se muestran', async () => {
    ausencias = [licencia('2026-10-05', '2026-10-09')];
    falla = true;
    const original = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await escondidas([GUARDIA]), []);
    } finally {
      console.error = original;
    }
  });

  it('la consulta no pide el tipo de licencia', async () => {
    await escondidas([GUARDIA]);

    const columnas = pedidos[0].parametros.get('select').split(',');
    assert.deepEqual(columnas.sort(), ['asistente_id', 'fecha_fin', 'fecha_inicio']);
  });

  it('la consulta va acotada a la Prestadora y con la credencial de su trabajo', async () => {
    await escondidas([GUARDIA]);

    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].parametros.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(pedidos[0].credencial?.role, 'trabajo_sin_persona');
    assert.equal(pedidos[0].credencial.prestadora_id, PRESTADORA);
  });

  it('sin Prestadora, o sin guardias por empezar, no consulta nada', async () => {
    assert.equal((await guardiasEnLicencia(null, [GUARDIA])).size, 0);
    assert.equal((await guardiasEnLicencia(PRESTADORA, [])).size, 0);
    assert.equal((await guardiasEnLicencia(PRESTADORA, [{ ...GUARDIA, estado: 'finalizada' }])).size, 0);
    assert.equal(pedidos.length, 0);
  });
});
