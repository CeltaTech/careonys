/**
 * Los incidentes de seguridad desde el Panel.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Comprueba lo que pide el paso de las brechas: que un incidente de
 * prueba sobre una Prestadora produzca la lista de pacientes alcanzados, el texto del aviso del
 * país de esa Prestadora y la cuenta regresiva que calcula la base. Y tapa los agujeros de
 * alrededor: que alguien que no es la administración entre, que la ruta vuelva a la llave
 * maestra, que una evaluación a medias se guarde, que un aviso dado se vuelva a anotar con otra
 * fecha, y que el registro de actividad guarde el contenido del incidente.
 *
 * Se levanta el router de verdad contra una base de mentira y se mira qué contesta, qué escribe y
 * con qué credencial. La cuenta regresiva la calcula una función de la base: acá se comprueba
 * que la ruta la pide para el incidente correcto y la devuelve tal cual, no el cálculo.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const INCIDENTE = '33333333-3333-3333-3333-333333333333';
const PACIENTE = '44444444-4444-4444-4444-444444444444';
const OTRO_PACIENTE = '55555555-5555-5555-5555-555555555555';
const PACIENTE_DE_OTRA = '66666666-6666-6666-6666-666666666666';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, filtros: direccion.searchParams, cuerpo, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams, cuerpo) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
    if (valor?.estado) {
      res.writeHead(valor.estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.cuerpo));
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

// El import va después de dejar puestas las variables de entorno: la conexión a la base se lee en
// el momento del import.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelIncidentesDeSeguridadRouter } = await import('../panelIncidentesDeSeguridad.js');

const app = express();
app.use(express.json());
app.use('/api/panel/incidentes-de-seguridad', panelIncidentesDeSeguridadRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}/api/panel/incidentes-de-seguridad`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Lo que va en la credencial con la que se hizo esa llamada. */
function credencialDe(llamada) {
  return JSON.parse(Buffer.from(llamada.credencial.replace('Bearer ', '').split('.')[1], 'base64url').toString());
}

function llamadasA(clave) {
  return llamadas.filter((l) => l.clave === clave);
}

/** Que todo lo que se le pidió así a la base haya ido con la credencial de quien pide. */
function todoConLaPersona(clave) {
  const hechas = llamadasA(clave);
  assert.ok(hechas.length, `no se llamó a ${clave}`);
  for (const llamada of hechas) {
    const credencial = credencialDe(llamada);
    assert.equal(credencial.sub, USUARIO, `${clave} no fue con la credencial de quien pide`);
    assert.equal(credencial.role, 'authenticated', `${clave} fue con otra credencial`);
  }
}

/** Los renglones que escribió esta ruta en el registro de actividad. La entrada al Panel la
 *  anota `requiereRolPanel` una vez por ventana, según el orden en que corren las pruebas, y no
 *  es de esta ruta. */
function registrado() {
  return llamadasA('POST /rest/v1/registro_actividad')
    .filter((llamada) => llamada.cuerpo?.accion !== 'entrada_al_panel')
    .map((llamada) => {
      const credencial = credencialDe(llamada);
      assert.equal(credencial.role, 'trabajo_sin_persona');
      assert.equal(credencial.prestadora_id, PRESTADORA);
      return llamada.cuerpo;
    });
}

// Un incidente inventado, en Costa Rica: se supo dos días después de que ocurrió.
const incidenteBase = () => ({
  id: INCIDENTE,
  prestadora_id: PRESTADORA,
  ocurrido_at: '2026-11-02T13:00:00+00:00',
  conocido_at: '2026-11-04T09:30:00+00:00',
  descripcion: 'Se perdió una computadora portátil con planillas de turnos',
  cargado_por: USUARIO,
  autoridad_notificada_at: null,
  titulares_notificados_at: null,
  responsable_notificado_at: null,
  factor_naturaleza_y_alcance: null,
  factor_quien_recibio: null,
  factor_adquiridos_o_vistos: null,
  factor_mitigacion: null,
  conclusion: null,
});

