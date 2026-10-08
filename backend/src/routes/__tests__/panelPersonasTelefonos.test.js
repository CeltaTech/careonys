/**
 * Pruebas de los teléfonos de contacto de una Ficha del Directorio de Personas.
 *
 * Se corren con el banco de pruebas que ya trae Node, sin instalar nada:
 *
 *   node --test "src/**\/__tests__/*.test.js"
 *
 * Se levanta el backend de verdad contra una base de mentira que contesta lo que cada prueba le
 * prepara, y se mira la dirección entera de cada consulta y con qué credencial llegó. Eso es lo que
 * permite comprobar las dos cosas que importan acá: que cada consulta separe una Prestadora de
 * otra —leer va con la credencial de quien pide y lo separa la protección por fila de la base;
 * cargar, corregir y sacar siguen con la llave maestra y lo separa el filtro escrito en la
 * consulta—, y que el número no se escriba nunca en una dirección.
 *
 * La base de mentira imita esa protección en lo único que hace falta: con la credencial de quien
 * pide contesta sólo las Fichas de su Prestadora, y con la llave maestra contesta los que pida el
 * filtro de la dirección. Así, una lectura que volviera a la llave maestra, o una escritura que
 * perdiera el filtro, encontraría la Ficha ajena, y las pruebas de aislamiento darían al revés. La
 * protección por fila en sí la prueba `scripts/probar_aislamiento.mjs` contra una base de verdad.
 *
 * Los números son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const PERSONA = '33333333-3333-3333-3333-333333333333';
const OTRA_PERSONA = '44444444-4444-4444-4444-444444444444';
const PERSONA_AJENA = '55555555-5555-5555-5555-555555555555';
const TELEFONO_ID = '66666666-6666-6666-6666-666666666666';

// Inventados, y a propósito el mismo en dos Fichas distintas.
const CASA = '+54 9 11 5555-1234';
const CELULAR = '+54 9 11 5555-9876';

/** Qué contesta la base a cada `MÉTODO /ruta`. Recibe el cuerpo y la dirección entera. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. Los filtros viajan en la dirección. */
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
    llamadas.push({ clave, url: req.url, cuerpo, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(cuerpo, req.url, req.headers.authorization) : preparada;
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
const { panelPersonasTelefonosRouter } = await import('../panelPersonasTelefonos.js');
const { huellaComparable } = await import('../../utils/celularDeUnaSolaPersona.js');
const { conElPreferidoMarcado, telefonoLimpio } = await import('../../utils/telefonosDeLaPersona.js');
const { supabase } = await import('../../db/connection.js');

const app = express();
app.use(express.json());
app.use('/api/panel/personas/telefonos', panelPersonasTelefonosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/personas/telefonos`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** La credencial que mandó el último pedido: las lecturas tienen que llegar con esa. */
let credencialEnviada = null;

/** Si la base, con la credencial de quien pide, le deja ver el Directorio (`ver_personas`). */
let laBaseLeDejaVerElDirectorio = true;

async function pedir(metodo, ruta, cuerpo) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: credencialEnviada, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Dos Fichas de esta Prestadora y una de otra, que es lo que hace falta para probar aislamiento:
 *  una consulta que vuelve vacía no prueba nada, porque una ruta que niega todo devuelve lo mismo. */
const DIRECTORIO_EN_LA_BASE = [
  { id: PERSONA, prestadora_id: PRESTADORA },
  { id: OTRA_PERSONA, prestadora_id: PRESTADORA },
  { id: PERSONA_AJENA, prestadora_id: OTRA_PRESTADORA },
];

function filaTelefono(id, personaId, telefono, creado = '2026-09-01T10:00:00Z') {
  return { id, persona_id: personaId, telefono, created_at: creado, updated_at: creado };
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
  laBaseLeDejaVerElDirectorio = true;
  // El Directorio de la base, con Fichas de dos Prestadoras. Con la credencial de quien pide, la
  // base contesta sólo las de su Prestadora, y ninguna si no tiene el permiso de ver el Directorio;
  // con la llave maestra, las que pida el filtro de la dirección. Es la única forma de que esta
  // prueba pueda fallar: si la lectura volviera a la llave maestra, o la escritura perdiera el
  // filtro, la Ficha ajena aparecería. Una base de mentira que devuelve vacío por su cuenta aprobaría igual.
  respuestas.set('GET /rest/v1/personas', (_cuerpo, url, credencial) => {
    const pedido = new URL(url, 'http://interno').searchParams;
    const valorDe = (parametro) => (pedido.get(parametro) ?? '').replace(/^eq\./, '') || null;
    const id = valorDe('id');
    const prestadora = valorDe('prestadora_id');
    const conSesion = credencial === credencialEnviada;
    if (conSesion && !laBaseLeDejaVerElDirectorio) return [];
    return DIRECTORIO_EN_LA_BASE.filter(
      (persona) => (!id || persona.id === id)
        && (!conSesion || persona.prestadora_id === PRESTADORA)
        && (!prestadora || persona.prestadora_id === prestadora),
    );
  });
});

/** Las consultas de datos, sin las que resuelven quién pide. */
function consultasDeDatos() {
  return llamadas.filter((l) => l.clave.includes('/rest/v1/telefonos_de_la_persona'));
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
      filaTelefono('a', PERSONA, CASA, '2026-09-01T10:00:00Z'),
      filaTelefono('b', PERSONA, CELULAR, '2026-09-02T10:00:00Z'),
    ];
    const marcados = await conElPreferidoMarcado(supabase, filas, PRESTADORA);
    assert.deepEqual(marcados.map((f) => f.preferido), [false, true]);
  });

  it('sin cuenta no hay preferido, y no se inventa ninguno', async () => {
    lasCuentasLlevan();
    const filas = [filaTelefono('a', PERSONA, CASA), filaTelefono('b', PERSONA, CELULAR)];
    const marcados = await conElPreferidoMarcado(supabase, filas, PRESTADORA);
    assert.deepEqual(marcados.map((f) => f.preferido), [false, false]);
    assert.equal(marcados.length, 2, 'los demás siguen habilitados igual');
  });

  it('el número no viaja en la consulta que resuelve el preferido: viaja su huella', async () => {
    lasCuentasLlevan(CELULAR);
    await conElPreferidoMarcado(supabase, [filaTelefono('a', PERSONA, CELULAR)], PRESTADORA);
    const consulta = llamadas.find((l) => l.url.includes('telefono_comparable'));
    assert.ok(consulta, 'se preguntó por las cuentas');
    assert.ok(!consulta.url.includes(digitos(CELULAR)), 'el número no está escrito en la dirección');
    assert.ok(consulta.url.includes(huellaComparable(CELULAR)), 'lo que viaja es la huella');
  });

  it('uno fuera de uso no es el preferido aunque sea el de la cuenta', async () => {
    lasCuentasLlevan(CELULAR);
    const filas = [{ ...filaTelefono('a', PERSONA, CELULAR), fuera_de_uso_at: '2026-10-01T10:00:00Z' }];
    const marcados = await conElPreferidoMarcado(supabase, filas, PRESTADORA);
    assert.equal(marcados[0].preferido, false);
    assert.equal(marcados.length, 1, 'sigue en la Ficha');
  });

  it('no poder comprobarlo deja la lista sin nada señalado, nunca con una señal inventada', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => ({ __estado: 500, __cuerpo: { message: 'caída' } }));
    const marcados = await conElPreferidoMarcado(supabase, [filaTelefono('a', PERSONA, CELULAR)], PRESTADORA);
    assert.equal(marcados[0].preferido, false);
  });
});

// ---------------------------------------------------------------------------------------
// Que se puedan repetir
// ---------------------------------------------------------------------------------------

describe('un mismo número en dos Fichas', () => {
  it('se carga sin que nada falle: es un dato de contacto, no una llave para entrar', async () => {
    // El número ya está cargado en otra Ficha de esta misma Prestadora, y la base lo contesta a
    // quien pregunte. Si alguien le agregara a la carga un control de que no se repita, acá lo
    // encontraría y rechazaría: por eso esta prueba puede fallar de verdad.
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [filaTelefono('ya', OTRA_PERSONA, CASA)]);
    respuestas.set('POST /rest/v1/telefonos_de_la_persona', (cuerpo) => [
      filaTelefono(TELEFONO_ID, cuerpo.persona_id, cuerpo.telefono),
    ]);

    const uno = await pedir('POST', `/${PERSONA}`, { telefono: CASA });
    const otro = await pedir('POST', `/${OTRA_PERSONA}`, { telefono: CASA });

    assert.equal(uno.estado, 200);
    assert.equal(otro.estado, 200);
    assert.equal(uno.cuerpo.telefono.telefono, CASA);
    assert.equal(otro.cuerpo.telefono.telefono, CASA);
  });

  it('y las dos Fichas lo devuelven, cada una con lo suyo', async () => {
    lasCuentasLlevan();
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [
      filaTelefono('a', PERSONA, CASA),
      filaTelefono('b', OTRA_PERSONA, CASA),
    ]);

    const { estado, cuerpo } = await pedir('GET', '/');
    assert.equal(estado, 200);
    assert.equal(cuerpo.telefonos.length, 2);
    assert.deepEqual(cuerpo.telefonos.map((t) => t.telefono), [CASA, CASA]);
  });

  it('si ese número repetido es el de una cuenta, queda señalado en las dos Fichas', async () => {
    lasCuentasLlevan(CASA);
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [
      filaTelefono('a', PERSONA, CASA),
      filaTelefono('b', OTRA_PERSONA, CASA),
    ]);

    const { cuerpo } = await pedir('GET', '/');
    assert.deepEqual(cuerpo.telefonos.map((t) => t.preferido), [true, true]);
  });
});

// ---------------------------------------------------------------------------------------
// El aislamiento entre Prestadoras
// ---------------------------------------------------------------------------------------

describe('una Ficha de otra Prestadora', () => {
  it('no se alcanza para cargarle un teléfono', async () => {
    const { estado, cuerpo } = await pedir('POST', `/${PERSONA_AJENA}`, { telefono: CASA });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'persona_no_encontrada');
    assert.equal(consultasDeDatos().length, 0, 'no se llegó a escribir nada');
  });

  it('no se alcanza para leerle los teléfonos', async () => {
    const { estado } = await pedir('GET', `/${PERSONA_AJENA}`);
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('no se alcanza para corregirle uno, ni sabiendo el identificador del teléfono', async () => {
    const { estado } = await pedir('PATCH', `/${PERSONA_AJENA}/${TELEFONO_ID}`, { telefono: CELULAR });
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('no se alcanza para sacarle uno', async () => {
    const { estado } = await pedir('DELETE', `/${PERSONA_AJENA}/${TELEFONO_ID}`);
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('y el que no existe se ve igual que el ajeno', async () => {
    const inexistente = '77777777-7777-7777-7777-777777777777';
    const ajeno = await pedir('GET', `/${PERSONA_AJENA}`);
    const noExiste = await pedir('GET', `/${inexistente}`);
    assert.equal(ajeno.estado, noExiste.estado);
    assert.deepEqual(ajeno.cuerpo, noExiste.cuerpo);
  });

  it('la Prestadora nunca sale del pedido: viene de la Ficha que la base dejó ver', async () => {
    respuestas.set('POST /rest/v1/telefonos_de_la_persona', (cuerpo) => [
      filaTelefono(TELEFONO_ID, cuerpo.persona_id, cuerpo.telefono),
    ]);

    // Se manda una Prestadora ajena adentro del cuerpo, que es lo que falsifica quien llama.
    await pedir('POST', `/${PERSONA}`, { telefono: CASA, prestadora_id: OTRA_PRESTADORA });

    const escritura = llamadas.find((l) => l.clave === 'POST /rest/v1/telefonos_de_la_persona');
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
  });
});

// ---------------------------------------------------------------------------------------
// Que toda consulta lleve el filtro escrito
// ---------------------------------------------------------------------------------------

describe('la credencial de quien pide', () => {
  beforeEach(() => {
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [filaTelefono('a', PERSONA, CASA)]);
    respuestas.set('POST /rest/v1/telefonos_de_la_persona', () => [filaTelefono(TELEFONO_ID, PERSONA, CASA)]);
    respuestas.set('PATCH /rest/v1/telefonos_de_la_persona', () => [filaTelefono(TELEFONO_ID, PERSONA, CELULAR)]);
    respuestas.set('DELETE /rest/v1/telefonos_de_la_persona', () => [{ id: TELEFONO_ID }]);
  });

  it('va en toda consulta de lectura a la Ficha y a sus teléfonos', async () => {
    const pedidos = [
      ['GET', '/'],
      ['GET', `/${PERSONA}`],
    ];
    for (const [metodo, ruta, cuerpo] of pedidos) {
      llamadas = [];
      await pedir(metodo, ruta, cuerpo);
      const aLaBase = llamadas.filter(
        (l) => l.clave.includes('/rest/v1/telefonos_de_la_persona') || l.clave.includes('/rest/v1/personas'),
      );
      assert.ok(aLaBase.length >= 1, `${metodo} ${ruta} tenía que consultar la base`);
      for (const llamada of aLaBase) {
        assert.equal(llamada.credencial, credencialEnviada, `${llamada.clave} no fue con la credencial de quien pide`);
      }
    }
  });

  // Cargar, corregir y sacar siguen con la llave maestra: las políticas de escritura piden
  // `editar_personas`, pero leer la Ficha y el renglón escrito piden además `ver_personas`.
  it('cargar, corregir y sacar van con la llave maestra y el filtro de la Prestadora', async () => {
    const pedidos = [
      ['POST', `/${PERSONA}`, { telefono: CASA }],
      ['PATCH', `/${PERSONA}/${TELEFONO_ID}`, { telefono: CELULAR }],
      ['DELETE', `/${PERSONA}/${TELEFONO_ID}`],
    ];
    for (const [metodo, ruta, cuerpo] of pedidos) {
      llamadas = [];
      const { estado } = await pedir(metodo, ruta, cuerpo);
      assert.equal(estado, 200, `${metodo} ${ruta}`);
      const aLaBase = llamadas.filter(
        (l) => l.clave.includes('/rest/v1/telefonos_de_la_persona') || l.clave.includes('/rest/v1/personas'),
      );
      assert.ok(aLaBase.length >= 2, `${metodo} ${ruta} tenía que leer la Ficha y escribir`);
      for (const llamada of aLaBase) {
        assert.notEqual(llamada.credencial, credencialEnviada, `${llamada.clave} fue con la credencial de quien pide`);
        const filtrada = llamada.url.includes(`prestadora_id=eq.${PRESTADORA}`)
          || llamada.cuerpo?.prestadora_id === PRESTADORA;
        assert.ok(filtrada, `${llamada.clave} sin la Prestadora de la sesión: ${llamada.url}`);
      }
    }
  });

  it('quien puede editar el Directorio y no verlo carga, corrige y saca igual', async () => {
    laBaseLeDejaVerElDirectorio = false;
    assert.equal((await pedir('POST', `/${PERSONA}`, { telefono: CASA })).estado, 200);
    assert.equal((await pedir('PATCH', `/${PERSONA}/${TELEFONO_ID}`, { telefono: CELULAR })).estado, 200);
    assert.equal((await pedir('DELETE', `/${PERSONA}/${TELEFONO_ID}`)).estado, 200);
  });

  it('corregir y sacar filtran además por la Ficha', async () => {
    await pedir('PATCH', `/${PERSONA}/${TELEFONO_ID}`, { telefono: CELULAR });
    await pedir('DELETE', `/${PERSONA}/${TELEFONO_ID}`);

    for (const consulta of consultasDeDatos()) {
      assert.ok(consulta.url.includes(`persona_id=eq.${PERSONA}`), consulta.url);
      assert.ok(consulta.url.includes(`id=eq.${TELEFONO_ID}`), consulta.url);
    }
  });
});

// ---------------------------------------------------------------------------------------
// El número es dato sensible
// ---------------------------------------------------------------------------------------

describe('el número no viaja en ninguna dirección', () => {
  it('ni al cargarlo, ni al corregirlo', async () => {
    respuestas.set('POST /rest/v1/telefonos_de_la_persona', () => [filaTelefono(TELEFONO_ID, PERSONA, CASA)]);
    respuestas.set('PATCH /rest/v1/telefonos_de_la_persona', () => [filaTelefono(TELEFONO_ID, PERSONA, CELULAR)]);

    await pedir('POST', `/${PERSONA}`, { telefono: CASA });
    await pedir('PATCH', `/${PERSONA}/${TELEFONO_ID}`, { telefono: CELULAR });

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
    const { estado, cuerpo } = await pedir('POST', `/${PERSONA}`, { telefono: '   ' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(consultasDeDatos().length, 0);
  });

  it('un teléfono que no está en esa Ficha no se corrige', async () => {
    respuestas.set('PATCH /rest/v1/telefonos_de_la_persona', () => []);
    const { estado, cuerpo } = await pedir('PATCH', `/${PERSONA}/${TELEFONO_ID}`, { telefono: CELULAR });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'telefono_no_encontrado');
  });

  it('un teléfono que no está en esa Ficha no se saca', async () => {
    respuestas.set('DELETE /rest/v1/telefonos_de_la_persona', () => []);
    const { estado, cuerpo } = await pedir('DELETE', `/${PERSONA}/${TELEFONO_ID}`);
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'telefono_no_encontrado');
  });

  it('fuera de uso pone la fecha y no borra; restaurar la quita', async () => {
    respuestas.set('PATCH /rest/v1/telefonos_de_la_persona', (cuerpo) => [
      { ...filaTelefono(TELEFONO_ID, PERSONA, CASA), fuera_de_uso_at: cuerpo.fuera_de_uso_at },
    ]);

    const fuera = await pedir('POST', `/${PERSONA}/${TELEFONO_ID}/fuera-de-uso`);
    assert.equal(fuera.estado, 200);
    assert.ok(fuera.cuerpo.telefono.fuera_de_uso_at);

    const vuelta = await pedir('POST', `/${PERSONA}/${TELEFONO_ID}/restaurar`);
    assert.equal(vuelta.estado, 200);
    assert.equal(vuelta.cuerpo.telefono.fuera_de_uso_at, null);

    assert.ok(!llamadas.some((l) => l.clave === 'DELETE /rest/v1/telefonos_de_la_persona'), 'no se borró nada');
    for (const consulta of consultasDeDatos()) {
      assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`), consulta.url);
      assert.ok(consulta.url.includes(`persona_id=eq.${PERSONA}`), consulta.url);
    }
  });

  it('a una Ficha de otra Prestadora no se le pone ninguno fuera de uso', async () => {
    const { estado } = await pedir('POST', `/${PERSONA_AJENA}/${TELEFONO_ID}/fuera-de-uso`);
    assert.equal(estado, 404);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('sacar uno deja los demás en su lugar', async () => {
    respuestas.set('DELETE /rest/v1/telefonos_de_la_persona', () => [{ id: TELEFONO_ID }]);
    const { estado, cuerpo } = await pedir('DELETE', `/${PERSONA}/${TELEFONO_ID}`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
  });

  it('sin el permiso del Directorio no se escribe', async () => {
    tienePermiso = false;
    const { estado } = await pedir('POST', `/${PERSONA}`, { telefono: CASA });
    assert.equal(estado, 403);
    assert.equal(consultasDeDatos().length, 0);
  });

  it('sin el permiso del Directorio tampoco se lee', async () => {
    tienePermiso = false;
    const { estado } = await pedir('GET', '/');
    assert.equal(estado, 403);
    assert.equal(consultasDeDatos().length, 0);
  });
});
