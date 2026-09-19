/**
 * Pruebas de los teléfonos de contacto de una ficha del Padrón.
 *
 * Se corren con el banco de pruebas que ya trae Node, sin instalar nada:
 *
 *   node --test "src/**\/__tests__/*.test.js"
 *
 * Se levanta el motor de verdad contra una base de mentira que contesta lo que cada prueba le
 * prepara, y se mira la dirección entera de cada consulta. Eso es lo que permite comprobar las dos
 * cosas que importan acá: que ninguna consulta se olvide el filtro de Prestadora —el motor entra
 * con la llave de servicio, o sea sin las reglas de acceso—, y que el número no se escriba nunca en
 * una dirección.
 *
 * Los números son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const LEGAJO = '33333333-3333-3333-3333-333333333333';
const OTRO_LEGAJO = '44444444-4444-4444-4444-444444444444';
const LEGAJO_AJENO = '55555555-5555-5555-5555-555555555555';
const TELEFONO_ID = '66666666-6666-6666-6666-666666666666';

// Inventados, y a propósito el mismo en dos fichas distintas.
const CASA = '+54 9 11 5555-1234';
const CELULAR = '+54 9 11 5555-9876';

/** Qué contesta la base a cada `MÉTODO /ruta`. Recibe el cuerpo y la dirección entera. */
const respuestas = new Map();
/** Todo lo que el motor le pidió a la base. Los filtros viajan en la dirección. */
let llamadas = [];

let rolDelUsuario = 'admin_prestadora';
let tienePermiso = true;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(cuerpo, req.url) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.__cuerpo));
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

// Después de las variables de entorno: la conexión se arma al importar.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelPadronTelefonosRouter } = await import('../panelPadronTelefonos.js');
const { huellaComparable } = await import('../../utils/celularDeUnaSolaPersona.js');
const { conElPreferidoMarcado, telefonoLimpio } = await import('../../utils/telefonosDelLegajo.js');

