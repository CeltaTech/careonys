// El servidor cuenta en hora universal. Tiene que ir antes de cualquier otra cosa: la zona del
// proceso se fija la primera vez que se arma una fecha.
process.env.TZ = 'UTC';

/**
 * Que los avisos al Coordinador lean la hora de los turnos en la zona de la Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Un turno se carga con la hora de la casa del Paciente: «08:00» quiere
 * decir las ocho de Buenos Aires. El servidor corre en hora universal, y leía esa hora como si
 * fuera la suya: cada turno quedaba tres horas antes de tiempo. Lo que tiene que sostenerse:
 *
 *   1. UN TURNO QUE TODAVÍA NO TERMINÓ NO SE AVISA COMO SIN CERRAR. Con la lectura vieja, el turno
 *      que termina dentro de media hora ya llevaba dos horas y media terminado.
 *   2. EL INCIDENTE DE TURNO SIN CUBRIR SE ABRE CUANDO FALTAN LAS HORAS QUE ELIGIÓ LA PRESTADORA, ni
 *      tres antes. Con la lectura vieja, el turno que empieza en 25 horas y media ya entraba en las 24.
 *   3. SIN ZONA, ESA PRESTADORA NO SE REVISA. Avisar a deshora es peor que esperar a que la zona esté.
 *
 * Cada caso lleva al lado su control: el mismo turno corrido una hora, que sí tiene que avisar. Sin
 * él, una tarea rota que no avisa nunca pasaría la prueba. Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { diaYHoraEnLaZona } from '../relojDeLaPrestadora.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const TURNO_GUARDIA = '33333333-3333-4333-8333-333333333333';
const SERVICIO = '44444444-4444-4444-8444-444444444444';
const MS_POR_MINUTO = 60 * 1000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;

/** Qué contesta la base a cada `MÉTODO /ruta`. Sin preparar, vacío. */
const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : (preparada ?? []);
    // `{ estado, cuerpo }` es una respuesta con error; cualquier otra cosa, filas.
    const estado = valor?.estado ?? 200;
    const cuerpo = valor?.estado ? valor.cuerpo : valor;

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(cuerpo) ? cuerpo[0] ?? null : cuerpo));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// Ningún correo sale de verdad.
process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = (url, opciones) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    return Promise.resolve(new Response(JSON.stringify({ id: 'correo-de-prueba' }), { status: 200 }));
  }
  return fetchDeVerdad(url, opciones);
};

// Después de las variables de entorno: la conexión se arma al importar.
const { adentro, PRESTADORA_DE_PRUEBA } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const revisarNotificacionesCoordinador = adentro(
  (await import('../revisarNotificacionesCoordinador.js')).revisarNotificacionesCoordinador
);
const equipoDeUnServicio = adentro((await import('../equipoDeUnServicio.js')).equipoDeUnServicio);
const { reglaDeEquipoDe } = await import('../equipoDelServicio.js');
const revisarIncidentesTurnoGuardiaSinCubrir = adentro(
  (await import('../revisarIncidentesTurnoGuardiaSinCubrir.js')).revisarIncidentesTurnoGuardiaSinCubrir
);

const errorDeVerdad = console.error;
const avisosDelServidor = [];
console.error = (...partes) => avisosDelServidor.push(partes.join(' '));

after(() => {
  console.error = errorDeVerdad;
  globalThis.fetch = fetchDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  avisosDelServidor.length = 0;
});

const pedidos = (clave) => llamadas.filter((l) => l.clave === clave);

/** Un turno de una hora, de `inicio` a `inicio + 1 h`, escrito con la hora de reloj de Buenos Aires. */
function turnoDeUnaHora(inicio, extra = {}) {
  const desde = diaYHoraEnLaZona(inicio, ZONA);
  const hasta = diaYHoraEnLaZona(new Date(inicio.getTime() + MS_POR_HORA), ZONA);
  return {
    id: TURNO_GUARDIA,
    servicio_id: SERVICIO,
    paciente_id: null,
    asistente_id: null,
    fecha: desde.dia,
    hora_inicio: desde.hora,
    hora_fin: hasta.hora,
    dias_hasta_el_fin: desde.dia === hasta.dia ? 0 : 1,
    checkout_at: null,
    aviso_sin_cerrar_at: null,
    aviso_sin_cerrar_veces: 0,
    aviso_sin_cerrar_backup_at: null,
    aviso_sin_cerrar_grave_at: null,
    ...extra,
  };
}

function prepararPrestadora(zona = ZONA) {
  respuestas.set('GET /rest/v1/prestadoras', [{ id: PRESTADORA_DE_PRUEBA, zona_horaria: zona, idioma: 'es-AR' }]);
}

