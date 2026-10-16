/**
 * La detección automática de ausencia: con qué credencial trabaja y de dónde saca los Pacientes
 * del turno.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `../ausenciaAutomatica.js` recorre las Prestadoras que la tienen
 * encendida de a una y en cada una lee su tolerancia, los turnos sin llegada, y marca ausente al
 * que se pasó. Lo que hay que sostener acá es que todo lo de una Prestadora vaya con la credencial
 * del trabajo de esa Prestadora y con ninguna otra, y que la guardia saliente se busque sin pasar
 * por la Ficha del Paciente.
 *
 * Con el sistema roto —una consulta con otra credencial, o la credencial de otra Prestadora— la
 * primera prueba da al revés.
 *
 * Se levanta la base de mentira igual que `revisarExtensionesDeTurno.test.js`. Datos inventados,
 * como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '44444444-4444-4444-4444-444444444444';
const TURNO = '11111111-1111-1111-1111-111111111111';
const TURNO_ANTERIOR = '22222222-2222-2222-2222-222222222222';

const CONFIGURACION = 'GET /rest/v1/configuracion_ausencia_automatica';
const TURNOS = 'GET /rest/v1/guardias';
const MARCAR = 'PATCH /rest/v1/guardias';
const LISTA = 'GET /rest/v1/guardia_pacientes';
const INCIDENTE = 'POST /rest/v1/incidentes_relevo';
const FICHAS = 'GET /rest/v1/pacientes';

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
const { revisarLasAusenciasDeUnaPrestadora } = await import('../ausenciaAutomatica.js');

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

// Una hora después de que el turno tenía que empezar.
const AHORA = new Date(2026, 2, 1, 9, 0, 0);

/** Un turno asignado que a esta hora ya debería tener la llegada marcada. */
const turnoSinLlegada = { id: TURNO, paciente_id: 'paciente-columna', fecha: '2026-03-01', hora_inicio: '08:00' };

/** Las dos consultas a la lista del turno van a la misma ruta: se distinguen por lo que piden. */
function lista({ pacientes, anteriores = [] }) {
  return (llamada) =>
    llamada.filtros.get('select').includes('guardias!inner')
      ? anteriores
      : pacientes.map((id) => ({ paciente_id: id }));
}

describe('la detección automática de ausencia', () => {
  it('todo lo de cada Prestadora va con la credencial del trabajo de esa Prestadora', async () => {
    respuestas.set(CONFIGURACION, [{ minutos_tolerancia_checkin: 15 }]);
    respuestas.set(TURNOS, [turnoSinLlegada]);
    respuestas.set(MARCAR, []);
    respuestas.set(LISTA, lista({
      pacientes: ['paciente-1'],
      anteriores: [{ guardias: { id: TURNO_ANTERIOR, fecha: '2026-03-01', hora_inicio: '00:00', hora_fin: '08:00', dias_hasta_el_fin: 0 } }],
    }));
    respuestas.set(INCIDENTE, []);

    await revisarLasAusenciasDeUnaPrestadora(PRESTADORA, AHORA);

    assert.deepEqual(
      [...new Set(llamadas.map((l) => l.clave))].sort(),
      [CONFIGURACION, INCIDENTE, LISTA, MARCAR, TURNOS].sort(),
    );
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
    const incidente = llamadas.find((l) => l.clave === INCIDENTE).cuerpo;
    assert.equal(incidente.guardia_entrante_id, TURNO);
    assert.equal(incidente.guardia_saliente_id, TURNO_ANTERIOR);
    assert.equal(anotados.length, 0, anotados.join('\n'));
  });

  it('la guardia saliente se busca por todos los Pacientes del turno, sin leer la Ficha', async () => {
    respuestas.set(CONFIGURACION, [{ minutos_tolerancia_checkin: 15 }]);
    respuestas.set(TURNOS, [turnoSinLlegada]);
    respuestas.set(MARCAR, []);
    respuestas.set(LISTA, lista({ pacientes: ['paciente-1', 'paciente-2'] }));
    respuestas.set(INCIDENTE, []);

    await revisarLasAusenciasDeUnaPrestadora(PRESTADORA, AHORA);

    assert.ok(!llamadas.some((l) => l.clave === FICHAS), 'leyó la Ficha del Paciente');
    const saliente = llamadas.find((l) => l.clave === LISTA && l.filtros.get('select').includes('guardias!inner'));
    assert.equal(saliente.filtros.get('paciente_id'), 'in.(paciente-1,paciente-2)');
  });

  it('dentro de la tolerancia no marca a nadie', async () => {
    respuestas.set(CONFIGURACION, [{ minutos_tolerancia_checkin: 90 }]);
    respuestas.set(TURNOS, [turnoSinLlegada]);

    await revisarLasAusenciasDeUnaPrestadora(PRESTADORA, AHORA);

    assert.deepEqual(llamadas.map((l) => l.clave), [CONFIGURACION, TURNOS]);
  });

  it('si la Prestadora la apagó, no busca turnos', async () => {
    respuestas.set(CONFIGURACION, []);

    await revisarLasAusenciasDeUnaPrestadora(PRESTADORA, AHORA);

    assert.deepEqual(llamadas.map((l) => l.clave), [CONFIGURACION]);
    assert.equal(anotados.length, 0, anotados.join('\n'));
  });
});
