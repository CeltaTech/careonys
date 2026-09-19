/**
 * `/perfil/datos-bancarios` — adónde se le paga, mirado y escrito por el dueño del dato.
 *
 *   node --test "src/**\/__tests__/*.test.js"
 *
 * POR QUÉ EXISTE ESTA PRUEBA. No es que la ruta conteste 200. Son cinco cosas, y ninguna se ve
 * mirando la pantalla:
 *
 *   1. DE QUIÉN SON LOS DATOS LO DECIDE LA SESIÓN. El identificador del Asistente no viaja en el
 *      pedido: no hay dónde escribir el de otra persona. Vale para mirar y para escribir.
 *   2. NADIE VE NI TOCA LA CUENTA DE OTRO. El motor entra a la base con la llave de servicio y se
 *      saltea la protección por fila, así que lo único que separa un Asistente de otro —y una
 *      Prestadora de otra— son los filtros de estas rutas. Si faltaran, la pantalla se vería
 *      igual de bien.
 *   3. EL NÚMERO DE LA CUENTA NO SALE POR NINGÚN OTRO LADO. Va en el cuerpo del pedido y en el de
 *      la respuesta, y en ningún otro lugar: ni en la dirección de una consulta, ni en un mensaje
 *      de error, ni en el registro de actividad.
 *   4. SE VALIDA ACÁ LO QUE ENTRA. Lo que no sirve no llega a la base.
 *   5. QUEDA ANOTADO QUIÉN LO CAMBIÓ. Cada escritura deja su renglón, con la fila y los nombres de
 *      las columnas, y nada más.
 *
 * Qué daría con el sistema roto: si un filtro se perdiera, las pruebas del aislamiento fallan; si
 * alguien buscara o guardara la cuenta por su número en la dirección, la prueba del número que no
 * sale lo dice; si una escritura dejara de anotarse, la prueba del registro se queda sin renglón.
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
const NUMERO_CORREGIDO = '9998887776665554443332';
// La fila de esa cuenta, que es lo único que se anota en el registro de actividad.
const FILA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
    llamadas.push({ clave, url: req.url, cuerpo: crudo });

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

async function guardarCuenta(clase, cuerpo, extra = '') {
  const respuesta = await fetch(`${DIRECCION}/perfil/datos-bancarios/${clase}${extra}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer token-de-mentira', 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function sacarCuenta(clase) {
  const respuesta = await fetch(`${DIRECCION}/perfil/datos-bancarios/${clase}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer token-de-mentira' },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Las direcciones con las que se consultó una tabla. Los filtros están ahí. */
function consultasA(tabla) {
  return llamadas.filter((l) => l.clave === `GET /rest/v1/${tabla}`).map((l) => l.url);
}