// Lo que devolvería la función de la base para ese incidente: 5 días hábiles desde que ocurrió.
const CUENTA_REGRESIVA = [
  {
    destinatario: 'autoridad', organismo: 'PRODHAB', cantidad: 5, unidad: 'dias_habiles',
    cuenta_desde: 'ocurrido', desde_at: '2026-11-02T13:00:00+00:00', vence_at: '2026-11-09T13:00:00+00:00',
    notificado_at: null, vencido: false, manda: true, fuente: 'Reglamento de la Ley 8968, artículos 38 y 39',
  },
  {
    destinatario: 'titular', organismo: null, cantidad: 5, unidad: 'dias_habiles',
    cuenta_desde: 'ocurrido', desde_at: '2026-11-02T13:00:00+00:00', vence_at: '2026-11-09T13:00:00+00:00',
    notificado_at: null, vencido: false, manda: false, fuente: 'Reglamento de la Ley 8968, artículos 38 y 39',
  },
];

// Una plantilla inventada para la prueba. La migración no carga ninguna.
const PLANTILLA_DEL_TITULAR = {
  destinatario: 'titular',
  texto: {
    'es-AR': 'Le informamos un incidente ocurrido el {ocurrido}, conocido el {conocido}: {descripcion}. Pacientes alcanzados: {cantidad_de_pacientes}. {marcador_que_no_existe}',
    en: 'We inform you of an incident on {ocurrido}.',
    'pt-BR': 'Informamos um incidente em {ocurrido}.',
  },
  contenido_minimo: ['naturaleza del incidente', 'datos comprometidos'],
  fuente: 'Plantilla de prueba',
  vigencia_desde: '2013-03-05',
  vigencia_hasta: null,
};

let quienLlama;
let incidente;
let alcanzados;
let plantillas;

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  quienLlama = { rol: 'admin_prestadora', prestadora_id: PRESTADORA };
  incidente = incidenteBase();
  alcanzados = [];
  plantillas = [PLANTILLA_DEL_TITULAR];

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [quienLlama]);
  respuestas.set('GET /rest/v1/permisos_de_acceso', () => []);
  respuestas.set('GET /rest/v1/auditoria_de_accesos', () => []);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ id: PRESTADORA, pais: 'CR' }]);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
  respuestas.set('GET /rest/v1/incidentes_de_seguridad', (filtros) => {
    if (filtros.get('id') && filtros.get('id') !== `eq.${INCIDENTE}`) return [];
    return [incidente];
  });
  respuestas.set('POST /rest/v1/incidentes_de_seguridad', (_filtros, cuerpo) => [
    { ...incidenteBase(), ...cuerpo, id: INCIDENTE },
  ]);
  respuestas.set('PATCH /rest/v1/incidentes_de_seguridad', (filtros, cuerpo) => {
    if (filtros.get('id') !== `eq.${INCIDENTE}`) return [];
    incidente = { ...incidente, ...cuerpo };
    return [incidente];
  });
  respuestas.set('GET /rest/v1/pacientes_de_incidentes', () => alcanzados);
  respuestas.set('POST /rest/v1/pacientes_de_incidentes', (_filtros, cuerpo) => {
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    // La clave foránea de la base: un paciente de otra Prestadora no entra.
    if (filas.some((fila) => fila.paciente_id === PACIENTE_DE_OTRA)) {
      return { estado: 409, cuerpo: { code: '23503', message: 'insert or update violates foreign key constraint' } };
    }
    for (const fila of filas) {
      if (!alcanzados.some((a) => a.paciente_id === fila.paciente_id)) {
        alcanzados.push({
          id: `fila-${fila.paciente_id}`,
          paciente_id: fila.paciente_id,
          created_at: '2026-11-04T10:00:00+00:00',
          paciente: { id: fila.paciente_id, persona: { nombre_visible: `Paciente ${alcanzados.length + 1}` } },
        });
      }
    }
    return [];
  });
  respuestas.set('POST /rest/v1/rpc/cuenta_regresiva_del_incidente', () => CUENTA_REGRESIVA);
  respuestas.set('GET /rest/v1/plantillas_de_aviso_de_brechas', () => plantillas);
});