const app = express();
app.use(express.json());
app.use('/api/panel/padron/telefonos', panelPadronTelefonosRouter);
const motor = app.listen(0, '127.0.0.1');
await new Promise((listo) => motor.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${motor.address().port}/api/panel/padron/telefonos`;

after(() => {
  motor.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: 'Bearer token-de-mentira', 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Dos fichas de esta Prestadora y una de otra, que es lo que hace falta para probar aislamiento:
 *  una consulta que vuelve vacía no prueba nada, porque una ruta que niega todo devuelve lo mismo. */
const PADRON_EN_LA_BASE = [
  { id: LEGAJO, prestadora_id: PRESTADORA },
  { id: OTRO_LEGAJO, prestadora_id: PRESTADORA },
  { id: LEGAJO_AJENO, prestadora_id: OTRA_PRESTADORA },
];

function filaTelefono(id, legajoId, telefono, creado = '2026-09-01T10:00:00Z') {
  return { id, legajo_id: legajoId, telefono, created_at: creado, updated_at: creado };
}

/** Las cuentas de la Prestadora cuyo teléfono se va a reconocer como preferido. */
function lasCuentasLlevan(...telefonos) {
  const huellas = telefonos.map((t) => huellaComparable(t));
  respuestas.set('GET /rest/v1/usuarios', (_cuerpo, url) => {
    // La misma tabla contesta dos preguntas distintas: quién es quien pide, y qué números son de
    // alguna cuenta. Se distinguen por las columnas que pide cada una.
    if (url.includes('telefono_comparable')) {
      return huellas.filter((h) => url.includes(h)).map((h) => ({ telefono_comparable: h }));
    }
    return [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }];
  });
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  tienePermiso = true;
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_de', () => tienePermiso);
  // Sin cuentas cargadas: entonces no hay ningún preferido, que es el caso más común al empezar.
  lasCuentasLlevan();
  // El Padrón de la base, con fichas de dos Prestadoras, y la base contestando lo que la consulta
  // le pide. Es la única forma de que esta prueba pueda fallar: el motor entra con la llave de
  // servicio, así que si la ruta se olvida el filtro de Prestadora, la ficha ajena aparece. Una
  // base de mentira que devuelve vacío por su cuenta aprobaría igual a una ruta sin filtro.
  respuestas.set('GET /rest/v1/legajos', (_cuerpo, url) => {
    const pedido = new URL(url, 'http://interno').searchParams;
    const valorDe = (parametro) => (pedido.get(parametro) ?? '').replace(/^eq\./, '') || null;
    const id = valorDe('id');
    const prestadora = valorDe('prestadora_id');
    return PADRON_EN_LA_BASE.filter(
      (ficha) => (!id || ficha.id === id) && (!prestadora || ficha.prestadora_id === prestadora),
    );
  });
});

/** Las consultas de datos, sin las que resuelven quién pide. */
function consultasDeDatos() {
  return llamadas.filter((l) => l.clave.includes('/rest/v1/telefonos_del_legajo'));
}

/** Los dígitos de un número, que es lo único con lo que se lo puede reconocer en una dirección. */
function digitos(telefono) {
  return telefono.replace(/[^\d]/g, '');
}

// ---------------------------------------------------------------------------------------
// Lo que se decide sin tocar la base
// ---------------------------------------------------------------------------------------

describe('qué teléfono se admite', () => {
  it('una cadena de espacios no es un teléfono', () => {
    assert.equal(telefonoLimpio('   '), null);
    assert.equal(telefonoLimpio(''), null);
    assert.equal(telefonoLimpio(null), null);
    assert.equal(telefonoLimpio(12345), null);
  });

  it('lo que se escribió se guarda recortado y tal cual', () => {
    assert.equal(telefonoLimpio(`  ${CASA} `), CASA);
  });
});

// ---------------------------------------------------------------------------------------
// Cuál es el preferido
// ---------------------------------------------------------------------------------------

describe('cuál es el preferido para llamar', () => {
  it('es el que esa Persona usa en su cuenta', async () => {
    lasCuentasLlevan(CELULAR);
    const filas = [
      filaTelefono('a', LEGAJO, CASA, '2026-09-01T10:00:00Z'),
      filaTelefono('b', LEGAJO, CELULAR, '2026-09-02T10:00:00Z'),
    ];
    const marcados = await conElPreferidoMarcado(filas, PRESTADORA);
    assert.deepEqual(marcados.map((f) => f.preferido), [false, true]);
  });

  it('sin cuenta no hay preferido, y no se inventa ninguno', async () => {
    lasCuentasLlevan();
    const filas = [filaTelefono('a', LEGAJO, CASA), filaTelefono('b', LEGAJO, CELULAR)];
    const marcados = await conElPreferidoMarcado(filas, PRESTADORA);
    assert.deepEqual(marcados.map((f) => f.preferido), [false, false]);
    assert.equal(marcados.length, 2, 'los demás siguen habilitados igual');
  });

  it('el número no viaja en la consulta que resuelve el preferido: viaja su huella', async () => {
    lasCuentasLlevan(CELULAR);
    await conElPreferidoMarcado([filaTelefono('a', LEGAJO, CELULAR)], PRESTADORA);
    const consulta = llamadas.find((l) => l.url.includes('telefono_comparable'));
    assert.ok(consulta, 'se preguntó por las cuentas');
    assert.ok(!consulta.url.includes(digitos(CELULAR)), 'el número no está escrito en la dirección');
    assert.ok(consulta.url.includes(huellaComparable(CELULAR)), 'lo que viaja es la huella');
  });

  it('no poder comprobarlo deja la lista sin nada señalado, nunca con una señal inventada', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => ({ __estado: 500, __cuerpo: { message: 'caída' } }));
    const marcados = await conElPreferidoMarcado([filaTelefono('a', LEGAJO, CELULAR)], PRESTADORA);
    assert.equal(marcados[0].preferido, false);
  });
});

// ---------------------------------------------------------------------------------------
// Que se puedan repetir
// ---------------------------------------------------------------------------------------

describe('un mismo número en dos fichas', () => {
  it('se carga sin que nada falle: es un dato de contacto, no una llave para entrar', async () => {
    // El número ya está cargado en otra ficha de esta misma Prestadora, y la base lo contesta a
    // quien pregunte. Si alguien le agregara a la carga un control de que no se repita, acá lo
    // encontraría y rechazaría: por eso esta prueba puede fallar de verdad.
    respuestas.set('GET /rest/v1/telefonos_del_legajo', () => [filaTelefono('ya', OTRO_LEGAJO, CASA)]);
    respuestas.set('POST /rest/v1/telefonos_del_legajo', (cuerpo) => [
      filaTelefono(TELEFONO_ID, cuerpo.legajo_id, cuerpo.telefono),
    ]);

    const uno = await pedir('POST', `/${LEGAJO}`, { telefono: CASA });
    const otro = await pedir('POST', `/${OTRO_LEGAJO}`, { telefono: CASA });

    assert.equal(uno.estado, 200);
    assert.equal(otro.estado, 200);
    assert.equal(uno.cuerpo.telefono.telefono, CASA);
    assert.equal(otro.cuerpo.telefono.telefono, CASA);
  });

  it('y las dos fichas lo devuelven, cada una con lo suyo', async () => {
    lasCuentasLlevan();
    respuestas.set('GET /rest/v1/telefonos_del_legajo', () => [
      filaTelefono('a', LEGAJO, CASA),
      filaTelefono('b', OTRO_LEGAJO, CASA),
    ]);

    const { estado, cuerpo } = await pedir('GET', '/');
    assert.equal(estado, 200);
    assert.equal(cuerpo.telefonos.length, 2);
    assert.deepEqual(cuerpo.telefonos.map((t) => t.telefono), [CASA, CASA]);
  });

  it('si ese número repetido es el de una cuenta, queda señalado en las dos fichas', async () => {
    lasCuentasLlevan(CASA);
    respuestas.set('GET /rest/v1/telefonos_del_legajo', () => [
      filaTelefono('a', LEGAJO, CASA),
      filaTelefono('b', OTRO_LEGAJO, CASA),
    ]);

    const { cuerpo } = await pedir('GET', '/');
    assert.deepEqual(cuerpo.telefonos.map((t) => t.preferido), [true, true]);
  });
});

// ---------------------------------------------------------------------------------------
// El aislamiento entre Prestadoras
// ---------------------------------------------------------------------------------------

describe('una ficha de otra Prestadora', () => {
  it('no se alcanza para cargarle un teléfono', async () => {
    const { estado, cuerpo } = await pedir('POST', `/${LEGAJO_AJENO}`, { telefono: CASA });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'legajo_no_encontrado');
    assert.equal(consultasDeDatos().length, 0, 'no se llegó a escribir nada');
  });

  it('no se alcanza para leerle los teléfonos', async () => {
    const { estado } = await pedir('GET', `/${LEGAJO_AJENO}`);
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('no se alcanza para corregirle uno, ni sabiendo el identificador del teléfono', async () => {
    const { estado } = await pedir('PATCH', `/${LEGAJO_AJENO}/${TELEFONO_ID}`, { telefono: CELULAR });
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('no se alcanza para sacarle uno', async () => {
    const { estado } = await pedir('DELETE', `/${LEGAJO_AJENO}/${TELEFONO_ID}`);
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('y el que no existe se ve igual que el ajeno', async () => {
    const inexistente = '77777777-7777-7777-7777-777777777777';
    const ajeno = await pedir('GET', `/${LEGAJO_AJENO}`);
    const noExiste = await pedir('GET', `/${inexistente}`);
    assert.equal(ajeno.estado, noExiste.estado);
    assert.deepEqual(ajeno.cuerpo, noExiste.cuerpo);
  });

  it('la Prestadora nunca sale del pedido: viene de la sesión', async () => {
    respuestas.set('POST /rest/v1/telefonos_del_legajo', (cuerpo) => [
      filaTelefono(TELEFONO_ID, cuerpo.legajo_id, cuerpo.telefono),
    ]);

    // Se manda una Prestadora ajena adentro del cuerpo, que es lo que falsifica quien llama.
    await pedir('POST', `/${LEGAJO}`, { telefono: CASA, prestadora_id: OTRA_PRESTADORA });

    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/telefonos_del_legajo');
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
  });
});

// ---------------------------------------------------------------------------------------
// Que toda consulta lleve el filtro escrito
// ---------------------------------------------------------------------------------------

describe('el filtro de Prestadora', () => {
  beforeEach(() => {
    respuestas.set('GET /rest/v1/telefonos_del_legajo', () => [filaTelefono('a', LEGAJO, CASA)]);
    respuestas.set('POST /rest/v1/telefonos_del_legajo', () => [filaTelefono(TELEFONO_ID, LEGAJO, CASA)]);
    respuestas.set('PATCH /rest/v1/telefonos_del_legajo', () => [filaTelefono(TELEFONO_ID, LEGAJO, CELULAR)]);
    respuestas.set('DELETE /rest/v1/telefonos_del_legajo', () => [{ id: TELEFONO_ID }]);
  });

  it('va escrito en toda consulta a la tabla, sea leer, corregir o sacar', async () => {
    await pedir('GET', '/');
    await pedir('GET', `/${LEGAJO}`);
    await pedir('PATCH', `/${LEGAJO}/${TELEFONO_ID}`, { telefono: CELULAR });
    await pedir('DELETE', `/${LEGAJO}/${TELEFONO_ID}`);

    const sinFiltro = consultasDeDatos().filter(
      (l) => l.clave !== 'POST /rest/v1/telefonos_del_legajo'
        && !l.url.includes(`prestadora_id=eq.${PRESTADORA}`),
    );
    assert.deepEqual(sinFiltro.map((l) => l.url), [], 'ninguna consulta sin el filtro');
  });

  it('corregir y sacar filtran además por la ficha', async () => {
    await pedir('PATCH', `/${LEGAJO}/${TELEFONO_ID}`, { telefono: CELULAR });
    await pedir('DELETE', `/${LEGAJO}/${TELEFONO_ID}`);

    for (const consulta of consultasDeDatos()) {
      assert.ok(consulta.url.includes(`legajo_id=eq.${LEGAJO}`), consulta.url);
      assert.ok(consulta.url.includes(`id=eq.${TELEFONO_ID}`), consulta.url);
    }
  });
});

// ---------------------------------------------------------------------------------------
// El número es dato sensible
// ---------------------------------------------------------------------------------------

describe('el número no viaja en ninguna dirección', () => {
  it('ni al cargarlo, ni al corregirlo', async () => {
    respuestas.set('POST /rest/v1/telefonos_del_legajo', () => [filaTelefono(TELEFONO_ID, LEGAJO, CASA)]);
    respuestas.set('PATCH /rest/v1/telefonos_del_legajo', () => [filaTelefono(TELEFONO_ID, LEGAJO, CELULAR)]);

    await pedir('POST', `/${LEGAJO}`, { telefono: CASA });
    await pedir('PATCH', `/${LEGAJO}/${TELEFONO_ID}`, { telefono: CELULAR });

    for (const consulta of llamadas) {
      assert.ok(!consulta.url.includes(digitos(CASA)), consulta.url);
      assert.ok(!consulta.url.includes(digitos(CELULAR)), consulta.url);
      assert.ok(!consulta.url.includes(encodeURIComponent(CASA)), consulta.url);
    }
  });
});

// ---------------------------------------------------------------------------------------
// El resto del camino
// ---------------------------------------------------------------------------------------

describe('cargar, corregir y sacar', () => {
  it('sin número no se escribe nada', async () => {
    const { estado, cuerpo } = await pedir('POST', `/${LEGAJO}`, { telefono: '   ' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(consultasDeDatos().length, 0);
  });

  it('un teléfono que no está en esa ficha no se corrige', async () => {
    respuestas.set('PATCH /rest/v1/telefonos_del_legajo', () => []);
    const { estado, cuerpo } = await pedir('PATCH', `/${LEGAJO}/${TELEFONO_ID}`, { telefono: CELULAR });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'telefono_no_encontrado');
  });

  it('un teléfono que no está en esa ficha no se saca', async () => {
    respuestas.set('DELETE /rest/v1/telefonos_del_legajo', () => []);
    const { estado, cuerpo } = await pedir('DELETE', `/${LEGAJO}/${TELEFONO_ID}`);
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'telefono_no_encontrado');
  });

  it('sacar uno deja los demás en su lugar', async () => {
    respuestas.set('DELETE /rest/v1/telefonos_del_legajo', () => [{ id: TELEFONO_ID }]);
    const { estado, cuerpo } = await pedir('DELETE', `/${LEGAJO}/${TELEFONO_ID}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
  });

  it('sin el permiso del Padrón no se escribe', async () => {
    tienePermiso = false;
    const { estado } = await pedir('POST', `/${LEGAJO}`, { telefono: CASA });
    assert.equal(estado, 403);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('sin el permiso del Padrón tampoco se lee', async () => {
    tienePermiso = false;
    const { estado } = await pedir('GET', '/');
    assert.equal(estado, 403);
    assert.equal(consultasDeDatos().length, 0);
  });
});
