/**
 * El enlace de activación se reenvía solo: lo pide la persona cuando el suyo venció, y le sale un
 * recordatorio a la cuenta que sigue sin activarse.
 *
 *   node --test src/routes/__tests__/enlaceDeActivacionNuevo.test.js
 *
 * Se levanta la ruta de verdad contra una base de mentira que guarda los enlaces y contesta por
 * HTTP como la de verdad, con filtros. Que salió un enlace nuevo se ve en la base: un renglón más
 * en `tokens_activacion_cuenta`. La base sólo le contesta al trabajo de la Prestadora, así que un
 * pedido hecho con otra credencial no encuentra nada y la prueba da al revés.
 *
 * Qué cuenta «nunca se activó» lo decide la base (`cuentas_nunca_activadas`); acá la base de
 * mentira contesta con la lista que arma cada prueba.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { verificadorDelEnlace } from '../../utils/verificadorDelEnlace.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CUENTA = '33333333-3333-4333-8333-333333333333';
const OTRA_CUENTA = '44444444-4444-4444-8444-444444444444';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

let enlaces = [];
let nuncaActivadas = new Set();
let pedidosDeClave = 0;
let siguienteId = 1;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

// Los filtros de PostgREST que usan estas rutas: eq, neq, gt, lte, in, is.null y not.is.null.
function cumple(fila, campo, condicion) {
  const valor = fila[campo];
  if (condicion === 'is.null') return valor == null;
  if (condicion === 'not.is.null') return valor != null;
  const [op, ...resto] = condicion.split('.');
  const dato = resto.join('.');
  if (op === 'eq') return String(valor) === dato;
  if (op === 'neq') return String(valor) !== dato;
  if (op === 'gt') return valor != null && new Date(valor) > new Date(dato);
  if (op === 'lte') return valor != null && new Date(valor) <= new Date(dato);
  if (op === 'in') return dato.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/"/g, '')).includes(String(valor));
  throw new Error(`filtro sin traducir: ${campo}=${condicion}`);
}

function filtrar(filas, url) {
  return filas.filter((fila) => [...url.searchParams]
    .filter(([campo]) => !['select', 'order', 'limit', 'columns'].includes(campo))
    .every(([campo, condicion]) => cumple(fila, campo, condicion)));
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const delTrabajo = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    let filas = [];

    if (clave === 'POST /rest/v1/rpc/prestadora_de_la_direccion') filas = PRESTADORA;
    if (clave === 'GET /rest/v1/configuracion_prestadora') filas = [{ prestadora_id: PRESTADORA, dominio: 'inventada' }];
    if (clave === 'GET /rest/v1/usuarios' && delTrabajo) {
      filas = filtrar([
        { id: CUENTA, nombre: 'Nombre inventado', rol: 'cliente', prestadora_id: PRESTADORA, email: 'inventado@ejemplo.test' },
        { id: OTRA_CUENTA, nombre: 'Otro inventado', rol: 'asistente', prestadora_id: PRESTADORA, email: 'otro@ejemplo.test' },
      ], url);
    }
    if (clave === 'GET /rest/v1/tokens_activacion_cuenta' && delTrabajo) filas = filtrar(enlaces, url);
    if (clave === 'POST /rest/v1/tokens_activacion_cuenta' && delTrabajo) {
      const nuevo = { id: `enlace-${siguienteId++}`, usado_en: null, recordatorio_enviado_en: null, created_at: new Date().toISOString(), ...cuerpo };
      enlaces.push(nuevo);
      filas = [nuevo];
    }
    if (clave === 'PATCH /rest/v1/tokens_activacion_cuenta' && delTrabajo) {
      filas = filtrar(enlaces, url);
      for (const fila of filas) Object.assign(fila, cuerpo);
    }
    if (clave === 'POST /rest/v1/rpc/cuentas_nunca_activadas' && delTrabajo) {
      filas = (cuerpo?.p_usuarios ?? []).filter((id) => nuncaActivadas.has(id));
    }
    if (clave === 'POST /rest/v1/pedidos_de_clave_nueva' && delTrabajo) pedidosDeClave += 1;

    if (req.method === 'HEAD') {
      const cuantos = url.pathname === '/rest/v1/pedidos_de_clave_nueva' && delTrabajo ? pedidosDeClave : 0;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `*/${cuantos}` });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(filas) && unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.PWA_CLIENTES_URL = 'https://clientes.ejemplo.test';
process.env.PWA_ASISTENTES_URL = 'https://asistentes.ejemplo.test';
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { activarCuentaRouter } = await import('../activarCuenta.js');
const { recordarLosEnlacesDeActivacion } = await import('../../utils/activacionCuenta.js');

const app = express();
app.use(express.json());
app.use('/api/activar-cuenta', activarCuentaRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/activar-cuenta/inventada/enlace-nuevo`;

after(() => {
  backend.close();
  baseFalsa.close();
});

beforeEach(() => {
  enlaces = [];
  nuncaActivadas = new Set([CUENTA, OTRA_CUENTA]);
  pedidosDeClave = 0;
  delete process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA;
  delete process.env.DIAS_HASTA_EL_RECORDATORIO_DE_ACTIVACION;
});

