/**
 * Habilitar un cambio de clave y confirmar un teléfono: con qué credencial se le pide cada cosa a
 * la base.
 *
 *   node --test src/utils/__tests__/habilitarConElTrabajo.test.js
 *
 * Todo va con el trabajo de la Prestadora de la cuenta, que alcanza sus cuentas y ninguna otra. La
 * base es de mentira y contesta por HTTP como la de verdad: muestra la cuenta, la puerta abierta y
 * el teléfono confirmado sólo al trabajo de esa Prestadora. Con el sistema roto —otra credencial u
 * otra Prestadora— las pruebas dan al revés.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const LA_ADMINISTRACION = '22222222-2222-4222-8222-222222222222';
const LA_CUENTA = '33333333-3333-4333-8333-333333333333';
const LA_PUERTA = '44444444-4444-4444-8444-444444444444';

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
    const url = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${url.pathname}`;
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ clave, credencial });
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const delTrabajo = credencial?.role === 'trabajo_sin_persona' && credencial.prestadora_id === PRESTADORA;
    let filas = [];
    if (delTrabajo) {
      if (clave === 'GET /rest/v1/usuarios') {
        filas = [{ id: LA_CUENTA, rol: 'asistente', nombre: 'Nombre inventado', email: 'inventado@ejemplo.test', telefono: '+5400000001', telefono_verificado_en: null, prestadora_id: PRESTADORA }];
      }
      if (clave === 'GET /rest/v1/cambios_de_clave_habilitados') filas = [{ id: LA_PUERTA, expira_en: new Date(Date.now() + 600000).toISOString() }];
      if (clave === 'PATCH /rest/v1/cambios_de_clave_habilitados' && url.searchParams.get('id')) filas = [{ id: LA_PUERTA }];
      if (clave === 'GET /rest/v1/telefonos_confirmados_por_la_prestadora') filas = [{ id: 'confirmado' }];
    } else if (req.method !== 'GET') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '42501', message: 'permission denied' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo ? (filas[0] ?? null) : filas));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

const {
  habilitarCambioDeClave,
  confirmarTelefonoDeLaCuenta,
  telefonoConfirmadoPorLaPrestadora,
  cambioDeClaveHabilitado,
  usarCambioDeClaveHabilitado,
} = await import('../habilitarCambioDeClave.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
});

const QUIEN = { id: LA_ADMINISTRACION, prestadoraId: PRESTADORA, rol: 'admin_prestadora' };

function conElTrabajoDeLaPrestadora(clave) {
  const encontradas = llamadas.filter((l) => l.clave === clave);
  assert.ok(encontradas.length > 0, `no se pidió ${clave}`);
  for (const llamada of encontradas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${clave} fue con otra credencial`);
    assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${clave} fue fuera de la Prestadora`);
  }
}

describe('habilitar desde el Panel', () => {
  it('la cuenta se lee y la puerta se abre con el trabajo de la Prestadora', async () => {
    const cuenta = await habilitarCambioDeClave({ quien: QUIEN, usuarioId: LA_CUENTA });
    assert.equal(cuenta.id, LA_CUENTA);
    conElTrabajoDeLaPrestadora('GET /rest/v1/usuarios');
    conElTrabajoDeLaPrestadora('PATCH /rest/v1/cambios_de_clave_habilitados');
    conElTrabajoDeLaPrestadora('POST /rest/v1/cambios_de_clave_habilitados');
  });

  it('el teléfono se confirma con el trabajo de la Prestadora', async () => {
    const cuenta = await confirmarTelefonoDeLaCuenta({ quien: QUIEN, usuarioId: LA_CUENTA });
    assert.equal(cuenta.id, LA_CUENTA);
    conElTrabajoDeLaPrestadora('GET /rest/v1/usuarios');
    conElTrabajoDeLaPrestadora('POST /rest/v1/telefonos_confirmados_por_la_prestadora');
  });
});

describe('usar lo habilitado al recuperar la clave', () => {
  it('el teléfono confirmado se lee con el trabajo de la Prestadora', async () => {
    assert.equal(await telefonoConfirmadoPorLaPrestadora({ usuarioId: LA_CUENTA, prestadoraId: PRESTADORA, telefono: '+5400000001' }), true);
    conElTrabajoDeLaPrestadora('GET /rest/v1/telefonos_confirmados_por_la_prestadora');
  });

  it('la puerta abierta se lee y se gasta con el trabajo de la Prestadora', async () => {
    const puerta = await cambioDeClaveHabilitado(LA_CUENTA, PRESTADORA);
    assert.equal(puerta?.id, LA_PUERTA);
    assert.equal(await usarCambioDeClaveHabilitado(LA_PUERTA, PRESTADORA), true);
    conElTrabajoDeLaPrestadora('GET /rest/v1/cambios_de_clave_habilitados');
    conElTrabajoDeLaPrestadora('PATCH /rest/v1/cambios_de_clave_habilitados');
  });
});
