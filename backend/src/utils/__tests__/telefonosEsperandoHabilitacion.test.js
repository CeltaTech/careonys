/**
 * Los números que esperan que alguien los habilite, y quién ve cuáles.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * QUÉ RESUELVE LA LISTA. Quien cambia su número lo carga y queda a la espera: ese número no sirve
 * para recuperar la clave hasta que una persona lo habilita. La espera tiene que aparecer sola en
 * las tareas pendientes de quien la tiene a cargo, y no obligar a ir a buscar a esa persona a mano.
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Que la regla esté también en la base —el disparador
 * `interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo`— no se prueba desde acá: sin base levantada
 * nada de este archivo puede comprobar un disparador. Lo que se prueba es el filtro del motor, que
 * es el que decide qué sale de la ruta, y cada caso está por el error que evita:
 *
 *   1. QUE LA LISTA SALGA SIN FILTRAR. Quien coordina vería a otro que coordina y podría habilitarlo.
 *   2. QUE ALGUIEN SE VEA A SÍ MISMO. Habilitarse el propio número es justamente lo que la
 *      habilitación viene a impedir.
 *   3. QUE SE MEZCLEN DOS PRESTADORAS. La consulta tiene que ir acotada a la de la sesión.
 *   4. QUE SE FILTRE EL NÚMERO. Es dato sensible: no sale en la lista y no viaja en ninguna
 *      dirección.
 *   5. QUE EL YA HABILITADO SIGA APARECIENDO, y que habilitar un número viejo dé por habilitado el
 *      que vino después.
 *   6. QUE UN ROL QUE NO SE ENTIENDE PASE. Todo control de acceso falla cerrado.
 *   7. QUE SE PREGUNTE SIN SESIÓN ENTENDIBLE.
 *   8. QUE EL NÚMERO VERIFICADO SE CAIGA DE LA LISTA. Verificar no es habilitar: quien verificó su
 *      número antes de que nadie lo llamara tiene que seguir apareciendo.
 *
 * LAS PRUEBAS QUE IMPORTAN ROMPEN EL CONTROL A PROPÓSITO: los mismos datos, mirados por quien sí
 * puede, tienen que aparecer. Sin eso una prueba que dice «no se ve» no prueba nada, porque podría
 * no verse por cualquier otro motivo.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const QUIEN_COORDINA = '11111111-1111-4111-8111-111111111111';
const OTRA_QUE_COORDINA = '22222222-2222-4222-8222-222222222222';
const LA_ADMINISTRACION = '33333333-3333-4333-8333-333333333333';
const UN_ASISTENTE = '44444444-4444-4444-8444-444444444444';
const UNA_FAMILIA = '55555555-5555-4555-8555-555555555555';

const CELULAR = '+54 9 11 5555-1234';
const OTRO_CELULAR = '+54 9 11 5555-9999';

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
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de las variables de entorno: la conexión se arma al importar.
const { telefonosEsperandoHabilitacion } = await import('../habilitarCambioDeClave.js');
const { huellaDelTelefono } = await import('../codigoAlTelefono.js');

after(() => {
  baseFalsa.close();
});

/** Las cuentas de la Prestadora con un número cargado y sin habilitar, tal como salen de la base. */
function cuentasConNumeroCargado(filas) {
  respuestas.set('GET /rest/v1/usuarios', filas);
}

/** Los números que alguien ya habilitó. */
function yaHabilitados(filas) {
  respuestas.set('GET /rest/v1/telefonos_confirmados_por_la_prestadora', filas);
}

function laCoordinacion(extra = {}) {
  return { id: QUIEN_COORDINA, prestadoraId: PRESTADORA, rol: 'coordinador', ...extra };
}

function laAdministracion(extra = {}) {
  return { id: LA_ADMINISTRACION, prestadoraId: PRESTADORA, rol: 'admin_prestadora', ...extra };
}

