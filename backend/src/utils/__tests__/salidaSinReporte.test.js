/**
 * La salida del Asistente que deja la guardia al relevo, con o sin Reporte Diario.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El relevo lee el código QR del que sale y toma la guardia aunque el
 * que sale no haya presentado el Reporte Diario. Esa lectura es la salida del que sale: la hora de
 * la lectura es su hora de salida. Con el reporte presentado, su turno de guardia queda completado;
 * sin el reporte, queda en «Salida sin Reporte Diario» con la falta anotada. Cuando el reporte
 * llega, el turno pasa a completado y anota la fecha en que llegó. Con el sistema roto —la hora
 * tomada del reloj, el estado equivocado o el cierre hecho con otra forma de comprobar la llegada—
 * alguna de estas pruebas falla.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-2222-3333-4444-555555555555';
const RELEVO = 'aaaaaaaa-0000-0000-0000-000000000001';
const SALIENTE = 'aaaaaaaa-0000-0000-0000-000000000002';
const ASISTENTE_RELEVO = 'bbbbbbbb-0000-0000-0000-000000000001';
const ASISTENTE_SALIENTE = 'bbbbbbbb-0000-0000-0000-000000000002';
const PACIENTE = 'cccccccc-0000-0000-0000-000000000001';
const HORA_DE_LA_LECTURA = '2026-11-20T09:00:12.000Z';

const COMPROBACIONES = 'GET /rest/v1/turno_guardia_comprobaciones';
const GUARDAR_COMPROBACION = 'POST /rest/v1/turno_guardia_comprobaciones';
const PACIENTES_DEL_TURNO = 'GET /rest/v1/turno_guardia_pacientes';
const REPORTES = 'GET /rest/v1/reportes';
const CONSENTIMIENTO = 'POST /rest/v1/rpc/consentimiento_seguimiento_vigente';
const CAMBIAR_TURNO = 'PATCH /rest/v1/turnos_guardia';
const PRESTADORA_LEIDA = 'GET /rest/v1/prestadoras';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => { cuerpo += parte; });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const llamada = { clave, filtros: direccion.searchParams, cuerpo: cuerpo ? JSON.parse(cuerpo) : null };
    llamadas.push(llamada);
    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(llamada) : preparada;
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

const { cerrarLaSalidaDelSaliente, completarSiLlegoElReporte, ESTADO_SALIDA_SIN_REPORTE } =
  await import('../salidaSinReporte.js');

// El aviso al que sale no tiene respuesta preparada: falla y se anota, y la salida queda igual.
const avisarDeVerdad = console.error;
console.error = () => {};

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

const relevo = { id: RELEVO, prestadora_id: PRESTADORA, asistente_id: ASISTENTE_RELEVO, paciente_id: PACIENTE };

function llegadaDelRelevo(cambios = {}) {
  return {
    turno_guardia_id: RELEVO,
    momento: 'checkin',
    estado: 'comprobada',
    medio: 'codigo_asistente_saliente',
    sujeto_tipo: 'asistente',
    sujeto_id: ASISTENTE_SALIENTE,
    comprobada_en: HORA_DE_LA_LECTURA,
    ...cambios,
  };
}

function prepararBase({ llegada = llegadaDelRelevo(), conReporte = false, factura = true } = {}) {
  respuestas.set(PRESTADORA_LEIDA, [{ factura_turnos_sin_reporte: factura }]);
  respuestas.set(COMPROBACIONES, (llamada) =>
    llamada.filtros.get('momento') === 'eq.checkin' && llamada.filtros.get('turno_guardia_id') === `eq.${RELEVO}`
      ? [llegada]
      : []);
  respuestas.set(GUARDAR_COMPROBACION, (llamada) => [llamada.cuerpo]);
  respuestas.set(PACIENTES_DEL_TURNO, (llamada) =>
    llamada.filtros.get('select').includes('turnos_guardia!inner')
      ? [
        { turno_guardia_id: RELEVO, turnos_guardia: { id: RELEVO, asistente_id: ASISTENTE_RELEVO, estado: 'activa', checkout_at: null } },
        { turno_guardia_id: SALIENTE, turnos_guardia: { id: SALIENTE, asistente_id: ASISTENTE_SALIENTE, estado: 'activa', checkout_at: null } },
      ]
      : [{ paciente_id: PACIENTE }]);
  respuestas.set(REPORTES, conReporte ? [{ paciente_id: PACIENTE }] : []);
  respuestas.set(CONSENTIMIENTO, true);
  respuestas.set(CAMBIAR_TURNO, (llamada) => [{ id: llamada.filtros.get('id').replace('eq.', '') }]);
}

const cambiosDelTurno = () => llamadas.filter((l) => l.clave === CAMBIAR_TURNO);

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

describe('el relevo lee el código del que sale', () => {
  it('con el Reporte Diario presentado, el turno del que sale queda completado a la hora de la lectura', async () => {
    prepararBase({ conReporte: true });

    const { salienteSinReporte } = await cerrarLaSalidaDelSaliente({ relevo, lat: -34.6, lng: -58.4 });

    assert.equal(salienteSinReporte, false);
    const [cambio] = cambiosDelTurno();
    assert.equal(cambio.filtros.get('id'), `eq.${SALIENTE}`);
    assert.equal(cambio.filtros.get('estado'), 'eq.activa');
    assert.equal(cambio.cuerpo.estado, 'completada');
    assert.equal(cambio.cuerpo.checkout_at, HORA_DE_LA_LECTURA);
    assert.equal(cambio.cuerpo.salio_sin_reporte, undefined);

    const salida = llamadas.find((l) => l.clave === GUARDAR_COMPROBACION);
    assert.equal(salida.cuerpo.turno_guardia_id, SALIENTE);
    assert.equal(salida.cuerpo.momento, 'checkout');
    assert.equal(salida.cuerpo.estado, 'comprobada');
    assert.equal(salida.cuerpo.comprobada_en, HORA_DE_LA_LECTURA);
  });

  it('sin el Reporte Diario, el turno del que sale queda en «Salida sin Reporte Diario» con la falta anotada', async () => {
    prepararBase({ conReporte: false });

    const { salienteSinReporte } = await cerrarLaSalidaDelSaliente({ relevo, lat: -34.6, lng: -58.4 });

    assert.equal(salienteSinReporte, true);
    const [cambio] = cambiosDelTurno();
    assert.equal(cambio.cuerpo.estado, ESTADO_SALIDA_SIN_REPORTE);
    assert.equal(cambio.cuerpo.salio_sin_reporte, true);
    assert.equal(cambio.cuerpo.checkout_at, HORA_DE_LA_LECTURA);
    // La Prestadora factura los turnos sin reporte: el turno no espera el reporte para cobrarse.
    assert.equal(cambio.cuerpo.factura_espera_el_reporte, false);
    // El primer aviso sale con la salida y anota la hora, para que la insistencia cuente desde ahí.
    assert.ok(Date.parse(cambio.cuerpo.push_reporte_pendiente_enviado_at) > 0);
  });

  it('si la Prestadora eligió no facturar los turnos sin reporte, el turno espera el reporte para cobrarse', async () => {
    prepararBase({ conReporte: false, factura: false });

    await cerrarLaSalidaDelSaliente({ relevo, lat: null, lng: null });

    const [cambio] = cambiosDelTurno();
    assert.equal(cambio.cuerpo.estado, ESTADO_SALIDA_SIN_REPORTE);
    assert.equal(cambio.cuerpo.factura_espera_el_reporte, true);
  });

  it('con el reporte presentado, la elección de facturar no se anota', async () => {
    prepararBase({ conReporte: true, factura: false });
    await cerrarLaSalidaDelSaliente({ relevo, lat: null, lng: null });
    const [cambio] = cambiosDelTurno();
    assert.equal(cambio.cuerpo.factura_espera_el_reporte, undefined);
    assert.equal(cambio.cuerpo.push_reporte_pendiente_enviado_at, undefined);
  });

  it('el turno de guardia del propio relevo no se cierra', async () => {
    prepararBase({ conReporte: true });
    await cerrarLaSalidaDelSaliente({ relevo, lat: null, lng: null });
    assert.ok(cambiosDelTurno().every((l) => l.filtros.get('id') !== `eq.${RELEVO}`));
  });

  it('si la llegada se comprobó con el código del Cliente, el que sale no se toca', async () => {
    prepararBase({ llegada: llegadaDelRelevo({ medio: 'codigo_cliente', sujeto_tipo: 'cliente' }) });
    const { salienteSinReporte } = await cerrarLaSalidaDelSaliente({ relevo, lat: null, lng: null });
    assert.equal(salienteSinReporte, false);
    assert.equal(cambiosDelTurno().length, 0);
  });

  it('si la llegada no está comprobada, el que sale no se toca', async () => {
    prepararBase({ llegada: llegadaDelRelevo({ estado: 'esperando_autorizacion' }) });
    await cerrarLaSalidaDelSaliente({ relevo, lat: null, lng: null });
    assert.equal(cambiosDelTurno().length, 0);
  });
});

describe('el Reporte Diario llega después de la salida', () => {
  const turno = { id: SALIENTE, prestadora_id: PRESTADORA, asistente_id: ASISTENTE_SALIENTE, estado: ESTADO_SALIDA_SIN_REPORTE };

  it('el turno pasa a completado y anota la fecha en que llegó el reporte', async () => {
    prepararBase({ conReporte: true });
    const antes = Date.now();

    assert.equal(await completarSiLlegoElReporte(turno), true);

    const [cambio] = cambiosDelTurno();
    assert.equal(cambio.filtros.get('estado'), `eq.${ESTADO_SALIDA_SIN_REPORTE}`);
    assert.equal(cambio.cuerpo.estado, 'completada');
    assert.ok(Date.parse(cambio.cuerpo.reporte_llego_at) >= antes - 1000);
    // La hora de salida ya fijada no se toca.
    assert.equal(cambio.cuerpo.checkout_at, undefined);
  });

  it('si todavía falta el reporte de algún Paciente, el turno sigue esperando', async () => {
    prepararBase({ conReporte: false });
    assert.equal(await completarSiLlegoElReporte(turno), false);
    assert.equal(cambiosDelTurno().length, 0);
  });

  it('un turno que no está esperando el reporte no se toca', async () => {
    prepararBase({ conReporte: true });
    assert.equal(await completarSiLlegoElReporte({ ...turno, estado: 'activa' }), false);
    assert.equal(llamadas.length, 0);
  });
});
