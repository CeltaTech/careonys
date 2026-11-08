/**
 * Que un aviso al Coordinador se anote antes de salir, y que un rechazo no lo haga salir de nuevo.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El aviso se anotaba después de mandarlo. Cuando el despachante de
 * correo lo rechazaba —con el cupo diario agotado, por ejemplo— no quedaba anotado, y la vuelta
 * siguiente lo volvía a mandar: cada cinco minutos, sin fin, gastando más cupo. Lo que tiene que
 * sostenerse:
 *
 *   1. EL AVISO SE ANOTA ANTES Y SÓLO LO ANOTA UNA VUELTA. Si la fila ya cambió, otra vuelta llegó
 *      primero, y ésta no manda nada.
 *   2. EL ESCALÓN DEJA CONSTANCIA ANTES DE ESCRIBIR. Con la constancia ya puesta por otra vuelta, o
 *      sin poder ponerla, no sale ningún correo.
 *   3. UN CORREO RECHAZADO NO VUELVE A SALIR en la vuelta siguiente.
 *
 * Con el sistema roto —anotar después de mandar— la primera y la tercera dan al revés. Datos
 * inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const GUARDIA = '11111111-1111-4111-8111-111111111111';
const COORDINADORA = '22222222-2222-4222-8222-222222222222';
const ANTERIOR = '2026-11-08T10:00:00.000Z';

/** Qué contesta la base a cada `MÉTODO /ruta`. Sin preparar, vacío. */
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
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : (preparada ?? []);
    // `{ estado, cuerpo }` es una respuesta con error; cualquier otra cosa, filas.
    const estado = valor?.estado ?? 200;
    const cuerpo = valor?.estado ? valor.cuerpo : valor;

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(cuerpo) ? cuerpo[0] ?? null : cuerpo));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El despachante de correo, de mentira: rechaza todo, como con el cupo diario agotado.
process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
let correosIntentados = 0;
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = (url, opciones) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    correosIntentados += 1;
    return Promise.resolve(new Response(JSON.stringify({ name: 'daily_quota_exceeded' }), { status: 429 }));
  }
  return fetchDeVerdad(url, opciones);
};

// Después de las variables de entorno: la conexión se arma al importar.
const { adentro, PRESTADORA_DE_PRUEBA } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const anotarElAviso = adentro((await import('../revisarNotificacionesCoordinador.js')).anotarElAviso);
const avisos = await import('../avisosDeEscalon.js');
const escalarSiCorresponde = adentro(avisos.escalarSiCorresponde);
const escalonesYaAvisados = adentro(avisos.escalonesYaAvisados);
const { ESCALONES } = await import('../ordenDeLaEscalada.js');

const errorDeVerdad = console.error;
const avisosDelServidor = [];
console.error = (...partes) => avisosDelServidor.push(partes.join(' '));

after(() => {
  console.error = errorDeVerdad;
  globalThis.fetch = fetchDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  correosIntentados = 0;
  avisosDelServidor.length = 0;
});

const pedidos = (clave) => llamadas.filter((l) => l.clave === clave);