const EL_ASISTENTE = {
  id: UN_ASISTENTE, nombre: 'Rosa Giménez', email: 'rosa@ejemplo.test',
  rol: 'asistente', telefono: CELULAR, telefono_verificado_en: null,
};
const LA_FAMILIA = {
  id: UNA_FAMILIA, nombre: 'Marta Ibáñez', email: 'marta@ejemplo.test',
  rol: 'familia', telefono: OTRO_CELULAR, telefono_verificado_en: null,
};
const LA_OTRA_QUE_COORDINA = {
  id: OTRA_QUE_COORDINA, nombre: 'Elena Duarte', email: 'elena@ejemplo.test',
  rol: 'coordinador', telefono: CELULAR, telefono_verificado_en: null,
};

function nombres(lista) {
  return lista.map((cuenta) => cuenta.nombre).sort();
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

describe('los números que esperan habilitación', () => {
  it('la coordinación ve al Asistente y a la Familia que están esperando', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE, LA_FAMILIA]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(nombres(lista), ['Marta Ibáñez', 'Rosa Giménez']);
  });

  it('quien coordina no ve a otro que coordina', async () => {
    cuentasConNumeroCargado([LA_OTRA_QUE_COORDINA]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(lista, []);
  });

  // El control roto a propósito: los mismos datos, mirados por la administración de la Prestadora,
  // tienen que aparecer. A quien coordina lo habilita la administración.
  it('la administración de la Prestadora sí ve a quien coordina', async () => {
    cuentasConNumeroCargado([LA_OTRA_QUE_COORDINA]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laAdministracion());

    assert.deepEqual(nombres(lista), ['Elena Duarte']);
  });

  it('nadie se ve a sí mismo, aunque el escalón se lo permitiera', async () => {
    // El rol técnico de la empresa está por encima de todos, así que acá lo único que puede dejar
    // afuera esta fila es que sea la suya.
    const yoMismo = { ...EL_ASISTENTE, id: QUIEN_COORDINA };
    cuentasConNumeroCargado([yoMismo]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion({
      id: QUIEN_COORDINA, prestadoraId: PRESTADORA, rol: 'superadmin',
    });

    assert.deepEqual(lista, []);
  });

  // El mismo control roto: la misma fila con otro dueño aparece.
  it('la misma cuenta, que no es la propia, sí aparece', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion({
      id: QUIEN_COORDINA, prestadoraId: PRESTADORA, rol: 'superadmin',
    });

    assert.deepEqual(nombres(lista), ['Rosa Giménez']);
  });

  it('pregunta sólo por la Prestadora de la sesión', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE]);
    yaHabilitados([]);

    await telefonosEsperandoHabilitacion(laCoordinacion());

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.ok(!consulta.url.includes(OTRA_PRESTADORA));
  });

  // El mismo control roto: con la otra Prestadora en la sesión, la consulta cambia de Prestadora.
  // Nunca sale de la sesión, y por eso nadie puede pedir la lista de otra.
  it('con otra Prestadora en la sesión pregunta por esa otra, y por ninguna más', async () => {
    cuentasConNumeroCargado([]);

    await telefonosEsperandoHabilitacion(laCoordinacion({ prestadoraId: OTRA_PRESTADORA }));

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.ok(consulta.url.includes(`prestadora_id=eq.${OTRA_PRESTADORA}`));
    assert.ok(!consulta.url.includes(PRESTADORA));
  });

  it('no devuelve ningún número de teléfono, y ninguno viaja en la dirección', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE, LA_FAMILIA]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    for (const cuenta of lista) {
      assert.deepEqual(Object.keys(cuenta).sort(), ['email', 'id', 'nombre', 'rol']);
    }
    const crudo = JSON.stringify(lista) + llamadas.map((l) => l.url).join(' ');
    for (const numero of [CELULAR, OTRO_CELULAR, '5491155551234', '5491155559999']) {
      assert.ok(!crudo.includes(numero), `se filtró ${numero}`);
    }
  });

  it('el número que alguien ya habilitó sale de la lista', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE]);
    yaHabilitados([{ usuario_id: UN_ASISTENTE, telefono_huella: huellaDelTelefono(CELULAR) }]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(lista, []);
  });

  // El control roto a propósito: lo habilitado es el número viejo, y el que la cuenta tiene hoy es
  // otro. Sigue esperando, porque habilitar un número no habilita al que vino después.
  it('habilitar el número viejo no habilita el que vino después', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE]);
    yaHabilitados([{ usuario_id: UN_ASISTENTE, telefono_huella: huellaDelTelefono(OTRO_CELULAR) }]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(nombres(lista), ['Rosa Giménez']);
  });

  it('un rol que no se entiende no lo ve nadie', async () => {
    cuentasConNumeroCargado([{ ...EL_ASISTENTE, rol: 'lo_que_sea' }]);
    yaHabilitados([]);

    assert.deepEqual(await telefonosEsperandoHabilitacion(laAdministracion()), []);
  });

  it('quien tiene un rol que no se entiende no ve a nadie', async () => {
    cuentasConNumeroCargado([EL_ASISTENTE, LA_FAMILIA]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion({ rol: 'lo_que_sea' }));

    assert.deepEqual(lista, []);
  });

  it('sin Prestadora en la sesión no pregunta nada y no devuelve nada', async () => {
    const lista = await telefonosEsperandoHabilitacion({ id: QUIEN_COORDINA, rol: 'coordinador' });

    assert.deepEqual(lista, []);
    assert.deepEqual(llamadas, []);
  });

  it('sin quién mira no pregunta nada y no devuelve nada', async () => {
    assert.deepEqual(await telefonosEsperandoHabilitacion(null), []);
    assert.deepEqual(llamadas, []);
  });

  it('el número verificado por su dueño sigue esperando que una persona lo habilite', async () => {
    // Verificar prueba que el número funciona; no prueba de quién es. Filtrar por la verificación
    // dejaba afuera de la lista a quien cargó su número y lo verificó antes de que nadie lo
    // llamara, y esa persona no aparecía nunca en las tareas pendientes de quien la tiene a cargo.
    const verificado = { ...EL_ASISTENTE, telefono_verificado_en: new Date().toISOString() };
    cuentasConNumeroCargado([verificado]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(nombres(lista), ['Rosa Giménez']);
    // La columna se sigue pidiendo, porque la pantalla muestra si el número está verificado; lo que
    // no puede volver es un filtro que deje afuera a quien lo verificó.
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    assert.ok(
      !/telefono_verificado_en=/.test(consulta.url),
      `la consulta volvió a filtrar por la verificación: ${consulta.url}`,
    );
  });

  // El control roto a propósito: esa misma cuenta, ya habilitada por una persona, sale de la lista.
  it('el número verificado y ya habilitado sí sale de la lista', async () => {
    const verificado = { ...EL_ASISTENTE, telefono_verificado_en: new Date().toISOString() };
    cuentasConNumeroCargado([verificado]);
    yaHabilitados([{ usuario_id: UN_ASISTENTE, telefono_huella: huellaDelTelefono(CELULAR) }]);

    assert.deepEqual(await telefonosEsperandoHabilitacion(laCoordinacion()), []);
  });

  it('no hay ninguna espera por tiempo: nada sale de la lista por vencimiento', async () => {
    // La cuenta cargó el número hace mucho y sigue esperando. Que pase el tiempo no la habilita ni
    // la saca: sale cuando una persona la habilita, y no antes.
    const hace_un_ano = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    respuestas.set('GET /rest/v1/usuarios', [{ ...EL_ASISTENTE, created_at: hace_un_ano }]);
    yaHabilitados([]);

    const lista = await telefonosEsperandoHabilitacion(laCoordinacion());

    assert.deepEqual(nombres(lista), ['Rosa Giménez']);
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios');
    // Y la consulta no pregunta por ninguna fecha: no hay ventana ni vencimiento en ningún lado.
    assert.ok(!/expira|vence|created_at/.test(consulta.url));
  });
});
