/**
 * El consentimiento de la medicación —si la Prestadora pide la firma y el texto que se acepta— se lee
 * con el trabajo de esa Prestadora cuando quien llama no trae conexión, nunca con la llave maestra ni
 * con la de otra.
 *
 *   node --test src/utils/__tests__/consentimientoMedicacion.test.js
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
const { documentoParaFirmar, pideLaFirma } = await import('../consentimientoMedicacion.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  respuestas.set('/rest/v1/configuracion_medicacion', [{ pide_firma_del_cliente: false }]);
  respuestas.set('/rest/v1/textos_consentimiento_medicacion', [{ cuerpo: 'Acepto lo de {{prestadora}}.', updated_at: null }]);
  respuestas.set('/rest/v1/prestadoras', [{ nombre_fantasia: 'Cuidar del Sur' }]);
});

/** Que cada pedido haya salido con el trabajo de esa Prestadora, y nombrándola. */
function todasConElTrabajoDe(prestadoraId) {
  assert.ok(llamadas.length > 0, 'llegó a preguntarle a la base');
  for (const llamada of llamadas) {
    assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', llamada.ruta);
    assert.equal(llamada.credencial?.prestadora_id, prestadoraId, llamada.ruta);
    const columna = llamada.ruta === '/rest/v1/prestadoras' ? 'id' : 'prestadora_id';
    assert.equal(llamada.consulta.get(columna), `eq.${prestadoraId}`, llamada.ruta);
  }
}

describe('el consentimiento de la medicación', () => {
  it('si se pide la firma se lee con el trabajo de esa Prestadora, y no con la llave maestra', async () => {
    assert.equal(await pideLaFirma({ prestadoraId: PRESTADORA }), false);
    assert.deepEqual(llamadas.map((l) => l.ruta), ['/rest/v1/configuracion_medicacion']);
    todasConElTrabajoDe(PRESTADORA);
  });

  it('sin fila de configuración se pide la firma', async () => {
    respuestas.set('/rest/v1/configuracion_medicacion', []);
    assert.equal(await pideLaFirma({ prestadoraId: PRESTADORA }), true);
  });

  it('sin Prestadora se pide la firma, y ni siquiera le pregunta a la base', async () => {
    assert.equal(await pideLaFirma({ prestadoraId: null }), true);
    assert.equal(llamadas.length, 0);
  });

  it('el texto que se acepta se arma con el trabajo de esa Prestadora', async () => {
    const documento = await documentoParaFirmar({ prestadoraId: PRESTADORA, idioma: 'es-AR' });
    assert.equal(documento.texto, 'Acepto lo de Cuidar del Sur.');
    assert.equal(documento.idioma, 'es-AR');
    assert.ok(documento.verificador);
    assert.deepEqual([...new Set(llamadas.map((l) => l.ruta))].sort(), [
      '/rest/v1/prestadoras',
      '/rest/v1/textos_consentimiento_medicacion',
    ]);
    todasConElTrabajoDe(PRESTADORA);
  });
});
