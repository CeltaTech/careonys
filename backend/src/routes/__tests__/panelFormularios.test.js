/**
 * Los formularios declarados se leen con la credencial de quien pide, y nunca con la llave maestra.
 *
 *   node --test src/routes/__tests__/panelFormularios.test.js
 *
 * La base es de mentira y contesta por HTTP como la de verdad: además del resultado se mira con qué
 * credencial se le pidió cada cosa. Qué filas ve esa credencial lo decide la protección por fila de
 * la base, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const FORMULARIO = '33333333-3333-4333-8333-333333333333';
const SECCION = '44444444-4444-4444-8444-444444444444';

/** Qué contesta la base a cada `MÉTODO /ruta`. */
const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, credencial: req.headers.authorization });

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

// El import va después de las variables de entorno: la conexión se arma al importar.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelFormulariosRouter } = await import('../panelFormularios.js');

const app = express();
app.use(express.json());
app.use('/api/panel/formularios', panelFormulariosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/formularios`;

after(() => {
  backend.close();
  baseFalsa.close();
});

let credencialEnviada = null;

async function llamar(camino, opciones = {}) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${camino}`, {
    ...opciones,
    headers: {
      Authorization: credencialEnviada,
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('GET /rest/v1/formularios_declarados', () => [
    { id: FORMULARIO, clave: 'alta_asistente', ambito: 'legajo', titulo: 'Alta', orden: 1, prestadora_id: null, activo: true },
  ]);
  respuestas.set('GET /rest/v1/formulario_secciones', () => [
    { id: SECCION, clave: 'datos', titulo: 'Datos', orden: 1, repetible: false, activo: true },
  ]);
  respuestas.set('GET /rest/v1/formulario_campos', () => [
    { seccion_id: SECCION, clave: 'nombre', tipo: 'texto', etiqueta: 'Nombre', obligatorio: true, orden: 1, activo: true },
  ]);
});

/** Que todo lo que la ruta le pidió a los formularios haya ido con la credencial de quien pide. */
function todoConLaCredencialDeQuienPide() {
  const deFormularios = llamadas.filter((l) => /\/rest\/v1\/formula/.test(l.clave));
  assert.ok(deFormularios.length > 0, 'la ruta tiene que haber consultado la base');
  for (const llamada of deFormularios) {
    assert.equal(llamada.credencial, credencialEnviada, `${llamada.clave} no fue con la credencial de quien pide`);
  }
  return deFormularios;
}

describe('los formularios declarados', () => {
  it('los de un ámbito se leen con la credencial de quien pide', async () => {
    const { estado, cuerpo } = await llamar('/ambito/legajo');
    assert.equal(estado, 200);
    assert.equal(cuerpo.formularios.length, 1);
    todoConLaCredencialDeQuienPide();
  });

  it('la declaración de uno se lee con la credencial de quien pide', async () => {
    const { estado, cuerpo } = await llamar('/alta_asistente');
    assert.equal(estado, 200);
    assert.equal(cuerpo.declaracion.secciones[0].campos[0].clave, 'nombre');
    assert.equal(todoConLaCredencialDeQuienPide().length, 3);
  });

  it('el control de una respuesta lee la declaración con la credencial de quien pide', async () => {
    const { estado, cuerpo } = await llamar('/alta_asistente/controlar', {
      method: 'POST',
      body: JSON.stringify({ respuesta: { datos: { nombre: 'Ana' } } }),
    });
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    assert.equal(todoConLaCredencialDeQuienPide().length, 3);
  });
});
