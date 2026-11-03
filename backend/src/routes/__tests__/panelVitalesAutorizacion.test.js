/**
 * La autorización de signos vitales vista desde la Ficha del Cliente, en el Panel.
 *
 *   node --test backend/src/routes/__tests__/panelVitalesAutorizacion.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La ruta (`../panelVitalesAutorizacion.js`) trabaja entera con la
 * credencial de quien pide: lee la tabla, sube y borra en el depósito, pide el enlace temporal y
 * cierra o revisa la autorización por funciones de la base que sacan de la sesión quién lo hizo.
 * Lo que se sostiene acá es eso:
 *
 *   1. QUE TODO SALGA CON LA CREDENCIAL DE QUIEN PIDE. Si una consulta volviera a otra credencial,
 *      se saltearía la protección por fila sin que nada fallara a la vista.
 *   2. QUE EL PACIENTE DE OTRA PRESTADORA NO EXISTA. Ni se lee su autorización, ni se sube nada a
 *      su nombre, ni se anota una lectura de salud sobre él.
 *   3. QUE EL PAPEL QUE NO QUEDÓ EN NINGUNA AUTORIZACIÓN SE BORRE. Si la base no cierra la
 *      autorización, el archivo subido queda huérfano en el depósito.
 *   4. QUE VER EL DOCUMENTO QUEDE ANOTADO como lectura de información de salud.
 *   5. QUE REVISAR DOS VECES NO SE CONFUNDA CON REVISAR BIEN. Si la base contesta que no tocó nada,
 *      otra persona ya la había resuelto.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Imita la protección por fila de
 * `pacientes`: sólo se ven los de la Prestadora de quien pide. Lo que esta prueba no ve son las
 * políticas y las funciones de la base en sí: la base de mentira no las tiene, y lo que ellas
 * comprueban por dentro —que quien pide alcance la información de salud del Paciente, que el
 * archivo esté en la carpeta de su Prestadora— lo prueban los scripts contra la base local.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-4999-8999-999999999999';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const PACIENTE = '33333333-3333-4333-8333-333333333333';
const AUTORIZACION = '44444444-4444-4444-8444-444444444444';
const BUCKET = 'autorizaciones-monitoreo';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, en orden, con la dirección entera y el cuerpo. */
let llamadas = [];

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
    llamadas.push({
      clave,
      url: req.url,
      cuerpo,
      credencial: req.headers.authorization,
      reemplaza: req.headers['x-upsert'],
    });

    const preparada = respuestas.get(clave) ?? respuestaDelDeposito(req.method, ruta);
    const valor = typeof preparada === 'function'
      ? preparada({ url: req.url, cuerpo })
      : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    // Un error de la base, con el código y el cuerpo que manda PostgREST o el depósito.
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
let depositoRechazaSubidas = false;

function respuestaDelDeposito(metodo, ruta) {
  if (!ruta.startsWith('/storage/v1/')) return undefined;
  if (depositoRechazaSubidas && metodo === 'POST' && ruta.startsWith(`/storage/v1/object/${BUCKET}/`)) {
    return { __estado: 400, __cuerpo: { statusCode: '403', error: 'Unauthorized', message: 'la política no lo deja' } };
  }
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/sign/${BUCKET}/`)) {
    return { signedURL: `${ruta.replace('/storage/v1', '')}?token=enlace-de-mentira` };
  }
  if (metodo === 'POST' && ruta.startsWith(`/storage/v1/object/${BUCKET}/`)) {
    return { Key: ruta.replace('/storage/v1/object/', ''), Id: 'archivo-de-mentira' };
  }
  if (metodo === 'DELETE' && ruta === `/storage/v1/object/${BUCKET}`) {
    return [];
  }
  return undefined;
}

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelVitalesAutorizacionRouter } = await import('../panelVitalesAutorizacion.js');

const app = express();
app.use(express.json());
app.use('/api/panel/vitales-autorizacion', panelVitalesAutorizacionRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/vitales-autorizacion`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** La credencial de la persona de la prueba, tal como llega a la base. */
const credencial = () => sesionDePrueba(USUARIO);

async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: { Authorization: credencial() } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(`${DIRECCION}${ruta}`, opciones);
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function subirPapel(pacienteId, { tipo = 'application/pdf' } = {}) {
  const cuerpo = new FormData();
  cuerpo.append('archivo', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: tipo }), 'autorizacion.pdf');
  const respuesta = await fetch(`${DIRECCION}/${pacienteId}/papel`, {
    method: 'POST',
    headers: { Authorization: credencial() },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function unPaciente(cambios = {}) {
  return { id: PACIENTE, prestadora_id: PRESTADORA, ...cambios };
}

/** Los Pacientes que hay en la base. Quien pide ve sólo los de su Prestadora, como con la política. */
function pacientesEnLaBase(...filas) {
  respuestas.set('GET /rest/v1/pacientes', () => filas.filter((fila) => fila.prestadora_id === PRESTADORA));
}

const llamadasA = (clave) => llamadas.filter((l) => l.clave === clave);
const rpc = (nombre) => llamadasA(`POST /rest/v1/rpc/${nombre}`);
const subidas = () => llamadas.filter((l) => l.clave.startsWith(`POST /storage/v1/object/${BUCKET}/`));
const borrados = () => llamadasA(`DELETE /storage/v1/object/${BUCKET}`);

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  depositoRechazaSubidas = false;
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('POST /rest/v1/consultas_a_hce', () => []);
  pacientesEnLaBase(unPaciente());
});

