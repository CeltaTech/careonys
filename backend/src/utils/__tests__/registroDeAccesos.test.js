/**
 * Quién leyó cada dato de salud: la función única que lo anota.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Lo que hace cumplir el registro —la cadena de resúmenes, que nadie lo
 * edite, que cada Prestadora vea sólo lo suyo— vive en la base y se prueba contra la base. Acá se
 * prueba lo que la base no puede ver: que el backend anote lo que corresponde, con la persona que
 * comprobó el middleware, sin identificadores en el origen, y que si no puede anotar, lance el
 * error en vez de dejar pasar la lectura sin registro.
 *
 * Se levanta una base de mentira, igual que `bajaDelAcceso.test.js`.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const PERSONA = '22222222-2222-2222-2222-222222222222';
const PACIENTE = '33333333-3333-3333-3333-333333333333';

let contestaConError = false;
let llamadas = [];
let anotados = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    llamadas.push({ clave: `${req.method} ${ruta}`, cuerpo: crudo ? JSON.parse(crudo) : null });
    if (contestaConError || `${req.method} ${ruta}` !== 'POST /rest/v1/accesos_a_datos_de_salud') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'violates check constraint "tabla_interna_con_detalle"', code: '23514' }));
      return;
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end('');
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { anotarAccesoADatosDeSalud, origenDelPedido } = await import('../registroDeAccesos.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  contestaConError = false;
  llamadas = [];
  anotados = [];
});

const quien = { id: PERSONA, asistenteId: 'otra-cosa', prestadoraId: PRESTADORA };
const anotar = (cambios = {}, persona = quien) =>
  anotarAccesoADatosDeSalud(persona, {
    pacienteId: PACIENTE,
    categorias: ['indicaciones_medicacion'],
    origen: 'GET /api/app-asistentes/medicacion/:pacienteId',
    ...cambios,
  });

function renglon() {
  return llamadas.find((l) => l.clave === 'POST /rest/v1/accesos_a_datos_de_salud')?.cuerpo;
}

describe('lo que queda anotado', () => {
  it('los cinco datos que pone el backend, a nombre de la persona comprobada', async () => {
    await anotar();
    assert.deepEqual(renglon(), {
      prestadora_id: PRESTADORA,
      usuario_id: PERSONA,
      paciente_id: PACIENTE,
      categorias: ['indicaciones_medicacion'],
      origen: 'GET /api/app-asistentes/medicacion/:pacienteId',
    });
  });

  it('el momento, el número y los resúmenes no los manda: los pone la base', async () => {
    await anotar();
    for (const columna of ['momento', 'numero', 'resumen', 'resumen_anterior', 'id']) {
      assert.equal(columna in renglon(), false, `no manda ${columna}`);
    }
  });

  it('lo que viaje después del signo de pregunta no entra en el origen', async () => {
    await anotar({ origen: 'GET /api/algo?nombre=Juana' });
    assert.equal(renglon().origen, 'GET /api/algo');
  });
});

describe('el origen del pedido', () => {
  it('es la ruta declarada, sin el identificador del paciente', () => {
    const req = {
      method: 'GET',
      baseUrl: '/api/app-asistentes/medicacion',
      route: { path: '/:pacienteId' },
      originalUrl: `/api/app-asistentes/medicacion/${PACIENTE}?x=1`,
    };
    assert.equal(origenDelPedido(req), 'GET /api/app-asistentes/medicacion/:pacienteId');
  });

  it('sin ruta declarada cae a la dirección escrita, sin lo que viene después del signo de pregunta', () => {
    assert.equal(origenDelPedido({ method: 'GET', originalUrl: '/api/x?dni=123' }), 'GET /api/x');
  });
});

describe('falla cerrado', () => {
  it('sin persona, sin Prestadora, sin paciente, sin categorías o sin origen, lanza y no escribe', async () => {
    const casos = [
      () => anotar({}, { prestadoraId: PRESTADORA }),
      () => anotar({}, { id: PERSONA }),
      () => anotar({}, null),
      () => anotar({ pacienteId: undefined }),
      () => anotar({ categorias: [] }),
      () => anotar({ categorias: [null] }),
      () => anotar({ origen: '' }),
      () => anotar({ origen: '?solo=esto' }),
    ];
    for (const caso of casos) {
      await assert.rejects(caso());
    }
    assert.equal(llamadas.length, 0);
  });

  it('si la base rechaza, lanza, y el texto crudo de la base queda sólo del lado del servidor', async () => {
    contestaConError = true;
    await assert.rejects(anotar(), (error) => {
      assert.equal(error.message.includes('tabla_interna_con_detalle'), false);
      return true;
    });
    assert.ok(anotados.join(' ').includes('tabla_interna_con_detalle'));
  });
});
