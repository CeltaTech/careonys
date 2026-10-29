/**
 * Los tres middleware de entrada —Panel, Cliente, Asistente— leen a la persona con su propia
 * credencial, y sin una credencial que sea de una persona no leen nada.
 *
 *   node --test src/middleware/__tests__/credencialDeLaPersona.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. De estas tres lecturas sale quién es la persona y en qué Prestadora
 * está parada, y de ahí cuelga todo el pedido. Si se hicieran con la llave maestra, la base
 * contestaría sobre cualquier cuenta de cualquier Prestadora; con la credencial de la persona, le
 * devuelve su propia fila y ninguna otra.
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Con el middleware
 * volviendo a la llave maestra, la prueba de la credencial da al revés; con el rol sin mirar, da
 * al revés la del rol ajeno. Lo que no ve es qué filas devuelve la base de verdad: eso es de
 * `scripts/probar_aislamiento.mjs`. La comprobación de la firma con la clave pública está en
 * `db/__tests__/credencialDeLaPersona.test.js`.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PERSONA = '44444444-4444-4444-4444-444444444444';
const PRESTADORA = '55555555-5555-5555-5555-555555555555';

let llamadas = [];
let usuarioDeLaBase = null;
let filas = {};
let personaReconocida = true;

const baseFalsa = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://interno').pathname;
  llamadas.push({ ruta, metodo: req.method, credencial: req.headers.authorization, apikey: req.headers.apikey });
  res.setHeader('Content-Type', 'application/json');
  if (ruta === '/auth/v1/user') {
    if (!personaReconocida) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: 'credencial inválida' }));
      return;
    }
    res.end(JSON.stringify({ id: PERSONA, aud: 'authenticated', role: 'authenticated' }));
    return;
  }
  const tabla = ruta.replace('/rest/v1/', '');
  const fila = tabla === 'usuarios' ? usuarioDeLaBase : filas[tabla] ?? null;
  const unaSola = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  if (unaSola && !fila) {
    res.writeHead(406);
    res.end(JSON.stringify({ code: 'PGRST116', message: 'sin filas' }));
    return;
  }
  res.end(JSON.stringify(unaSola ? fila : fila ? [fila] : []));
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
const { prepararCredencialDePrueba } = await import('../../__tests__/credencialDePrueba.js');
prepararCredencialDePrueba();

const { sesionDePrueba } = await import('../../__tests__/sesionDePrueba.js');
const { requiereRolPanel } = await import('../requiereRolPanel.js');
const { requiereRolCliente } = await import('../requiereRolCliente.js');
const { requiereRolAsistente } = await import('../requiereRolAsistente.js');

after(() => baseFalsa.close());

beforeEach(() => {
  llamadas = [];
  usuarioDeLaBase = null;
  filas = {};
  personaReconocida = true;
});

/** Pasa un pedido por el middleware y devuelve cómo terminó. */
async function pasarPor(middleware, autorizacion) {
  const req = { method: 'GET', originalUrl: '/prueba', headers: autorizacion ? { authorization: autorizacion } : {} };
  let estado = null;
  let siguio = false;
  const res = {
    status(codigo) { estado = codigo; return this; },
    json() { return this; },
    on() {},
  };
  await middleware(req, res, () => { siguio = true; });
  return { req, estado, siguio };
}

const lecturasDe = (tabla) => llamadas.filter((l) => l.ruta === `/rest/v1/${tabla}` && l.metodo === 'GET');
const escriturasDe = (tabla) => llamadas.filter((l) => l.ruta === `/rest/v1/${tabla}` && l.metodo !== 'GET');

/** Un permiso de acceso abierto por CeltaTech, con la actividad y el tope que se le pidan. */
function permisoAbierto({ quietoHaceMin = 1, venceEnMin = 30 } = {}) {
  const ahora = Date.now();
  return {
    id: 'permiso-1',
    prestadora_id: PRESTADORA,
    ultima_actividad_at: new Date(ahora - quietoHaceMin * 60_000).toISOString(),
    expira_at: new Date(ahora + venceEnMin * 60_000).toISOString(),
  };
}