/** Lo que se le mandó a una tabla con un método que escribe. */
function escriturasA(tabla, metodo) {
  return llamadas.filter((l) => l.clave === `${metodo} /rest/v1/${tabla}`);
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
  respuestas.set('GET /rest/v1/prestadoras', () => [{ pais: 'AR' }]);
  // El catálogo contesta lo que se le pregunta: la lista entera cuando se la piden por país, y la
  // clase sola cuando se pregunta si esa clase existe. Sin el filtro, una clase inventada pasaría.
  respuestas.set('GET /rest/v1/catalogo_identificadores_de_cuenta', ({ url }) => {
    const filas = [
      { pais: 'AR', codigo: 'cbu', sigla: 'CBU' },
      { pais: 'AR', codigo: 'cvu', sigla: 'CVU' },
      { pais: 'AR', codigo: 'alias', sigla: 'Alias' },
    ];
    const pedido = new URL(url, 'http://interno').searchParams.get('codigo');
    if (!pedido) return filas;
    return filas.filter((f) => `eq.${f.codigo}` === pedido);
  });

  // La fila que ya estaba, la que se crea y la que se saca. Cada prueba cambia lo que haga falta.
  respuestas.set('PATCH /rest/v1/datos_bancarios_asistente', () => [
    { id: FILA, updated_at: '2026-09-02T10:00:00Z' },
  ]);
  respuestas.set('POST /rest/v1/datos_bancarios_asistente', () => [
    { id: FILA, updated_at: '2026-09-02T10:00:00Z' },
  ]);
  respuestas.set('DELETE /rest/v1/datos_bancarios_asistente', () => [{ id: FILA }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
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

  // La lista es para mirar. Corregir es en la puerta de al lado, que lleva la clase de la cuenta:
  // así una escritura sin clase no puede pisar nada, y el pedido dice siempre qué cuenta toca.
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

describe('el Asistente informa adónde se le paga', () => {
  it('corrige la cuenta que ya tenía de esa clase, sin crear otra', async () => {
    const { estado, cuerpo } = await guardarCuenta('cbu', {
      identificador: NUMERO_CORREGIDO,
      banco: 'Banco Inventado',
      titular: 'Nombre Inventado',
    });
    assert.equal(estado, 200);
    assert.equal(cuerpo.identificador, NUMERO_CORREGIDO);
    assert.equal(cuerpo.clase, 'cbu');
    assert.equal(cuerpo.pais, 'AR');
    assert.equal(escriturasA('datos_bancarios_asistente', 'PATCH').length, 1);
    assert.equal(
      escriturasA('datos_bancarios_asistente', 'POST').length,
      0,
      'corregir la cuenta creó una fila nueva en vez de pisar la que estaba',
    );
  });

  it('la carga cuando todavía no había ninguna de esa clase', async () => {
    respuestas.set('PATCH /rest/v1/datos_bancarios_asistente', () => []);
    const { estado } = await guardarCuenta('alias', { identificador: 'nombre.inventado.cuenta' });
    assert.equal(estado, 200);

    const altas = escriturasA('datos_bancarios_asistente', 'POST');
    assert.equal(altas.length, 1);
    const fila = JSON.parse(altas[0].cuerpo);
    assert.equal(fila.asistente_id, LEGAJO);
    assert.equal(fila.prestadora_id, PRESTADORA);
    assert.equal(fila.identificador_clase, 'alias');
    // El país lo pone la Prestadora, no el pedido: es lo que decide qué clases valen.
    assert.equal(fila.pais, 'AR');
  });

  // ESTO ES LO QUE IMPIDE QUE UN ASISTENTE ESCRIBA LA CUENTA DE OTRO. El motor se saltea la
  // protección por fila, así que sin estos filtros la escritura alcanzaría cualquier fila.
  it('la corrección va filtrada por el Asistente de la sesión, su Prestadora y la clase', async () => {
    await guardarCuenta('cbu', { identificador: NUMERO_CORREGIDO });
    const correccion = escriturasA('datos_bancarios_asistente', 'PATCH')[0].url;
    assert.ok(correccion.includes(`asistente_id=eq.${LEGAJO}`), 'la corrección no se acota al Asistente de la sesión');
    assert.ok(correccion.includes(`prestadora_id=eq.${PRESTADORA}`), 'la corrección no lleva el filtro de Prestadora');
    assert.ok(correccion.includes('identificador_clase=eq.cbu'), 'la corrección no dice qué cuenta toca');
  });

  it('un Asistente no escribe la cuenta de otro, diga lo que diga el pedido', async () => {
    const OTRO_ASISTENTE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const OTRA_PRESTADORA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    respuestas.set('PATCH /rest/v1/datos_bancarios_asistente', () => []);

    const { estado } = await guardarCuenta(
      'cbu',
      {
        identificador: NUMERO_CORREGIDO,
        // Todo lo que se le podría ocurrir escribir a quien quiera cobrarle a otro.
        asistente_id: OTRO_ASISTENTE,
        prestadora_id: OTRA_PRESTADORA,
        id: FILA,
        pais: 'BR',
      },
      `?asistente_id=${OTRO_ASISTENTE}&prestadora_id=${OTRA_PRESTADORA}`,
    );
    assert.equal(estado, 200);

    for (const llamada of llamadas) {
      const todo = `${decodeURIComponent(llamada.url)} ${llamada.cuerpo || ''}`;
      assert.ok(!todo.includes(OTRO_ASISTENTE), `el Legajo de otro llegó a la base: ${llamada.clave}`);
      assert.ok(!todo.includes(OTRA_PRESTADORA), `la Prestadora de otro llegó a la base: ${llamada.clave}`);
    }

    const fila = JSON.parse(escriturasA('datos_bancarios_asistente', 'POST')[0].cuerpo);
    assert.equal(fila.asistente_id, LEGAJO);
    assert.equal(fila.prestadora_id, PRESTADORA);
    assert.equal(fila.pais, 'AR');
  });

  it('el número de la cuenta no aparece en ninguna dirección al guardarlo', async () => {
    await guardarCuenta('cbu', { identificador: NUMERO_CORREGIDO });
    for (const llamada of llamadas) {
      assert.ok(
        !decodeURIComponent(llamada.url).includes(NUMERO_CORREGIDO),
        `el número de la cuenta viajó en una dirección: ${llamada.clave}`,
      );
    }
  });

  it('queda anotado quién lo cambió, y ahí adentro no está el número', async () => {
    await guardarCuenta('cbu', { identificador: NUMERO_CORREGIDO, banco: 'Banco Inventado' });

    const renglones = escriturasA('registro_actividad', 'POST');
    assert.equal(renglones.length, 1, 'el cambio de la cuenta no dejó ningún renglón');
    const renglon = JSON.parse(renglones[0].cuerpo);
    assert.equal(renglon.accion, 'cambio_de_datos_bancarios_del_asistente');
    assert.equal(renglon.usuario_id, USUARIO);
    assert.equal(renglon.prestadora_id, PRESTADORA);
    assert.equal(renglon.tabla_afectada, 'datos_bancarios_asistente');
    assert.equal(renglon.registro_id, FILA);
    // Qué columnas se escribieron, no qué se escribió en ellas.
    assert.deepEqual(renglon.campos_cambiados, ['identificador', 'banco', 'titular']);
    assert.ok(!renglones[0].cuerpo.includes(NUMERO_CORREGIDO), 'el número de la cuenta entró en la auditoría');
  });

  it('lo que no sirve no llega a la base', async () => {
    const malos = [
      [{}, 'identificador_vacio'],
      [{ identificador: '   ' }, 'identificador_vacio'],
      [{ identificador: 123456789 }, 'identificador_vacio'],
      [{ identificador: 'ab' }, 'identificador_invalido'],
      [{ identificador: '0001 1122 2333' }, 'identificador_invalido'],
      [{ identificador: '1'.repeat(65) }, 'identificador_invalido'],
      [{ identificador: NUMERO_CORREGIDO, banco: 'x'.repeat(121) }, 'nombre_del_banco_invalido'],
      [{ identificador: NUMERO_CORREGIDO, titular: { nombre: 'x' } }, 'titular_invalido'],
    ];
    for (const [cuerpoDelPedido, motivo] of malos) {
      llamadas = [];
      const { estado, cuerpo } = await guardarCuenta('cbu', cuerpoDelPedido);
      assert.equal(estado, 400, `pasó algo que no tendría que pasar: ${motivo}`);
      assert.equal(cuerpo.motivo, motivo);
      assert.equal(
        escriturasA('datos_bancarios_asistente', 'PATCH').length
          + escriturasA('datos_bancarios_asistente', 'POST').length,
        0,
        `un dato que no sirve llegó a la base: ${motivo}`,
      );
    }
  });

  it('una manera de identificar la cuenta que no se usa en el país no se guarda', async () => {
    const { estado, cuerpo } = await guardarCuenta('iban', { identificador: NUMERO_CORREGIDO });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'clase_de_cuenta_invalida');
    assert.equal(escriturasA('datos_bancarios_asistente', 'PATCH').length, 0);
    assert.equal(escriturasA('datos_bancarios_asistente', 'POST').length, 0);
  });

  it('si la base falla, el aviso no cuenta nada de lo que se estaba guardando', async () => {
    respuestas.set('PATCH /rest/v1/datos_bancarios_asistente', () => undefined);
    const { estado, cuerpo } = await guardarCuenta('cbu', { identificador: NUMERO_CORREGIDO });
    assert.equal(estado, 500);
    assert.ok(!JSON.stringify(cuerpo).includes(NUMERO_CORREGIDO));
    assert.ok(!JSON.stringify(cuerpo).includes('datos_bancarios_asistente'));
  });

  it('saca la cuenta propia, y también eso queda anotado', async () => {
    const { estado } = await sacarCuenta('cbu');
    assert.equal(estado, 200);

    const borrados = escriturasA('datos_bancarios_asistente', 'DELETE');
    assert.equal(borrados.length, 1);
    assert.ok(borrados[0].url.includes(`asistente_id=eq.${LEGAJO}`), 'el borrado no se acota al Asistente de la sesión');
    assert.ok(borrados[0].url.includes(`prestadora_id=eq.${PRESTADORA}`), 'el borrado no lleva el filtro de Prestadora');
    assert.ok(borrados[0].url.includes('identificador_clase=eq.cbu'), 'el borrado no dice qué cuenta saca');

    const renglon = JSON.parse(escriturasA('registro_actividad', 'POST')[0].cuerpo);
    assert.equal(renglon.accion, 'cambio_de_datos_bancarios_del_asistente');
    assert.equal(renglon.registro_id, FILA);
  });

  it('sacar una cuenta que no está no borra nada ni anota nada', async () => {
    respuestas.set('DELETE /rest/v1/datos_bancarios_asistente', () => []);
    const { estado, cuerpo } = await sacarCuenta('cvu');
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'cuenta_no_encontrada');
    assert.equal(escriturasA('registro_actividad', 'POST').length, 0);
  });

  it('sin sesión no se escribe nada, y quien no es Asistente tampoco', async () => {
    const sinSesion = await fetch(`${DIRECCION}/perfil/datos-bancarios/cbu`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: NUMERO_CORREGIDO }),
    });
    assert.equal(sinSesion.status, 401);

    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA }]);
    const { estado } = await guardarCuenta('cbu', { identificador: NUMERO_CORREGIDO });
    assert.equal(estado, 403);

    assert.equal(escriturasA('datos_bancarios_asistente', 'PATCH').length, 0);
    assert.equal(escriturasA('datos_bancarios_asistente', 'POST').length, 0);
  });
});
