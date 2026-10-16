/**
 * Los equipos conocidos: con qué credencial se lee y con cuál se escribe cada cosa.
 *
 *   node --test src/utils/__tests__/equiposConocidos.test.js
 *
 * Lo que se lee va con la credencial de quien pide. Lo que se anota o se revoca en
 * `equipos_conocidos` va con el trabajo de su Prestadora, porque si la persona pudiera escribir esa
 * tabla se ahorraría el segundo factor. Las llaves de las aplicaciones de teléfono las revoca la
 * propia persona, y no se borran.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: además del resultado se mira con qué
 * credencial se le pidió cada cosa. Con el sistema roto —otra credencial, otra Prestadora, o la
 * llave borrada en vez de revocada— las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const DE_LA_PERSONA = 'Bearer credencial-de-quien-pide';

let llamadas = [];

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
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ clave: `${req.method} ${url.pathname}`, url, cuerpo: crudo, credencial: req.headers.authorization });
    if (url.pathname.startsWith('/auth/v1/')) {
      res.writeHead(204);
      res.end();
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? null : []));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { createClient } = await import('@supabase/supabase-js');
const { equipoConocido, anotarEquipo, equiposDe, cerrarSesionEnTodosLosEquipos } = await import('../equiposConocidos.js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  accessToken: async () => DE_LA_PERSONA.replace('Bearer ', ''),
});

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

function conElTrabajoDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
}

describe('los equipos conocidos', () => {
  it('saber si el equipo es conocido se lee con la credencial de quien pide', async () => {
    await equipoConocido({ usuarioId: USUARIO, prestadoraId: PRESTADORA, marca: 'marca-inventada', db });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].clave, 'GET /rest/v1/equipos_conocidos');
    assert.equal(llamadas[0].credencial, DE_LA_PERSONA);
  });

  it('la lista de equipos se lee con la credencial de quien pide', async () => {
    await equiposDe(USUARIO, PRESTADORA, db);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].credencial, DE_LA_PERSONA);
  });

  it('anotar un equipo lo escribe el trabajo de la Prestadora de la cuenta', async () => {
    const marca = await anotarEquipo({ usuario: { id: USUARIO, prestadora_id: PRESTADORA }, marca: null });
    assert.ok(marca);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].clave, 'POST /rest/v1/equipos_conocidos');
    conElTrabajoDeLaPrestadora(llamadas[0]);
  });

  it('cerrar todo revoca los equipos con el trabajo y las llaves con la credencial de quien pide, sin borrar', async () => {
    await cerrarSesionEnTodosLosEquipos(USUARIO, PRESTADORA, 'credencial-de-quien-pide', db);

    const equipos = llamadas.filter((l) => l.clave === 'PATCH /rest/v1/equipos_conocidos');
    assert.equal(equipos.length, 1);
    conElTrabajoDeLaPrestadora(equipos[0]);

    const llaves = llamadas.filter((l) => l.url.pathname === '/rest/v1/llaves_de_dispositivo');
    assert.equal(llaves.length, 1);
    assert.equal(llaves[0].clave, 'PATCH /rest/v1/llaves_de_dispositivo', 'la llave se borró en vez de revocarse');
    assert.equal(llaves[0].credencial, DE_LA_PERSONA);
    assert.ok(JSON.parse(llaves[0].cuerpo).revocada_en);
    assert.equal(llaves[0].url.searchParams.get('usuario_id'), `eq.${USUARIO}`);
  });

  it('sin la conexión de quien pide no consulta nada', async () => {
    await assert.rejects(() => equipoConocido({ usuarioId: USUARIO, prestadoraId: PRESTADORA, marca: 'x' }));
    await assert.rejects(() => equiposDe(USUARIO, PRESTADORA));
    await assert.rejects(() => cerrarSesionEnTodosLosEquipos(USUARIO, PRESTADORA, 't'));
    assert.equal(llamadas.length, 0);
  });
});