describe('anotarElAviso', () => {
  const aviso = {
    tabla: 'guardias',
    prestadoraId: PRESTADORA_DE_PRUEBA,
    id: GUARDIA,
    columna: 'aviso_sin_cerrar_at',
    cambios: { aviso_sin_cerrar_at: '2026-11-08T10:05:00.000Z', aviso_sin_cerrar_veces: 2 },
  };

  it('anota sólo si la fila sigue como la vio esta vuelta, y en la Prestadora de la vuelta', async () => {
    respuestas.set('PATCH /rest/v1/guardias', [{ id: GUARDIA }]);
    assert.equal(await anotarElAviso({ ...aviso, anterior: ANTERIOR }), true);

    const [pedido] = pedidos('PATCH /rest/v1/guardias');
    assert.equal(pedido.filtros.get('prestadora_id'), `eq.${PRESTADORA_DE_PRUEBA}`);
    assert.equal(pedido.filtros.get('id'), `eq.${GUARDIA}`);
    assert.equal(pedido.filtros.get('aviso_sin_cerrar_at'), `eq.${ANTERIOR}`);
    assert.deepEqual(pedido.cuerpo, aviso.cambios);
  });

  it('el primer aviso pide que no haya ninguno anotado', async () => {
    respuestas.set('PATCH /rest/v1/guardias', [{ id: GUARDIA }]);
    await anotarElAviso({ ...aviso, anterior: null });
    assert.equal(pedidos('PATCH /rest/v1/guardias')[0].filtros.get('aviso_sin_cerrar_at'), 'is.null');
  });

  it('si otra vuelta ya la anotó, contesta que no: el aviso no sale', async () => {
    respuestas.set('PATCH /rest/v1/guardias', []);
    assert.equal(await anotarElAviso({ ...aviso, anterior: ANTERIOR }), false);
  });

  it('si la base no deja anotar, falla: el aviso tampoco sale', async () => {
    respuestas.set('PATCH /rest/v1/guardias', { estado: 403, cuerpo: { code: '42501', message: 'permission denied' } });
    await assert.rejects(anotarElAviso({ ...aviso, anterior: ANTERIOR }));
  });
});

describe('escalarSiCorresponde', () => {
  // La administración a los diez minutos, y la alarma lleva treinta: el escalón corresponde.
  const config = { minutos_antes_todos_los_coordinadores: null, minutos_antes_administracion: 10 };

  function prepararDestinataria() {
    respuestas.set('GET /rest/v1/usuarios', [{ id: COORDINADORA, email: 'administracion@ejemplo.test' }]);
  }

  async function unaVuelta() {
    const yaSalieron = await escalonesYaAvisados({ prestadoraId: PRESTADORA_DE_PRUEBA, tipo: 'guardia_sin_cerrar' });
    return escalarSiCorresponde({
      prestadoraId: PRESTADORA_DE_PRUEBA,
      tipo: 'guardia_sin_cerrar',
      referenciaId: GUARDIA,
      minutosPremura: 30,
      config,
      idioma: 'es-AR',
      texto: 'Cuerpo de prueba',
      yaSalieron,
    });
  }

  it('deja la constancia antes de escribir, y un rechazo no lo hace salir en la vuelta siguiente', async () => {
    prepararDestinataria();
    const constancias = [];
    respuestas.set('POST /rest/v1/escalones_de_alarma_avisados', () => {
      // En el momento de la constancia todavía no se intentó ningún correo.
      assert.equal(correosIntentados, 0);
      constancias.push({ referencia_id: GUARDIA, escalon: ESCALONES.ADMINISTRACION });
      return [];
    });
    respuestas.set('GET /rest/v1/escalones_de_alarma_avisados', () => constancias);

    assert.deepEqual(await unaVuelta(), [ESCALONES.ADMINISTRACION]);
    assert.equal(correosIntentados, 1);
    assert.equal(pedidos('POST /rest/v1/escalones_de_alarma_avisados')[0].cuerpo.destinatarios, 1);

    // La vuelta siguiente lee la constancia y no vuelve a escribir.
    assert.deepEqual(await unaVuelta(), []);
    assert.equal(correosIntentados, 1);
  });

  it('si otra vuelta ya dejó la constancia, no sale ningún correo', async () => {
    prepararDestinataria();
    respuestas.set('POST /rest/v1/escalones_de_alarma_avisados', {
      estado: 409,
      cuerpo: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    assert.deepEqual(await unaVuelta(), []);
    assert.equal(pedidos('POST /rest/v1/escalones_de_alarma_avisados').length, 1);
    assert.equal(correosIntentados, 0);
  });

  it('sin poder dejar la constancia, no sale ningún correo', async () => {
    prepararDestinataria();
    respuestas.set('POST /rest/v1/escalones_de_alarma_avisados', {
      estado: 500,
      cuerpo: { code: 'XX000', message: 'falla de prueba' },
    });
    assert.deepEqual(await unaVuelta(), []);
    assert.equal(pedidos('POST /rest/v1/escalones_de_alarma_avisados').length, 1);
    assert.equal(correosIntentados, 0);
  });
});
