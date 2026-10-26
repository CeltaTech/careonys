/**
 * `/api/panel/documentos-asistente` — la Prestadora revisa los documentos de sus Asistentes.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Aprobar, observar y prorrogar son de la administración, cambian si
 * un Asistente puede trabajar, y quedan anotados. Eso es lo que se prueba:
 *
 *   1. SÓLO LA ADMINISTRACIÓN REVISA. El Coordinador recibe 403 y la base no recibe nada.
 *   2. APROBAR Y OBSERVAR ESCRIBEN EL ESTADO, QUIÉN Y CUÁNDO, y dejan su renglón en el registro.
 *   3. OBSERVAR SIN MOTIVO NO SE PUEDE: el Asistente tiene que saber qué corregir.
 *   4. UNA PRÓRROGA LLEVA DÍAS ENTEROS Y POSITIVOS.
 *
 * Qué daría con el sistema roto: si el candado de administración se cayera, la prueba del
 * Coordinador encuentra una escritura; si la revisión dejara de anotarse, la del registro se queda
 * sin renglón; si observar aceptara un motivo vacío, contesta 200.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const ASISTENTE = '44444444-4444-4444-4444-444444444444';
const TIPO = '66666666-6666-6666-6666-666666666666';
const DOCUMENTO = '77777777-7777-7777-7777-777777777777';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url, cuerpo: crudo ? JSON.parse(crudo) : null });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada;
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
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { panelDocumentosAsistenteRouter } = await import('../panelDocumentosAsistente.js');

const app = express();
app.use(express.json());
app.use('/api/panel/documentos-asistente', panelDocumentosAsistenteRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/documentos-asistente`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function llamar(camino, opciones = {}) {
  const respuesta = await fetch(`${DIRECCION}${camino}`, {
    ...opciones,
    headers: {
      Authorization: sesionDePrueba(USUARIO),
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const enviar = (camino, cuerpo = {}) => llamar(camino, { method: 'POST', body: JSON.stringify(cuerpo) });
const escriturasA = (tabla, metodo) => llamadas.filter((l) => l.clave === `${metodo} /rest/v1/${tabla}`);

function unDocumento(cambios = {}) {
  return {
    id: DOCUMENTO,
    prestadora_id: PRESTADORA,
    asistente_id: ASISTENTE,
    tipo_documento_id: TIPO,
    estado: 'en_revision',
    fecha_emision: null,
    fecha_vencimiento: '2030-01-01',
    numero: null,
    organismo_id: null,
    motivo_observacion: null,
    revisado_por: null,
    revisado_at: null,
    cargado_por: USUARIO,
    created_at: '2026-09-01T12:00:00Z',
    ruta_archivo: `${PRESTADORA}/${ASISTENTE}/inventado.pdf`,
    ...cambios,
  };
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  rolDelUsuario = 'admin_prestadora';

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ id: USUARIO, rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: ASISTENTE, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ dias_aviso_vencimiento_documentos: 30, idioma: 'es-AR' }]);
  respuestas.set('GET /rest/v1/documentos_asistente', () => [unDocumento()]);
  respuestas.set('GET /rest/v1/tipos_documento_asistente', () => [{ nombre: 'Documento inventado' }]);
  respuestas.set('PATCH /rest/v1/documentos_asistente', () => [unDocumento({ estado: 'aprobado' })]);
  respuestas.set('POST /rest/v1/prorrogas_de_gracia_documento', () => [{ id: 'p1', hasta: '2026-10-15' }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
});

describe('la administración revisa un documento', () => {
  it('aprobar escribe el estado, quién y cuándo, y lo anota', async () => {
    const { estado, cuerpo } = await enviar(`/${DOCUMENTO}/aprobar`);
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);

    const [cambio] = escriturasA('documentos_asistente', 'PATCH');
    assert.equal(cambio.cuerpo.estado, 'aprobado');
    assert.equal(cambio.cuerpo.motivo_observacion, null);
    assert.equal(cambio.cuerpo.revisado_por, USUARIO);
    assert.ok(cambio.cuerpo.revisado_at);
    assert.ok(cambio.url.includes(`id=eq.${DOCUMENTO}`));

    // La entrada al Panel también deja su renglón: se busca el de este documento.
    const renglon = escriturasA('registro_actividad', 'POST').find((r) => r.cuerpo?.registro_id === DOCUMENTO);
    assert.ok(renglon, 'la revisión no quedó anotada');
    assert.equal(renglon.cuerpo.tabla_afectada, 'documentos_asistente');
    assert.equal(renglon.cuerpo.prestadora_id, PRESTADORA);
  });

  it('observar guarda el motivo', async () => {
    respuestas.set('PATCH /rest/v1/documentos_asistente', () => [unDocumento({ estado: 'observado' })]);
    const { estado } = await enviar(`/${DOCUMENTO}/observar`, { motivo: '  La foto está borrosa  ' });
    assert.equal(estado, 200);
    const [cambio] = escriturasA('documentos_asistente', 'PATCH');
    assert.equal(cambio.cuerpo.estado, 'observado');
    assert.equal(cambio.cuerpo.motivo_observacion, 'La foto está borrosa');
    assert.ok(escriturasA('registro_actividad', 'POST').some((r) => r.cuerpo?.registro_id));
  });

  it('observar sin motivo no se puede', async () => {
    const { estado, cuerpo } = await enviar(`/${DOCUMENTO}/observar`, { motivo: '   ' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'motivo_observacion_requerido');
    assert.equal(escriturasA('documentos_asistente', 'PATCH').length, 0);
  });

  it('un documento que no se ve no se revisa', async () => {
    respuestas.set('GET /rest/v1/documentos_asistente', () => []);
    const { estado, cuerpo } = await enviar(`/${DOCUMENTO}/aprobar`);
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'documento_no_encontrado');
    assert.equal(escriturasA('documentos_asistente', 'PATCH').length, 0);
  });

  it('el Coordinador no revisa ni prorroga', async () => {
    rolDelUsuario = 'coordinador';
    const aprobar = await enviar(`/${DOCUMENTO}/aprobar`);
    const prorrogar = await enviar('/prorrogar', { asistente_id: ASISTENTE, tipo_documento_id: TIPO, dias: 10 });
    assert.equal(aprobar.estado, 403);
    assert.equal(prorrogar.estado, 403);
    assert.equal(escriturasA('documentos_asistente', 'PATCH').length, 0);
    assert.equal(escriturasA('prorrogas_de_gracia_documento', 'POST').length, 0);
  });
});

describe('la prórroga de gracia', () => {
  it('con días enteros y positivos se guarda y se anota', async () => {
    const { estado, cuerpo } = await enviar('/prorrogar', { asistente_id: ASISTENTE, tipo_documento_id: TIPO, dias: 10 });
    assert.equal(estado, 200);
    assert.equal(cuerpo.hasta, '2026-10-15');
    const [alta] = escriturasA('prorrogas_de_gracia_documento', 'POST');
    assert.equal(alta.cuerpo.dias, 10);
    assert.equal(alta.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(alta.cuerpo.prorrogado_por, USUARIO);
    assert.ok(escriturasA('registro_actividad', 'POST').some((r) => r.cuerpo?.registro_id));
  });

  for (const dias of [0, -3, 2.5, 'diez']) {
    it(`con ${JSON.stringify(dias)} días no se guarda`, async () => {
      const { estado, cuerpo } = await enviar('/prorrogar', { asistente_id: ASISTENTE, tipo_documento_id: TIPO, dias });
      assert.equal(estado, 400);
      assert.equal(cuerpo.motivo, 'dias_invalidos');
      assert.equal(escriturasA('prorrogas_de_gracia_documento', 'POST').length, 0);
    });
  }

  it('un tipo que no existe en la base es un tipo inválido, sin el texto de la base', async () => {
    respuestas.set('POST /rest/v1/prorrogas_de_gracia_documento', () => ({
      __estado: 409,
      __cuerpo: { code: '23503', message: 'insert or update on table violates foreign key constraint' },
    }));
    const { estado, cuerpo } = await enviar('/prorrogar', { asistente_id: ASISTENTE, tipo_documento_id: TIPO, dias: 5 });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'tipo_de_documento_invalido');
    assert.ok(!JSON.stringify(cuerpo).includes('foreign key'));
  });
});
