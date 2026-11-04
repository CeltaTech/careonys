/**
 * La autorización de signos vitales vista desde la aplicación del Cliente.
 *
 *   node --test backend/src/routes/__tests__/appClientesVitalesAutorizacion.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La ruta (`../appClientesVitalesAutorizacion.js`) mezcla dos
 * credenciales a propósito: lee con la de quien pide, y firma y sube con el trabajo de la
 * Prestadora, porque el Cliente no escribe en esa tabla ni en ese depósito. Lo que se sostiene acá:
 *
 *   1. QUE LA PERSONA AUTORIZADA SIN LA FICHA NO VEA NADA. La autorización es información de salud
 *      del Paciente, y entra por el mismo acceso que la Ficha.
 *   2. QUE FIRMAR SEA SÓLO DEL TITULAR. Ni el documento, ni la firma, ni el documento le llegan a otro, y la
 *      base no recibe nada en su nombre.
 *   3. QUE LO QUE SE ESCRIBE SALGA CON EL TRABAJO DE LA PRESTADORA DEL PACIENTE, y no con la
 *      credencial de quien pide ni con la de otra Prestadora.
 *   4. QUE EL DOCUMENTO QUE NO QUEDÓ EN NINGUNA AUTORIZACIÓN SE BORRE del depósito.
 *   5. QUE SIN UNA FIRMA DE VERDAD NO SE ANOTE NADA. La firma se hace con un teléfono de mentira que
 *      firma con una llave P-256 lo mismo que firmaría uno de verdad, así que la comprobación de
 *      WebAuthn corre entera, sin reemplazar ningún módulo.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Lo que esta prueba no ve son las
 * políticas y las funciones de la base en sí: que la base sólo le muestre la autorización a quien
 * tiene la Ficha, que `registrar_autorizacion_signos_vitales_del_titular` vuelva a comprobar que
 * quien firma es el titular, y que el identificador de verificación coincida con el texto mostrado.
 * Eso lo prueban los scripts contra la base local.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTRO_CLIENTE = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
const AUTORIZACION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PACIENTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PACIENTE_DE_OTRO = 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0';
const LLAVE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CREDENCIAL_DEL_TELEFONO = 'Y3JlZGVuY2lhbC12aXZh';
const ORIGEN = 'https://clientes.ejemplo.com';
const BUCKET = 'autorizaciones-monitoreo';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, en orden, con la dirección entera y el cuerpo. */
let llamadas = [];
/** Si el depósito rechaza las subidas, como lo haría su política. */
let depositoRechazaSubidas = false;

