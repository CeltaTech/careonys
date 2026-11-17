/**
 * La puerta por la que el software de cobranzas avisa cómo está cada acceso de Match.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Es una dirección pública que abre o cierra el contacto de los
 * Asistentes según lo que diga. Lo que tapa:
 *
 *  1. Que entre algo sin firma, con una firma que no da, o sin secreto cargado.
 *  2. Que un aviso incompleto llegue hasta la base.
 *  3. Que el trabajo de una Prestadora anote sobre otra.
 *  4. Que el mismo aviso mandado dos veces se cuente como nuevo.
 *  5. Que la respuesta, o el rechazo, cuente algo de la base.
 *
 * Lo que hace la base con el aviso —anotar el cobro, cambiar el estado, sumar contactos— vive en
 * una sola función de la base y no se prueba acá: acá se prueba que le llegue lo que tiene que
 * llegar, con la credencial que corresponde, y que su respuesta se traduzca bien.
 */
import { strict as assert } from 'node:assert';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { respuestaDeSecretosDePrueba } from '../../__tests__/secretosDeTercerosDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const ACCESO = '70000000-0000-4000-8000-000000000001';
const SECRETO = 'un-secreto-largo-de-mas-de-32-caracteres';
const RPC = 'POST /rest/v1/rpc/anotar_aviso_de_acceso_de_match';

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
    llamadas.push({
      clave,
      credencial: req.headers.authorization,
      filtros: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
    });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams, crudo) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor && valor.__falla) {
      res.writeHead(valor.__falla.estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: valor.__falla.code, message: valor.__falla.message }));
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
const { accesoDeMatchRouter, loQueEstaMalEnElAvisoDeAcceso } = await import('../avisoDeAccesoDeMatch.js');

