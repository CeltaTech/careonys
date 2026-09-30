/**
 * Lo que superadmin lee y guarda en Configuración aunque la política de la tabla no lo nombre.
 *
 *   node --test src/routes/__tests__/panelConfiguracionSuperadmin.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Las alertas de IA y la visibilidad de las aplicaciones tienen
 * políticas que sólo alcanzan a admin_prestadora (`admin_gestiona_configuracion_alertas_ia`,
 * `admin_gestiona_visibilidad_app`). Superadmin llega a estas rutas y siempre pudo leer y guardar;
 * con su propia credencial la base no le mostraría nada y la pantalla le mostraría los valores de
 * fábrica como si fueran los de la Prestadora. Las rutas consultan con la llave maestra y el filtro
 * de la Prestadora escrito en la consulta, y eso es lo que se comprueba acá.
 *
 * Con el sistema roto —la consulta hecha con la credencial de quien pide— la base de mentira
 * recibe esa credencial en lugar de la maestra, o no recibe el filtro, y la prueba falla.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const MAESTRA = 'Bearer clave-de-mentira';

const respuestas = new Map();
let llamadas = [];

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
      consulta: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
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
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelConfiguracionRouter } = await import('../panelConfiguracion.js');
const { CATALOGO_VISIBILIDAD } = await import('../../utils/catalogoVisibilidad.js');

const app = express();
app.use(express.json());
app.use('/api/panel/configuracion', panelConfiguracionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/configuracion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function laConsulta(clave) {
  const llamada = llamadas.find((l) => l.clave === clave);
  assert.ok(llamada, `la ruta no pidió ${clave}`);
  return llamada;
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'superadmin', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/configuracion_plataforma', () => [{ mfa_admin_obligatorio: false }]);
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
});

describe('alertas de IA', () => {
  it('superadmin lee lo guardado de la Prestadora, no los valores de fábrica', async () => {
    const guardado = {
      palabras_clave: ['caída'],
      reportes_a_analizar: 7,
      roja_avisa_cliente: false,
      amarilla_avisa_cliente: true,
      amarilla_avisa_coordinador: false,
    };
    respuestas.set('GET /rest/v1/configuracion_alertas_ia', () => [guardado]);
    const { estado, cuerpo } = await pedir('GET', '/alertas-ia');
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.configuracion, guardado);
    const consulta = laConsulta('GET /rest/v1/configuracion_alertas_ia');
    assert.equal(consulta.credencial, MAESTRA);
    assert.equal(consulta.consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('superadmin guarda en la Prestadora sobre la que trabaja', async () => {
    respuestas.set('POST /rest/v1/configuracion_alertas_ia', () => []);
    const { estado } = await pedir('PATCH', '/alertas-ia', {
      palabras_clave: ['Fiebre'],
      reportes_a_analizar: 5,
      roja_avisa_cliente: true,
      amarilla_avisa_cliente: false,
      amarilla_avisa_coordinador: true,
    });
    assert.equal(estado, 200);
    const escritura = laConsulta('POST /rest/v1/configuracion_alertas_ia');
    assert.equal(escritura.credencial, MAESTRA);
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
    assert.deepEqual(escritura.cuerpo.palabras_clave, ['fiebre']);
  });
});

describe('visibilidad de las aplicaciones', () => {
  it('superadmin lee lo guardado de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/configuracion_visibilidad_app', () => []);
    const { estado } = await pedir('GET', '/visibilidad-app');
    assert.equal(estado, 200);
    const consulta = laConsulta('GET /rest/v1/configuracion_visibilidad_app');
    assert.equal(consulta.credencial, MAESTRA);
    assert.equal(consulta.consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('superadmin guarda un interruptor', async () => {
    const clave = CATALOGO_VISIBILIDAD[0]?.clave;
    assert.ok(clave, 'el catálogo de visibilidad está vacío');

    respuestas.set('POST /rest/v1/configuracion_visibilidad_app', () => []);
    const { estado } = await pedir('PATCH', `/visibilidad-app/${clave}`, { visible: false });
    assert.equal(estado, 200);
    const escritura = laConsulta('POST /rest/v1/configuracion_visibilidad_app');
    assert.equal(escritura.credencial, MAESTRA);
    assert.equal(escritura.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(escritura.cuerpo.visible, false);
  });
});

describe('personal de emergencia', () => {
  it('lee con la maestra y acotado a la Prestadora, para que el nombre del Asistente no salga vacío', async () => {
    respuestas.set('GET /rest/v1/personal_emergencia', () => []);
    const { estado } = await pedir('GET', '/personal-emergencia');
    assert.equal(estado, 200);
    const consulta = laConsulta('GET /rest/v1/personal_emergencia');
    assert.equal(consulta.credencial, MAESTRA);
    assert.equal(consulta.consulta.get('prestadora_id'), `eq.${PRESTADORA}`);
  });
});