const baseFalsa = createServer((req, res) => {
  const partes = [];
  req.on('data', (parte) => partes.push(parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const crudo = Buffer.concat(partes).toString();
    let cuerpo = null;
    if ((req.headers['content-type'] || '').includes('json') && crudo) {
      try { cuerpo = JSON.parse(crudo); } catch { cuerpo = null; }
    }
    llamadas.push({ clave, url: req.url, cuerpo, autorizacion: req.headers.authorization, reemplaza: req.headers['x-upsert'] });

    const preparada = respuestas.get(clave) ?? respuestaDelDeposito(req.method, ruta);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url, cuerpo }) : preparada;
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
    if (unoSolo && Array.isArray(valor) && valor.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST116', message: 'no hay filas' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

/** Lo que contesta el depósito cuando la prueba no preparó otra cosa: que salió bien. */
function respuestaDelDeposito(metodo, ruta) {
  if (!ruta.startsWith('/storage/v1/')) return undefined;
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/sign/${BUCKET}/`)) {
    return { signedURL: `${ruta.replace('/storage/v1', '')}?token=enlace-de-mentira` };
  }
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/${BUCKET}/`)) {
    if (depositoRechazaSubidas) {
      return { __estado: 400, __cuerpo: { statusCode: '403', error: 'Unauthorized', message: 'la política no lo deja' } };
    }
    return { Key: ruta.replace('/storage/v1/object/', ''), Id: 'archivo-de-mentira' };
  }
  if (metodo === 'DELETE' && ruta === `/storage/v1/object/${BUCKET}`) return [];
  return undefined;
}

/** La base falsa filtra de verdad por los `eq` y los `is` de la dirección, como la de la llave. */
function filasQuePasanLosFiltros(url, filas) {
  const parametros = new URL(url, 'http://interno').searchParams;
  return filas.filter((fila) =>
    [...parametros.entries()].every(([campo, condicion]) => {
      if (!Object.hasOwn(fila, campo)) return true;
      if (condicion === 'is.null') return fila[campo] === null || fila[campo] === undefined;
      if (condicion === 'not.is.null') return fila[campo] !== null && fila[campo] !== undefined;
      if (condicion.startsWith('eq.')) return String(fila[campo]) === condicion.slice(3);
      return true;
    })
  );
}

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.PWA_CLIENTES_URL = ORIGEN;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { appClientesVitalesAutorizacionRouter } = await import('../appClientesVitalesAutorizacion.js');

const app = express();
app.use(express.json());
app.use('/api/app-clientes/vitales-autorizacion', appClientesVitalesAutorizacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-clientes/vitales-autorizacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

const credencial = () => sesionDePrueba(USUARIO);

/** Que el pedido salió con el trabajo sin persona de la Prestadora del Paciente. */
function esElTrabajoDeLaPrestadora(autorizacion, mensaje) {
  const contenido = JSON.parse(Buffer.from(String(autorizacion).replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString() || '{}');
  assert.equal(contenido.role, 'trabajo_sin_persona', mensaje);
  assert.equal(contenido.prestadora_id, PRESTADORA, mensaje);
}

async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: { Authorization: credencial() } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(`${DIRECCION}${ruta}`, opciones);
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function subirDocumentoFirmado(pacienteId) {
  const cuerpo = new FormData();
  cuerpo.append('archivo', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'autorizacion.jpg');
  const respuesta = await fetch(`${DIRECCION}/${pacienteId}/documento`, {
    method: 'POST',
    headers: { Authorization: credencial() },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/**
 * Quién entra: el titular por defecto, o una persona autorizada con los accesos que le dieron.
 */
function sesionDelCliente({ titular = true, accesos = [] } = {}) {
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('GET /rest/v1/clientes', titular ? [{ id: CLIENTE }] : []);
  respuestas.set('GET /rest/v1/personas_autorizadas', titular ? [] : [{ cliente_id: CLIENTE }]);
  respuestas.set('GET /rest/v1/configuracion_visibilidad_app', []);
  respuestas.set('GET /rest/v1/permisos_personas_autorizadas', accesos);
}

const CON_LA_FICHA = [{ clave: 'persona_autorizada_ficha_del_paciente', permitido: true }];

const llamadasA = (clave) => llamadas.filter((l) => l.clave === clave);
const rpc = (nombre) => llamadasA(`POST /rest/v1/rpc/${nombre}`);
const subidas = () => llamadas.filter((l) => l.clave.startsWith(`POST /storage/v1/object/${BUCKET}/`));
const borrados = () => llamadasA(`DELETE /storage/v1/object/${BUCKET}`);
const REGISTRAR = 'registrar_autorizacion_signos_vitales_del_titular';

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  depositoRechazaSubidas = false;
  sesionDelCliente();
  // Dos Pacientes en la base: el de este Cliente y el de otro, de la misma Prestadora.
  respuestas.set('GET /rest/v1/pacientes', ({ url }) => filasQuePasanLosFiltros(url, [
    { id: PACIENTE, prestadora_id: PRESTADORA, cliente_id: CLIENTE },
    { id: PACIENTE_DE_OTRO, prestadora_id: PRESTADORA, cliente_id: OTRO_CLIENTE },
  ]));
  respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [
    { id: AUTORIZACION, metodo: 'documento_firmado_cliente', estado: 'pendiente', created_at: '2026-10-01T10:00:00Z' },
  ]);
  respuestas.set('POST /rest/v1/consultas_a_hce', () => []);
  respuestas.set('GET /rest/v1/apoderados', () => []);
  respuestas.set('POST /rest/v1/rpc/documento_autorizacion_signos_vitales', () => [
    { titulo: 'Autorización inventada', texto: 'Texto inventado para firmar.', verificador: 'verificador-inventado', idioma: 'es-AR' },
  ]);
  respuestas.set(`POST /rest/v1/rpc/${REGISTRAR}`, () => null);
});

describe('quién ve la autorización', () => {
  it('la persona autorizada sin la Ficha del Paciente no ve nada, y no se consulta nada del Paciente', async () => {
    sesionDelCliente({ titular: false, accesos: [] });

    for (const ruta of [`/${PACIENTE}`, `/autorizacion/${AUTORIZACION}`]) {
      const { estado, cuerpo } = await pedir('GET', ruta);
      assert.equal(estado, 403, ruta);
      assert.equal(cuerpo.motivo, 'sin_acceso', ruta);
    }
    assert.equal(llamadasA('GET /rest/v1/pacientes').length, 0);
    assert.equal(llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente').length, 0);
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });

  it('la persona autorizada con la Ficha la ve, pero no puede firmar', async () => {
    sesionDelCliente({ titular: false, accesos: CON_LA_FICHA });

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}`);

    assert.equal(estado, 200);
    assert.equal(cuerpo.autorizacion.id, AUTORIZACION);
    assert.equal(cuerpo.puedeFirmar, false);
  });

  it('el titular la ve y puede firmar; la lectura sale con su credencial', async () => {
    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}`);

    assert.equal(estado, 200);
    assert.equal(cuerpo.puedeFirmar, true);
    const [consulta] = llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente');
    assert.equal(consulta.autorizacion, credencial());
    const [paciente] = llamadasA('GET /rest/v1/pacientes');
    assert.equal(paciente.autorizacion, credencial());
    assert.ok(paciente.url.includes(`cliente_id=eq.${CLIENTE}`), paciente.url);
  });

  it('el Paciente de otro Cliente no existe para éste', async () => {
    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE_DE_OTRO}`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'paciente_no_encontrado');
    assert.equal(llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente').length, 0);
  });
});

describe('cuando firma un Apoderado', () => {
  const conPoder = (estado) => [{ id: 'a', estado, persona: { id: 'p', nombre_visible: 'Inventada' } }];

  it('con el poder aprobado, el titular se entera y no firma; la consulta sale con el trabajo', async () => {
    respuestas.set('GET /rest/v1/apoderados', () => conPoder('aprobado'));

    const vista = await pedir('GET', `/${PACIENTE}`);
    const firma = await pedir('POST', `/${PACIENTE}/firmar`, { respuesta: { id: CREDENCIAL_DEL_TELEFONO }, verificador: 'x' });

    assert.equal(vista.cuerpo.hayApoderado, true);
    esElTrabajoDeLaPrestadora(llamadasA('GET /rest/v1/apoderados')[0].autorizacion, 'la tabla la lee el trabajo');
    assert.equal(firma.estado, 403);
    assert.equal(firma.cuerpo.motivo, 'sin_permiso');
    assert.equal(rpc(REGISTRAR).length, 0);
  });

  it('con el poder sin aprobar, sigue firmando el titular', async () => {
    respuestas.set('GET /rest/v1/apoderados', () => conPoder('en_revision'));

    const { cuerpo } = await pedir('GET', `/${PACIENTE}`);

    assert.equal(cuerpo.hayApoderado, false);
    assert.equal(cuerpo.puedeFirmar, true);
  });
});

describe('lo que es sólo del titular', () => {
  it('la persona autorizada, aun con la Ficha, no pide el documento, no firma y no sube documento', async () => {
    sesionDelCliente({ titular: false, accesos: CON_LA_FICHA });

    const documento = await pedir('GET', `/${PACIENTE}/documento`);
    const firma = await pedir('POST', `/${PACIENTE}/firmar`, { respuesta: { id: CREDENCIAL_DEL_TELEFONO }, verificador: 'x' });
    const subida = await subirDocumentoFirmado(PACIENTE);

    for (const [nombre, r] of [['documento', documento], ['firmar', firma], ['documento firmado', subida]]) {
      assert.equal(r.estado, 403, nombre);
      assert.equal(r.cuerpo.motivo, 'sin_acceso', nombre);
    }
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /rest/v1/rpc/')), false);
    assert.equal(llamadas.some((l) => l.clave.includes(' /storage/')), false);
    assert.equal(llamadasA('GET /rest/v1/llaves_de_dispositivo').length, 0);
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });

  it('el documento trae el identificador de verificación, y verla queda anotado', async () => {
    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}/documento?idioma=pt-BR`);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, {
      titulo: 'Autorización inventada',
      texto: 'Texto inventado para firmar.',
      verificador: 'verificador-inventado',
      idioma: 'es-AR',
    });
    const [documento] = rpc('documento_autorizacion_signos_vitales');
    assert.equal(documento.autorizacion, credencial());
    assert.deepEqual(documento.cuerpo, { p_paciente: PACIENTE, p_idioma: 'pt-BR' });
    const anotaciones = llamadasA('POST /rest/v1/consultas_a_hce');
    assert.equal(anotaciones.length, 1);
    assert.equal(anotaciones[0].autorizacion, credencial());
    assert.equal(anotaciones[0].cuerpo.paciente_id, PACIENTE);
    assert.deepEqual(anotaciones[0].cuerpo.categorias, ['autorizaciones_monitoreo_paciente']);
  });

  it('sin texto para el país, no hay documento ni se anota nada', async () => {
    respuestas.set('POST /rest/v1/rpc/documento_autorizacion_signos_vitales', () => []);

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}/documento`);

    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'sin_texto');
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });
});

describe('el documento firmado que sube el titular', () => {
  it('se sube con el trabajo de la Prestadora, sin reemplazar ninguno, y se anota sin verificador', async () => {
    const { estado, cuerpo } = await subirDocumentoFirmado(PACIENTE);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });

    const [subida] = subidas();
    assert.ok(subida, 'no se subió nada');
    const ruta = subida.clave.replace(`POST /storage/v1/object/${BUCKET}/`, '');
    assert.ok(ruta.startsWith(`${PRESTADORA}/${PACIENTE}/autorizacion-`), ruta);
    assert.ok(ruta.endsWith('.jpg'), ruta);
    assert.notEqual(subida.autorizacion, credencial());
    esElTrabajoDeLaPrestadora(subida.autorizacion, 'la subida salió con otra credencial');
    assert.equal(subida.reemplaza, 'false');

    const [registro] = rpc(REGISTRAR);
    assert.ok(registro, 'no se anotó la autorización');
    esElTrabajoDeLaPrestadora(registro.autorizacion, 'la anotación salió con otra credencial');
    assert.equal(registro.cuerpo.p_usuario, USUARIO);
    assert.equal(registro.cuerpo.p_paciente, PACIENTE);
    assert.equal(registro.cuerpo.p_verificador, null);
    assert.equal(registro.cuerpo.p_archivo, ruta);
    assert.ok(llamadas.indexOf(subida) < llamadas.indexOf(registro), 'se anotó antes de subir');
    assert.equal(borrados().length, 0);
  });

  it('si la base no lo anota, el archivo se borra con el mismo trabajo y la respuesta dice por qué', async () => {
    respuestas.set(`POST /rest/v1/rpc/${REGISTRAR}`, () => ({
      __estado: 400,
      __cuerpo: { code: 'P0001', message: 'ya_hay_una_autorizacion' },
    }));

    const { estado, cuerpo } = await subirDocumentoFirmado(PACIENTE);

    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'ya_hay_una_autorizacion');
    const [subida] = subidas();
    const [borrado] = borrados();
    assert.ok(borrado, 'el archivo quedó huérfano en el depósito');
    esElTrabajoDeLaPrestadora(borrado.autorizacion, 'el borrado salió con otra credencial');
    assert.deepEqual(borrado.cuerpo.prefixes, [subida.clave.replace(`POST /storage/v1/object/${BUCKET}/`, '')]);
  });

  it('si el depósito no lo deja subir, no se anota nada', async () => {
    depositoRechazaSubidas = true;

    const { estado } = await subirDocumentoFirmado(PACIENTE);

    assert.notEqual(estado, 200);
    assert.equal(rpc(REGISTRAR).length, 0);
  });

  it('para el Paciente de otro Cliente no se sube nada', async () => {
    const { estado } = await subirDocumentoFirmado(PACIENTE_DE_OTRO);

    assert.equal(estado, 404);
    assert.equal(subidas().length, 0);
    assert.equal(rpc(REGISTRAR).length, 0);
  });
});

/**
 * Un teléfono de mentira: una llave P-256 que firma lo mismo que firmaría un teléfono de verdad.
 * Es el mismo que usa `llaveDelDispositivo.test.js`, con el origen de la aplicación de Clientes.
 */
function llaveQueFirma({ contador = 4, origen = ORIGEN } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = publicKey.export({ format: 'jwk' });
  // La mitad pública en el formato en que la guarda la base: COSE, en base64url.
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(y, 'base64url'),
  ]);
  return {
    clavePublica: cose.toString('base64url'),
    firmar(desafio) {
      const datosDelAparato = Buffer.alloc(37);
      crypto.createHash('sha256').update(new URL(origen).hostname).digest().copy(datosDelAparato, 0);
      datosDelAparato[32] = 0x05; // presencia y verificación de la persona
      datosDelAparato.writeUInt32BE(contador, 33);
      const delNavegador = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: desafio, origin: origen }));
      const firma = crypto
        .createSign('sha256')
        .update(Buffer.concat([datosDelAparato, crypto.createHash('sha256').update(delNavegador).digest()]))
        .sign(privateKey);
      return {
        id: CREDENCIAL_DEL_TELEFONO,
        rawId: CREDENCIAL_DEL_TELEFONO,
        type: 'public-key',
        response: {
          clientDataJSON: delNavegador.toString('base64url'),
          authenticatorData: datosDelAparato.toString('base64url'),
          signature: firma.toString('base64url'),
        },
        clientExtensionResults: {},
      };
    },
  };
}

describe('firmar con el acceso guardado del teléfono', () => {
  let telefono;
  let desafiosEnLaBase;

  beforeEach(() => {
    telefono = llaveQueFirma();
    const llaves = [{
      id: LLAVE,
      prestadora_id: PRESTADORA,
      usuario_id: USUARIO,
      rol: 'cliente',
      credencial_id: CREDENCIAL_DEL_TELEFONO,
      clave_publica: telefono.clavePublica,
      contador: 3,
      transportes: ['internal'],
      revocada_en: null,
    }];
    const vence = new Date(Date.now() + 60 * 1000).toISOString();
    desafiosEnLaBase = [
      { id: crypto.randomUUID(), desafio: 'firma-del-titular', para: 'firma', rol: 'cliente', usuario_id: USUARIO, prestadora_id: PRESTADORA, vence_en: vence, usado_en: null },
      { id: crypto.randomUUID(), desafio: 'de-alta', para: 'alta', rol: 'cliente', usuario_id: USUARIO, prestadora_id: PRESTADORA, vence_en: vence, usado_en: null },
    ];
    respuestas.set('GET /rest/v1/llaves_de_dispositivo', ({ url }) => filasQuePasanLosFiltros(url, llaves));
    respuestas.set('PATCH /rest/v1/llaves_de_dispositivo', ({ url }) => filasQuePasanLosFiltros(url, llaves).map((f) => ({ id: f.id })));
    respuestas.set('GET /rest/v1/desafios_de_llave', ({ url }) => filasQuePasanLosFiltros(url, desafiosEnLaBase));
    respuestas.set('PATCH /rest/v1/desafios_de_llave', ({ url }) => filasQuePasanLosFiltros(url, desafiosEnLaBase).map((f) => ({ id: f.id })));
  });

  it('con una firma de verdad, se anota con el trabajo de la Prestadora y el verificador del documento', async () => {
    const { estado, cuerpo } = await pedir('POST', `/${PACIENTE}/firmar`, {
      respuesta: telefono.firmar('firma-del-titular'),
      verificador: 'verificador-inventado',
      idioma: 'en',
    });

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo, { ok: true });
    const [registro] = rpc(REGISTRAR);
    esElTrabajoDeLaPrestadora(registro.autorizacion, 'la firma se anotó con otra credencial');
    assert.deepEqual(registro.cuerpo, {
      p_usuario: USUARIO,
      p_paciente: PACIENTE,
      p_idioma: 'en',
      p_verificador: 'verificador-inventado',
      p_archivo: null,
    });
    // La llave y el desafío se leyeron con la credencial de quien firma, no con el trabajo.
    assert.equal(llamadasA('GET /rest/v1/llaves_de_dispositivo')[0].autorizacion, credencial());
    assert.equal(llamadasA('GET /rest/v1/desafios_de_llave')[0].autorizacion, credencial());
    const contador = llamadasA('PATCH /rest/v1/llaves_de_dispositivo').find((l) => l.cuerpo?.contador !== undefined);
    assert.equal(contador.cuerpo.contador, 4);
    assert.ok(
      llamadas.indexOf(contador) < llamadas.indexOf(registro),
      'se anotó la firma antes de terminar de comprobarla'
    );
  });

  it('sin verificador o sin respuesta del teléfono faltan datos, y no se mira ninguna llave', async () => {
    for (const cuerpo of [
      { respuesta: telefono.firmar('firma-del-titular') },
      { verificador: 'verificador-inventado' },
    ]) {
      const r = await pedir('POST', `/${PACIENTE}/firmar`, cuerpo);
      assert.equal(r.estado, 400);
      assert.equal(r.cuerpo.motivo, 'faltan_datos');
    }
    assert.equal(llamadasA('GET /rest/v1/llaves_de_dispositivo').length, 0);
    assert.equal(rpc(REGISTRAR).length, 0);
  });

  it('una firma que no sirve no anota nada', async () => {
    const otroTelefono = llaveQueFirma();
    const casos = {
      'firmada por otra llave': otroTelefono.firmar('firma-del-titular'),
      'sobre un desafío de alta': telefono.firmar('de-alta'),
      'desde otro origen': llaveQueFirma({ origen: 'https://otro.ejemplo.com' }).firmar('firma-del-titular'),
    };
    for (const [caso, respuesta] of Object.entries(casos)) {
      const r = await pedir('POST', `/${PACIENTE}/firmar`, { respuesta, verificador: 'verificador-inventado' });
      assert.equal(r.estado, 401, caso);
      assert.equal(r.cuerpo.motivo, 'firma_no_sirve', caso);
    }
    assert.equal(rpc(REGISTRAR).length, 0);
  });

  it('si el documento cambió desde que se mostró, la base lo dice y la respuesta lo trae', async () => {
    respuestas.set(`POST /rest/v1/rpc/${REGISTRAR}`, () => ({
      __estado: 400,
      __cuerpo: { code: 'P0001', message: 'el_texto_cambio' },
    }));

    const { estado, cuerpo } = await pedir('POST', `/${PACIENTE}/firmar`, {
      respuesta: telefono.firmar('firma-del-titular'),
      verificador: 'verificador-viejo',
    });

    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'el_texto_cambio');
  });
});

describe('lo firmado', () => {
  it('firmado en la aplicación, devuelve el texto, y la lectura queda anotada con la credencial de quien pide', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [{
      id: AUTORIZACION, prestadora_id: PRESTADORA, paciente_id: PACIENTE, metodo: 'aplicacion', estado: 'aceptada',
      documento_texto: 'Texto inventado que se firmó.', documento_idioma: 'es-AR', archivo_url: null,
    }]);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { id: AUTORIZACION, metodo: 'aplicacion', estado: 'aceptada', texto: 'Texto inventado que se firmó.', idioma: 'es-AR' });
    assert.equal(llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente')[0].autorizacion, credencial());
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 1);
    assert.equal(llamadas.some((l) => l.clave.includes('/object/sign/')), false);
  });

  it('firmado a mano, el enlace temporal sale con el trabajo de la Prestadora de la autorización', async () => {
    const ruta = `${PRESTADORA}/${PACIENTE}/autorizacion-1.jpg`;
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [{
      id: AUTORIZACION, prestadora_id: PRESTADORA, paciente_id: PACIENTE, metodo: 'documento_firmado_cliente', estado: 'pendiente',
      documento_texto: null, documento_idioma: 'es-AR', archivo_url: ruta,
    }]);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 200);
    assert.ok(cuerpo.url.includes(`/object/sign/${BUCKET}/${ruta}`), cuerpo.url);
    const [enlace] = llamadasA(`POST /storage/v1/object/sign/${BUCKET}/${ruta}`);
    esElTrabajoDeLaPrestadora(enlace.autorizacion, 'el enlace salió con otra credencial');
    assert.equal(enlace.cuerpo.expiresIn, 60);
    const anotacion = llamadasA('POST /rest/v1/consultas_a_hce')[0];
    assert.ok(llamadas.indexOf(anotacion) < llamadas.indexOf(enlace), 'el enlace salió antes de anotar la lectura');
  });

  it('la que la base no le muestra no existe, y no se pide ningún enlace', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => []);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(llamadas.some((l) => l.clave.includes(' /storage/')), false);
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });
});
