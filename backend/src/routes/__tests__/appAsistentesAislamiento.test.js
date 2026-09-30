/**
 * Las consultas de la aplicación del Asistente que cuelgan de su identificador y de nada más:
 * sus calificaciones, su consentimiento y la baja del mensaje al celular.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Una misma persona tiene una ficha por cada Prestadora donde
 * trabaja. Lo que separa una Prestadora de otra es que estas consultas vayan con la credencial de
 * quien pide, para que la base le conteste sólo lo de la suya: con la llave maestra la aplicación
 * mostraría lo de otra Prestadora y la pantalla se vería igual de bien. No lo encuentra nadie
 * mirando.
 *
 * La del consentimiento es la que más pesa: de esa lectura sale el identificador con el que
 * después se retira o se reemplaza una decisión.
 *
 * Qué daría con el sistema roto: si cualquiera de las tres volviera a la llave maestra, o fuera
 * por la cuenta en vez del Legajo, su comprobación falla. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // la cuenta: usuarios.id === auth.uid()
// El Legajo de esa persona en esta Prestadora. Es a propósito otro número que el de la cuenta: si
// alguna consulta volviera a usar el de la cuenta, estas comprobaciones fallan.
const LEGAJO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CALIFICACION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: req.headers.authorization });

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
const { appAsistentesRouter } = await import('../appAsistentes.js');
const { appAsistentesConsentimientosRouter } = await import('../appAsistentesConsentimientos.js');

const app = express();
app.use(express.json());
// El mismo orden de montaje que en `server.js`: el camino más largo primero.
app.use('/api/app-asistentes/consentimientos', appAsistentesConsentimientosRouter);
app.use('/api/app-asistentes', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** Las direcciones con las que se consultó una tabla. Los filtros están ahí. */
function consultasA(tabla, metodo = 'GET') {
  return llamadas.filter((l) => l.clave === `${metodo} /rest/v1/${tabla}`).map((l) => l.url);
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  // El tope de pedidos por minuto lleva su cuenta en la memoria del proceso y todas las pruebas
  // entran con el mismo Asistente: sin esto, las últimas fallarían por algo que no prueban.
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  // El Legajo con el que entra la sesión: lo busca el middleware por la cuenta y la Prestadora.
  respuestas.set('GET /rest/v1/asistentes', [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
});

// Las calificaciones y la baja del aviso ya no entran con la llave maestra: van con la credencial
// de quien pide, y la base sólo le contesta lo de su Prestadora. Lo que se comprueba es que el
// pedido vaya de verdad con esa credencial y por el Legajo, no por la cuenta. Con la llave maestra,
// estas comprobaciones fallan.
describe('las calificaciones que el Asistente ve de sí mismo', () => {
  it('se piden con la credencial de quien pide y por su Legajo', async () => {
    respuestas.set('GET /rest/v1/calificaciones_asistente', [
      { id: CALIFICACION, estrellas: 4, comentario: null, visible_publica: true,
        descargo_asistente: null, descargo_en: null, created_at: '2026-09-01T10:00:00Z' },
    ]);

    const credencial = sesionDePrueba(USUARIO);
    const respuesta = await fetch(`${DIRECCION}/calificaciones`, {
      headers: { Authorization: credencial },
    });
    assert.equal(respuesta.status, 200);

    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/calificaciones_asistente');
    assert.ok(lectura, 'no se consultaron las calificaciones');
    assert.equal(lectura.credencial, credencial, 'las calificaciones no se pidieron con la credencial de quien pide');
    assert.ok(lectura.url.includes(`asistente_id=eq.${LEGAJO}`), lectura.url);
  });
});

describe('la baja del aviso al celular', () => {
  it('borra con la credencial de quien pide y sólo la suscripción de su Legajo', async () => {
    respuestas.set('DELETE /rest/v1/push_subscriptions', []);

    const credencial = sesionDePrueba(USUARIO);
    const respuesta = await fetch(`${DIRECCION}/push/suscribir`, {
      method: 'DELETE',
      headers: { Authorization: credencial, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://aviso.ejemplo.test/abc' }),
    });
    assert.equal(respuesta.status, 200);

    const baja = llamadas.find((l) => l.clave === 'DELETE /rest/v1/push_subscriptions');
    assert.ok(baja, 'no se borró ninguna suscripción');
    assert.equal(baja.credencial, credencial, 'la baja no fue con la credencial de quien pide');
    assert.ok(baja.url.includes(`asistente_id=eq.${LEGAJO}`), baja.url);
  });
});

// El consentimiento ya no entra con la llave maestra: se lee con la credencial de quien pide, y la
// base sólo le deja ver las decisiones de su propia ficha. Lo que se comprueba es que la lectura
// vaya de verdad con esa credencial y por el Legajo, no por la cuenta. Con la llave maestra y sin
// filtro de Prestadora, esta comprobación falla.
describe('la decisión de consentimiento que ya tomó', () => {
  it('se lee con la credencial de quien pide y por su Legajo', async () => {
    respuestas.set('GET /rest/v1/asistentes', [
      { id: LEGAJO, prestadora_id: PRESTADORA, tipo_vinculo: 'monotributo' },
    ]);
    respuestas.set('GET /rest/v1/prestadoras', [{ pais: 'AR' }]);
    respuestas.set('GET /rest/v1/textos_consentimiento', [
      { id: 't-1', version: 1, idioma: 'es-AR', titulo: 'Título inventado', cuerpo: 'Cuerpo inventado',
        puntos_clave: [], es_borrador: false },
    ]);
    respuestas.set('GET /rest/v1/consentimientos_asistente', []);

    const credencial = sesionDePrueba(USUARIO);
    const respuesta = await fetch(`${DIRECCION}/consentimientos`, {
      headers: { Authorization: credencial },
    });
    assert.equal(respuesta.status, 200);

    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/consentimientos_asistente');
    assert.ok(lectura, 'no se leyó la decisión');
    assert.equal(lectura.credencial, credencial, 'la lectura del consentimiento no fue con la credencial de quien pide');
    assert.ok(lectura.url.includes(`asistente_id=eq.${LEGAJO}`), lectura.url);
  });
});
