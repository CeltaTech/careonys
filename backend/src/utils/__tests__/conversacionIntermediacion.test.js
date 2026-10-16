/**
 * El hilo del Match: con qué credencial se lee y con cuál se escribe cada cosa.
 *
 *   node --test src/utils/__tests__/conversacionIntermediacion.test.js
 *
 * Lo que se lee va con la credencial de quien pide. Lo que se escribe —abrir el hilo, dejar un
 * mensaje, darlo por leído, anotar la sala— va con el trabajo de la Prestadora del hilo, porque la
 * persona tiene su credencial en el teléfono y con ella se saltearía lo que comprueba el backend.
 *
 * La base es de mentira y contesta por HTTP como la de verdad: además del resultado se mira con qué
 * credencial se le pidió cada cosa. Con el sistema roto —otra credencial u otra Prestadora— las
 * pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CLIENTE = '33333333-3333-4333-8333-333333333333';
const ASISTENTE = '44444444-4444-4444-8444-444444444444';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const HILO = '55555555-5555-4555-8555-555555555555';
const DE_LA_PERSONA = 'Bearer credencial-de-quien-pide';

const conversacion = {
  id: HILO,
  prestadora_id: PRESTADORA,
  cliente_id: CLIENTE,
  asistente_id: ASISTENTE,
  sala_videollamada: null,
  sala_abierta_at: null,
};

let llamadas = [];
let hiloExiste = false;

function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    llamadas.push({ clave, url, cuerpo: crudo, credencial: req.headers.authorization });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let respuesta = unoSolo ? null : [];
    if (clave === 'GET /rest/v1/conversaciones_intermediacion' && hiloExiste) respuesta = conversacion;
    if (clave === 'POST /rest/v1/conversaciones_intermediacion') respuesta = conversacion;
    if (clave === 'POST /rest/v1/mensajes_intermediacion') {
      respuesta = { id: 'm1', lado: 'cliente', cuerpo: 'hola', automatico: false, created_at: '2026-01-01T00:00:00Z', leido_at: null, regla_tapada: null };
    }
    if (clave === 'GET /rest/v1/mensajes_intermediacion') {
      respuesta = [{ id: 'm1', lado: 'asistente', cuerpo: '[tapado]', automatico: false, created_at: '2026-01-01T00:00:00Z', leido_at: null, regla_tapada: 'telefono' }];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respuesta));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const { createClient } = await import('@supabase/supabase-js');
const { conversacionDeLaPareja, mensajesDeLaConversacion, marcarLeido, escribirMensaje, LADO } = await import(
  '../conversacionIntermediacion.js'
);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  accessToken: async () => DE_LA_PERSONA.replace('Bearer ', ''),
});

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  hiloExiste = false;
});

function conElTrabajoDeLaPrestadora(llamada) {
  const credencial = leerCredencial(llamada.credencial ?? '');
  assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
  assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
}

const pareja = { prestadoraId: PRESTADORA, clienteId: CLIENTE, asistenteId: ASISTENTE };

describe('el hilo del Match', () => {
  it('el hilo que ya existe se busca con la credencial de quien pide y no se escribe nada', async () => {
    hiloExiste = true;
    const hilo = await conversacionDeLaPareja({ ...pareja, crear: true, db });
    assert.equal(hilo.id, HILO);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].credencial, DE_LA_PERSONA);
  });

  it('el hilo nuevo lo abre el trabajo de la Prestadora de la pareja', async () => {
    const hilo = await conversacionDeLaPareja({ ...pareja, crear: true, db });
    assert.equal(hilo.id, HILO);
    const abiertas = llamadas.filter((l) => l.clave === 'POST /rest/v1/conversaciones_intermediacion');
    assert.equal(abiertas.length, 1);
    conElTrabajoDeLaPrestadora(abiertas[0]);
  });

  it('los mensajes y sus motivos se leen con la credencial de quien pide', async () => {
    const mensajes = await mensajesDeLaConversacion({ conversacion, db });
    assert.equal(mensajes.length, 1);
    const lecturas = llamadas.filter((l) => l.url.pathname === '/rest/v1/mensajes_intermediacion' || l.url.pathname === '/rest/v1/reglas_de_los_mensajes');
    assert.equal(lecturas.length, 2);
    for (const l of lecturas) assert.equal(l.credencial, DE_LA_PERSONA);
  });

  it('dar por leído lo escribe el trabajo de la Prestadora', async () => {
    await marcarLeido({ conversacion, lado: LADO.CLIENTE });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].clave, 'PATCH /rest/v1/mensajes_intermediacion');
    conElTrabajoDeLaPrestadora(llamadas[0]);
    assert.equal(llamadas[0].url.searchParams.get('lado'), 'eq.asistente');
  });

  it('un mensaje lo guarda el trabajo de la Prestadora, con el lado y el autor que dio el backend', async () => {
    await escribirMensaje({ conversacion, lado: LADO.CLIENTE, autorUsuarioId: USUARIO, cuerpo: 'hola' });
    const guardado = llamadas.find((l) => l.clave === 'POST /rest/v1/mensajes_intermediacion');
    conElTrabajoDeLaPrestadora(guardado);
    const fila = JSON.parse(guardado.cuerpo);
    assert.equal(fila.lado, 'cliente');
    assert.equal(fila.autor_usuario_id, USUARIO);
    const hilo = llamadas.find((l) => l.clave === 'PATCH /rest/v1/conversaciones_intermediacion');
    conElTrabajoDeLaPrestadora(hilo);
  });

  it('sin la conexión de quien pide no consulta nada', async () => {
    await assert.rejects(() => conversacionDeLaPareja({ ...pareja }));
    await assert.rejects(() => mensajesDeLaConversacion({ conversacion }));
    assert.equal(llamadas.length, 0);
  });
});