function enlace({ codigo, usuarioId = CUENTA, emitidoHaceDias = 8, validoPorDias = 7, usado = false }) {
  const emitido = Date.now() - emitidoHaceDias * UN_DIA_MS;
  const fila = {
    id: `enlace-${siguienteId++}`,
    usuario_id: usuarioId,
    token: verificadorDelEnlace(codigo ?? `codigo-${siguienteId}`),
    created_at: new Date(emitido).toISOString(),
    expira_en: new Date(emitido + validoPorDias * UN_DIA_MS).toISOString(),
    usado_en: usado ? new Date(emitido + UN_DIA_MS).toISOString() : null,
    recordatorio_enviado_en: null,
  };
  enlaces.push(fila);
  return fila;
}

async function pedirEnlaceNuevo(token) {
  const respuesta = await fetch(RAIZ, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.text() };
}

const emitidos = (desde) => enlaces.length - desde;

describe('la persona pide un enlace nuevo', () => {
  it('con su enlace vencido y la cuenta sin activar, sale uno nuevo y el vencido no vuelve a servir', async () => {
    const viejo = enlace({ codigo: 'vencido-inventado' });
    const otroVigente = enlace({ codigo: 'otro-vigente', emitidoHaceDias: 1 });
    const antes = enlaces.length;

    const respuesta = await pedirEnlaceNuevo('vencido-inventado');

    assert.equal(respuesta.estado, 200);
    assert.equal(emitidos(antes), 1, 'no salió el enlace nuevo');
    const nuevo = enlaces.at(-1);
    assert.equal(nuevo.usuario_id, CUENTA);
    assert.ok(new Date(nuevo.expira_en) > new Date(), 'el enlace nuevo nace vencido');
    assert.ok(new Date(otroVigente.expira_en) <= new Date(), 'el enlace anterior que seguía vigente sigue sirviendo');
    assert.ok(new Date(viejo.expira_en) <= new Date());
    assert.equal(viejo.usado_en, null, 'vencer no es usar');
  });

  it('con un enlace ajeno, uno usado o una cuenta activada, contesta lo mismo y no manda nada', async () => {
    const valido = await (async () => {
      enlace({ codigo: 'vencido-inventado' });
      return pedirEnlaceNuevo('vencido-inventado');
    })();

    enlaces = [];
    enlace({ codigo: 'usado-inventado', usado: true });
    enlace({ codigo: 'de-cuenta-activada', usuarioId: OTRA_CUENTA });
    nuncaActivadas = new Set([CUENTA]);
    const antes = enlaces.length;

    const respuestas = [
      await pedirEnlaceNuevo('enlace-que-no-existe'),
      await pedirEnlaceNuevo('usado-inventado'),
      await pedirEnlaceNuevo('de-cuenta-activada'),
      await pedirEnlaceNuevo(''),
    ];

    assert.equal(emitidos(antes), 0, 'salió un enlace que no correspondía');
    for (const respuesta of respuestas) assert.deepEqual(respuesta, valido);
  });

  it('el tope por hora corta los pedidos repetidos', async () => {
    process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA = '2';
    enlace({ codigo: 'vencido-inventado' });
    const antes = enlaces.length;

    for (let i = 0; i < 4; i += 1) {
      const { estado } = await pedirEnlaceNuevo('vencido-inventado');
      assert.equal(estado, 200);
    }

    assert.equal(emitidos(antes), 2, 'el tope no cortó');
  });
});

describe('el recordatorio', () => {
  it('sale una sola vez por cuenta, aunque el enlace nuevo también envejezca', async () => {
    const original = enlace({ codigo: 'sin-usar', emitidoHaceDias: 4 });
    const antes = enlaces.length;

    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 1 });
    assert.equal(emitidos(antes), 1);
    assert.ok(original.recordatorio_enviado_en, 'no quedó anotado el recordatorio');

    // Pasan los días: el enlace del recordatorio también queda viejo y sin usar.
    for (const fila of enlaces) fila.created_at = new Date(Date.now() - 4 * UN_DIA_MS).toISOString();
    const despues = enlaces.length;
    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 0 });
    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 0 });
    assert.equal(emitidos(despues), 0, 'salió un segundo recordatorio');
  });

  it('espera los días configurados, y no le escribe a una cuenta activada ni a un enlace vencido o usado', async () => {
    enlace({ codigo: 'reciente', emitidoHaceDias: 2 });
    enlace({ codigo: 'de-cuenta-activada', usuarioId: OTRA_CUENTA, emitidoHaceDias: 4 });
    nuncaActivadas = new Set([CUENTA]);

    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 0 });

    enlaces = [];
    enlace({ codigo: 'vencido', emitidoHaceDias: 8 });
    enlace({ codigo: 'usado', emitidoHaceDias: 4, usado: true });
    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 0 });

    // Con la espera en un día, el de hace dos ya corresponde: los días salen de la configuración.
    enlaces = [];
    enlace({ codigo: 'reciente', emitidoHaceDias: 2 });
    process.env.DIAS_HASTA_EL_RECORDATORIO_DE_ACTIVACION = '1';
    assert.deepEqual(await recordarLosEnlacesDeActivacion(PRESTADORA), { recordados: 1 });
  });

  it('sin Prestadora no busca nada', async () => {
    enlace({ codigo: 'sin-usar', emitidoHaceDias: 4 });
    assert.deepEqual(await recordarLosEnlacesDeActivacion(null), { recordados: 0 });
  });
});