describe('el Panel', () => {
  it('lee la cuenta con la credencial de la persona, y nunca con la llave maestra', async () => {
    // El rol técnico es el que más lee: la cuenta y los permisos de acceso abiertos.
    usuarioDeLaBase = { rol: 'superadmin', prestadora_id: null };
    filas.permisos_de_acceso = permisoAbierto();
    const credencial = sesionDePrueba(PERSONA);

    const { req, siguio } = await pasarPor(requiereRolPanel, credencial);

    assert.equal(siguio, true);
    assert.equal(req.usuarioPanel.id, PERSONA);
    assert.equal(req.usuarioPanel.prestadoraId, PRESTADORA);
    for (const tabla of ['usuarios', 'permisos_de_acceso']) {
      const lecturas = lecturasDe(tabla);
      assert.ok(lecturas.length > 0, `no se leyó ${tabla}`);
      for (const l of lecturas) {
        assert.equal(l.credencial, credencial, `${tabla} se leyó con otra credencial`);
        assert.equal(l.apikey, 'clave-publica-de-mentira');
      }
    }
    // La actividad se anota con la credencial del trabajo de la Prestadora: la persona sólo lee
    // sus permisos.
    const anotaciones = escriturasDe('permisos_de_acceso');
    assert.equal(anotaciones.length, 1);
    assert.notEqual(anotaciones[0].credencial, credencial);
  });

  it('con una credencial que la base no reconoce, contesta 401 y no lee ninguna cuenta', async () => {
    personaReconocida = false;

    const { estado, siguio } = await pasarPor(requiereRolPanel, sesionDePrueba(PERSONA));

    assert.equal(estado, 401);
    assert.equal(siguio, false);
    assert.equal(lecturasDe('usuarios').length, 0);
  });

  it('sin credencial, o con una que no es de una persona, contesta 401', async () => {
    usuarioDeLaBase = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };
    for (const valor of [undefined, 'Bearer token-de-mentira', sesionDePrueba(PERSONA, { rol: 'anon' })]) {
      const { estado, siguio } = await pasarPor(requiereRolPanel, valor);
      assert.equal(estado, 401);
      assert.equal(siguio, false);
    }
    assert.equal(lecturasDe('usuarios').length, 0);
  });

  it('una credencial de otra región no pasa', async () => {
    usuarioDeLaBase = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };

    const { estado } = await pasarPor(
      requiereRolPanel,
      sesionDePrueba(PERSONA, { emisor: 'https://otra-region.example/auth/v1' }),
    );

    assert.equal(estado, 401);
  });

  it('una cuenta que no es del Panel, o que la base no devuelve, contesta 403', async () => {
    for (const cuenta of [{ rol: 'cliente', prestadora_id: PRESTADORA }, { rol: 'inventado', prestadora_id: PRESTADORA }, null]) {
      usuarioDeLaBase = cuenta;
      const { estado, siguio } = await pasarPor(requiereRolPanel, sesionDePrueba(PERSONA));
      assert.equal(estado, 403, `pasó con ${JSON.stringify(cuenta)}`);
      assert.equal(siguio, false);
    }
  });

  it('el rol técnico sin un permiso vigente no entra, con el mismo rechazo que cualquier rol sin acceso', async () => {
    // Sin permiso, con uno vencido por el tope y con uno vencido por quietud: los tres afuera.
    for (const permiso of [null, permisoAbierto({ venceEnMin: -1 }), permisoAbierto({ quietoHaceMin: 6 })]) {
      for (const prestadoraPropia of [null, PRESTADORA]) {
        usuarioDeLaBase = { rol: 'superadmin', prestadora_id: prestadoraPropia };
        filas.permisos_de_acceso = permiso;
        const { estado, siguio, req } = await pasarPor(requiereRolPanel, sesionDePrueba(PERSONA));
        const caso = `permiso ${JSON.stringify(permiso)}, Prestadora propia ${prestadoraPropia}`;
        assert.equal(estado, 403, caso);
        assert.equal(siguio, false, caso);
        assert.equal(req.usuarioPanel, undefined, caso);
      }
    }
  });

  it('Admin_prestadora y Coordinador entran a su Prestadora sin buscar ningún permiso', async () => {
    for (const rol of ['admin_prestadora', 'coordinador']) {
      llamadas = [];
      usuarioDeLaBase = { rol, prestadora_id: PRESTADORA };
      const { req, siguio } = await pasarPor(requiereRolPanel, sesionDePrueba(PERSONA));
      assert.equal(siguio, true, rol);
      assert.equal(req.usuarioPanel.prestadoraId, PRESTADORA, rol);
      assert.equal(req.usuarioPanel.conPermisoDeAcceso, false, rol);
      assert.equal(lecturasDe('permisos_de_acceso').length, 0, rol);
    }
  });
});

describe('el Cliente', () => {
  it('lee la cuenta y el Cliente con la credencial de la persona', async () => {
    usuarioDeLaBase = { rol: 'cliente', prestadora_id: PRESTADORA };
    filas.clientes = { id: 'cliente-1' };
    const credencial = sesionDePrueba(PERSONA);

    const { req, siguio } = await pasarPor(requiereRolCliente, credencial);

    assert.equal(siguio, true);
    assert.equal(req.usuarioCliente.clienteId, 'cliente-1');
    for (const l of [...lecturasDe('usuarios'), ...lecturasDe('clientes')]) {
      assert.equal(l.credencial, credencial);
    }
  });

  it('sin persona reconocida contesta 401, y con otro rol 403', async () => {
    personaReconocida = false;
    assert.equal((await pasarPor(requiereRolCliente, sesionDePrueba(PERSONA))).estado, 401);

    personaReconocida = true;
    usuarioDeLaBase = { rol: 'asistente', prestadora_id: PRESTADORA };
    assert.equal((await pasarPor(requiereRolCliente, sesionDePrueba(PERSONA))).estado, 403);
  });
});

describe('el Asistente', () => {
  it('lee la cuenta y su Legajo con la credencial de la persona', async () => {
    usuarioDeLaBase = { rol: 'asistente', prestadora_id: PRESTADORA };
    filas.asistentes = { id: 'asistente-1' };
    const credencial = sesionDePrueba(PERSONA);

    const { req, siguio } = await pasarPor(requiereRolAsistente, credencial);

    assert.equal(siguio, true);
    assert.equal(req.usuarioAsistente.asistenteId, 'asistente-1');
    for (const l of [...lecturasDe('usuarios'), ...lecturasDe('asistentes')]) {
      assert.equal(l.credencial, credencial);
    }
  });

  it('sin Legajo que la base le muestre, contesta 403', async () => {
    usuarioDeLaBase = { rol: 'asistente', prestadora_id: PRESTADORA };

    assert.equal((await pasarPor(requiereRolAsistente, sesionDePrueba(PERSONA))).estado, 403);
  });

  it('con la cuenta desactivada no entra, aunque su credencial todavía no haya vencido', async () => {
    usuarioDeLaBase = { rol: 'asistente', prestadora_id: PRESTADORA, desactivada_en: '2027-03-10T12:00:00Z' };
    filas.asistentes = { id: 'asistente-1' };

    const { estado, siguio } = await pasarPor(requiereRolAsistente, sesionDePrueba(PERSONA));

    assert.equal(siguio, false);
    assert.equal(estado, 403);
  });
});
