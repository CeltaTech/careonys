/**
 * El perfil que pide la aplicación del Cliente al abrir.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La aplicación dice «hoy» y escribe las horas de los turnos de guardia
 * en la zona horaria de la Prestadora, que recibe con el perfil. Si el perfil no la mandara, la
 * aplicación usaría la del aparato y la pantalla se vería igual de bien.
 *
 * Qué daría con el sistema roto: sin la zona en la respuesta, o leída con otra credencial que la de
 * quien pide, las comprobaciones de abajo fallan. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no se preparó contesta vacío. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera y la credencial. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), autorizacion: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { appClientesRouter } = await import('../appClientes.js');

const app = express();
app.use(express.json());
app.use('/api/app-clientes', appClientesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-clientes`;

after(() => {
  backend.close();
  baseFalsa.close();
});

let sesion;

async function pedir(ruta) {
  sesion = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, { headers: { Authorization: sesion } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  respuestas.set('GET /auth/v1/user', { id: USUARIO });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA, nombre: 'Persona Inventada' }]);
  respuestas.set('GET /rest/v1/clientes', [{ id: CLIENTE }]);
  respuestas.set('GET /rest/v1/prestadoras', [{ zona_horaria: 'America/Sao_Paulo' }]);
});

describe('GET /perfil — la zona horaria de la Prestadora', () => {
  it('viaja con el perfil, leída de la base con la sesión de quien pide', async () => {
    const { estado, cuerpo } = await pedir('/perfil');
    assert.equal(estado, 200);
    assert.equal(cuerpo.zonaHoraria, 'America/Sao_Paulo');

    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/prestadoras' && l.url.includes('zona_horaria'));
    assert.ok(lectura, 'no leyó la zona de la Prestadora');
    assert.equal(lectura.autorizacion, sesion, 'la zona se leyó con otra credencial');
    assert.ok(lectura.url.includes(`id=eq.${PRESTADORA}`), 'no acotó la lectura a su Prestadora');
  });
});