describe('el incidente de prueba, de punta a punta', () => {
  it('produce la lista de pacientes alcanzados, el aviso del país y la cuenta regresiva', async () => {
    const alta = await pedir('POST', '/', {
      ocurrido_at: '2026-11-02T13:00:00Z',
      conocido_at: '2026-11-04T09:30:00Z',
      descripcion: '  Se perdió una computadora portátil con planillas de turnos  ',
    });
    assert.equal(alta.estado, 201);
    const escrito = llamadasA('POST /rest/v1/incidentes_de_seguridad')[0].cuerpo;
    assert.equal(escrito.prestadora_id, PRESTADORA, 'la Prestadora sale de la que la base deja ver');
    assert.equal(escrito.descripcion, 'Se perdió una computadora portátil con planillas de turnos');
    assert.equal(escrito.cargado_por, undefined, 'quién cargó lo pone la base, no el pedido');

    const agregados = await pedir('POST', `/${INCIDENTE}/pacientes`, { pacientes: [PACIENTE, OTRO_PACIENTE, PACIENTE] });
    assert.equal(agregados.estado, 201);
    assert.equal(agregados.cuerpo.pacientes.length, 2, 'un paciente repetido no se duplica');
    const upsert = llamadasA('POST /rest/v1/pacientes_de_incidentes')[0];
    assert.equal(upsert.filtros.get('on_conflict'), 'incidente_id,paciente_id');

    const visto = await pedir('GET', `/${INCIDENTE}?zona=America/Costa_Rica`);
    assert.equal(visto.estado, 200);
    assert.deepEqual(visto.cuerpo.pacientes.map((p) => p.paciente_id), [PACIENTE, OTRO_PACIENTE]);
    assert.deepEqual(visto.cuerpo.plazos, CUENTA_REGRESIVA);
    assert.equal(visto.cuerpo.plazos.filter((p) => p.manda).length, 1, 'manda un solo plazo');

    const rpc = llamadasA('POST /rest/v1/rpc/cuenta_regresiva_del_incidente')[0];
    assert.deepEqual(rpc.cuerpo, { p_incidente: INCIDENTE });

    assert.equal(visto.cuerpo.avisos.length, 1);
    const [aviso] = visto.cuerpo.avisos;
    assert.equal(aviso.destinatario, 'titular');
    assert.match(aviso.texto, /ocurrido el 02\/11\/2026,? 07:00/, 'la fecha va en la hora de quien mira');
    assert.match(aviso.texto, /Se perdió una computadora portátil/);
    assert.match(aviso.texto, /Pacientes alcanzados: 2\./);
    assert.match(aviso.texto, /\{marcador_que_no_existe\}/, 'un marcador desconocido queda a la vista');
    assert.deepEqual(aviso.contenido_minimo, PLANTILLA_DEL_TITULAR.contenido_minimo);

    for (const clave of [
      'POST /rest/v1/incidentes_de_seguridad',
      'GET /rest/v1/incidentes_de_seguridad',
      'POST /rest/v1/pacientes_de_incidentes',
      'GET /rest/v1/pacientes_de_incidentes',
      'POST /rest/v1/rpc/cuenta_regresiva_del_incidente',
      'GET /rest/v1/plantillas_de_aviso_de_brechas',
    ]) {
      todoConLaPersona(clave);
    }

    const renglones = registrado();
    assert.deepEqual(renglones.map((r) => r.accion), [
      'alta_de_incidente_de_seguridad',
      'alta_de_paciente_alcanzado_por_incidente',
    ]);
    for (const renglon of renglones) {
      assert.equal(renglon.usuario_id, USUARIO);
      assert.equal(renglon.detalle, null, 'el registro no guarda el contenido del incidente');
      assert.ok(!JSON.stringify(renglon).includes('computadora'), 'la descripción no entra al registro');
    }
  });

  it('un país sin plantilla no tiene texto de aviso', async () => {
    plantillas = [];
    const visto = await pedir('GET', `/${INCIDENTE}`);
    assert.equal(visto.estado, 200);
    assert.deepEqual(visto.cuerpo.avisos, []);
    assert.deepEqual(visto.cuerpo.plazos, CUENTA_REGRESIVA, 'la cuenta regresiva sale igual');
  });

  it('una plantilla vencida antes del incidente no se usa', async () => {
    plantillas = [{ ...PLANTILLA_DEL_TITULAR, vigencia_hasta: '2020-01-01' }];
    const visto = await pedir('GET', `/${INCIDENTE}`);
    assert.deepEqual(visto.cuerpo.avisos, []);
  });

  it('la lista trae todos los incidentes, se haya avisado o no', async () => {
    const lista = await pedir('GET', '/');
    assert.equal(lista.estado, 200);
    assert.equal(lista.cuerpo.incidentes.length, 1);
    todoConLaPersona('GET /rest/v1/incidentes_de_seguridad');
  });
});

