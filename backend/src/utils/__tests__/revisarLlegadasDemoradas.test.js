/**
 * Lo que el sistema anota solo cuando nadie apretó nada (pendiente #101).
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El producto se apoya en el acto de la persona: quien aprieta «salgo
 * ahora» y avisa que va demorado hizo algo, y eso lo protege. Lo que saca una máquina es un hecho,
 * no un mérito. De ahí salen cinco cosas que hay que garantizar, y ninguna se ve mirando el
 * código:
 *
 *   1. LOS DOS REGISTROS AUTOMÁTICOS NO SE MEZCLAN NUNCA CON EL AVISO DE UNA PERSONA. Se anotan
 *      con códigos de origen propios y sin nadie en «quién lo reportó», porque no lo reportó
 *      nadie.
 *   2. LA AUSENCIA DE TODO TAMBIÉN ES UN REGISTRO. Pasó la hora y no hay ni llegada, ni salida, ni
 *      aviso: eso se anota como el hecho que es.
 *   3. QUIEN MARCÓ LA SALIDA NUNCA CAE EN EL SEGUNDO REGISTRO, aunque de su viaje no se pueda
 *      estimar nada. Anotarle «ni aviso ni salida» a alguien que sí marcó la salida sería escribir
 *      algo falso.
 *   4. LOS MINUTOS DE ATRASO LOS DECIDE LA PRESTADORA. El mismo viaje, con dos configuraciones
 *      distintas, da dos resultados distintos.
 *   5. SI ALGUIEN YA AVISÓ, EL SISTEMA NO REPITE. El Coordinador ya está enterado; una segunda
 *      fila por el mismo viaje sólo le llena la pantalla.
 *
 * Y una que es la medida de todo esto: LA DETECCIÓN POR CÁLCULO LLEGA ANTES DE LA HORA DE INICIO.
 * Ahí están los minutos con los que la Prestadora puede cubrir el turno de guardia; una alerta que aparece
 * cuando la hora ya pasó llega tarde para lo único que sirve.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import {
  FUENTE_AVISO_DEMORA_ASISTENTE,
  FUENTE_AVISO_TELEFONICO,
  FUENTE_CALCULO_LLEGADA_TARDIA,
  FUENTE_SIN_AVISO_NI_SALIDA,
  laDioUnaPersona,
} from '../fuentesAlertaTemprana.js';
import { MINUTOS_DEMORA_POR_OMISION } from '../llegadaEstimada.js';

// El servidor de verdad cuenta en hora universal y la Prestadora está en Argentina, tres horas
// atrás. Los turnos de guardia se cargan en la hora de la Prestadora: si el proceso la leyera en
// la del servidor, cada turno le quedaría corrido tres horas y las cuentas de abajo darían mal.
process.env.TZ = 'UTC';
const ZONA = 'America/Argentina/Buenos_Aires';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const TURNO_GUARDIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TURNO_GUARDIA_AJENA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PACIENTE = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// El domicilio del Paciente, y dos puntos de salida: uno a la vuelta de la esquina y otro a
// treinta y tres kilómetros, que a la velocidad media del producto son más de dos horas de viaje.
const DOMICILIO = { lat: -34.6, lng: -58.4 };
const SALIDA_CERCA = { lat: -34.604, lng: -58.4 };
const SALIDA_LEJOS = { lat: -34.9, lng: -58.4 };
// Un domicilio temporal lejísimos: es el caso de quien está pasando una temporada en la casa de
// un hijo, y lo que prueba que la cuenta se hace contra el domicilio que rige ese día.
const DOMICILIO_TEMPORAL = { lat: -35.2, lng: -58.4 };

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
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

const { adentro } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const revisarLlegadasDemoradas = adentro((await import('../revisarLlegadasDemoradas.js')).revisarLlegadasDemoradas);
const { llegadaEstimadaDeTurnoGuardia } = await import('../estimarLlegadaDeTurnoGuardia.js');
const { conexionDe } = await import('../../__tests__/adentroDeUnaPrestadora.js');
const supabase = conexionDe();

after(() => {
  baseFalsa.close();
});

/** La fecha y la hora tal como las guarda la base, en la hora de la Prestadora. */
function enDosPartes(momento) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(momento)
      .map(({ type, value }) => [type, value])
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}:${partes.second}` };
}

function haceUnRato(minutos) {
  return new Date(Date.now() - minutos * 60 * 1000).toISOString();
}

/** Un turno de guardia programado que empieza dentro de tantos minutos (negativo: ya empezó). */
function turnoGuardiaQueEmpiezaEn(minutos, extra = {}) {
  const inicio = new Date(Date.now() + minutos * 60 * 1000);
  const { fecha, hora } = enDosPartes(inicio);
  return {
    id: TURNO_GUARDIA,
    prestadora_id: PRESTADORA,
    paciente_id: PACIENTE,
    fecha,
    hora_inicio: hora,
    salida_checkin_at: null,
    salida_lat: null,
    salida_lng: null,
    ...extra,
  };
}

/** Cuándo empieza, de verdad, un turno de guardia de las de arriba. Argentina está siempre tres horas atrás. */
function inicioDe(turno_guardia) {
  return new Date(`${turno_guardia.fecha}T${turno_guardia.hora_inicio}-03:00`);
}

let turnosGuardiaEnLaBase;
let alertasEnLaBase;
let nivelesDeEscalada;
/** Dónde se atiende al Paciente el día del turno de guardia, que puede no ser el del Legajo del Paciente. */
let domicilioDelDia;

function filaQuePasaLosFiltros(url, filas) {
  const parametros = new URL(url, 'http://interno').searchParams;
  return filas.filter((fila) =>
    [...parametros.entries()].every(([campo, condicion]) => {
      if (!Object.hasOwn(fila, campo)) return true;
      if (condicion === 'is.null') return fila[campo] === null || fila[campo] === undefined;
      if (condicion === 'not.is.null') return fila[campo] !== null && fila[campo] !== undefined;
      if (!condicion.startsWith('eq.')) return true;
      return String(fila[campo]) === condicion.slice(3);
    })
  );
}

/** Los ids que trae un filtro `campo=in.(a,b,c)`, que es como los pide el cliente de la base. */
function idsPedidos(url, campo) {
  const crudo = new URL(url, 'http://interno').searchParams.get(campo) ?? '';
  if (!crudo.startsWith('in.(')) return [];
  return crudo
    .slice('in.('.length, -1)
    .split(',')
    .map((id) => id.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

/** Las alertas que el proceso anotó, en el orden en que las anotó. */
function alertasAnotadas() {
  return llamadas
    .filter((l) => l.clave === 'POST /rest/v1/alertas_tempranas_turno_guardia')
    .map((l) => (Array.isArray(l.cuerpo) ? l.cuerpo[0] : l.cuerpo));
}

/** La consulta con la que el proceso fue a buscar los turnos de guardia. */
function consultaDeTurnosGuardia() {
  return llamadas.find((l) => l.clave === 'GET /rest/v1/turnos_guardia');
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  alertasEnLaBase = [];
  nivelesDeEscalada = [];
  turnosGuardiaEnLaBase = [];
  domicilioDelDia = { ...DOMICILIO, es_temporal: false, motivo: null };

  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, zona_horaria: ZONA }]);
  respuestas.set('GET /rest/v1/configuracion_escalada_relevo', () => nivelesDeEscalada);
  respuestas.set('GET /rest/v1/turnos_guardia', ({ url }) => filaQuePasaLosFiltros(url, turnosGuardiaEnLaBase));
  respuestas.set('GET /rest/v1/alertas_tempranas_turno_guardia', ({ url }) =>
    filaQuePasaLosFiltros(url, alertasEnLaBase)
  );
  respuestas.set('POST /rest/v1/alertas_tempranas_turno_guardia', () => []);
  // Contesta por los turnos de guardia que le preguntaron, y no por las que estén cargadas en la base
  // falsa. La diferencia importa: las pruebas que llaman a la estimación con un turno de guardia en la
  // mano no cargan nada en `turnosGuardiaEnLaBase`, y una respuesta vacía las mandaba a la red de
  // seguridad de `pacientesDeTurnoGuardia.js` —la columna vieja `turnos_guardia.paciente_id`—, o sea a
  // probar un camino que no era el que decían probar.
  respuestas.set('GET /rest/v1/turno_guardia_pacientes', ({ url }) =>
    idsPedidos(url, 'turno_guardia_id').map((turnoGuardiaId) => ({
      turno_guardia_id: turnoGuardiaId,
      // Las coordenadas viven en los datos del Paciente, no en su fila.
      pacientes: { id: PACIENTE, persona: { nombre_visible: 'Paciente de prueba', ...DOMICILIO } },
    }))
  );
  // La base devuelve el domicilio en partes, y no el renglón armado.
  respuestas.set('POST /rest/v1/rpc/domicilios_de_pacientes_en', () => [
    {
      paciente_id: PACIENTE,
      domicilio_temporal_id: domicilioDelDia.es_temporal ? 'una-temporal' : null,
      calle: null,
      numero: null,
      piso: null,
      unidad: null,
      lugar: null,
      desde: null,
      hasta: null,
      ...domicilioDelDia,
    },
  ]);
});

// ============================================================================
// La cuenta: se detecta antes de la hora, que es para lo que sirve
// ============================================================================

describe('cálculo de llegada tardía — los minutos de aviso', () => {
  it('con la salida marcada lejos, la alerta se anota ANTES de la hora de inicio', async () => {
    const turno_guardia = turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(0), salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng });
    turnosGuardiaEnLaBase = [turno_guardia];

    await revisarLlegadasDemoradas();

    const [alerta] = alertasAnotadas();
    assert.ok(alerta, 'tiene que quedar anotada la llegada tardía');
    assert.equal(alerta.fuente, FUENTE_CALCULO_LLEGADA_TARDIA);
    assert.equal(alerta.turno_guardia_id, TURNO_GUARDIA);
    assert.equal(alerta.prestadora_id, PRESTADORA);

    // Ésta es la medida de todo el mecanismo: cuántos minutos antes se enteró la Prestadora.
    const minutosDeAnticipacion = (inicioDe(turno_guardia).getTime() - new Date(alerta.detectado_at).getTime()) / 60000;
    assert.ok(minutosDeAnticipacion > 0, `la alerta llegó ${minutosDeAnticipacion} minutos después de la hora de inicio`);
  });

  it('la cuenta no la reporta nadie: no lleva persona ni motivo', async () => {
    turnosGuardiaEnLaBase = [
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(0), salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng }),
    ];

    await revisarLlegadasDemoradas();

    const [alerta] = alertasAnotadas();
    // Poner ahí a la persona del turno de guardia diría que ella avisó, que es lo que no pasó.
    assert.equal(alerta.reportado_por, undefined);
    assert.equal(alerta.motivo, null);
    assert.equal(laDioUnaPersona(alerta.fuente), false);
    assert.notEqual(alerta.fuente, FUENTE_AVISO_DEMORA_ASISTENTE);
  });

  it('quien sale a tiempo y de cerca no queda anotado', async () => {
    turnosGuardiaEnLaBase = [
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(0), salida_lat: SALIDA_CERCA.lat, salida_lng: SALIDA_CERCA.lng }),
    ];

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });

  it('la cuenta se hace contra el domicilio que rige ese día, no contra el del Legajo del Paciente', async () => {
    // Mismo viaje corto, pero ese día se lo atiende en otro lado, a sesenta kilómetros.
    domicilioDelDia = { ...DOMICILIO_TEMPORAL, es_temporal: true, motivo: 'temporada en casa de un familiar' };
    turnosGuardiaEnLaBase = [
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(0), salida_lat: SALIDA_CERCA.lat, salida_lng: SALIDA_CERCA.lng }),
    ];

    await revisarLlegadasDemoradas();

    const [alerta] = alertasAnotadas();
    assert.ok(alerta, 'medir contra la casa de siempre habría dicho que llega a horario');
    assert.equal(alerta.fuente, FUENTE_CALCULO_LLEGADA_TARDIA);
  });
});

// ============================================================================
// Los minutos los decide la Prestadora
// ============================================================================

describe('el margen lo decide la Prestadora, no el código', () => {
  it('el mismo viaje no se anota si la Prestadora tolera más minutos', async () => {
    const turno_guardia = turnoGuardiaQueEmpiezaEn(20, {
      salida_checkin_at: haceUnRato(0),
      salida_lat: SALIDA_LEJOS.lat,
      salida_lng: SALIDA_LEJOS.lng,
    });

    // Primero con lo que trae de fábrica: se anota.
    turnosGuardiaEnLaBase = [turno_guardia];
    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 1);

    // Y ahora con un margen configurado que cubre el viaje entero: no se anota nada.
    llamadas = [];
    nivelesDeEscalada = [{ minutos_demora: 400 }];
    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
    assert.notEqual(400, MINUTOS_DEMORA_POR_OMISION);
  });

  it('con varios niveles manda el primer escalón, el más chico', async () => {
    nivelesDeEscalada = [{ minutos_demora: 400 }, { minutos_demora: 5 }];
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];

    await revisarLlegadasDemoradas();
    // Empezó hace treinta minutos: con el escalón de cinco ya está vencida.
    assert.equal(alertasAnotadas()[0].fuente, FUENTE_SIN_AVISO_NI_SALIDA);
  });
});

// ============================================================================
// La ausencia de todo también es un registro
// ============================================================================

describe('ni aviso ni salida — la ausencia de todo, anotada como hecho', () => {
  it('pasada la hora con su margen y sin nada, queda el registro', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-(MINUTOS_DEMORA_POR_OMISION + 5))];

    await revisarLlegadasDemoradas();

    const [alerta] = alertasAnotadas();
    assert.ok(alerta, 'la ausencia de todo también se anota');
    assert.equal(alerta.fuente, FUENTE_SIN_AVISO_NI_SALIDA);
    assert.equal(alerta.motivo, null);
    assert.equal(alerta.reportado_por, undefined);
  });

  it('antes de que se cumpla el margen no se anota nada', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(20)];
    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });

  it('quien marcó la salida nunca queda anotado como «ni aviso ni salida»', async () => {
    // Marcó la salida, pero el teléfono no pudo ubicarla: de ese viaje no se puede estimar nada.
    // No saber no es no haber avisado, y anotarle lo contrario sería escribir algo falso.
    turnosGuardiaEnLaBase = [
      turnoGuardiaQueEmpiezaEn(-60, { salida_checkin_at: haceUnRato(70), salida_lat: null, salida_lng: null }),
    ];

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });

  it('una guardia de anteayer ya no se anota: cubrirla no sirve de nada', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-60 * 30)];
    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });
});

// ============================================================================
// El acto de la persona manda: el sistema no lo repite ni lo pisa
// ============================================================================

describe('si alguien ya avisó, el sistema no agrega nada', () => {
  for (const fuente of [FUENTE_AVISO_DEMORA_ASISTENTE, FUENTE_AVISO_TELEFONICO]) {
    it(`con un aviso abierto de origen «${fuente}» no se anota nada nuevo`, async () => {
      turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
      alertasEnLaBase = [
        { turno_guardia_id: TURNO_GUARDIA, prestadora_id: PRESTADORA, fuente, resuelto_at: null },
      ];

      await revisarLlegadasDemoradas();
      assert.equal(alertasAnotadas().length, 0);
    });
  }

  it('el mismo origen no se anota dos veces por la misma guardia', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    // Ya se anotó una vez y el Coordinador la resolvió: no vuelve a anotarse por lo mismo.
    alertasEnLaBase = [
      {
        turno_guardia_id: TURNO_GUARDIA,
        prestadora_id: PRESTADORA,
        fuente: FUENTE_SIN_AVISO_NI_SALIDA,
        resuelto_at: haceUnRato(5),
      },
    ];

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });

  it('una alerta resuelta de otro origen no impide anotar la que corresponde', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    alertasEnLaBase = [
      {
        turno_guardia_id: TURNO_GUARDIA,
        prestadora_id: PRESTADORA,
        fuente: FUENTE_CALCULO_LLEGADA_TARDIA,
        resuelto_at: haceUnRato(5),
      },
    ];

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas()[0].fuente, FUENTE_SIN_AVISO_NI_SALIDA);
  });

  it('sin poder leer lo que ya está anotado no se anota nada', async () => {
    // Repetirle al Coordinador una alerta que ya existe le llena la pantalla de filas iguales, y
    // eso termina en un filtro del correo. Ante la duda, no se escribe.
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    respuestas.set('GET /rest/v1/alertas_tempranas_turno_guardia', () => undefined);

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });
});

// ============================================================================
// Aislamiento y alcance de la consulta
// ============================================================================

describe('a quién mira este proceso', () => {
  it('sin la zona horaria de la Prestadora no revisa sus turnos de guardia', async () => {
    respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, zona_horaria: null }]);
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    const avisarDeVerdad = console.error;
    const anotados = [];
    console.error = (...partes) => anotados.push(partes.join(' '));
    try {
      await revisarLlegadasDemoradas();
    } finally {
      console.error = avisarDeVerdad;
    }
    assert.equal(consultaDeTurnosGuardia(), undefined);
    assert.equal(alertasAnotadas().length, 0);
    assert.equal(anotados.length, 1, anotados.join('\n'));
  });

  it('la consulta va acotada a una Prestadora por vez', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    await revisarLlegadasDemoradas();
    assert.ok(consultaDeTurnosGuardia().url.includes(`prestadora_id=eq.${PRESTADORA}`), consultaDeTurnosGuardia().url);
  });

  it('la guardia de otra Prestadora no entra en la revisión de ésta', async () => {
    turnosGuardiaEnLaBase = [
      turnoGuardiaQueEmpiezaEn(-30, { id: TURNO_GUARDIA_AJENA, prestadora_id: OTRA_PRESTADORA }),
    ];

    await revisarLlegadasDemoradas();
    assert.equal(alertasAnotadas().length, 0);
  });

  it('no mira guardias sin Asistente, ni guardias que ya marcaron la llegada', async () => {
    turnosGuardiaEnLaBase = [turnoGuardiaQueEmpiezaEn(-30)];
    await revisarLlegadasDemoradas();
    const { url } = consultaDeTurnosGuardia();
    // De los huecos sin cubrir se ocupa otro proceso, que sabe en qué punto está la búsqueda.
    assert.ok(url.includes('asistente_id=not.is.null'), url);
    assert.ok(url.includes('checkin_at=is.null'), url);
    assert.ok(url.includes('estado=eq.programada'), url);
  });
});

// ============================================================================
// La estimación, mirada de cerca
// ============================================================================

describe('estimarLlegadaDeTurnoGuardia — qué devuelve y qué no', () => {
  it('sin marca de salida no hay estimación, y eso se dice', async () => {
    const estimada = await llegadaEstimadaDeTurnoGuardia(supabase, PRESTADORA, turnoGuardiaQueEmpiezaEn(20));
    assert.equal(estimada, null);
  });

  it('con salida marcada pero sin punto tampoco: no se inventa una hora', async () => {
    const estimada = await llegadaEstimadaDeTurnoGuardia(
      supabase,
      PRESTADORA,
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(5), salida_lat: null, salida_lng: null })
    );
    assert.equal(estimada, null);
  });

  it('con salida y punto devuelve una hora posterior a la salida', async () => {
    const salidaAt = haceUnRato(5);
    const estimada = await llegadaEstimadaDeTurnoGuardia(
      supabase,
      PRESTADORA,
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: salidaAt, salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng })
    );
    assert.ok(estimada instanceof Date);
    assert.ok(estimada.getTime() > new Date(salidaAt).getTime());
  });

  it('lo que devuelve es una hora y nunca un punto: el lugar del que salió no viaja', async () => {
    const estimada = await llegadaEstimadaDeTurnoGuardia(
      supabase,
      PRESTADORA,
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(5), salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng })
    );
    // Es la garantía de que de acá no sale la ubicación de nadie hacia ninguna pantalla.
    assert.equal(typeof estimada.getTime(), 'number');
    assert.equal(Object.hasOwn(estimada, 'lat'), false);
    assert.equal(Object.hasOwn(estimada, 'lng'), false);
  });

  it('sin salida marcada ni siquiera se le pregunta a la base por el domicilio', async () => {
    llamadas = [];
    await llegadaEstimadaDeTurnoGuardia(supabase, PRESTADORA, turnoGuardiaQueEmpiezaEn(20));
    assert.equal(llamadas.length, 0);
  });

  it('sin Prestadora no hay estimación: un filtro vacío no acota nada', async () => {
    // El aislamiento lo sostiene el filtro, no la pantalla: preguntar por los Pacientes de una
    // turno de guardia sin decir de quién es sería una consulta que alcanza a cualquiera.
    llamadas = [];
    const estimada = await llegadaEstimadaDeTurnoGuardia(
      supabase,
      null,
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(5), salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng })
    );
    assert.equal(estimada, null);
    assert.equal(llamadas.length, 0);
  });

  it('los Pacientes de la guardia se piden acotados a esa Prestadora', async () => {
    llamadas = [];
    await llegadaEstimadaDeTurnoGuardia(
      supabase,
      PRESTADORA,
      turnoGuardiaQueEmpiezaEn(20, { salida_checkin_at: haceUnRato(5), salida_lat: SALIDA_LEJOS.lat, salida_lng: SALIDA_LEJOS.lng })
    );
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/turno_guardia_pacientes');
    assert.ok(consulta, 'tiene que preguntar por los Pacientes de la guardia');
    assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`), consulta.url);
  });
});
