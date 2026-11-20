/**
 * El aviso de turno de guardia sin cubrir cuenta en la hora de la Prestadora, no en la del
 * servidor.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Un turno de guardia se guarda como un día y una hora de reloj, y
 * esa hora es la de la casa del Paciente. El servidor cuenta en hora universal. Si la tarea lee
 * «08:00» en la hora del servidor, en Argentina cada turno le queda tres horas corrido: avisa de
 * un hueco que todavía no está dentro de la anticipación, y deja de avisar de uno que sigue a
 * tiempo de taparse. Y sin la zona de la Prestadora no hay forma de contar bien, así que no se
 * avisa nada.
 *
 * Con el sistema roto —la hora del turno leída en la del servidor— las pruebas de la ventana y
 * la de los días pedidos dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
// El servidor de verdad cuenta en hora universal. Va antes de cualquier fecha.
process.env.TZ = 'UTC';

const { strict: assert } = await import('node:assert');
const { after, afterEach, beforeEach, describe, it, mock } = await import('node:test');
const { createServer } = await import('node:http');

const ZONA = 'America/Argentina/Buenos_Aires';
const PRESTADORA = '0a000000-0000-4000-8000-0000000000a1';
const TURNO_GUARDIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const PRESTADORAS = 'GET /rest/v1/prestadoras';
const TURNOS_GUARDIA = 'GET /rest/v1/turnos_guardia';
const AVISADO = 'PATCH /rest/v1/turnos_guardia';

const respuestas = new Map();
let llamadas = [];
let anotados = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => (crudo += parte));
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const llamada = { clave, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null };
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

// Los imports van después de dejar puestas las variables de entorno: la conexión a la base se
// arma en el momento en que se importa el archivo.
const { adentro } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const revisarTurnosGuardiaSinCubrir = adentro((await import('../revisarTurnosGuardiaSinCubrir.js')).revisarTurnosGuardiaSinCubrir, PRESTADORA);
const { sembrarMensajesDelSistema } = await import('../../i18n/mensajesDelSistema.js');
const { filasSembradas } = await import('../../i18n/__tests__/mensajesSembrados.js');
sembrarMensajesDelSistema(filasSembradas());

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

/** La base, con un solo turno de guardia sin nadie y la anticipación que se le pida. */
function prepararLaBase({ zona = ZONA, horasAntes, turno }) {
  respuestas.set(PRESTADORAS, [{ id: PRESTADORA, zona_horaria: zona, pais: 'AR' }]);
  respuestas.set('GET /rest/v1/configuracion_aviso_turno_guardia_sin_cubrir', [
    { horas_antes: horasAntes, horas_entre_avisos: 1, activo: true },
  ]);
  respuestas.set(TURNOS_GUARDIA, turno ? [turno] : []);
  respuestas.set('GET /rest/v1/turno_guardia_pacientes', []);
  respuestas.set('GET /rest/v1/pacientes', []);
  // El aviso está apagado en el envío: lo que se mira acá es si la tarea decidió avisar, que se
  // ve en la marca que deja en el turno de guardia.
  respuestas.set('GET /rest/v1/configuracion_notificaciones', [{ activo: false }]);
  respuestas.set(AVISADO, []);
}

/** Un turno de guardia sin Asistente, cargado en la hora de la Prestadora. */
function turnoSinNadie(fecha, horaInicio) {
  return {
    id: TURNO_GUARDIA,
    serie_id: null,
    paciente_id: null,
    fecha,
    hora_inicio: horaInicio,
    hora_fin: '06:00',
    dias_hasta_el_fin: 1,
    aviso_sin_cubrir_at: null,
    aviso_sin_cubrir_veces: 0,
    asignaciones_de_turno_guardia: [],
  };
}

const avisó = () => llamadas.some((l) => l.clave === AVISADO);

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  anotados = [];
});

afterEach(() => mock.timers.reset());

describe('el aviso de turno de guardia sin cubrir, en la hora de la Prestadora', () => {
  it('a las 20:30 de Argentina, el turno de las 02:00 no entra en tres horas de anticipación', async () => {
    // En hora universal son las 23:30. Leído en la hora del servidor, el turno de las 02:00
    // empezaría en dos horas y media, y saldría un aviso que todavía no corresponde.
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-01T23:30:00Z') });
    prepararLaBase({ horasAntes: 3, turno: turnoSinNadie('2026-03-02', '02:00') });

    await revisarTurnosGuardiaSinCubrir();

    assert.equal(avisó(), false, 'avisó de un turno que empieza en cinco horas y media');
  });

  it('un turno que empezó hace 22 horas en Argentina todavía se avisa', async () => {
    // Son las 20:00 del 2 de marzo en Argentina y el turno empezó el 1 a las 22:00. Leído en la
    // hora del servidor, habría empezado hace 25 horas y quedaría afuera de la ventana.
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-02T23:00:00Z') });
    prepararLaBase({ horasAntes: 3, turno: turnoSinNadie('2026-03-01', '22:00') });

    await revisarTurnosGuardiaSinCubrir();

    assert.equal(avisó(), true, anotados.join('\n'));
  });

  it('los días que pide a la base son los de Argentina', async () => {
    // Son las 22:00 del 1 de marzo en Argentina y ya la 01:00 del 2 en hora universal. Desde un
    // día atrás hasta la anticipación más un día: del 28 de febrero al 2 de marzo.
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-02T01:00:00Z') });
    prepararLaBase({ horasAntes: 1 });

    await revisarTurnosGuardiaSinCubrir();

    const consulta = llamadas.find((l) => l.clave === TURNOS_GUARDIA);
    assert.deepEqual(consulta.filtros.getAll('fecha').sort(), ['gte.2026-02-28', 'lte.2026-03-02']);
  });

  it('sin la zona horaria de la Prestadora no avisa nada', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-02T23:00:00Z') });
    prepararLaBase({ zona: null, horasAntes: 3, turno: turnoSinNadie('2026-03-01', '22:00') });

    await revisarTurnosGuardiaSinCubrir();

    assert.ok(!llamadas.some((l) => l.clave === TURNOS_GUARDIA), 'buscó turnos sin saber la hora de la Prestadora');
    assert.equal(avisó(), false);
    assert.equal(anotados.length, 1, anotados.join('\n'));
  });
});
