/**
 * El saldo de contactos de un paquete del Match.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Las cuentas —restarle uno al saldo, anotar a quién se abrió—
 * viven en la base y están probadas contra la base de verdad, incluidas dos sesiones descontando el
 * mismo saldo al mismo tiempo. Lo de acá es lo otro: que este archivo llame bien, que no invente un
 * saldo cuando la base no contestó nada, y que ante cualquier cosa rara falle cerrado. Abrir un
 * contacto es plata, así que contestar que sí ante una respuesta que no se entendió es regalarlo.
 *
 * Y con qué credencial: la apertura va con el trabajo de la Prestadora del acceso. Con el sistema
 * roto —otra Prestadora— las pruebas dan al revés. Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const ACCESO = '33333333-3333-3333-3333-333333333333';
const ASISTENTE = '88888888-8888-8888-8888-888888888888';

const respuestas = new Map();
let llamadas = [];

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
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, cuerpo: crudo ? JSON.parse(crudo) : null, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    if (preparada === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(typeof preparada === 'function' ? preparada() : preparada));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// Después de las variables de entorno: la conexión a la base se arma al importar.
const { abrirElContacto: abrir, elAccesoAbreContactos, MOTIVO_CONTACTO } = await import(
  '../contactosIntermediacion.js'
);

const abrirElContacto = (argumentos) => abrir({ prestadoraId: PRESTADORA, ...argumentos });

after(() => baseFalsa.close());

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
});

describe('abrir el contacto de un Asistente', () => {
  it('descuenta uno y dice cuánto quedó', async () => {
    respuestas.set('POST /rest/v1/rpc/consumir_contacto_intermediacion', () => ({
      ok: true,
      ya_estaba: false,
      saldo_contactos: 4,
    }));
    const resultado = await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE });

    assert.deepEqual(resultado, { ok: true, ya_estaba: false, saldo_contactos: 4 });
    assert.deepEqual(llamadas[0].cuerpo, { p_acceso_id: ACCESO, p_asistente_id: ASISTENTE });
    const credencial = leerCredencial(llamadas[0].credencial ?? '');
    assert.equal(credencial?.role, 'trabajo_sin_persona', 'fue con otra credencial');
    assert.equal(credencial.prestadora_id, PRESTADORA, 'fue fuera de la Prestadora');
  });

  it('el que ya estaba abierto se abre otra vez sin descontar', async () => {
    // El contacto de cada persona se paga una sola vez: volver a mirarlo no puede costar otro.
    // `ya_estaba` es lo que después permite avisar que se gastó un contacto sólo cuando se gastó.
    respuestas.set('POST /rest/v1/rpc/consumir_contacto_intermediacion', () => ({
      ok: true,
      ya_estaba: true,
      saldo_contactos: 4,
    }));
    const resultado = await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE });
    assert.deepEqual(resultado, { ok: true, ya_estaba: true, saldo_contactos: 4 });
  });

  it('sin saldo no se abre, y el motivo dice cuál de los dos casos es', async () => {
    // «Se acabó» y «este acceso no se sostiene por saldo» se arreglan de maneras distintas: uno
    // comprando otro paquete y el otro no.
    respuestas.set('POST /rest/v1/rpc/consumir_contacto_intermediacion', () => ({
      ok: false,
      motivo: 'saldo_agotado',
      saldo_contactos: 0,
    }));
    assert.deepEqual(await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE }), {
      ok: false,
      motivo: MOTIVO_CONTACTO.SALDO_AGOTADO,
      saldo_contactos: 0,
    });

    respuestas.set('POST /rest/v1/rpc/consumir_contacto_intermediacion', () => ({
      ok: false,
      motivo: 'acceso_sin_saldo',
    }));
    const otro = await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE });
    assert.equal(otro.motivo, MOTIVO_CONTACTO.ACCESO_SIN_SALDO);
  });

  it('ante una respuesta que no se entiende, no se abre nada', async () => {
    // Falla cerrado. Contestar que sí acá sería entregar el dato de contacto sin haberlo
    // descontado, y sin que quede anotado a quién se abrió.
    for (const respuesta of [null, '', 'listo', 0]) {
      respuestas.set('POST /rest/v1/rpc/consumir_contacto_intermediacion', () => respuesta);
      const resultado = await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE });
      assert.equal(resultado.ok, false, `respuesta: ${JSON.stringify(respuesta)}`);
      assert.equal(resultado.motivo, MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR);
    }
  });

  it('sin Prestadora no consulta nada y no abre', async () => {
    const resultado = await abrir({ accesoId: ACCESO, asistenteId: ASISTENTE });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR);
    assert.equal(llamadas.length, 0);
  });

  it('si la base falla, tampoco', async () => {
    const resultado = await abrirElContacto({ accesoId: ACCESO, asistenteId: ASISTENTE });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, MOTIVO_CONTACTO.NO_SE_PUDO_GUARDAR);
  });
});

describe('qué acceso abre contactos hoy', () => {
  const HOY = '2026-11-17';

  it('el vigente abre', () => {
    assert.equal(elAccesoAbreContactos({ estado: 'vigente' }, HOY), true);
  });

  it('en período de gracia abre hasta el día anterior al de la suspensión', () => {
    assert.equal(elAccesoAbreContactos({ estado: 'en_gracia', suspension_desde: '2026-11-18' }, HOY), true);
    assert.equal(elAccesoAbreContactos({ estado: 'en_gracia', suspension_desde: HOY }, HOY), false);
  });

  it('en período de gracia sin día de suspensión no abre', () => {
    assert.equal(elAccesoAbreContactos({ estado: 'en_gracia', suspension_desde: null }, HOY), false);
  });

  it('dado de baja abre hasta el último día pagado inclusive', () => {
    assert.equal(elAccesoAbreContactos({ estado: 'cancelada', vigente_hasta: HOY }, HOY), true);
    assert.equal(elAccesoAbreContactos({ estado: 'cancelada', vigente_hasta: '2026-11-16' }, HOY), false);
    assert.equal(elAccesoAbreContactos({ estado: 'cancelada', vigente_hasta: null }, HOY), false);
  });

  it('el suspendido, el vencido y un estado desconocido no abren', () => {
    for (const estado of ['suspendida', 'vencida', 'otro', undefined]) {
      assert.equal(elAccesoAbreContactos({ estado, vigente_hasta: '2099-01-01', suspension_desde: '2099-01-01' }, HOY), false);
    }
    assert.equal(elAccesoAbreContactos(null, HOY), false);
  });
});