describe('turno de guardia sin cerrar', () => {
  function prepararVuelta(turno_guardia, zona = ZONA) {
    prepararPrestadora(zona);
    respuestas.set('GET /rest/v1/configuracion_escalada_coordinador', [
      {
        prestadora_id: PRESTADORA_DE_PRUEBA,
        umbrales_premura: [],
        minutos_antes_backup: null,
        coordinador_backup_id: null,
        minutos_gracia_cierre_turno_guardia: 15,
        horas_antes_aviso_grave_sin_cerrar: null,
      },
    ]);
    respuestas.set('GET /rest/v1/turnos_guardia', [turno_guardia]);
    // La fila ya la anotó otra vuelta: alcanza con ver si se intentó anotar el aviso.
    respuestas.set('PATCH /rest/v1/turnos_guardia', []);
  }

  it('el turno que termina dentro de media hora, en Buenos Aires, no se avisa', async () => {
    const ahora = Date.now();
    prepararVuelta(turnoDeUnaHora(new Date(ahora - 30 * MS_POR_MINUTO)));
    await revisarNotificacionesCoordinador();
    assert.equal(pedidos('PATCH /rest/v1/turnos_guardia').length, 0);
  });

  it('control: el que terminó hace media hora, pasados los 15 minutos de gracia, sí se avisa', async () => {
    const ahora = Date.now();
    prepararVuelta(turnoDeUnaHora(new Date(ahora - 90 * MS_POR_MINUTO)));
    await revisarNotificacionesCoordinador();
    assert.equal(pedidos('PATCH /rest/v1/turnos_guardia').length, 1);
  });

  it('sin zona, la Prestadora no se revisa', async () => {
    const ahora = Date.now();
    prepararVuelta(turnoDeUnaHora(new Date(ahora - 90 * MS_POR_MINUTO)), null);
    await revisarNotificacionesCoordinador();
    assert.equal(pedidos('GET /rest/v1/turnos_guardia').length, 0);
    assert.equal(pedidos('PATCH /rest/v1/turnos_guardia').length, 0);
  });
});

describe('incidente de turno de guardia sin cubrir', () => {
  function prepararVuelta(turno_guardia, zona = ZONA) {
    prepararPrestadora(zona);
    respuestas.set('GET /rest/v1/turnos_guardia', [{ ...turno_guardia, estado: 'programada' }]);
    // Otra vuelta ya lo abrió: alcanza con ver si se intentó abrir.
    respuestas.set('POST /rest/v1/incidentes_turno_guardia_sin_cubrir', {
      estado: 409,
      cuerpo: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
  }

  it('el turno que empieza en 25 horas y media no abre incidente: la regla de fábrica es 24', async () => {
    prepararVuelta(turnoDeUnaHora(new Date(Date.now() + 25.5 * MS_POR_HORA)));
    await revisarIncidentesTurnoGuardiaSinCubrir();
    assert.equal(pedidos('POST /rest/v1/incidentes_turno_guardia_sin_cubrir').length, 0);
  });

  it('control: el que empieza en 23 horas sí abre incidente', async () => {
    prepararVuelta(turnoDeUnaHora(new Date(Date.now() + 23 * MS_POR_HORA)));
    await revisarIncidentesTurnoGuardiaSinCubrir();
    assert.equal(pedidos('POST /rest/v1/incidentes_turno_guardia_sin_cubrir').length, 1);
  });

  it('sin zona, la Prestadora no se revisa', async () => {
    prepararVuelta(turnoDeUnaHora(new Date(Date.now() + 23 * MS_POR_HORA)), null);
    await revisarIncidentesTurnoGuardiaSinCubrir();
    assert.equal(pedidos('GET /rest/v1/turnos_guardia').length, 0);
    assert.equal(pedidos('POST /rest/v1/incidentes_turno_guardia_sin_cubrir').length, 0);
  });
});

describe('equipo de un Servicio', () => {
  // A la una de la mañana en hora universal, en Buenos Aires todavía son las diez de la noche del
  // día anterior. Los turnos del equipo se piden desde el día de Buenos Aires, no desde el del servidor.
  const ahora = new Date('2026-09-10T01:00:00.000Z');
  const regla = reglaDeEquipoDe(null);
  const MS_POR_DIA = 24 * MS_POR_HORA;

  it('los turnos se piden desde el día en la zona de la Prestadora', async () => {
    await equipoDeUnServicio({ servicioId: SERVICIO, prestadoraId: PRESTADORA_DE_PRUEBA, regla, ahora, zona: ZONA });
    const [pedido] = pedidos('GET /rest/v1/turnos_guardia');
    const esperado = diaYHoraEnLaZona(new Date(ahora.getTime() - regla.dias_hacia_atras * MS_POR_DIA), ZONA).dia;
    assert.equal(pedido.filtros.get('fecha'), `gte.${esperado}`);
  });

  it('sin zona no se cuenta el día: se corta en vez de usar la hora del servidor', async () => {
    await assert.rejects(equipoDeUnServicio({ servicioId: SERVICIO, prestadoraId: PRESTADORA_DE_PRUEBA, regla, ahora }));
    assert.equal(pedidos('GET /rest/v1/turnos_guardia').length, 0);
  });
});
