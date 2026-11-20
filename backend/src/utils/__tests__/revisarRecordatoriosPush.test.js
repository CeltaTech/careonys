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
 * Se levanta la base de mentira igual que `revisarExtensionesDeTurnoGuardia.test.js`. Datos inventados,
 * como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

// El servidor de verdad cuenta en hora universal y la Prestadora está en Argentina, tres horas
// atrás: así se ve si la hora del turno se lee en la zona de la Prestadora o en la del servidor.
process.env.TZ = 'UTC';
const ZONA = 'America/Argentina/Buenos_Aires';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';

const PRESTADORAS = 'GET /rest/v1/prestadoras';
const TURNOS_GUARDIA = 'GET /rest/v1/turnos_guardia';
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
    respuestas.set(PRESTADORAS, [{ minutos_aviso_previo_turno_guardia: 30, zona_horaria: ZONA }]);
    respuestas.set(TURNOS_GUARDIA, []);
    respuestas.set(MENSAJES, []);

    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date('2026-03-01T12:00:00Z'));

    assert.deepEqual(
      llamadas.map((l) => l.clave),
      [PRESTADORAS, TURNOS_GUARDIA, MENSAJES, TURNOS_GUARDIA],
    );
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
    assert.equal(anotados.length, 0, anotados.join('\n'));
  });

  it('si no puede leer la anticipación, no sigue', async () => {
    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date('2026-03-01T12:00:00Z'));

    assert.deepEqual(llamadas.map((l) => l.clave), [PRESTADORAS]);
    assert.equal(anotados.length, 1);
  });
});

describe('el recordatorio de turno próximo se mide en la hora de la Prestadora', () => {
  /** Un turno de las 08:00 de Argentina, que en hora universal empieza a las 11:00. */
  const turnoDeLasOcho = {
    id: '11111111-1111-1111-1111-111111111111',
    asistente_id: '55555555-5555-5555-5555-555555555555',
    fecha: '2026-03-01',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    dias_hasta_el_fin: 0,
    estado: 'programada',
    checkin_at: null,
  };

  /** Las dos lecturas de turnos van a la misma ruta: el recordatorio es la que mira su marca. */
  function turnosParaElRecordatorio(turnos) {
    return (llamada) => (llamada.filtros.has('push_recordatorio_enviado_at') ? turnos : []);
  }

  it('a las 04:45 de Argentina el turno de las 08:00 todavía no entra en la anticipación', async () => {
    // En hora universal son las 07:45. Leída la hora del turno en la del servidor, el turno
    // empezaría en 15 minutos y saldría el recordatorio tres horas antes de tiempo.
    respuestas.set(PRESTADORAS, [{ minutos_aviso_previo_turno_guardia: 30, zona_horaria: ZONA }]);
    respuestas.set(TURNOS_GUARDIA, turnosParaElRecordatorio([turnoDeLasOcho]));
    respuestas.set(MENSAJES, []);

    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date('2026-03-01T07:45:00Z'));

    assert.deepEqual(llamadas.map((l) => l.clave), [PRESTADORAS, TURNOS_GUARDIA, MENSAJES, TURNOS_GUARDIA]);
  });

  it('a las 07:45 de Argentina el turno de las 08:00 entra en la anticipación', async () => {
    // En hora universal son las 10:45. Leída la hora del turno en la del servidor, el turno
    // ya habría empezado y el recordatorio no saldría nunca.
    respuestas.set(PRESTADORAS, [{ minutos_aviso_previo_turno_guardia: 30, zona_horaria: ZONA }]);
    respuestas.set(TURNOS_GUARDIA, turnosParaElRecordatorio([turnoDeLasOcho]));
    respuestas.set(MENSAJES, []);

    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date('2026-03-01T10:45:00Z'));

    // Pasado el filtro, sigue a buscar las licencias y el idioma antes de mandar: alcanza con ver
    // que siguió más allá de las cuatro lecturas de siempre.
    assert.ok(llamadas.length > 4, `no siguió hacia el envío: ${llamadas.map((l) => l.clave).join(', ')}`);
  });

  it('sin la zona horaria de la Prestadora no manda recordatorios de turno próximo', async () => {
    respuestas.set(PRESTADORAS, [{ minutos_aviso_previo_turno_guardia: 30, zona_horaria: null }]);
    respuestas.set(TURNOS_GUARDIA, turnosParaElRecordatorio([turnoDeLasOcho]));
    respuestas.set(MENSAJES, []);

    await revisarLosRecordatoriosDeUnaPrestadora(PRESTADORA, new Date('2026-03-01T10:45:00Z'));

    assert.deepEqual(llamadas.map((l) => l.clave), [PRESTADORAS, TURNOS_GUARDIA, MENSAJES]);
    assert.equal(anotados.length, 1);
  });
});
