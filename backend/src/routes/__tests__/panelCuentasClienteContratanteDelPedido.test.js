/**
 * Con qué se busca el Cliente de un pedido en las rutas de las personas autorizadas y del Pagador.
 *
 *   node --test src/routes/__tests__/panelCuentasClienteContratanteDelPedido.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El Cliente se busca con la credencial de quien pide, y la base decide
 * si lo ve: si es de otra Prestadora o está pendiente de conformidad, la ruta contesta «no
 * encontrado». Se prueba el camino entero: se levanta el router contra una base de mentira y se
 * mira con qué credencial llegó cada lectura, y que no viaje ningún filtro de Prestadora escrito a
 * mano, porque ése es el que separaba las Prestadoras cuando entraba la llave maestra.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const CLIENTE = '88888888-8888-8888-8888-888888888888';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({
      clave,
      busqueda: decodeURIComponent(direccion.search),
      credencial: req.headers.authorization,
    });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada() : preparada;
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelCuentasRouter } = await import('../panelCuentas.js');

const app = express();
app.use(express.json());
app.use('/api/panel/cuentas', panelCuentasRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/cuentas`;

after(() => {
  backend.close();
  baseFalsa.close();
});

let credencialEnviada = null;

async function pedir(metodo, ruta) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: credencialEnviada, 'Content-Type': 'application/json' },
  });
  return { estado: respuesta.status };
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  // El Cliente no aparece: la ruta contesta 404 y lo que se mira es cómo se lo buscó.
  respuestas.set('GET /rest/v1/clientes', () => []);
});

const RUTAS_QUE_BUSCAN_EL_CLIENTE = [
  ['GET', `/cliente/${CLIENTE}/personas_autorizadas`],
  ['GET', `/cliente/${CLIENTE}/pagador`],
];

const INSTRUCCION = '99999999-9999-9999-9999-999999999999';

describe('el Cliente del pedido se busca con la credencial de quien pide', () => {
  for (const rol of ['admin_prestadora', 'coordinador']) {
    for (const [metodo, ruta] of RUTAS_QUE_BUSCAN_EL_CLIENTE) {
      it(`${rol}: ${metodo} ${ruta}`, async () => {
        rolDelUsuario = rol;
        const { estado } = await pedir(metodo, ruta);
        assert.equal(estado, 404);

        const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/clientes');
        assert.ok(lectura, 'la ruta no buscó el Cliente');
        assert.equal(lectura.credencial, credencialEnviada, 'el Cliente se buscó con otra credencial');
        assert.doesNotMatch(lectura.busqueda, /prestadora_id=/, 'viajó un filtro de Prestadora escrito a mano');
        assert.match(lectura.busqueda, new RegExp(`id=eq\\.${CLIENTE}`));
      });
    }
  }
});

describe('la hoja firmada de las personas autorizadas la abre quien ve la fila', () => {
  it('si la base no le deja ver la autorización, no existe', async () => {
    respuestas.set('GET /rest/v1/instrucciones_acceso_personas_autorizadas', () => []);
    const { estado } = await pedir('GET', `/cliente/${CLIENTE}/personas_autorizadas/instruccion/${INSTRUCCION}/papel`);
    assert.equal(estado, 404);

    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/instrucciones_acceso_personas_autorizadas');
    assert.ok(lectura, 'la ruta no buscó la autorización');
    assert.equal(lectura.credencial, credencialEnviada, 'la autorización se buscó con otra credencial');
    assert.doesNotMatch(lectura.busqueda, /prestadora_id=/);
    assert.ok(!llamadas.some((l) => l.clave.startsWith('POST /storage/')), 'pidió un enlace sin tener la fila');
  });

  it('el enlace temporal lo pide con la credencial de quien pide', async () => {
    const ARCHIVO = `${PRESTADORA}/${CLIENTE}/${INSTRUCCION}-x.pdf`;
    respuestas.set('GET /rest/v1/instrucciones_acceso_personas_autorizadas', () => [{ archivo_firmado_url: ARCHIVO }]);
    respuestas.set(`POST /storage/v1/object/sign/instrucciones-acceso-personas-autorizadas/${ARCHIVO}`, () => ({ signedURL: '/firmado' }));
    const { estado } = await pedir('GET', `/cliente/${CLIENTE}/personas_autorizadas/instruccion/${INSTRUCCION}/papel`);
    assert.equal(estado, 200);

    const firma = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/sign/'));
    assert.ok(firma, 'no pidió el enlace');
    assert.equal(firma.credencial, credencialEnviada, 'el enlace se pidió con otra credencial');
  });
});
