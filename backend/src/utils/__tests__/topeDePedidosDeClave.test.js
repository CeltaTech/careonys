/**
 * El tope de pedidos de clave nueva.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE. Pedir una clave nueva no exige sesión, así que esa puerta la abre cualquiera
 * desde afuera. Cada caso está por el error que evita:
 *
 *   1. QUE SE PUEDA PEDIR SIN LÍMITE. Es llenarle la casilla de correo a una persona, y cada
 *      mensaje lo paga la Prestadora.
 *   2. QUE EL TOPE DE UNA CUENTA FRENE A OTRA. Se cuenta por cuenta, de su Prestadora.
 *   3. QUE EL TOPE SE SALTEE CUANDO LA BASE NO CONTESTA. Todo control falla cerrado.
 *
 * LA PRUEBA QUE IMPORTA ROMPE EL CONTROL A PROPÓSITO: la misma llamada, con un pedido menos, tiene
 * que pasar. Sin eso, una prueba que dice «frenó» no prueba nada, porque podría estar frenando por
 * otra cosa.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CUENTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTRA_CUENTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera. */
let llamadas = [];

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
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({
      clave,
      url: req.url,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    });

    const valor = respuestas.get(clave);
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    res.writeHead(valor.__estado ?? 200, {
      'Content-Type': 'application/json',
      ...(valor.__cabeceras ?? {}),
    });
    res.end(JSON.stringify(valor.__cuerpo ?? null));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const {
  seAgotaronLosPedidosDeClave,
  anotarPedidoDeClave,
  topeDePedidosDeClavePorHora,
} = await import('../topeDePedidosDeClave.js');

after(() => baseFalsa.close());

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  delete process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA;
});

/* Cuántos pedidos contesta la base para la última hora. Contar sin traer filas es un `HEAD`, y el
   número viene en `Content-Range`. */
function conPedidosEnLaHora(cuantos) {
  respuestas.set('HEAD /rest/v1/pedidos_de_clave_nueva', {
    __estado: 200,
    __cabeceras: { 'Content-Range': `0-0/${cuantos}` },
    __cuerpo: null,
  });
}

describe('el tope por hora', () => {
  it('justo en el tope, no se manda nada más', async () => {
    conPedidosEnLaHora(topeDePedidosDeClavePorHora());
    assert.equal(await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA), true);
  });

  it('un pedido por debajo del tope todavía pasa', async () => {
    // La misma llamada con el control corrido: si esto también frenara, la prueba de arriba no
    // estaría probando el tope.
    conPedidosEnLaHora(topeDePedidosDeClavePorHora() - 1);
    assert.equal(await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA), false);
  });

  it('el valor sale del entorno y se lee en cada pedido', async () => {
    process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA = '2';
    assert.equal(topeDePedidosDeClavePorHora(), 2);
    conPedidosEnLaHora(2);
    assert.equal(await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA), true);
  });

  it('un valor mal cargado no apaga el tope', () => {
    process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA = 'todos';
    assert.equal(topeDePedidosDeClavePorHora(), 5);
    process.env.TOPE_PEDIDOS_DE_CLAVE_POR_HORA = '0';
    assert.equal(topeDePedidosDeClavePorHora(), 5);
  });

  it('se cuenta por Prestadora y por cuenta, y sólo la última hora', async () => {
    conPedidosEnLaHora(0);
    await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA);
    const pedido = llamadas.find((l) => l.clave === 'HEAD /rest/v1/pedidos_de_clave_nueva');
    assert.ok(pedido.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.ok(pedido.url.includes(`usuario_id=eq.${CUENTA}`));
    assert.ok(pedido.url.includes('pedido_en=gte.'));
  });

  it('sin Prestadora no se manda nada, y no se le pregunta a la base', async () => {
    assert.equal(await seAgotaronLosPedidosDeClave(null, CUENTA), true);
    assert.equal(llamadas.length, 0);
  });

  it('sin cuenta no se manda nada, y no se le pregunta a la base', async () => {
    assert.equal(await seAgotaronLosPedidosDeClave(PRESTADORA, null), true);
    assert.equal(llamadas.length, 0);
  });

  it('si la base no contesta, falla cerrado', async () => {
    respuestas.set('HEAD /rest/v1/pedidos_de_clave_nueva', {
      __estado: 500,
      __cuerpo: { message: 'la base no contesta' },
    });
    assert.equal(await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA), true);
  });
});

describe('el pedido anotado', () => {
  it('guarda la Prestadora y la cuenta, y nunca un email', async () => {
    respuestas.set('POST /rest/v1/pedidos_de_clave_nueva', { __estado: 201, __cuerpo: null });
    await anotarPedidoDeClave(PRESTADORA, CUENTA);
    const anotado = llamadas.find((l) => l.clave === 'POST /rest/v1/pedidos_de_clave_nueva');
    assert.deepEqual(anotado.cuerpo, { prestadora_id: PRESTADORA, usuario_id: CUENTA });
  });

  it('el tope de una cuenta no frena a otra', async () => {
    conPedidosEnLaHora(0);
    await seAgotaronLosPedidosDeClave(OTRA_PRESTADORA, OTRA_CUENTA);
    const pedido = llamadas.find((l) => l.clave === 'HEAD /rest/v1/pedidos_de_clave_nueva');
    assert.ok(pedido.url.includes(`prestadora_id=eq.${OTRA_PRESTADORA}`));
    assert.ok(pedido.url.includes(`usuario_id=eq.${OTRA_CUENTA}`));
  });
});

describe('con qué credencial', () => {
  it('contar y anotar van con la credencial del trabajo de la Prestadora del pedido', async () => {
    conPedidosEnLaHora(0);
    respuestas.set('POST /rest/v1/pedidos_de_clave_nueva', { __estado: 201, __cuerpo: null });

    await seAgotaronLosPedidosDeClave(PRESTADORA, CUENTA);
    await anotarPedidoDeClave(PRESTADORA, CUENTA);

    assert.equal(llamadas.length, 2);
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
  });
});