describe('la autorización del Paciente', () => {
  it('se lee con la credencial de quien pide, la que rige o la que espera revisión', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [
      { id: AUTORIZACION, metodo: 'aplicacion', estado: 'aceptada', created_at: '2026-10-01T10:00:00Z' },
    ]);

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}`);

    assert.equal(estado, 200);
    assert.equal(cuerpo.autorizacion.id, AUTORIZACION);
    const [consulta] = llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente');
    assert.equal(consulta.credencial, credencial());
    const url = decodeURIComponent(consulta.url);
    assert.ok(url.includes(`paciente_id=eq.${PACIENTE}`), url);
    assert.ok(url.includes('estado=in.(aceptada,pendiente)'), url);
    // El Paciente también se busca con esa credencial, y sin filtro de Prestadora: lo pone la base.
    const [paciente] = llamadasA('GET /rest/v1/pacientes');
    assert.equal(paciente.credencial, credencial());
    assert.ok(!paciente.url.includes('prestadora_id='), paciente.url);
  });

  it('sin ninguna, contesta vacío y no un error', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => []);

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}`);

    assert.equal(estado, 200);
    assert.equal(cuerpo.autorizacion, null);
  });

  it('el Paciente de otra Prestadora no existe para ésta, y no se toca nada a su nombre', async () => {
    pacientesEnLaBase(unPaciente({ prestadora_id: OTRA_PRESTADORA }));

    for (const [metodo, ruta] of [['GET', `/${PACIENTE}`], ['GET', `/${PACIENTE}/para-firmar`]]) {
      const { estado, cuerpo } = await pedir(metodo, ruta);
      assert.equal(estado, 404, ruta);
      assert.equal(cuerpo.motivo, 'paciente_no_encontrado', ruta);
    }
    const papel = await subirPapel(PACIENTE);
    assert.equal(papel.estado, 404);

    assert.equal(llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente').length, 0);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /rest/v1/rpc/')), false);
    assert.equal(llamadas.some((l) => l.clave.includes(' /storage/')), false);
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });
});

describe('la hoja para imprimir y firmar', () => {
  beforeEach(() => {
    respuestas.set('POST /rest/v1/rpc/documento_autorizacion_signos_vitales', () => [
      { titulo: 'Autorización inventada', texto: 'Texto inventado para firmar.', idioma: 'es-AR', verificador: 'abc123' },
    ]);
  });

  it('la arma la base con la credencial de quien pide, y devuelve título, texto e idioma', async () => {
    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}/para-firmar?idioma=es-AR`);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { titulo: 'Autorización inventada', texto: 'Texto inventado para firmar.', idioma: 'es-AR' });
    const [llamada] = rpc('documento_autorizacion_signos_vitales');
    assert.equal(llamada.credencial, credencial());
    assert.equal(llamada.cuerpo.p_paciente, PACIENTE);
    assert.equal(llamada.cuerpo.p_idioma, 'es-AR');
  });

  it('verla queda anotado como lectura de salud, con la credencial de quien pide', async () => {
    await pedir('GET', `/${PACIENTE}/para-firmar`);

    const anotaciones = llamadasA('POST /rest/v1/consultas_a_hce');
    assert.equal(anotaciones.length, 1);
    assert.equal(anotaciones[0].credencial, credencial());
    assert.equal(anotaciones[0].cuerpo.paciente_id, PACIENTE);
    assert.equal(anotaciones[0].cuerpo.prestadora_id, PRESTADORA);
    assert.equal(anotaciones[0].cuerpo.usuario_id, USUARIO);
    assert.deepEqual(anotaciones[0].cuerpo.categorias, ['autorizaciones_monitoreo_paciente']);
  });

  it('si el país no tiene texto, no se entrega una hoja vacía ni se anota nada', async () => {
    respuestas.set('POST /rest/v1/rpc/documento_autorizacion_signos_vitales', () => [{ titulo: null, texto: null, idioma: 'es-AR' }]);

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}/para-firmar`);

    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'sin_texto');
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
  });

  it('si no se puede anotar la lectura, el texto no sale', async () => {
    respuestas.set('POST /rest/v1/consultas_a_hce', () => ({ __estado: 403, __cuerpo: { code: '42501', message: 'la política no lo deja' } }));

    const { estado, cuerpo } = await pedir('GET', `/${PACIENTE}/para-firmar`);

    assert.equal(estado, 500);
    assert.equal(cuerpo.texto, undefined);
  });
});

