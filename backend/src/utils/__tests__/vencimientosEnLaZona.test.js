/**
 * La revisión de vencimientos cuenta los días en la zona horaria de la Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El servidor cuenta en hora universal. Entre las 21 y las 24 de
 * Argentina la hora universal ya está en el día siguiente, y la ventana de aviso se correría un
 * día. Con el sistema roto —el día sacado del reloj del servidor— la primera prueba pide hasta el
 * 1 de abril en vez del 31 de marzo, y la segunda lee los documentos de una Prestadora sin zona.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
// El servidor cuenta en hora universal: la prueba también, para que dé igual en cualquier máquina.
process.env.TZ = 'UTC';

import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '55555555-5555-5555-5555-555555555555';
const PRESTADORAS = 'GET /rest/v1/prestadoras';
const DOCUMENTOS = 'GET /rest/v1/documentos_pedidos_al_asistente';
const ZONA = 'America/Argentina/Buenos_Aires';

const respuestas = new Map();
let llamadas = [];
let anotados = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, filtros: direccion.searchParams });
    const valor = respuestas.get(clave);
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

const { revisarVencimientos } = await import('../vencimientos.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  respuestas.set(DOCUMENTOS, []);
  llamadas = [];
  anotados = [];
});

// Las 22:30 del 1 de marzo en Argentina: en hora universal ya es el 2 de marzo.
const AHORA = new Date('2026-03-02T01:30:00Z');

describe('los vencimientos se cuentan en el día de la Prestadora', () => {
  it('la ventana de aviso arranca en el día de la Prestadora, no en el del servidor', async () => {
    respuestas.set(PRESTADORAS, [{ dias_aviso_vencimiento_documentos: 30, zona_horaria: ZONA }]);
    await revisarVencimientos(PRESTADORA, AHORA);
    const pedido = llamadas.find((l) => l.clave === DOCUMENTOS);
    assert.ok(pedido, 'tenía que pedir los documentos');
    assert.deepEqual(pedido.filtros.getAll('fecha_vencimiento'), ['not.is.null', 'lte.2026-03-31']);
  });

  it('sin zona horaria no se revisa esa Prestadora', async () => {
    respuestas.set(PRESTADORAS, [{ dias_aviso_vencimiento_documentos: 30, zona_horaria: null }]);
    await revisarVencimientos(PRESTADORA, AHORA);
    assert.equal(llamadas.some((l) => l.clave === DOCUMENTOS), false);
    assert.equal(anotados.length, 1);
  });
});
