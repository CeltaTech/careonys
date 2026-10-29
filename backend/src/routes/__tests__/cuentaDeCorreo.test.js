/**
 * Cada correo que sale queda anotado, para poder contarlo contra el límite del despachante.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El correo de todas las Prestadoras sale por un mismo servicio de
 * afuera que acepta hasta cierta cantidad por día y por mes; pasado ese límite deja de aceptar y
 * los mensajes no salen. Sin una cuenta propia, el límite se descubre el día que uno no sale.
 * Acá hay tres cosas que se rompen sin hacer ruido:
 *
 *   1. QUE UN ENVÍO NO SE CUENTE. Si el backend manda por un camino que no pasa por donde se anota,
 *      la cuenta queda corta y muestra margen que no existe. Por eso se comprueba sobre
 *      las dos salidas de correo que tiene el backend, no sobre una.
 *   2. QUE UN RECHAZO SE CUENTE COMO ENVÍO. Un correo rechazado es justamente la señal de que se
 *      llegó al límite: si se anota como aceptado, la señal desaparece.
 *   3. QUE LA ANOTACIÓN SE LLEVE PUESTO EL CORREO. Un mensaje que salió y no se pudo contar sigue
 *      siendo un mensaje que salió. Y al revés: lo que se anota es el hecho, nunca a quién iba,
 *      el asunto ni una línea del contenido (`celtatech/CLAUDE.md` §6).
 *
 * Se levanta el backend de verdad contra una base de mentira, y el despachante se reemplaza por uno
 * que contesta lo que la prueba le diga. Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera. */
let llamadas = [];
/** Si la base deja anotar. En falso, el insert contesta un error. */
let laBaseDejaAnotar = true;
/** Si el despachante toma el correo. */
let elDespachanteAcepta = true;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo, credencial: req.headers.authorization });

    if (req.method === 'POST' && ruta === '/rest/v1/envios_de_correo') {
      if (!laBaseDejaAnotar) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'la base no deja anotar' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
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
prepararCredencialDePrueba();
process.env.RESEND_API_KEY = 'clave-de-mentira';
process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
delete process.env.SMTP_USER;

// El despachante de verdad no se toca: se corta el pedido antes de salir, así que la prueba no
// sale a la red. Lo que va a la base falsa pasa de largo.
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async (direccion, opciones) => {
  if (String(direccion).startsWith('https://api.resend.com/')) {
    if (!elDespachanteAcepta) return new Response('', { status: 429 });
    return new Response(JSON.stringify({ id: 'envio-de-mentira' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return fetchDeVerdad(direccion, opciones);
};

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { enviarEmail, enviarEmailCoordinador } = await import('../../utils/email.js');

after(() => {
  baseFalsa.close();
  globalThis.fetch = fetchDeVerdad;
  delete process.env.RESEND_API_KEY;
  delete process.env.REMITENTE_AVISOS;
});

function anotaciones() {
  return llamadas.filter((l) => l.clave === 'POST /rest/v1/envios_de_correo');
}

beforeEach(() => {
  llamadas = [];
  laBaseDejaAnotar = true;
  elDespachanteAcepta = true;
  respuestas.clear();
  respuestas.set('GET /rest/v1/prestadoras', () => [
    { casilla_envio: null, nombre_fantasia: null, logo_url: null },
  ]);
  respuestas.set('GET /rest/v1/configuracion_prestadora', () => [{ email: 'contacto@ejemplo.test' }]);
  respuestas.set('GET /rest/v1/configuracion_notificaciones', () => [
    { emails: ['coordinacion@ejemplo.test'], activo: true, whatsapp_activo: false },
  ]);
});

describe('cada correo que sale queda contado', () => {
  it('el que el despachante toma se anota como aceptado', async () => {
    await enviarEmail({
      to: 'alguien@ejemplo.test',
      asunto: 'Un asunto inventado',
      texto: 'Un texto inventado',
      prestadoraId: PRESTADORA,
    });

    const anotado = anotaciones();
    assert.equal(anotado.length, 1, 'el correo salió y no quedó contado: el Panel muestra margen que no existe');
    assert.equal(anotado[0].cuerpo.aceptado, true);
    assert.equal(anotado[0].cuerpo.prestadora_id, PRESTADORA);
  });

  it('el aviso al Coordinador también se cuenta, que es la otra salida de correo', async () => {
    await enviarEmailCoordinador({
      evento: 'un_evento_inventado',
      prestadoraId: PRESTADORA,
      asunto: 'Un asunto inventado',
      texto: 'Un texto inventado',
    });

    assert.equal(anotaciones().length, 1, 'esta salida de correo esquiva la cuenta');
  });

  it('el que el despachante rechaza se anota como rechazado, y el error sale igual', async () => {
    // Un rechazo es justamente la señal de que se llegó al límite. Anotarlo como aceptado, o no
    // anotarlo, borra la señal.
    elDespachanteAcepta = false;

    await assert.rejects(() =>
      enviarEmail({
        to: 'alguien@ejemplo.test',
        asunto: 'Un asunto inventado',
        texto: 'Un texto inventado',
        prestadoraId: PRESTADORA,
      }));

    const anotado = anotaciones();
    assert.equal(anotado.length, 1);
    assert.equal(anotado[0].cuerpo.aceptado, false);
  });

  it('no se anota a quién iba, ni el asunto, ni una línea de lo que decía', async () => {
    await enviarEmail({
      to: 'alguien@ejemplo.test',
      asunto: 'Un asunto inventado',
      texto: 'Un texto inventado',
      prestadoraId: PRESTADORA,
    });

    const escrito = JSON.stringify(anotaciones()[0].cuerpo);
    assert.doesNotMatch(escrito, /alguien@ejemplo\.test|Un asunto inventado|Un texto inventado/);
    assert.deepEqual(Object.keys(anotaciones()[0].cuerpo).sort(), ['aceptado', 'prestadora_id']);
  });

  it('si la anotación falla, el correo sale igual', async () => {
    // Hacer fallar el mensaje porque falló su registro sería cambiar un número por una
    // notificación que no llega.
    laBaseDejaAnotar = false;

    await enviarEmail({
      to: 'alguien@ejemplo.test',
      asunto: 'Un asunto inventado',
      texto: 'Un texto inventado',
      prestadoraId: PRESTADORA,
    });
  });
});