describe('el papel firmado que sube la Prestadora', () => {
  beforeEach(() => {
    respuestas.set('POST /rest/v1/rpc/cerrar_autorizacion_signos_vitales_en_papel', () => null);
  });

  it('se sube con la credencial de quien pide, sin reemplazar ninguno, y después se cierra', async () => {
    const { estado, cuerpo } = await subirPapel(PACIENTE);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });

    const [subida] = subidas();
    assert.ok(subida, 'no se subió nada');
    assert.ok(subida.clave.startsWith(`POST /storage/v1/object/${BUCKET}/${PRESTADORA}/${PACIENTE}/autorizacion-`), subida.clave);
    assert.ok(subida.clave.endsWith('.pdf'), subida.clave);
    assert.equal(subida.credencial, credencial());
    assert.equal(subida.reemplaza, 'false');

    const [cierre] = rpc('cerrar_autorizacion_signos_vitales_en_papel');
    assert.ok(cierre, 'no se cerró la autorización');
    assert.equal(cierre.credencial, credencial());
    assert.equal(cierre.cuerpo.p_paciente, PACIENTE);
    assert.equal(cierre.cuerpo.p_archivo, subida.clave.replace(`POST /storage/v1/object/${BUCKET}/`, ''));
    assert.ok(llamadas.indexOf(subida) < llamadas.indexOf(cierre), 'se cerró antes de subir');
    assert.equal(borrados().length, 0);
  });

  it('si la base no la cierra, el archivo se borra y la respuesta dice por qué', async () => {
    respuestas.set('POST /rest/v1/rpc/cerrar_autorizacion_signos_vitales_en_papel', () => ({
      __estado: 400,
      __cuerpo: { code: 'P0001', message: 'ya_hay_una_autorizacion' },
    }));

    const { estado, cuerpo } = await subirPapel(PACIENTE);

    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'ya_hay_una_autorizacion');
    const [subida] = subidas();
    const [borrado] = borrados();
    assert.ok(borrado, 'el archivo quedó huérfano en el depósito');
    assert.equal(borrado.credencial, credencial());
    assert.deepEqual(borrado.cuerpo.prefixes, [subida.clave.replace(`POST /storage/v1/object/${BUCKET}/`, '')]);
  });

  it('si el depósito no lo deja subir, no se cierra nada', async () => {
    // La ruta del archivo lleva la hora, así que no se puede preparar por clave: se rechaza toda
    // subida, como lo haría la política del depósito.
    depositoRechazaSubidas = true;

    const { estado } = await subirPapel(PACIENTE);

    assert.notEqual(estado, 200);
    assert.equal(subidas().length, 1);
    assert.equal(rpc('cerrar_autorizacion_signos_vitales_en_papel').length, 0);
  });

  it('un archivo de otro tipo no se sube', async () => {
    const { estado, cuerpo } = await subirPapel(PACIENTE, { tipo: 'text/plain' });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'faltan_datos');
    assert.equal(subidas().length, 0);
  });
});