const app = express();
let prestadoraDeLaDireccion = null;
app.use((req, _res, next) => {
  prestadoraDeLaDireccion = req.path.split('/').find((parte) => /^[0-9a-f-]{36}$/i.test(parte)) ?? null;
  next();
});
// Montado como en `server.js`: antes de cualquier lector de JSON general.
app.use('/api/avisos-de-acceso-de-match', accesoDeMatchRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/avisos-de-acceso-de-match`;

after(() => {
  backend.close();
  baseFalsa.close();
});

function firmaDe(cuerpo, secreto = SECRETO, instante = Math.floor(Date.now() / 1000)) {
  const firma = createHmac('sha256', secreto).update(`${instante}.`).update(cuerpo).digest('hex');
  return `ts=${instante},v1=${firma}`;
}

async function avisar(cuerpo, { firma, prestadora = PRESTADORA } = {}) {
  const texto = JSON.stringify(cuerpo);
  const cabeceras = { 'Content-Type': 'application/json' };
  if (firma !== null) cabeceras['x-signature'] = firma ?? firmaDe(texto);
  const respuesta = await fetch(`${DIRECCION}/${prestadora}`, { method: 'POST', headers: cabeceras, body: texto });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function laAnotacion() {
  return llamadas.find((l) => l.clave === RPC)?.cuerpo;
}

const PAGADO = {
  acceso_id: ACCESO,
  estado: 'pagado',
  periodo: '2026-11-01',
  monto: 12000.5,
  moneda: 'ARS',
  numero_del_aviso: 'M-2001',
  medio: 'tarjeta',
};

let secretoCargado = SECRETO;

beforeEach(() => {
  llamadas = [];
  secretoCargado = SECRETO;
  respuestas.clear();
  respuestas.set('GET /rest/v1/secretos_de_terceros', (filtros) =>
    respuestaDeSecretosDePrueba(
      filtros.get('prestadora_id')?.replace(/^eq\./, '') ?? PRESTADORA,
      { secreto_del_aviso_de_cobranza: secretoCargado },
    )(filtros));
  respuestas.set(RPC, { ok: true, estado: 'vigente', saldo_contactos: 5 });
});

afterEach(() => {
  for (const { clave, credencial } of llamadas) {
    const reclamos = credencial
      ? JSON.parse(Buffer.from(credencial.replace('Bearer ', '').split('.')[1], 'base64url').toString())
      : {};
    assert.equal(reclamos.role, 'trabajo_sin_persona', `${clave} no entró con la credencial del trabajo`);
    assert.equal(reclamos.prestadora_id, prestadoraDeLaDireccion, `${clave} entró con la credencial de otra Prestadora`);
  }
});

// ---------------------------------------------------------------------------------------

describe('sin firma no entra nada', () => {
  it('el aviso sin cabecera de firma se rechaza y no anota', async () => {
    const { estado } = await avisar(PAGADO, { firma: null });
    assert.equal(estado, 401);
    assert.equal(laAnotacion(), undefined);
  });

  it('una firma calculada con otro secreto no entra', async () => {
    const { estado } = await avisar(PAGADO, { firma: firmaDe(JSON.stringify(PAGADO), 'otro-secreto') });
    assert.equal(estado, 401);
    assert.equal(laAnotacion(), undefined);
  });

  it('una firma de hace horas no entra', async () => {
    const vieja = Math.floor(Date.now() / 1000) - 60 * 60 * 5;
    const { estado } = await avisar(PAGADO, { firma: firmaDe(JSON.stringify(PAGADO), SECRETO, vieja) });
    assert.equal(estado, 401);
    assert.equal(laAnotacion(), undefined);
  });

  it('sin secreto cargado no entra ningún aviso, aunque venga firmado', async () => {
    secretoCargado = null;
    const { estado } = await avisar(PAGADO);
    assert.equal(estado, 401);
    assert.equal(laAnotacion(), undefined);
  });

  it('una Prestadora sin forma de identificador se corta antes de tocar la base', async () => {
    const { estado } = await avisar(PAGADO, { prestadora: 'la-de-siempre' });
    assert.equal(estado, 401);
    assert.equal(llamadas.length, 0);
  });

  it('el rechazo no cuenta cuál de las comprobaciones falló', async () => {
    const sinFirma = await avisar(PAGADO, { firma: null });
    const conOtroSecreto = await avisar(PAGADO, { firma: firmaDe(JSON.stringify(PAGADO), 'otro') });
    assert.deepEqual(sinFirma.cuerpo, conOtroSecreto.cuerpo);
    noFiltraLaBase(sinFirma.cuerpo);
  });
});

describe('el aviso entero llega a la base tal como vino', () => {
  it('un pago se anota con su período, su importe, su moneda y su número', async () => {
    const { estado, cuerpo } = await avisar(PAGADO);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });
    const anotado = laAnotacion();
    assert.equal(anotado.p_acceso_id, ACCESO);
    assert.equal(anotado.p_estado, 'pagado');
    assert.equal(anotado.p_periodo, '2026-11-01');
    assert.equal(anotado.p_monto, 12000.5);
    assert.equal(anotado.p_moneda, 'ARS');
    assert.equal(anotado.p_numero_del_aviso, 'M-2001');
    assert.equal(anotado.p_medio, 'tarjeta');
    assert.equal(anotado.p_suspende_el, null);
    assert.equal(anotado.p_vigente_hasta, null);
  });

  it('la gracia viaja con el día fijo de la suspensión', async () => {
    await avisar({ ...PAGADO, estado: 'gracia', suspende_el: '2026-11-08' });
    assert.equal(laAnotacion().p_estado, 'gracia');
    assert.equal(laAnotacion().p_suspende_el, '2026-11-08');
  });

  it('la suspensión entra sin fecha: la fija la base', async () => {
    const { estado } = await avisar({ ...PAGADO, estado: 'suspendido' });
    assert.equal(estado, 200);
    assert.equal(laAnotacion().p_suspende_el, null);
  });

  it('la baja viaja con el último día pagado', async () => {
    await avisar({ ...PAGADO, estado: 'baja', vigente_hasta: '2026-11-30' });
    assert.equal(laAnotacion().p_estado, 'baja');
    assert.equal(laAnotacion().p_vigente_hasta, '2026-11-30');
  });

  it('sin medio de pago, el medio va vacío y no inventado', async () => {
    const { medio: _medio, ...sinMedio } = PAGADO;
    await avisar(sinMedio);
    assert.equal(laAnotacion().p_medio, null);
  });
});

describe('lo que no entra', () => {
  const casos = [
    ['sin acceso', { acceso_id: undefined }, 'acceso_id'],
    ['con un acceso que no es un identificador', { acceso_id: '0001-000123' }, 'acceso_id'],
    ['con un estado que el contrato no tiene', { estado: 'moroso' }, 'estado'],
    ['sin período', { periodo: undefined }, 'periodo'],
    ['con un período que no existe', { periodo: '2026-02-30' }, 'periodo'],
    ['con un importe negativo', { monto: -1 }, 'monto'],
    ['con un importe escrito como texto', { monto: '12000' }, 'monto'],
    ['sin moneda', { moneda: undefined }, 'moneda'],
    ['con una moneda en minúsculas', { moneda: 'ars' }, 'moneda'],
    ['sin número de aviso', { numero_del_aviso: '  ' }, 'numero_del_aviso'],
    ['en gracia sin el día de la suspensión', { estado: 'gracia' }, 'suspende_el'],
    ['una baja sin el último día pagado', { estado: 'baja' }, 'vigente_hasta'],
    ['con una fecha de cobro mal escrita', { fecha_cobro: '01/11/2026' }, 'fecha_cobro'],
  ];

  for (const [nombre, cambio, dato] of casos) {
    it(`un aviso ${nombre} se rechaza diciendo cuál es el dato, y no llega a la base`, async () => {
      const { estado, cuerpo } = await avisar({ ...PAGADO, ...cambio });
      assert.equal(estado, 400);
      assert.equal(cuerpo.dato, dato);
      assert.equal(laAnotacion(), undefined);
      noFiltraLaBase(cuerpo);
    });
  }

  it('la comprobación sola acepta un aviso entero', () => {
    assert.equal(loQueEstaMalEnElAvisoDeAcceso(PAGADO), null);
  });

  it('un acceso de otra Prestadora contesta como inexistente', async () => {
    respuestas.set(RPC, { ok: false, motivo: 'acceso_inexistente' });
    const { estado, cuerpo } = await avisar(PAGADO, { prestadora: OTRA_PRESTADORA });
    assert.equal(estado, 404);
    noFiltraLaBase(cuerpo);
  });

  it('la baja de un acceso que no se renueva solo se rechaza', async () => {
    respuestas.set(RPC, { ok: false, motivo: 'no_se_renueva' });
    const { estado } = await avisar({ ...PAGADO, estado: 'baja', vigente_hasta: '2026-11-30' });
    assert.equal(estado, 409);
  });
});

describe('el mismo aviso mandado dos veces', () => {
  it('se contesta que sí y se dice que ya estaba', async () => {
    respuestas.set(RPC, { ok: true, repetido: true, estado: 'vigente', saldo_contactos: 5 });
    const { estado, cuerpo } = await avisar(PAGADO);
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true, repetido: true });
  });
});

describe('lo que no se cuenta hacia afuera', () => {
  it('una caída de la base no describe la base', async () => {
    respuestas.set(RPC, {
      __falla: { estado: 500, code: '42883', message: 'function anotar_aviso_de_acceso_de_match does not exist' },
    });
    const { estado, cuerpo } = await avisar(PAGADO);
    assert.equal(estado, 500);
    noFiltraLaBase(cuerpo);
  });

  it('una respuesta vacía de la base no se da por anotada', async () => {
    respuestas.set(RPC, null);
    const { estado } = await avisar(PAGADO);
    assert.equal(estado, 500);
  });

  it('la respuesta no devuelve el saldo ni el estado del acceso', async () => {
    const { cuerpo } = await avisar(PAGADO);
    assert.equal(cuerpo.saldo_contactos, undefined);
    assert.equal(cuerpo.estado, undefined);
  });
});

function noFiltraLaBase(cuerpo) {
  const texto = JSON.stringify(cuerpo ?? {});
  assert.doesNotMatch(
    texto,
    /accesos_intermediacion|cobros_intermediacion|anotar_aviso|prestadora_id|jsonb|constraint|select|column|relation|function|PGRST|secretos_de_terceros/i,
    `el mensaje nombra algo de la base: ${texto}`
  );
}
