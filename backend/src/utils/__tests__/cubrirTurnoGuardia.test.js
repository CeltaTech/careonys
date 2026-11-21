/**
 * Cubrir un turno de guardia con un sustituto: el turno pasa a nombre de quien lo hace.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/cubrirTurnoGuardia.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Acá se cruzan dos cosas que el producto no puede perder: que quien
 * va a la casa del Paciente vea su turno de guardia y la pueda fichar —la aplicación del Asistente lista
 * por `turnos_guardia.asistente_id`—, y que quede escrito a quién le tocaba ese turno antes. Las dos
 * escrituras las hace juntas una sola función de la base; esta prueba mira que se la llame a ella,
 * con todos los datos, y que su rechazo llegue tal cual a quien llama.
 *
 * La base es de mentira y contesta por HTTP como la de verdad, así que además del resultado se
 * mira **qué se le pidió**.
 *
 * QUÉ PASARÍA CON EL SISTEMA ROTO. Si volviera a escribir la constancia y el turno de guardia por
 * separado, falla la de «un solo pedido». Si se perdiera un dato de la constancia, falla la que los
 * compara. Y si el rechazo de la base se tragara o se cambiara, fallan las del rechazo.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const TITULAR = '22222222-2222-2222-2222-222222222222';
const SUSTITUTO = '33333333-3333-3333-3333-333333333333';
const AUSENCIA = '44444444-4444-4444-4444-444444444444';
const CONSTANCIA = '55555555-5555-5555-5555-555555555555';

/** Lo que se le pidió a la base, en orden, qué tabla contesta con error y con qué mensaje. */
let pedidos = [];
let tablaQueFalla = null;
let mensajeDelRechazo = 'la base dijo que no';

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => { cuerpo += parte; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const tabla = url.pathname.replace('/rest/v1/', '').replace('rpc/', 'rpc:');
    pedidos.push({
      tabla,
      metodo: req.method,
      parametros: url.searchParams,
      cuerpo: cuerpo ? JSON.parse(cuerpo) : null,
    });

    if (tabla === tablaQueFalla) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '23514', message: mensajeDelRechazo }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // La función devuelve el identificador de la constancia nueva.
    res.end(JSON.stringify(CONSTANCIA));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;

// El import va después de las variables de entorno: la conexión se arma al importar.
const { cubrirTurnoGuardiaConSustituto } = await import('../cubrirTurnoGuardia.js');
// La función entra con la conexión que le pasan.
const { conexionDe } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const supabase = conexionDe();

/** El turno que el titular no va a poder hacer. */
const TURNO_GUARDIA = {
  id: 'g-1',
  prestadora_id: PRESTADORA,
  asistente_id: TITULAR,
  estado: 'programada',
};

const cubrir = (extra = {}) => cubrirTurnoGuardiaConSustituto({
  db: supabase,
  turno_guardia: TURNO_GUARDIA,
  asistenteSustitutoId: SUSTITUTO,
  ausenciaId: AUSENCIA,
  motivo: 'emergencia',
  ...extra,
});

const RPC = 'rpc:cubrir_turno_guardia_con_sustituto';
const pedidoA = (tabla, metodo) => pedidos.find((p) => p.tabla === tabla && p.metodo === metodo);

describe('cubrir una guardia con un sustituto', () => {
  beforeEach(() => {
    pedidos = [];
    tablaQueFalla = null;
    mensajeDelRechazo = 'la base dijo que no';
  });

  after(() => baseFalsa.close());

  it('hace todo en un solo pedido a la base', async () => {
    const resultado = await cubrir();

    assert.equal(resultado.ok, true);
    assert.deepEqual(pedidos.map((p) => `${p.metodo} ${p.tabla}`), ['POST rpc:cubrir_turno_guardia_con_sustituto'],
      'la constancia y el cambio de nombre van juntos, o puede quedar la mitad');
  });

  it('le pasa a la base el turno, el sustituto y por qué lo hace otro', async () => {
    await cubrir({ motivoDetalle: 'se quedó sin transporte', costoAdicional: '1500' });

    const pedido = pedidoA(RPC, 'POST');
    assert.deepEqual(pedido.cuerpo, {
      p_turno_guardia: 'g-1',
      p_asistente_sustituto: SUSTITUTO,
      p_ausencia: AUSENCIA,
      p_cobertura_de_ausencia: null,
      p_motivo: 'emergencia',
      p_motivo_detalle: 'se quedó sin transporte',
      p_costo_adicional: '1500',
    });
  });

  it('el turno sigue siendo uno solo: no nace ninguna guardia nueva', async () => {
    await cubrir();

    assert.equal(pedidoA('turnos_guardia', 'POST'), undefined);
    assert.equal(pedidoA('turno_guardia_pacientes', 'POST'), undefined);
  });

  for (const rechazo of ['tarea_prohibida_bloquea: la tarea no se le asigna', 'modalidad_bloquea: la modalidad no le corresponde']) {
    it(`si la base rechaza la cobertura (${rechazo.split(':')[0]}), el motivo llega tal cual`, async () => {
      tablaQueFalla = RPC;
      mensajeDelRechazo = rechazo;

      const resultado = await cubrir();

      assert.equal(resultado.ok, false);
      assert.equal(resultado.motivo, rechazo, 'quien llama tiene que poder reconocer el motivo del rechazo');
      assert.equal(pedidos.length, 1, 'no hay nada que deshacer a mano: la base no escribió nada');
    });
  }
});
