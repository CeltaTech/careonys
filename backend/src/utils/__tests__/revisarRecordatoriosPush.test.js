/**
 * La tarea que le manda los avisos de rutina a la Asistente: con qué credencial lee lo de cada
 * Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../revisarRecordatoriosPush.js` recorre las Prestadoras de a una y
 * en cada una lee su anticipación, los turnos recién asignados, los mensajes del coordinador y los
 * turnos por empezar. Lo que hay que sostener acá es que todo eso vaya con la credencial del
 * trabajo de esa Prestadora y con ninguna otra.
 *
 * Con el sistema roto —una consulta con otra credencial, o la credencial de otra Prestadora— la
 * prueba da al revés. El envío al celular no se prueba acá: sale por `push.js`, que tiene sus
 * propias pruebas.
 *
 * Se levanta la base de mentira igual que `revisarExtensionesDeTurno.test.js`. Datos inventados,
 * como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';

const PRESTADORAS = 'GET /rest/v1/prestadoras';
const TURNOS = 'GET /rest/v1/guardias';
const MENSAJES = 'GET /rest/v1/mensajes_asistente';

/**
 * Qué contesta la base a cada `MÉTODO /ruta`: un valor, o una función que recibe la llamada y
 * devuelve el valor (`undefined` es un error de la base). Cada prueba pisa lo que necesita.
 */
const respuestas = new Map();
/** Todo lo que se le pidió a la base. */
let llamadas = [];
/** Lo que quedó anotado del lado del servidor. Se junta para no ensuciar la salida. */
let anotados = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => (crudo += parte));
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const llamada = {
      clave,
      filtros: direccion.searchParams,
      cuerpo: crudo ? JSON.parse(crudo) : null,
      credencial: leerCredencial(req.headers.authorization ?? ''),
    };
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma en
// el momento en que se importa el archivo.
const { revisarLosRecordatoriosDeUnaPrestadora } = await import('../revisarRecordatoriosPush.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  anotados = [];
});

describe('los avisos de rutina a la Asistente', () => {
  it('todo lo de cada Prestadora se lee con la credencial del trabajo de esa Prestadora', async () => {
    respuestas.set(PRESTADORAS, [{ minutos_aviso_previo_guardia: 30 }]);
    respuestas.set(TURNOS, []);
    respuestas.set(MENSAJES, []);

    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date(2026, 2, 1, 12, 0, 0));

    assert.deepEqual(
      llamadas.map((l) => l.clave),
      [PRESTADORAS, TURNOS, MENSAJES, TURNOS],
    );
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
    assert.equal(anotados.length, 0, anotados.join('\n'));
  });

  it('si no puede leer la anticipación, no sigue', async () => {
    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date(2026, 2, 1, 12, 0, 0));

    assert.deepEqual(llamadas.map((l) => l.clave), [PRESTADORAS]);
    assert.equal(anotados.length, 1);
  });
});
