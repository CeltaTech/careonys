/**
 * Los signos vitales habilitados y el consentimiento de ubicación se preguntan con el trabajo de
 * la Prestadora, nunca con la llave maestra.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Que la base le deje ver al trabajo sólo lo de su Prestadora lo
 * deciden sus políticas, y eso no se prueba sin base. Lo que se prueba es que el backend pregunte
 * con la credencial del trabajo y de la Prestadora correcta, y que cuando no puede saber algo
 * conteste que no:
 *
 *   1. QUE LA PREGUNTA SALGA CON LA LLAVE MAESTRA. Es lo que se viene a corregir.
 *   2. QUE SALGA CON LA CREDENCIAL DE OTRA PRESTADORA. El consentimiento dado en una no habilita
 *      a ubicar en otra.
 *   3. QUE SIN PRESTADORA SE UBIQUE IGUAL. Es un control de privacidad: falla cerrado.
 *   4. QUE UNA FALLA MUESTRE LOS SIGNOS VITALES. Sin autorización comprobada no hay sección.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASISTENTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PACIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

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
    const clave = `${req.method} ${new URL(req.url, 'http://interno').pathname}`;
    llamadas.push({ clave, url: req.url, credencial: leerCredencial(req.headers.authorization ?? '') });

    const valor = respuestas.get(clave);
    if (valor === undefined || valor?.__estado) {
      res.writeHead(valor?.__estado ?? 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `sin respuesta para ${clave}` }));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { puedeRegistrarUbicacion } = await import('../consentimientoUbicacion.js');
const { vitalesDelAsistente, filtrarSignos, rangosParaLosReportes } = await import('../vitalesReferencia.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.clave);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.clave);
  }
}

describe('el consentimiento de ubicación', () => {
  it('lo pregunta el trabajo de la Prestadora de la guardia, y no la llave maestra', async () => {
    respuestas.set('POST /rest/v1/rpc/consentimiento_seguimiento_vigente', true);
    assert.equal(await puedeRegistrarUbicacion(ASISTENTE, PRESTADORA), true);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('sin Prestadora contesta que no, y ni siquiera le pregunta a la base', async () => {
    respuestas.set('POST /rest/v1/rpc/consentimiento_seguimiento_vigente', true);
    assert.equal(await puedeRegistrarUbicacion(ASISTENTE, undefined), false);
    assert.equal(llamadas.length, 0);
  });

  it('si la base falla contesta que no', async () => {
    respuestas.set('POST /rest/v1/rpc/consentimiento_seguimiento_vigente', { __estado: 500 });
    assert.equal(await puedeRegistrarUbicacion(ASISTENTE, PRESTADORA), false);
  });
});

const ENFERMERA = { habilitada: [{ clave: 'monitoreo_y_registro_biometrico' }] };
const CUIDADORA = { habilitada: [{ clave: 'higiene_y_confort' }] };
const SIN_PUNCION = ['presion_sistolica', 'presion_diastolica', 'temperatura', 'saturacion'];
const SIN_SIGNOS = { habilitados: false, signos: [], rangos: {} };

describe('los signos vitales del Asistente', () => {
  it('con la autorización aceptada los lee el trabajo de la Prestadora, sin los de punción', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', [{ id: 'x' }]);
    respuestas.set('GET /rest/v1/rangos_referencia_vitales', [
      { signo: 'pulso', valor_min: 60, valor_max: 100, unidad: 'lpm', paciente_id: null },
      { signo: 'pulso', valor_min: 55, valor_max: 90, unidad: 'lpm', paciente_id: PACIENTE },
    ]);
    const vitales = await vitalesDelAsistente(PACIENTE, PRESTADORA, CUIDADORA);
    assert.deepEqual(vitales, {
      habilitados: true,
      signos: SIN_PUNCION,
      rangos: { pulso: { min: 55, max: 90, unidad: 'lpm' } },
    });
    todasConElTrabajoDe(PRESTADORA);
    assert.ok(llamadas.some((l) => l.clave.includes('autorizaciones_monitoreo_paciente') && l.url.includes('estado=eq.aceptada')), 'pide sólo la aceptada');
  });

  it('sin autorización aceptada no hay sección', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', []);
    assert.deepEqual(await vitalesDelAsistente(PACIENTE, PRESTADORA, CUIDADORA), SIN_SIGNOS);
  });

  it('el tipo con monitoreo biométrico los toma todos sin autorización, también la glucemia', async () => {
    respuestas.set('GET /rest/v1/autorizaciones_monitoreo_paciente', []);
    respuestas.set('GET /rest/v1/rangos_referencia_vitales', []);
    const vitales = await vitalesDelAsistente(PACIENTE, PRESTADORA, ENFERMERA);
    assert.equal(vitales.habilitados, true);
    assert.ok(vitales.signos.includes('glucemia'));
    assert.ok(!llamadas.some((l) => l.clave.includes('autorizaciones_monitoreo_paciente')), 'no pregunta por la autorización');
  });

  it('sin Prestadora no hay sección, y ni siquiera le pregunta a la base', async () => {
    assert.deepEqual(await vitalesDelAsistente(PACIENTE, undefined, ENFERMERA), SIN_SIGNOS);
    assert.equal(llamadas.length, 0);
  });

  it('al guardar quedan sólo los signos que puede tomar', () => {
    assert.deepEqual(filtrarSignos({ temperatura: 36.5, glucemia: 110, saturacion: '' }, SIN_PUNCION), { temperatura: 36.5 });
    assert.equal(filtrarSignos({ glucemia: 110 }, SIN_PUNCION), null);
    assert.equal(filtrarSignos({ temperatura: 36.5 }, []), null);
  });
});

describe('los rangos que ve el Cliente', () => {
  it('sin signos en los reportes no van, y ni siquiera le pregunta a la base', async () => {
    assert.deepEqual(await rangosParaLosReportes(PACIENTE, PRESTADORA, [{ signos_vitales: null }]), { rangos: null });
    assert.equal(llamadas.length, 0);
  });

  it('con signos los lee el trabajo de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/rangos_referencia_vitales', [
      { signo: 'glucemia', valor_min: 70, valor_max: 140, unidad: 'mg/dL', paciente_id: null },
    ]);
    const { rangos } = await rangosParaLosReportes(PACIENTE, PRESTADORA, [{ signos_vitales: { glucemia: 110 } }]);
    assert.deepEqual(rangos, { glucemia: { min: 70, max: 140, unidad: 'mg/dL' } });
    todasConElTrabajoDe(PRESTADORA);
  });
});
