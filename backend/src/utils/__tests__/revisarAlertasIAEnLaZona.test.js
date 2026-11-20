/**
 * La revisión nocturna de la IA mira la medicación vigente con el día de la Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El servidor cuenta en hora universal. Entre las 21 y las 24 de
 * Argentina la hora universal ya está en el día siguiente: la IA dejaría afuera la medicación que
 * termina ese día y metería la que empieza mañana. Con el sistema roto —el día sacado del reloj del
 * servidor— la primera prueba pide la medicación de otro día, y la segunda revisa los Pacientes de
 * una Prestadora sin zona.
 *
 * Se llega hasta la medicación y se corta antes de llamar a la IA: los reportes a analizar vienen
 * vacíos. Datos inventados, como manda CLAUDE.md §6.
 */
// El servidor cuenta en hora universal: la prueba también, para que dé igual en cualquier máquina.
process.env.TZ = 'UTC';

import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '66666666-6666-6666-6666-666666666666';
const PACIENTE = '77777777-7777-7777-7777-777777777777';
const PRESTADORAS = 'GET /rest/v1/prestadoras';
const PACIENTES = 'GET /rest/v1/pacientes';
const REPORTES = 'GET /rest/v1/reportes';
const MEDICACION = 'GET /rest/v1/indicaciones_medicacion';
const CONFIGURACION = 'GET /rest/v1/configuracion_alertas_ia';
const ZONA = 'America/Argentina/Buenos_Aires';

const respuestas = new Map();
let llamadas = [];
let anotados = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const llamada = { clave, filtros: direccion.searchParams };
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

const { enLaPrestadora } = await import('../../db/connection.js');
const { revisarAlertasIA } = await import('../revisarAlertasIA.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  respuestas.set(PACIENTES, (llamada) =>
    llamada.filtros.get('select').includes('ultimo_analisis_ia_at')
      ? [{ id: PACIENTE, ultimo_analisis_ia_at: null }]
      : [{ cliente_id: 'cliente-1', salud: null }],
  );
  // La primera consulta pregunta si hay reportes nuevos; la segunda trae los que se analizan, que
  // vienen vacíos para que no se llame a la IA.
  respuestas.set(REPORTES, (llamada) =>
    llamada.filtros.get('select').includes('texto_libre') ? [] : [{ id: 'reporte-1', created_at: '2026-03-01T20:00:00Z' }],
  );
  respuestas.set(MEDICACION, []);
  respuestas.set(CONFIGURACION, []);
  llamadas = [];
  anotados = [];
});

// Las 22:30 del 1 de marzo en Argentina: en hora universal ya es el 2 de marzo.
const AHORA = new Date('2026-03-02T01:30:00Z');

const revisar = () => enLaPrestadora(PRESTADORA, 'alertas de la IA', () => revisarAlertasIA(AHORA));

describe('la IA nocturna mira la medicación del día de la Prestadora', () => {
  it('la medicación vigente se pide con el día de la Prestadora, no con el del servidor', async () => {
    respuestas.set(PRESTADORAS, [{ id: PRESTADORA, zona_horaria: ZONA }]);
    await revisar();
    const pedido = llamadas.find((l) => l.clave === MEDICACION);
    assert.ok(pedido, 'tenía que pedir la medicación vigente');
    assert.equal(pedido.filtros.get('fecha_desde'), 'lte.2026-03-01');
    assert.equal(pedido.filtros.get('or'), '(fecha_hasta.is.null,fecha_hasta.gte.2026-03-01)');
  });

  it('sin zona horaria no se revisa esa Prestadora', async () => {
    respuestas.set(PRESTADORAS, [{ id: PRESTADORA, zona_horaria: null }]);
    await revisar();
    assert.equal(llamadas.some((l) => l.clave === PACIENTES), false);
    assert.equal(anotados.length, 1);
  });
});