describe('lo que no entra', () => {
  it('quien no es la administración no ve ni carga nada', async () => {
    quienLlama = { rol: 'coordinador', prestadora_id: PRESTADORA };
    const lista = await pedir('GET', '/');
    const alta = await pedir('POST', '/', { ocurrido_at: '2026-11-02T13:00:00Z', conocido_at: '2026-11-04T09:30:00Z', descripcion: 'x' });
    assert.equal(lista.estado, 403);
    assert.equal(alta.estado, 403);
    assert.equal(llamadasA('GET /rest/v1/incidentes_de_seguridad').length, 0);
    assert.equal(llamadasA('POST /rest/v1/incidentes_de_seguridad').length, 0);
  });

  it('un incidente sin fechas o sin descripción no se carga', async () => {
    for (const cuerpo of [
      { conocido_at: '2026-11-04T09:30:00Z', descripcion: 'algo' },
      { ocurrido_at: '2026-11-02T13:00:00Z', descripcion: 'algo' },
      { ocurrido_at: '2026-11-02T13:00:00Z', conocido_at: '2026-11-04T09:30:00Z', descripcion: '   ' },
      { ocurrido_at: 'ayer', conocido_at: '2026-11-04T09:30:00Z', descripcion: 'algo' },
    ]) {
      const alta = await pedir('POST', '/', cuerpo);
      assert.equal(alta.estado, 400);
      assert.equal(alta.cuerpo.motivo, 'faltan_datos');
    }
    assert.equal(llamadasA('POST /rest/v1/incidentes_de_seguridad').length, 0);
  });

  it('no se puede saber de un incidente antes de que ocurra', async () => {
    const alta = await pedir('POST', '/', {
      ocurrido_at: '2026-11-04T09:30:00Z', conocido_at: '2026-11-02T13:00:00Z', descripcion: 'algo',
    });
    assert.equal(alta.estado, 400);
    assert.equal(alta.cuerpo.motivo, 'fecha_anterior');
  });

  it('un paciente de otra Prestadora no entra, y se contesta como si no existiera', async () => {
    const agregado = await pedir('POST', `/${INCIDENTE}/pacientes`, { paciente_id: PACIENTE_DE_OTRA });
    assert.equal(agregado.estado, 404);
    assert.equal(agregado.cuerpo.motivo, 'paciente_no_encontrado');
    assert.equal(registrado().length, 0);
  });

  it('un incidente que la base no deja ver es «no encontrado»', async () => {
    const otro = '77777777-7777-7777-7777-777777777777';
    assert.equal((await pedir('GET', `/${otro}`)).estado, 404);
    assert.equal((await pedir('POST', `/${otro}/pacientes`, { paciente_id: PACIENTE })).estado, 404);
    assert.equal((await pedir('POST', `/${otro}/notificado`, { destinatario: 'autoridad' })).estado, 404);
    assert.equal(llamadasA('POST /rest/v1/pacientes_de_incidentes').length, 0);
  });
});

