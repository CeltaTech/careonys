/**
 * `GET /perfil/datos-bancarios` — adónde se le paga, mirado por el dueño del dato.
 *
 *   node --test "src/**\/__tests__/*.test.js"
 *
 * POR QUÉ EXISTE ESTA PRUEBA. No es que la ruta conteste 200. Son cuatro cosas, y ninguna se ve
 * mirando la pantalla:
 *
 *   1. DE QUIÉN SON LOS DATOS LO DECIDE LA SESIÓN. El identificador del Asistente no viaja en el
 *      pedido: no hay dónde escribir el de otra persona.
 *   2. NADIE VE LA CUENTA DE OTRO. El motor entra a la base con la llave de servicio y se saltea la
 *      protección por fila, así que lo único que separa un Asistente de otro —y una Prestadora de
 *      otra— son los filtros de esta ruta. Si faltaran, la pantalla se vería igual de bien.
 *   3. EL NÚMERO DE LA CUENTA NO SALE POR NINGÚN OTRO LADO. Va en el cuerpo de la respuesta y en
 *      ningún otro lugar: ni en la dirección de una consulta, ni en un mensaje de error.
 *   4. VERIFICAR ES MIRAR. Por esta puerta no se corrige nada: no hay ninguna escritura.
 *
 * Qué daría con el sistema roto: si un filtro se perdiera, la prueba del aislamiento falla; si
 * alguien buscara la cuenta por su número, aparecería en la dirección de la consulta y la prueba
 * del número que no sale lo dice; si se agregara una escritura, la última prueba deja de dar 404.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // la cuenta: usuarios.id === auth.uid()
// El Legajo de esa persona en esta Prestadora, que es otro número que el de la cuenta.
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';

// Inventado, como todo lo que se siembra en una prueba.
const NUMERO_DE_LA_CUENTA = '0001112223334445556667';

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
    llamadas.push({ clave, url: req.url });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada;
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
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes', appAsistentesRouter);
const motor = app.listen(0, '127.0.0.1');
await new Promise((listo) => motor.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${motor.address().port}/api/app-asistentes`;

after(() => {
  motor.close();
  baseFalsa.close();
});

async function pedirCuentas() {
  const respuesta = await fetch(`${DIRECCION}/perfil/datos-bancarios`, {
    headers: { Authorization: 'Bearer token-de-mentira' },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Las direcciones con las que se consultó una tabla. Los filtros están ahí. */
function consultasA(tabla) {
  return llamadas.filter((l) => l.clave === `GET /rest/v1/${tabla}`).map((l) => l.url);
}

let cuentas;

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  cuentas = [
    {
      pais: 'AR',
      identificador_clase: 'cbu',
      identificador: NUMERO_DE_LA_CUENTA,
      banco: 'Banco Inventado',
      titular: 'Nombre Inventado',
      updated_at: '2026-09-01T10:00:00Z',
    },
    {
      pais: 'AR',
      identificador_clase: 'alias',
      identificador: 'nombre.inventado.cuenta',
      banco: null,
      titular: null,
      updated_at: '2026-09-01T10:00:00Z',
    },
  ];

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/datos_bancarios_asistente', () => cuentas);
  respuestas.set('GET /rest/v1/catalogo_identificadores_de_cuenta', () => [
    { pais: 'AR', codigo: 'cbu', sigla: 'CBU' },
    { pais: 'AR', codigo: 'cvu', sigla: 'CVU' },
    { pais: 'AR', codigo: 'alias', sigla: 'Alias' },
  ]);
});