describe('lo firmado', () => {
  it('firmado en la aplicación, devuelve el texto y el idioma, y la lectura queda anotada', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [{
      id: AUTORIZACION,
      paciente_id: PACIENTE,
      metodo: 'aplicacion',
      estado: 'aceptada',
      documento_texto: 'Texto inventado que se firmó.',
      documento_idioma: 'es-AR',
      archivo_url: null,
    }]);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, {
      id: AUTORIZACION,
      metodo: 'aplicacion',
      estado: 'aceptada',
      texto: 'Texto inventado que se firmó.',
      idioma: 'es-AR',
    });
    const [consulta] = llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente');
    assert.equal(consulta.credencial, credencial());
    const anotaciones = llamadasA('POST /rest/v1/consultas_a_hce');
    assert.equal(anotaciones.length, 1);
    assert.equal(anotaciones[0].cuerpo.paciente_id, PACIENTE);
    assert.equal(llamadas.some((l) => l.clave.includes('/object/sign/')), false);
  });

  it('firmado en papel, devuelve un enlace temporal pedido con la credencial de quien pide', async () => {
    const ruta = `${PRESTADORA}/${PACIENTE}/autorizacion-1.pdf`;
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => [{
      id: AUTORIZACION,
      paciente_id: PACIENTE,
      metodo: 'papel_cliente',
      estado: 'pendiente',
      documento_texto: null,
      documento_idioma: 'es-AR',
      archivo_url: ruta,
    }]);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 200);
    assert.ok(cuerpo.url.includes(`/object/sign/${BUCKET}/${ruta}`), cuerpo.url);
    assert.equal(cuerpo.texto, undefined);
    const [enlace] = llamadasA(`POST /storage/v1/object/sign/${BUCKET}/${ruta}`);
    assert.ok(enlace, 'no se pidió el enlace');
    assert.equal(enlace.credencial, credencial());
    assert.equal(enlace.cuerpo.expiresIn, 60);
  });

  it('la que no se ve, o la rechazada, no se encuentra y no se anota nada', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', () => []);

    const { estado, cuerpo } = await pedir('GET', `/autorizacion/${AUTORIZACION}`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(llamadasA('POST /rest/v1/consultas_a_hce').length, 0);
    const url = decodeURIComponent(llamadasA('GET /rest/v1/autorizaciones_monitoreo_paciente')[0].url);
    assert.ok(url.includes('estado=in.(aceptada,pendiente)'), url);
  });
});

describe('revisar el papel que subió el Cliente', () => {
  it('aceptar pide a la base el estado aceptada, sin motivo, con la credencial de quien pide', async () => {
    respuestas.set('POST /rest/v1/rpc/revisar_autorizacion_signos_vitales', () => true);

    const { estado, cuerpo } = await pedir('POST', `/autorizacion/${AUTORIZACION}/aceptar`);

    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { ok: true });
    const [llamada] = rpc('revisar_autorizacion_signos_vitales');
    assert.equal(llamada.credencial, credencial());
    assert.deepEqual(llamada.cuerpo, { p_autorizacion: AUTORIZACION, p_estado: 'aceptada', p_motivo: null });
  });

  it('rechazar pide a la base el estado rechazada, con el motivo escrito', async () => {
    respuestas.set('POST /rest/v1/rpc/revisar_autorizacion_signos_vitales', () => true);

    const { estado } = await pedir('POST', `/autorizacion/${AUTORIZACION}/rechazar`, { motivo: 'La firma no se lee.' });

    assert.equal(estado, 200);
    const [llamada] = rpc('revisar_autorizacion_signos_vitales');
    assert.deepEqual(llamada.cuerpo, { p_autorizacion: AUTORIZACION, p_estado: 'rechazada', p_motivo: 'La firma no se lee.' });
  });

  it('un motivo que no es texto no viaja', async () => {
    respuestas.set('POST /rest/v1/rpc/revisar_autorizacion_signos_vitales', () => true);

    await pedir('POST', `/autorizacion/${AUTORIZACION}/rechazar`, { motivo: { algo: 1 } });

    const [llamada] = rpc('revisar_autorizacion_signos_vitales');
    assert.equal(llamada.cuerpo.p_motivo, null);
  });

  it('si la base no tocó nada, otra persona ya la había resuelto', async () => {
    for (const contesta of [false, null]) {
      respuestas.set('POST /rest/v1/rpc/revisar_autorizacion_signos_vitales', () => contesta);

      const { estado, cuerpo } = await pedir('POST', `/autorizacion/${AUTORIZACION}/aceptar`);

      assert.equal(estado, 409, String(contesta));
      assert.equal(cuerpo.motivo, 'ya_resuelta', String(contesta));
    }
  });

  it('rechazar sin motivo sale con el motivo que la base levantó', async () => {
    respuestas.set('POST /rest/v1/rpc/revisar_autorizacion_signos_vitales', () => ({
      __estado: 400,
      __cuerpo: { code: 'P0001', message: 'falta_el_motivo' },
    }));

    const { estado, cuerpo } = await pedir('POST', `/autorizacion/${AUTORIZACION}/rechazar`, {});

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'falta_el_motivo');
  });
});