describe('la evaluación de los cuatro factores', () => {
  const evaluacion = {
    factor_naturaleza_y_alcance: 'Nombres y horarios de turnos, sin diagnósticos',
    factor_quien_recibio: 'Desconocido',
    factor_adquiridos_o_vistos: 'El equipo tenía el disco cifrado',
    factor_mitigacion: 'Se cambiaron las contraseñas y se bloqueó el equipo',
    conclusion: 'baja_probabilidad_de_compromiso',
  };

  it('se guarda con los cinco datos, y el registro dice qué columnas cambiaron sin su contenido', async () => {
    const guardada = await pedir('PUT', `/${INCIDENTE}/evaluacion`, evaluacion);
    assert.equal(guardada.estado, 200);
    const cambio = llamadasA('PATCH /rest/v1/incidentes_de_seguridad')[0];
    assert.deepEqual(cambio.cuerpo, evaluacion);
    assert.equal(cambio.cuerpo.evaluado_por, undefined, 'quién evaluó lo pone la base');
    todoConLaPersona('PATCH /rest/v1/incidentes_de_seguridad');

    const [renglon] = registrado();
    assert.equal(renglon.accion, 'evaluacion_de_incidente_de_seguridad');
    assert.deepEqual(renglon.campos_cambiados, Object.keys(evaluacion));
    assert.ok(!JSON.stringify(renglon).includes('cifrado'));
  });

  it('a medias, o con una conclusión desconocida, no se guarda', async () => {
    const sinUnFactor = { ...evaluacion, factor_mitigacion: '' };
    const conclusionRara = { ...evaluacion, conclusion: 'no_pasa_nada' };
    assert.equal((await pedir('PUT', `/${INCIDENTE}/evaluacion`, sinUnFactor)).estado, 400);
    assert.equal((await pedir('PUT', `/${INCIDENTE}/evaluacion`, conclusionRara)).estado, 400);
    assert.equal(llamadasA('PATCH /rest/v1/incidentes_de_seguridad').length, 0);
  });
});

describe('los avisos dados', () => {
  it('se anota a quién se avisó y cuándo', async () => {
    const anotado = await pedir('POST', `/${INCIDENTE}/notificado`, {
      destinatario: 'autoridad', notificado_at: '2026-11-05T15:00:00Z',
    });
    assert.equal(anotado.estado, 200);
    const cambio = llamadasA('PATCH /rest/v1/incidentes_de_seguridad')[0];
    assert.deepEqual(cambio.cuerpo, { autoridad_notificada_at: '2026-11-05T15:00:00.000Z' });

    const [renglon] = registrado();
    assert.equal(renglon.accion, 'notificacion_de_incidente_de_seguridad');
    assert.deepEqual(renglon.campos_cambiados, ['autoridad_notificada_at']);
  });

  it('un aviso ya dado no se vuelve a anotar', async () => {
    incidente = { ...incidente, titulares_notificados_at: '2026-11-05T15:00:00+00:00' };
    const otraVez = await pedir('POST', `/${INCIDENTE}/notificado`, { destinatario: 'titular' });
    assert.equal(otraVez.estado, 409);
    assert.equal(otraVez.cuerpo.motivo, 'aviso_ya_dado');
    assert.equal(llamadasA('PATCH /rest/v1/incidentes_de_seguridad').length, 0);
  });

  it('un destinatario desconocido o un aviso anterior al incidente no se anotan', async () => {
    const desconocido = await pedir('POST', `/${INCIDENTE}/notificado`, { destinatario: 'prensa' });
    assert.equal(desconocido.estado, 400);
    const anterior = await pedir('POST', `/${INCIDENTE}/notificado`, {
      destinatario: 'autoridad', notificado_at: '2026-10-01T00:00:00Z',
    });
    assert.equal(anterior.estado, 400);
    assert.equal(anterior.cuerpo.motivo, 'fecha_anterior');
    assert.equal(llamadasA('PATCH /rest/v1/incidentes_de_seguridad').length, 0);
  });
});