describe('el Asistente mira adónde se le paga', () => {
  it('cada cuenta sale con el número y con cómo se llama ese número en su país', async () => {
    const { estado, cuerpo } = await pedirCuentas();
    assert.equal(estado, 200);
    assert.equal(cuerpo.cuentas.length, 2);

    const porCbu = cuerpo.cuentas.find((c) => c.clase === 'cbu');
    assert.equal(porCbu.sigla, 'CBU');
    assert.equal(porCbu.identificador, NUMERO_DE_LA_CUENTA);
    assert.equal(porCbu.banco, 'Banco Inventado');
    assert.equal(porCbu.titular, 'Nombre Inventado');

    // Sin la sigla, comprobar que el número está bien sería adivinar de qué número se trata.
    assert.equal(cuerpo.cuentas.find((c) => c.clase === 'alias').sigla, 'Alias');
  });

  it('sin ninguna cuenta cargada contesta la lista vacía, y no le pregunta al catálogo', async () => {
    cuentas = [];
    const { estado, cuerpo } = await pedirCuentas();
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.cuentas, []);
    assert.equal(consultasA('catalogo_identificadores_de_cuenta').length, 0);
  });

  // ESTO ES LO QUE SEPARA A UN ASISTENTE DE OTRO. El motor se saltea la protección por fila.
  it('la consulta va filtrada por el Asistente de la sesión y por su Prestadora', async () => {
    await pedirCuentas();
    const consultas = consultasA('datos_bancarios_asistente');
    assert.equal(consultas.length, 1);
    assert.ok(
      consultas[0].includes(`asistente_id=eq.${LEGAJO}`),
      'la consulta no se acota al Asistente de la sesión',
    );
    assert.ok(
      consultas[0].includes(`prestadora_id=eq.${PRESTADORA}`),
      'la consulta no lleva el filtro de Prestadora',
    );
  });

  it('el identificador que llega en el pedido no cambia de quién son las cuentas', async () => {
    const otro = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const respuesta = await fetch(
      `${DIRECCION}/perfil/datos-bancarios?asistente_id=${otro}&prestadora_id=${otro}`,
      { headers: { Authorization: 'Bearer token-de-mentira' } },
    );
    assert.equal(respuesta.status, 200);

    const consultas = consultasA('datos_bancarios_asistente');
    assert.ok(consultas[0].includes(`asistente_id=eq.${LEGAJO}`));
    assert.ok(!consultas[0].includes(otro), 'lo que vino en el pedido llegó hasta la base');
  });

  it('el número de la cuenta no aparece en ninguna dirección de consulta', async () => {
    await pedirCuentas();
    for (const llamada of llamadas) {
      assert.ok(
        !decodeURIComponent(llamada.url).includes(NUMERO_DE_LA_CUENTA),
        `el número de la cuenta viajó en una dirección: ${llamada.clave}`,
      );
    }
  });

  it('si la base falla, el aviso no cuenta nada de lo que se estaba leyendo', async () => {
    respuestas.set('GET /rest/v1/datos_bancarios_asistente', () => undefined);
    const { estado, cuerpo } = await pedirCuentas();
    assert.equal(estado, 500);
    assert.ok(!JSON.stringify(cuerpo).includes(NUMERO_DE_LA_CUENTA));
    assert.ok(!JSON.stringify(cuerpo).includes('datos_bancarios_asistente'));
  });

  it('sin sesión no se ve nada', async () => {
    const respuesta = await fetch(`${DIRECCION}/perfil/datos-bancarios`);
    assert.equal(respuesta.status, 401);
    assert.equal(consultasA('datos_bancarios_asistente').length, 0);
  });

  it('quien no es Asistente no entra, aunque tenga sesión', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA }]);
    const { estado } = await pedirCuentas();
    assert.equal(estado, 403);
    assert.equal(consultasA('datos_bancarios_asistente').length, 0);
  });

  // Verificar es mirar: corregir es de la administración de la Prestadora, que es donde el cambio
  // queda anotado. Por esta puerta no entra ninguna escritura.
  it('por acá no se corrige nada', async () => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const respuesta = await fetch(`${DIRECCION}/perfil/datos-bancarios`, {
        method: metodo,
        headers: { Authorization: 'Bearer token-de-mentira', 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: '9999999999999999999999' }),
      });
      assert.equal(respuesta.status, 404, `${metodo} encontró una puerta que no tendría que existir`);
    }
  });
});
