/**
 * El Certificado de Aptitud que el Cliente ve del Asistente asignado.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Una misma persona tiene un Legajo de Asistente por cada Prestadora donde
 * trabaja: si el identificador del Asistente se repitiera, el Cliente vería el Certificado de
 * otra Prestadora y la pantalla se vería igual de bien. No lo encuentra nadie mirando.
 *
 * La consulta sale con la credencial de la persona, y la que separa una Prestadora de otra es la
 * protección por fila de la base: acá se comprueba que la consulta salga con esa credencial y no
 * con la llave maestra.
 *
 * Qué daría con el sistema roto: con la consulta de vuelta en la llave maestra, la comprobación de
 * abajo falla. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PACIENTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ASISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, autorizacion: req.headers.authorization });

    const preparada = respuestas.get(clave);
    // Lo que esta prueba no prepara contesta vacío: acá se mira con qué filtros se consultó una
    // sola tabla, y hacer fallar el pedido entero por una consulta de al lado no probaría eso.
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];

    // `.single()` y `.maybeSingle()` piden una fila sola con este encabezado.
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
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

/** La credencial de la persona de la prueba. La de la llave maestra es otra: `clave-de-mentira`. */
let credencial;

async function pedir(ruta) {
  credencial = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    headers: { Authorization: credencial },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];

  respuestas.set('GET /auth/v1/user', { id: USUARIO });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/clientes', [{ id: CLIENTE }]);
  respuestas.set('GET /rest/v1/pacientes', [
    { id: PACIENTE, cliente_id: CLIENTE, prestadora_id: PRESTADORA, persona: { nombre_visible: 'Persona Inventada' } },
  ]);
  respuestas.set('GET /rest/v1/asistentes', [
    { id: ASISTENTE, nombre: 'Asistente Inventado', foto_url: null, tipo_asistente_id: null },
  ]);
  respuestas.set('GET /rest/v1/certificados', [
    { activo: true, fecha_vencimiento: '2027-01-01' },
  ]);
});

describe('el Certificado en la pantalla del Asistente asignado', () => {
  it('se pide con la credencial de la persona, no con la llave maestra', async () => {
    respuestas.set('GET /rest/v1/guardias', [
      { id: 'g-1', estado: 'cerrada', asistente_id: ASISTENTE },
    ]);

    const { estado } = await pedir(`/pacientes/${PACIENTE}/asistente`);
    assert.equal(estado, 200);

    const consultas = llamadas.filter((l) => l.clave === 'GET /rest/v1/certificados');
    assert.equal(consultas.length, 1, 'no se consultó el Certificado');
    assert.equal(
      consultas[0].autorizacion,
      credencial,
      'la consulta del Certificado no salió con la credencial de la persona'
    );
    assert.ok(consultas[0].url.includes(`asistente_id=eq.${ASISTENTE}`), consultas[0].url);
  });
});
