/**
 * Las consultas por un relevo: lo que ve el Asistente consultado y cómo contesta.
 *
 *   npm test --prefix backend
 *
 * QUÉ PROTEGEN ESTOS CASOS:
 *
 *   1. QUE CONTESTE POR OTRO. Cada uno ve y contesta las suyas; la ajena no existe para él.
 *   2. QUE CONTESTE DOS VECES, O SOBRE UN PEDIDO YA CERRADO.
 *   3. QUE LOS MINUTOS DEL GPS LOS ESCRIBA LA PERSONA. Si pudiera, la comparación con lo que dice
 *      no compararía nada: los escribe el trabajo de la Prestadora.
 *   4. QUE SE USE LA UBICACIÓN SIN CONSENTIMIENTO VIGENTE, O QUE SE GUARDE EL PUNTO.
 *   5. QUE UNA FALLA DEL CÁLCULO SE LLEVE LA RESPUESTA.
 *   6. QUE AL CONSULTADO LE LLEGUE ALGO DEL PACIENTE antes de quedar asignado.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';

import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-4bbb-8bbb-b0000000000b';
const OTRO_LEGAJO = 'bbbbbbbb-bbbb-4bbb-8bbb-b0000000000c';
const GUARDIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PACIENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INCIDENTE = '11111111-1111-4111-8111-111111111111';
const INCIDENTE_CERRADO = '11111111-1111-4111-8111-111111111112';
const CONSULTA = '22222222-2222-4222-8222-222222222221';
const CONSULTA_AJENA = '22222222-2222-4222-8222-222222222222';
const CONSULTA_DEL_CERRADO = '22222222-2222-4222-8222-222222222223';

// El domicilio del Paciente y un punto a unos pocos kilómetros, inventados.
const DOMICILIO = { lat: -34.6037, lng: -58.3816 };
const DESDE_DONDE_CONTESTA = { lat: -34.62, lng: -58.42 };

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    const credencial = req.headers.authorization;
    llamadas.push({ clave, url: req.url, cuerpo, credencial });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url, credencial }) : preparada;
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

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** Filtra de verdad por los `eq`, los `is` y los `in` de la dirección. */
function filasQuePasanLosFiltros(url, filas) {
  const parametros = new URL(url, 'http://interno').searchParams;
  return filas.filter((fila) =>
    [...parametros.entries()].every(([campo, condicion]) => {
      if (!Object.hasOwn(fila, campo)) return true;
      if (condicion === 'is.null') return fila[campo] === null || fila[campo] === undefined;
      if (condicion.startsWith('eq.')) return String(fila[campo]) === condicion.slice(3);
      if (condicion.startsWith('in.(')) {
        const valores = condicion.slice(4, -1).split(',').map((v) => v.replace(/"/g, ''));
        return valores.includes(String(fila[campo]));
      }
      return true;
    })
  );
}

const esDeLaPersona = (credencial) => credencial === sesionDePrueba(USUARIO);

let consultasEnLaBase;
let incidentesEnLaBase;
let consentimientoVigente;

async function contestar(id, cuerpo) {
  const respuesta = await fetch(`${RAIZ}/api/app-asistentes/consultas-de-relevo/${id}/respuesta`, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function verLasConsultas() {
  const respuesta = await fetch(`${RAIZ}/api/app-asistentes/consultas-de-relevo`, {
    headers: { Authorization: sesionDePrueba(USUARIO) },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const escrituras = () => llamadas.filter((l) => l.clave === 'PATCH /rest/v1/consultas_de_relevo');
const laRespuesta = () => escrituras().filter((l) => esDeLaPersona(l.credencial));
const losMinutosPorGps = () => escrituras().filter((l) => !esDeLaPersona(l.credencial));

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  consentimientoVigente = true;
  incidentesEnLaBase = [
    { id: INCIDENTE, prestadora_id: PRESTADORA, guardia_entrante_id: GUARDIA, resuelto_at: null },
    {
      id: INCIDENTE_CERRADO,
      prestadora_id: PRESTADORA,
      guardia_entrante_id: GUARDIA,
      resuelto_at: '2026-09-15T21:00:00Z',
    },
  ];
  consultasEnLaBase = [
    {
      id: CONSULTA,
      prestadora_id: PRESTADORA,
      incidente_id: INCIDENTE,
      asistente_id: LEGAJO,
      consultado_at: '2026-09-15T20:30:00Z',
      respuesta: null,
    },
    {
      id: CONSULTA_AJENA,
      prestadora_id: PRESTADORA,
      incidente_id: INCIDENTE,
      asistente_id: OTRO_LEGAJO,
      consultado_at: '2026-09-15T20:30:00Z',
      respuesta: null,
    },
    {
      id: CONSULTA_DEL_CERRADO,
      prestadora_id: PRESTADORA,
      incidente_id: INCIDENTE_CERRADO,
      asistente_id: LEGAJO,
      consultado_at: '2026-09-15T19:30:00Z',
      respuesta: null,
    },
  ];

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/consultas_de_relevo', ({ url }) => filasQuePasanLosFiltros(url, consultasEnLaBase));
  // La política: la persona contesta la suya, sin respuesta y con el pedido abierto.
  respuestas.set('PATCH /rest/v1/consultas_de_relevo', ({ url, credencial }) => {
    let filas = filasQuePasanLosFiltros(url, consultasEnLaBase);
    if (esDeLaPersona(credencial)) {
      filas = filas.filter(
        (f) =>
          f.asistente_id === LEGAJO &&
          incidentesEnLaBase.some((i) => i.id === f.incidente_id && i.resuelto_at === null)
      );
    }
    return filas.map((f) => ({ id: f.id }));
  });
  respuestas.set('GET /rest/v1/incidentes_relevo', ({ url }) => filasQuePasanLosFiltros(url, incidentesEnLaBase));
  respuestas.set('GET /rest/v1/guardias', ({ url }) =>
    filasQuePasanLosFiltros(url, [
      {
        id: GUARDIA,
        prestadora_id: PRESTADORA,
        paciente_id: PACIENTE,
        fecha: '2026-09-15',
        hora_inicio: '22:00',
        hora_fin: '06:00',
      },
    ])
  );
  respuestas.set('POST /rest/v1/rpc/consentimiento_seguimiento_vigente', () => consentimientoVigente);
  respuestas.set('GET /rest/v1/guardia_pacientes', () => [
    {
      guardia_id: GUARDIA,
      pacientes: { id: PACIENTE, persona: { nombre_visible: 'Inventada Gómez', ...DOMICILIO } },
    },
  ]);
  respuestas.set('POST /rest/v1/rpc/domicilios_de_pacientes_en', () => [
    { paciente_id: PACIENTE, es_temporal: false, ...DOMICILIO },
  ]);
});

describe('ver las consultas de relevo', () => {
  it('trae sólo las propias, sin contestar y con el pedido abierto', async () => {
    const { estado, cuerpo } = await verLasConsultas();
    assert.equal(estado, 200);
    assert.deepEqual(
      cuerpo.consultas.map((c) => c.id),
      [CONSULTA]
    );
    const [consulta] = cuerpo.consultas;
    assert.equal(consulta.fecha, '2026-09-15');
    assert.equal(consulta.hora_inicio, '22:00');
    assert.equal(consulta.hora_fin, '06:00');
  });

  it('nada del Paciente: ni quién es ni dónde vive', async () => {
    const { cuerpo } = await verLasConsultas();
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes(PACIENTE));
    assert.ok(!texto.includes('Inventada'));
    assert.ok(!texto.includes(String(DOMICILIO.lat)));
    assert.deepEqual(Object.keys(cuerpo.consultas[0]).sort(), ['consultado_at', 'fecha', 'hora_fin', 'hora_inicio', 'id']);
  });

  it('una ya contestada no vuelve a aparecer', async () => {
    consultasEnLaBase[0].respuesta = 'disponible';
    const { cuerpo } = await verLasConsultas();
    assert.deepEqual(cuerpo.consultas, []);
  });
});

describe('contestar una consulta de relevo', () => {
  it('«no disponible» queda guardado, sin minutos y sin cálculo', async () => {
    const { estado, cuerpo } = await contestar(CONSULTA, { respuesta: 'no_disponible', ...DESDE_DONDE_CONTESTA });
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    const [escrita] = laRespuesta();
    assert.deepEqual(escrita.cuerpo, { respuesta: 'no_disponible', minutos_que_indica: null });
    assert.equal(losMinutosPorGps().length, 0);
  });

  it('«disponible» guarda los minutos que dice, con la credencial de la persona', async () => {
    const { estado } = await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40 });
    assert.equal(estado, 200);
    const [escrita] = laRespuesta();
    assert.deepEqual(escrita.cuerpo, { respuesta: 'disponible', minutos_que_indica: 40 });
  });

  it('con el punto y el consentimiento vigente, los minutos por GPS los escribe el trabajo de la Prestadora', async () => {
    await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40, ...DESDE_DONDE_CONTESTA });
    const [gps] = losMinutosPorGps();
    assert.ok(gps, 'los minutos por GPS tienen que quedar');
    assert.deepEqual(Object.keys(gps.cuerpo), ['minutos_por_gps']);
    assert.ok(Number.isInteger(gps.cuerpo.minutos_por_gps) && gps.cuerpo.minutos_por_gps > 0);
    assert.ok(gps.url.includes(`id=eq.${CONSULTA}`));
    assert.ok(gps.url.includes(`prestadora_id=eq.${PRESTADORA}`));
  });

  it('el punto no se guarda en ningún lado', async () => {
    await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40, ...DESDE_DONDE_CONTESTA });
    for (const escritura of escrituras()) {
      const texto = JSON.stringify(escritura.cuerpo);
      assert.ok(!texto.includes(String(DESDE_DONDE_CONTESTA.lat)), escritura.clave);
    }
  });

  it('sin consentimiento vigente no se calcula nada, y la respuesta queda', async () => {
    consentimientoVigente = false;
    const { estado } = await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40, ...DESDE_DONDE_CONTESTA });
    assert.equal(estado, 200);
    assert.equal(laRespuesta().length, 1);
    assert.equal(losMinutosPorGps().length, 0);
    assert.ok(!llamadas.some((l) => l.clave === 'GET /rest/v1/guardia_pacientes'));
  });

  it('sin el punto no se calcula nada', async () => {
    await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40 });
    assert.equal(losMinutosPorGps().length, 0);
    assert.ok(!llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/consentimiento_seguimiento_vigente'));
  });

  it('si el cálculo falla, la respuesta ya quedó y sale bien', async () => {
    respuestas.set('GET /rest/v1/guardia_pacientes', undefined);
    const { estado, cuerpo } = await contestar(CONSULTA, { respuesta: 'disponible', minutos: 40, ...DESDE_DONDE_CONTESTA });
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    assert.equal(laRespuesta().length, 1);
    assert.equal(losMinutosPorGps().length, 0);
  });

  it('«disponible» sin minutos, o «no disponible» con minutos, no se guarda', async () => {
    for (const cuerpo of [
      { respuesta: 'disponible' },
      { respuesta: 'disponible', minutos: -5 },
      { respuesta: 'disponible', minutos: 12.5 },
      { respuesta: 'disponible', minutos: '30' },
      { respuesta: 'no_disponible', minutos: 30 },
      { respuesta: 'quizas' },
      {},
    ]) {
      const { estado, cuerpo: devuelto } = await contestar(CONSULTA, cuerpo);
      assert.equal(estado, 400, JSON.stringify(cuerpo));
      assert.equal(devuelto.motivo, 'faltan_datos');
    }
    assert.equal(escrituras().length, 0);
  });

  it('la de otro Asistente no existe para quien contesta', async () => {
    const { estado, cuerpo } = await contestar(CONSULTA_AJENA, { respuesta: 'no_disponible' });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(escrituras().length, 0);
  });

  it('una ya contestada no se contesta de nuevo', async () => {
    consultasEnLaBase[0].respuesta = 'no_disponible';
    const { estado, cuerpo } = await contestar(CONSULTA, { respuesta: 'disponible', minutos: 20 });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'ya_resuelta');
    assert.equal(escrituras().length, 0);
  });

  it('sobre un pedido ya cerrado la base no deja contestar, y se dice', async () => {
    const { estado, cuerpo } = await contestar(CONSULTA_DEL_CERRADO, { respuesta: 'disponible', minutos: 20, ...DESDE_DONDE_CONTESTA });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'ya_cerrada');
    assert.equal(losMinutosPorGps().length, 0);
  });

  it('la lectura y la respuesta van con la credencial de quien contesta', async () => {
    await contestar(CONSULTA, { respuesta: 'no_disponible' });
    const propias = llamadas.filter((l) => l.clave.endsWith('/consultas_de_relevo'));
    assert.ok(propias.length >= 2);
    for (const llamada of propias) {
      assert.ok(esDeLaPersona(llamada.credencial), `${llamada.clave} no fue con la credencial de quien contesta`);
    }
  });
});
