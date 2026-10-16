/**
 * El tipo de un Asistente y sus tareas se leen con el trabajo de esa Prestadora, nunca con la
 * llave maestra ni con la de otra.
 *
 *   node --test src/utils/__tests__/tareasDelTipo.test.js
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Qué filas le deja ver la
 * base al trabajo lo deciden sus políticas, y eso no se prueba sin base.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TIPO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** Qué contesta la base a cada ruta. */
const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    llamadas.push({ ruta: url.pathname, consulta: url.searchParams, credencial: leerCredencial(req.headers.authorization ?? '') });
    const valor = respuestas.get(url.pathname) ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { tipoDelAsistente, tipoConSusTareas } = await import('../tareasDelTipo.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('/rest/v1/tipos_asistente', [{ id: TIPO, clave: 'cuidador', nombre: null, prestadora_id: null }]);
  respuestas.set('/rest/v1/prestadoras', [{ pais: 'AR' }]);
  respuestas.set('/rest/v1/tareas_tipo_asistente', [
    { id: '1', prestadora_id: null, clase: 'habilitada', clave: 'acompanar', texto: null, descripcion: null, orden: 1 },
    { id: '2', prestadora_id: null, clase: 'prohibida', clave: 'inyectar', texto: null, descripcion: null, orden: 2 },
  ]);
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
  }
}

describe('el tipo del Asistente y sus tareas', () => {
  it('se leen con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    const { tipo, tareas } = await tipoConSusTareas(TIPO, PRESTADORA);
    assert.equal(tipo?.id, TIPO);
    assert.deepEqual(tareas.habilitada.map((t) => t.clave), ['acompanar']);
    assert.deepEqual(tareas.prohibida.map((t) => t.clave), ['inyectar']);
    assert.deepEqual(tareas.no_incluida, []);

    assert.deepEqual([...new Set(llamadas.map((l) => l.ruta))].sort(), [
      '/rest/v1/prestadoras',
      '/rest/v1/tareas_tipo_asistente',
      '/rest/v1/tipos_asistente',
    ]);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('las tareas del producto se piden sólo del país de la Prestadora', async () => {
    await tipoConSusTareas(TIPO, PRESTADORA);
    const tareas = llamadas.find((l) => l.ruta === '/rest/v1/tareas_tipo_asistente');
    assert.equal(tareas.consulta.get('or'), `(prestadora_id.eq.${PRESTADORA},and(prestadora_id.is.null,pais.eq.AR))`);
  });

  it('si el tipo no existe no se piden tareas', async () => {
    respuestas.set('/rest/v1/tipos_asistente', []);
    const { tipo, tareas } = await tipoConSusTareas(TIPO, PRESTADORA);
    assert.equal(tipo, null);
    assert.deepEqual(tareas, { habilitada: [], no_incluida: [], prohibida: [] });
    assert.ok(!llamadas.some((l) => l.ruta === '/rest/v1/tareas_tipo_asistente'));
  });

  it('sin Prestadora no hay tipo, y ni siquiera le pregunta a la base', async () => {
    assert.equal(await tipoDelAsistente(TIPO, null), null);
    assert.equal(llamadas.length, 0);
  });
});
