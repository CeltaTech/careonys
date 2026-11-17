/**
 * La puerta por la que CeltaTech da de alta una Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Es una dirección pública que crea una Prestadora entera. Lo único
 * que separa un pedido de CeltaTech de uno inventado es la firma. Lo que tapa:
 *
 *  1. Que entre algo sin firma, con una firma que no da, o sin clave de firma configurada.
 *  2. Que un pedido mal armado llegue a la base.
 *  3. Que un alta que falla en la base deje abierto el reenvío de las respuestas.
 *  4. Que el reintento de CeltaTech cree una segunda Prestadora o deje un reenvío de más.
 *  5. Que la respuesta cuente algo de la base.
 *
 * Se levanta el router de verdad, con la base y el correo de mentira inyectados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createHmac } from 'node:crypto';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:9';
prepararCredencialDePrueba();

const { default: express } = await import('express');
const { crearAltaDePrestadoraRouter } = await import('../altaDePrestadora.js');
const { darDeAltaLaPrestadora, loQueFaltaEnElAlta } = await import('../../utils/altaDePrestadora.js');

const CLAVE = 'una-clave-de-firma-inventada-de-mas-de-32-caracteres';
const PRESTADORA = '11111111-1111-4111-8111-111111111111';

/** Qué contesta la base de mentira y qué le pidieron. */
let respuestaDeLaBase;
let llamadasALaBase;
let reglasAbiertas;
let reglasCortadas;
let claveConfigurada;

const dependencias = {
  llamarALaBase: async (funcion, parametros) => {
    llamadasALaBase.push({ funcion, parametros });
    return typeof respuestaDeLaBase === 'function' ? respuestaDeLaBase() : respuestaDeLaBase;
  },
  abrirReenvio: async (pedido) => {
    reglasAbiertas.push(pedido);
    return 'regla-inventada';
  },
  cortarReenvio: async (regla) => {
    reglasCortadas.push(regla);
    return true;
  },
  casillaDelCodigo: (codigo) => codigo.toLowerCase(),
  dominio: () => 'correo.invalid',
};

