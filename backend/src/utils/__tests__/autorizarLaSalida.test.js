/**
 * La autorización de una salida desde el Panel, con la hora de salida que pone quien la registra.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Quien coordina puede autorizar la salida de palabra y registrarla
 * después. Por eso el Panel le propone la hora de ese momento y le deja cambiarla. Esa hora es la
 * hora de salida del turno de guardia, y la autorización lo cierra por el único camino del cierre.
 * Ese camino valida tres límites en la base: no antes de la llegada del turno, no después del
 * momento en que se registra y no después de la llegada del turno siguiente del mismo Paciente.
 * Si la base rechaza la hora, el pedido sigue esperando, así quien registra la corrige.
 * Con el sistema roto alguna de estas pruebas falla. Por ejemplo, si la hora se toma del reloj o
 * si la comprobación se marca antes de cerrar.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-2222-3333-4444-555555555555';
const TURNO = 'aaaaaaaa-0000-0000-0000-000000000003';
const ASISTENTE = 'bbbbbbbb-0000-0000-0000-000000000003';
const PACIENTE = 'cccccccc-0000-0000-0000-000000000003';
const PEDIDO = 'dddddddd-0000-0000-0000-000000000003';
const QUIEN_AUTORIZA = 'eeeeeeee-0000-0000-0000-000000000003';
const MOTIVO = 'ffffffff-0000-0000-0000-000000000003';
const HORA_ELEGIDA = '2026-11-20T18:40:00.000Z';

const COMPROBACIONES = 'GET /rest/v1/turno_guardia_comprobaciones';
const MARCAR_COMPROBACION = 'PATCH /rest/v1/turno_guardia_comprobaciones';
const TURNOS = 'GET /rest/v1/turnos_guardia';
const MOTIVOS = 'GET /rest/v1/motivos_cierre_turno_guardia';
const PACIENTES_DEL_TURNO = 'GET /rest/v1/turno_guardia_pacientes';
const REPORTES = 'GET /rest/v1/reportes';
const CONSENTIMIENTO = 'POST /rest/v1/rpc/consentimiento_seguimiento_vigente';
const CERRAR = 'POST /rest/v1/rpc/cerrar_turno_guardia';

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
    // Un rechazo de la base: viaja como lo manda PostgREST, con su texto en `message`.
    if (valor?.rechazo) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: valor.rechazo }));
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

const { autorizarIngreso, horaDeSalidaAutorizada } = await import('../comprobacionDePresencia.js');

// El aviso del Reporte pendiente no tiene respuesta preparada: falla, se anota y la salida queda.
const avisarDeVerdad = console.error;
console.error = () => {};
after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

const cierres = () => llamadas.filter((l) => l.clave === CERRAR);
const marcas = () => llamadas.filter((l) => l.clave === MARCAR_COMPROBACION);

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set(COMPROBACIONES, [{
    id: PEDIDO, estado: 'pendiente_de_autorizacion', momento: 'checkout', turno_guardia_id: TURNO,
    motivo_del_pedido: 'sin_camara', lat: -34.6, lng: -58.4,
  }]);
  respuestas.set(TURNOS, [{
    id: TURNO, prestadora_id: PRESTADORA, asistente_id: ASISTENTE, paciente_id: PACIENTE, fecha: '2026-11-20',
    estado: 'activa', checkout_at: null, checkin_at: '2026-11-20T08:00:00.000Z',
  }]);
  respuestas.set(MOTIVOS, [{ id: MOTIVO }]);
  respuestas.set(PACIENTES_DEL_TURNO, [{ paciente_id: PACIENTE }]);
  respuestas.set(REPORTES, [{ paciente_id: PACIENTE }]);
  respuestas.set(CONSENTIMIENTO, true);
  respuestas.set(CERRAR, (llamada) => (llamada.cuerpo.p_reporte_atrasado ? 'salida_sin_reporte' : 'completada'));
  respuestas.set(MARCAR_COMPROBACION, [{ id: PEDIDO }]);
});

const autorizar = (horaDeSalida) =>
  autorizarIngreso({ comprobacionId: PEDIDO, prestadoraId: PRESTADORA, autorizadaPor: QUIEN_AUTORIZA, horaDeSalida });

describe('la autorización de una salida', () => {
  it('cierra el turno de guardia con la hora que puso quien registra, a su nombre y con el motivo del pedido', async () => {
    const resultado = await autorizar(HORA_ELEGIDA);
    assert.equal(resultado.comprobadaEn, HORA_ELEGIDA);

    const [cierre] = cierres();
    assert.equal(cierre.cuerpo.p_turno_guardia, TURNO);
    assert.equal(cierre.cuerpo.p_hora, HORA_ELEGIDA);
    assert.equal(cierre.cuerpo.p_cerrada_por, QUIEN_AUTORIZA);
    assert.equal(cierre.cuerpo.p_motivo, MOTIVO);
    assert.equal(cierre.cuerpo.p_reporte_atrasado, false);
    // El pedido sin cámara se cierra con el motivo «falló el teléfono del Asistente».
    const motivo = llamadas.find((l) => l.clave === MOTIVOS);
    assert.equal(motivo.filtros.get('clave'), 'eq.fallo_el_telefono_del_asistente');

    const [marca] = marcas();
    assert.equal(marca.cuerpo.comprobada_en, HORA_ELEGIDA);
    assert.equal(marca.cuerpo.autorizada_por, QUIEN_AUTORIZA);
  });

  it('sin hora elegida, la hora de salida es la del momento en que se registra', async () => {
    const antes = Date.now();
    await autorizar(null);
    const hora = new Date(cierres()[0].cuerpo.p_hora).getTime();
    assert.ok(hora >= antes && hora <= Date.now());
  });

  it('con el Reporte Diario pendiente, la base sabe que el turno queda en «Salida sin Reporte Diario»', async () => {
    respuestas.set(REPORTES, []);
    await autorizar(HORA_ELEGIDA);
    assert.equal(cierres()[0].cuerpo.p_reporte_atrasado, true);
  });

  for (const motivo of ['hora_de_salida_futura', 'hora_de_salida_anterior_a_la_llegada', 'hora_de_salida_posterior_al_relevo']) {
    it(`si la base rechaza la hora por «${motivo}», el pedido sigue esperando`, async () => {
      respuestas.set(CERRAR, { rechazo: motivo });
      await assert.rejects(autorizar(HORA_ELEGIDA), (error) => error.motivo === motivo);
      assert.equal(marcas().length, 0);
    });
  }

  it('una hora que no es una fecha no llega a la base', async () => {
    await assert.rejects(autorizar('mañana a la tarde'), (error) => error.motivo === 'hora_de_salida_obligatoria');
    assert.equal(cierres().length, 0);
    assert.equal(marcas().length, 0);
  });

  it('un pedido que ya se resolvió no cierra nada', async () => {
    respuestas.set(COMPROBACIONES, [{ id: PEDIDO, estado: 'comprobada', momento: 'checkout', turno_guardia_id: TURNO }]);
    await assert.rejects(autorizar(HORA_ELEGIDA), (error) => error.motivo === 'ya_resuelta');
    assert.equal(cierres().length, 0);
  });
});

describe('horaDeSalidaAutorizada', () => {
  it('vacía, devuelve el momento en que se registra', () => {
    assert.equal(horaDeSalidaAutorizada('', '2026-11-20T19:00:00.000Z'), '2026-11-20T19:00:00.000Z');
    assert.equal(horaDeSalidaAutorizada(null, '2026-11-20T19:00:00.000Z'), '2026-11-20T19:00:00.000Z');
  });

  it('con hora, la devuelve en el formato de la base', () => {
    assert.equal(horaDeSalidaAutorizada('2026-11-20T15:40:00-03:00', 'x'), HORA_ELEGIDA);
  });
});
