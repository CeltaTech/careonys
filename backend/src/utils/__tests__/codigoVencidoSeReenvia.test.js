/**
 * En la recuperación de la clave, el código del teléfono que llega vencido se reemplaza solo.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA. Quien abrió el enlace del correo y escribió un código que ya venció recibe otro
 * por WhatsApp sin tener que volver a abrir el enlace, y la respuesta sigue diciendo
 * `codigo_vencido`, que es lo que la pantalla usa para avisar que salió uno nuevo. Y la clave no
 * se cambia: un código vencido no abre nada.
 *
 * LA PRUEBA QUE IMPORTA SE COMPRUEBA POR LO QUE SALE, no por el motivo: sin el reenvío el motivo
 * sería el mismo, así que lo que distingue es que se haya emitido una fila nueva y que Meta haya
 * recibido el mensaje. Y del otro lado del borde, un código equivocado no manda nada.
 *
 * La base y Meta son de mentira. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUENTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CODIGO_NUEVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TELEFONO = '+5491122334455';
const ENLACE = 'enlace-de-prueba';
const EL_CODIGO = '123456';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json', ...(valor.__cabeceras ?? {}) });
      res.end(JSON.stringify(valor.__cuerpo));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
prepararCredencialDePrueba();

// Un Meta de mentira, puesto antes de importar nada. Lo que no va a Meta sigue a la base de mentira.
const fetchDeVerdad = globalThis.fetch;
let pedidosAMeta = [];
globalThis.fetch = async (url, opciones) => {
  const direccion = String(url);
  if (!direccion.startsWith('https://graph.facebook.com/')) return fetchDeVerdad(url, opciones);
  pedidosAMeta.push({ direccion, cuerpo: opciones?.body ? JSON.parse(opciones.body) : null });
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.de-mentira' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const { cambiarClaveConToken } = await import('../recuperacionDeClave.js');
const { verificadorDelCodigo } = await import('../codigoDeUnSoloUso.js');

after(() => {
  globalThis.fetch = fetchDeVerdad;
  baseFalsa.close();
});

function enMinutos(minutos) {
  return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}

/**
 * Una cuenta con el enlace vivo, el teléfono verificado y habilitado por la Prestadora, sin puerta
 * abierta, y un código pendiente que vence cuando diga la prueba.
 */
function prepararRecuperacion({ codigoExpiraEn, pedidosEnLaHora = 0 }) {
  respuestas.set('GET /rest/v1/tokens_recuperacion_clave', [
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', usuario_id: CUENTA, expira_en: enMinutos(60), usado_en: null },
  ]);
  respuestas.set('GET /rest/v1/usuarios', [
    {
      id: CUENTA,
      nombre: 'Persona De Prueba',
      email: 'persona@ejemplo.invalido',
      telefono: TELEFONO,
      telefono_verificado_en: enMinutos(-1000),
      prestadora_id: PRESTADORA,
    },
  ]);
  respuestas.set('GET /rest/v1/cambios_de_clave_habilitados', []);
  respuestas.set('GET /rest/v1/plantillas_whatsapp', [
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      nombre_interno: 'codigo_de_acceso',
      idioma: 'es',
      cuerpo_texto: 'Su código es {{1}}. Vence en {{2}} minutos.',
      estado: 'aprobada',
    },
  ]);
  respuestas.set('GET /rest/v1/telefonos_confirmados_por_la_prestadora', [{ id: '99999999-9999-4999-8999-999999999999' }]);
  respuestas.set('GET /rest/v1/codigos_al_telefono', [
    {
      id: CODIGO_ID,
      telefono: TELEFONO,
      codigo_verificador: verificadorDelCodigo(EL_CODIGO),
      codigo_expira_en: codigoExpiraEn,
      verificado_en: null,
      anulado_en: null,
    },
  ]);
  respuestas.set('POST /rest/v1/rpc/sumar_intento_de_codigo', 1);
  respuestas.set('PATCH /rest/v1/codigos_al_telefono', []);

  // Lo que hace falta para que salga un código nuevo.
  respuestas.set('HEAD /rest/v1/pedidos_de_codigo_al_telefono', {
    __estado: 200,
    __cabeceras: { 'Content-Range': `0-0/${pedidosEnLaHora}` },
    __cuerpo: null,
  });
  respuestas.set('POST /rest/v1/codigos_al_telefono', [{ id: CODIGO_NUEVO_ID, codigo_expira_en: enMinutos(10) }]);
  respuestas.set('POST /rest/v1/pedidos_de_codigo_al_telefono', []);
  respuestas.set('GET /rest/v1/configuracion_whatsapp_prestadora', [
    { activo: true, phone_number_id: '1234567890', waba_id: '0987654321' },
  ]);
  respuestas.set('POST /rest/v1/rpc/leer_token_whatsapp', 'token-de-mentira');
}