const app = express();
app.use('/integracion/v1/tenants', crearAltaDePrestadoraRouter({
  clave: () => claveConfigurada,
  alta: (cuerpo) => darDeAltaLaPrestadora(cuerpo, dependencias),
}));
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/integracion/v1/tenants`;

after(() => backend.close());

beforeEach(() => {
  respuestaDeLaBase = { data: { prestadora_id: PRESTADORA, creada: true }, error: null };
  llamadasALaBase = [];
  reglasAbiertas = [];
  reglasCortadas = [];
  claveConfigurada = CLAVE;
});

/** Un alta inventada, completa. */
function altaCompleta() {
  return {
    suscripcion_id: 'sub-inventada-001',
    cliente: { razon_social: 'Cuidados Inventados S. A.', identificacion_fiscal: '30-00000000-0', pais: 'ar' },
    entitlements: { algo: true },
    datos_del_producto: {
      nombre_fantasia: 'Cuidar Inventado',
      codigo: 'CuidarInventado',
      email_respuestas: 'Respuestas@Ejemplo.invalid',
      administrador: { nombre: 'Persona Inventada', email: 'Admin@Ejemplo.invalid', telefono: '+5400000000' },
    },
  };
}

function firmaDe(crudo, clave = CLAVE) {
  return `sha256=${createHmac('sha256', clave).update(crudo).digest('hex')}`;
}

async function pedir(cuerpo, { firma, tipo = 'application/json' } = {}) {
  const crudo = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  const cabeceras = { 'Content-Type': tipo };
  const laFirma = firma === undefined ? firmaDe(crudo) : firma;
  if (laFirma !== null) cabeceras['X-CeltaTech-Firma'] = laFirma;
  const respuesta = await fetch(DIRECCION, { method: 'POST', headers: cabeceras, body: crudo });
  return { estado: respuesta.status, cuerpo: await respuesta.json(), texto: JSON.stringify(respuesta) };
}

describe('La firma', () => {
  it('sin clave de firma configurada no abre, aunque la firma venga', async () => {
    claveConfigurada = null;
    const { estado, cuerpo } = await pedir(altaCompleta());
    assert.equal(estado, 401);
    assert.deepEqual(cuerpo, { error: 'Pedido no autenticado' });
    assert.equal(llamadasALaBase.length, 0);
    assert.equal(reglasAbiertas.length, 0);
  });

  it('sin cabecera no abre', async () => {
    const { estado } = await pedir(altaCompleta(), { firma: null });
    assert.equal(estado, 401);
    assert.equal(llamadasALaBase.length, 0);
  });

  it('con la firma de otra clave no abre', async () => {
    const crudo = JSON.stringify(altaCompleta());
    const { estado } = await pedir(crudo, { firma: firmaDe(crudo, 'otra-clave-inventada-de-mas-de-32-caracteres') });
    assert.equal(estado, 401);
    assert.equal(llamadasALaBase.length, 0);
  });

  it('con el cuerpo cambiado después de firmar no abre', async () => {
    const crudo = JSON.stringify(altaCompleta());
    const firma = firmaDe(crudo);
    const { estado } = await pedir(crudo.replace('Inventado', 'Cambiado'), { firma });
    assert.equal(estado, 401);
  });

  it('con una firma que no es hexadecimal, o sin el prefijo, no abre', async () => {
    assert.equal((await pedir(altaCompleta(), { firma: 'sha256=zzzz' })).estado, 401);
    const crudo = JSON.stringify(altaCompleta());
    assert.equal((await pedir(crudo, { firma: firmaDe(crudo).slice('sha256='.length) })).estado, 401);
  });

  it('con un tipo de contenido que no es JSON no abre: no hay cuerpo crudo con qué comprobar', async () => {
    const { estado } = await pedir(altaCompleta(), { tipo: 'text/plain' });
    assert.equal(estado, 401);
  });
});

describe('El alta', () => {
  it('con todo bien crea la Prestadora y contesta 201 con su referencia', async () => {
    const { estado, cuerpo } = await pedir(altaCompleta());
    assert.equal(estado, 201);
    assert.deepEqual(cuerpo, { tenant_ref: PRESTADORA });

    assert.equal(llamadasALaBase.length, 1);
    const { funcion, parametros } = llamadasALaBase[0];
    assert.equal(funcion, 'dar_de_alta_la_prestadora');
    assert.equal(parametros.p_referencia, 'sub-inventada-001');
    assert.equal(parametros.p_pais, 'AR');
    assert.equal(parametros.p_codigo, 'CuidarInventado');
    assert.equal(parametros.p_casilla_envio, 'cuidarinventado');
    assert.equal(parametros.p_email_respuestas, 'respuestas@ejemplo.invalid');
    assert.equal(parametros.p_admin_email, 'admin@ejemplo.invalid');
    assert.equal(parametros.p_regla_reenvio, 'regla-inventada');

    assert.deepEqual(reglasAbiertas, [{
      direccionDeEnvio: 'cuidarinventado@correo.invalid',
      emailRespuestas: 'respuestas@ejemplo.invalid',
    }]);
    assert.deepEqual(reglasCortadas, []);
  });

  it('repetida con la misma referencia contesta 200 con la misma Prestadora y corta el reenvío sobrante', async () => {
    respuestaDeLaBase = { data: { prestadora_id: PRESTADORA, creada: false }, error: null };
    const { estado, cuerpo } = await pedir(altaCompleta());
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { tenant_ref: PRESTADORA });
    assert.deepEqual(reglasCortadas, ['regla-inventada']);
  });

  it('si la base rechaza el código ya usado, contesta 409 con el motivo y corta el reenvío', async () => {
    respuestaDeLaBase = { data: null, error: { message: 'codigo_en_uso' } };
    const { estado, cuerpo } = await pedir(altaCompleta());
    assert.equal(estado, 409);
    assert.deepEqual(cuerpo, { error: 'codigo_en_uso' });
    assert.deepEqual(reglasCortadas, ['regla-inventada']);
  });

  it('un país sin moneda conocida o un código mal escrito son 400', async () => {
    respuestaDeLaBase = { data: null, error: { message: 'pais_sin_moneda' } };
    assert.equal((await pedir(altaCompleta())).estado, 400);
    respuestaDeLaBase = { data: null, error: { message: 'codigo_mal_escrito' } };
    assert.equal((await pedir(altaCompleta())).estado, 400);
  });

  it('una falla de la base no cuenta nada de la base y corta el reenvío', async () => {
    respuestaDeLaBase = { data: null, error: { message: 'insert or update on table prestadoras violates constraint x' } };
    const { estado, cuerpo } = await pedir(altaCompleta());
    assert.equal(estado, 502);
    assert.deepEqual(cuerpo, { error: 'alta_no_completada' });
    assert.doesNotMatch(JSON.stringify(cuerpo), /prestadoras|constraint|table/);
    assert.deepEqual(reglasCortadas, ['regla-inventada']);
  });

  it('si la base se cae a mitad de camino también corta el reenvío', async () => {
    respuestaDeLaBase = () => { throw new Error('conexión caída'); };
    const { estado } = await pedir(altaCompleta());
    assert.equal(estado, 502);
    assert.deepEqual(reglasCortadas, ['regla-inventada']);
  });

  it('un cuerpo ilegible, ya firmado, es 400 y no llega a la base', async () => {
    const { estado } = await pedir('{esto no es json');
    assert.equal(estado, 400);
    assert.equal(llamadasALaBase.length, 0);
    assert.equal(reglasAbiertas.length, 0);
  });
});

describe('Lo que falta en el pedido', () => {
  it('nombra el primer dato que falta, con el nombre del contrato', async () => {
    const sinCodigo = altaCompleta();
    delete sinCodigo.datos_del_producto.codigo;
    const { estado, cuerpo } = await pedir(sinCodigo);
    assert.equal(estado, 400);
    assert.deepEqual(cuerpo, { error: 'faltan_datos', dato: 'datos_del_producto.codigo' });
    assert.equal(llamadasALaBase.length, 0);
    assert.equal(reglasAbiertas.length, 0);
  });

  it('pide cada dato obligatorio y acepta sin correo de respuestas', () => {
    assert.equal(loQueFaltaEnElAlta(null), 'cuerpo');
    assert.equal(loQueFaltaEnElAlta([]), 'cuerpo');
    const casos = [
      [(c) => { delete c.suscripcion_id; }, 'suscripcion_id'],
      [(c) => { c.cliente.razon_social = '  '; }, 'cliente.razon_social'],
      [(c) => { c.cliente.pais = 'Argentina'; }, 'cliente.pais'],
      [(c) => { delete c.datos_del_producto.nombre_fantasia; }, 'datos_del_producto.nombre_fantasia'],
      [(c) => { c.datos_del_producto.email_respuestas = 'no-es-correo'; }, 'datos_del_producto.email_respuestas'],
      [(c) => { delete c.datos_del_producto.administrador.nombre; }, 'datos_del_producto.administrador.nombre'],
      [(c) => { c.datos_del_producto.administrador.email = 'sin-arroba'; }, 'datos_del_producto.administrador.email'],
    ];
    for (const [romper, dato] of casos) {
      const cuerpo = altaCompleta();
      romper(cuerpo);
      assert.equal(loQueFaltaEnElAlta(cuerpo), dato);
    }
    const sinRespuestas = altaCompleta();
    delete sinRespuestas.datos_del_producto.email_respuestas;
    assert.equal(loQueFaltaEnElAlta(sinRespuestas), null);
  });
});
