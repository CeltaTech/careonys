/**
 * `/api/app-asistentes/documentos` — los documentos que la Prestadora le pide al Asistente, vistos
 * y cargados desde su teléfono.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Son cuatro cosas que la pantalla no muestra:
 *
 *   1. EL ASISTENTE CARGA Y NO APRUEBA. Lo que manda entra en revisión, a nombre del Legajo de la
 *      sesión y con la ruta del archivo adentro de la carpeta de su Prestadora.
 *   2. SÓLO LOS DOCUMENTOS QUE SE LE PIDEN. Un tipo que no figura entre los suyos no se carga.
 *   3. APAGADA LA OPCIÓN, NO CARGA. Ver sí; mandar no.
 *   4. UN DOCUMENTO VENCIDO NO ENTRA, y la respuesta dice desde qué fecha tiene que estar emitido.
 *
 * Qué daría con el sistema roto: si la ruta guardara el estado que manda el pedido, la prueba de
 * la carga encuentra «aprobado»; si el Legajo saliera del cuerpo, encuentra el de otro; si la
 * opción no se mirara, la carga apagada contesta 201.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';
const OTRO_LEGAJO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TIPO = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DOCUMENTO = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DEPOSITO = '/storage/v1/object/documentos-asistente/';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    // Las subidas al depósito llevan un nombre que pone el sistema: se las atiende por la carpeta.
    const clave = ruta.startsWith(DEPOSITO) ? `${req.method} ${DEPOSITO}*` : `${req.method} ${ruta}`;
    llamadas.push({ clave, ruta, url: req.url, cuerpo: crudo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada;
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
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesDocumentosRouter } = await import('../appAsistentesDocumentos.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/documentos', appAsistentesDocumentosRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/documentos`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(ruta = '') {
  const respuesta = await fetch(`${DIRECCION}${ruta}`, { headers: { Authorization: sesionDePrueba(USUARIO) } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function mandar(campos, { conArchivo = true } = {}) {
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formulario.append(clave, valor);
  if (conArchivo) {
    formulario.append('archivo', new Blob([Buffer.from('%PDF-1.4 inventado')], { type: 'application/pdf' }), 'doc.pdf');
  }
  const respuesta = await fetch(DIRECCION, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO) },
    body: formulario,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const insertados = () => llamadas.filter((l) => l.clave === 'POST /rest/v1/documentos_asistente');
const subidas = () => llamadas.filter((l) => l.clave === `POST ${DEPOSITO}*`);

let pedidos;
let visibilidad;
let tipo;

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();

  pedidos = [
    {
      tipo_documento_id: TIPO,
      nombre: 'Documento inventado',
      impide_trabajar: true,
      documento_id: null,
      estado: null,
      fecha_vencimiento: null,
      motivo_observacion: null,
    },
  ];
  visibilidad = [];
  tipo = {
    id: TIPO,
    prestadora_id: PRESTADORA,
    nombre: 'Documento inventado',
    activo: true,
    vencimiento: 'fecha_del_documento',
    periodo_cantidad: null,
    periodo_unidad: null,
    lleva_numero: false,
  };

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/configuracion_visibilidad_app', () => visibilidad);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ dias_aviso_vencimiento_documentos: 30 }]);
  // La vista contesta sólo el tipo que se le pregunta, como la base.
  respuestas.set('GET /rest/v1/documentos_pedidos_al_asistente', ({ url }) => {
    const pedido = new URL(url, 'http://interno').searchParams.get('tipo_documento_id');
    if (!pedido) return pedidos;
    return pedidos.filter((p) => `eq.${p.tipo_documento_id}` === pedido);
  });
  respuestas.set('GET /rest/v1/tipos_documento_asistente', () => [tipo]);
  respuestas.set('GET /rest/v1/organismos_por_tipo_documento', () => []);
  respuestas.set(`POST ${DEPOSITO}*`, () => ({ Key: 'subido' }));
  respuestas.set('POST /rest/v1/documentos_asistente', () => [
    { id: DOCUMENTO, tipo_documento_id: TIPO, estado: 'en_revision', fecha_vencimiento: '2030-01-01' },
  ]);
});

describe('el Asistente mira sus documentos', () => {
  it('la lista dice cuántos lleva enviados y si puede cargar', async () => {
    pedidos.push({ ...pedidos[0], tipo_documento_id: 'otro', documento_id: DOCUMENTO, estado: 'en_revision' });
    const { estado, cuerpo } = await pedir();
    assert.equal(estado, 200);
    assert.equal(cuerpo.total, 2);
    assert.equal(cuerpo.enviados, 1);
    assert.equal(cuerpo.puede_cargar, true);
    assert.equal(cuerpo.documentos[0].estado_visible, 'falta');
  });

  it('con la opción apagada sigue viendo la lista, pero no puede cargar', async () => {
    visibilidad = [{ clave: 'asistente_carga_sus_documentos', visible: false }];
    const { estado, cuerpo } = await pedir();
    assert.equal(estado, 200);
    assert.equal(cuerpo.puede_cargar, false);
  });

  it('un tipo que no se le pide no existe para él', async () => {
    const { estado, cuerpo } = await pedir('/tipo/ffffffff-ffff-ffff-ffff-ffffffffffff');
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'documento_no_encontrado');
  });
});

describe('el Asistente manda un documento', () => {
  it('entra en revisión, a nombre del Legajo de la sesión y en la carpeta de su Prestadora', async () => {
    const { estado, cuerpo } = await mandar({
      tipo_documento_id: TIPO,
      fecha_vencimiento: '2030-01-01',
      estado: 'aprobado',
      asistente_id: OTRO_LEGAJO,
    });
    assert.equal(estado, 201);
    assert.equal(cuerpo.ok, true);

    const [insertado] = insertados();
    const fila = JSON.parse(insertado.cuerpo);
    assert.equal(fila.estado, 'en_revision');
    assert.equal(fila.asistente_id, LEGAJO);
    assert.equal(fila.prestadora_id, PRESTADORA);
    assert.equal(fila.cargado_por, USUARIO);
    assert.ok(fila.ruta_archivo.startsWith(`${PRESTADORA}/`));

    const [subida] = subidas();
    assert.ok(subida.ruta.startsWith(`${DEPOSITO}${PRESTADORA}/`));
  });

  it('con la opción apagada no carga nada', async () => {
    visibilidad = [{ clave: 'asistente_carga_sus_documentos', visible: false }];
    const { estado, cuerpo } = await mandar({ tipo_documento_id: TIPO, fecha_vencimiento: '2030-01-01' });
    assert.equal(estado, 403);
    assert.equal(cuerpo.motivo, 'no_disponible');
    assert.equal(subidas().length, 0);
    assert.equal(insertados().length, 0);
  });

  it('un tipo que no se le pide no se carga', async () => {
    pedidos = [];
    const { estado, cuerpo } = await mandar({ tipo_documento_id: TIPO, fecha_vencimiento: '2030-01-01' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'tipo_de_documento_invalido');
    assert.equal(subidas().length, 0);
  });

  it('sin archivo falta un dato', async () => {
    const { estado, cuerpo } = await mandar({ tipo_documento_id: TIPO }, { conArchivo: false });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
  });

  it('uno vencido no entra, y la respuesta dice la fecha', async () => {
    const { estado, cuerpo } = await mandar({ tipo_documento_id: TIPO, fecha_vencimiento: '2020-01-01' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'documento_ya_vencido');
    assert.equal(cuerpo.fecha, '2020-01-01');
    assert.equal(subidas().length, 0);
    assert.equal(insertados().length, 0);
  });
});