function seEmitioUnCodigoNuevo() {
  return llamadas.some((l) => l.clave === 'POST /rest/v1/codigos_al_telefono');
}

function seCambioLaClave() {
  return llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/poner_clave_con_codigo');
}

async function motivoDe(promesa) {
  try {
    await promesa;
    return null;
  } catch (err) {
    return err.motivo ?? err.message;
  }
}

beforeEach(() => {
  llamadas = [];
  pedidosAMeta = [];
  respuestas.clear();
  delete process.env.TOPE_CODIGOS_AL_TELEFONO_POR_HORA;
});

describe('el código vencido en la recuperación de la clave', () => {
  it('manda uno nuevo por WhatsApp y la respuesta sigue siendo «vencido»', async () => {
    prepararRecuperacion({ codigoExpiraEn: enMinutos(-1) });

    const motivo = await motivoDe(cambiarClaveConToken(ENLACE, 'ClaveNueva-De-Prueba-1', EL_CODIGO, PRESTADORA));

    assert.equal(motivo, 'codigo_vencido');
    assert.equal(seEmitioUnCodigoNuevo(), true, 'tenía que emitirse un código nuevo');
    assert.equal(pedidosAMeta.length, 1, 'tenía que salir un mensaje por WhatsApp');
    assert.equal(pedidosAMeta[0].cuerpo?.to, TELEFONO);
    const nuevo = llamadas.find((l) => l.clave === 'POST /rest/v1/codigos_al_telefono');
    assert.equal(nuevo.cuerpo?.uso, 'recuperar_la_clave');
    assert.equal(nuevo.cuerpo?.usuario_id, CUENTA);
    assert.equal(seCambioLaClave(), false, 'un código vencido no cambia la clave');
  });

  it('si el nuevo no puede salir, sube ese motivo y no el vencimiento', async () => {
    process.env.TOPE_CODIGOS_AL_TELEFONO_POR_HORA = '3';
    prepararRecuperacion({ codigoExpiraEn: enMinutos(-1), pedidosEnLaHora: 3 });

    const motivo = await motivoDe(cambiarClaveConToken(ENLACE, 'ClaveNueva-De-Prueba-1', EL_CODIGO, PRESTADORA));

    assert.equal(motivo, 'demasiados_pedidos');
    assert.equal(pedidosAMeta.length, 0);
    assert.equal(seCambioLaClave(), false);
  });

  it('un código equivocado y vigente no manda ninguno', async () => {
    // El otro lado del borde: el reenvío es sólo para el vencido.
    prepararRecuperacion({ codigoExpiraEn: enMinutos(5) });

    const motivo = await motivoDe(cambiarClaveConToken(ENLACE, 'ClaveNueva-De-Prueba-1', '000000', PRESTADORA));

    assert.equal(motivo, 'codigo_incorrecto');
    assert.equal(seEmitioUnCodigoNuevo(), false);
    assert.equal(pedidosAMeta.length, 0);
    assert.equal(seCambioLaClave(), false);
  });
});
