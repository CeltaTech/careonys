/**
 * Los contactos de emergencia de un Cliente: desde el Panel, desde la aplicación del Cliente y lo
 * que ve el Asistente durante el turno de guardia.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Lo que se sostiene acá:
 *
 *   1. QUE NUNCA PASEN MÁS DE TRES, y que viajen a la base en el orden en que llegaron, que es el
 *      orden de prioridad.
 *   2. QUE UNA PERSONA NUEVA LLEGUE CON NOMBRE, APELLIDO Y TELÉFONO, y que lo que falta o está mal
 *      escrito se rechace antes de llegar a la base.
 *   3. QUE LO QUE LA BASE RECHAZA —una persona de otra Prestadora, o una que el titular no puede
 *      elegir— SALGA COMO MOTIVO, sin el texto de la base.
 *   4. QUE CADA LADO SALGA CON SU CREDENCIAL: el Panel con la de quien pide; la aplicación con el
 *      trabajo de la Prestadora y diciéndole a la base en nombre de qué titular.
 *   5. QUE EN LA APLICACIÓN LO VEA Y LO CAMBIE SÓLO EL TITULAR.
 *   6. QUE EL ASISTENTE RECIBA LOS CONTACTOS SÓLO CON EL TURNO DE GUARDIA EN CURSO: después de marcar
 *      la llegada y antes de marcar la salida.
 *   7. QUE EL CLIENTE QUE LA BASE NO LE MUESTRA A QUIEN PIDE NO EXISTA: no se cambia nada a su nombre.
 *
 * Qué daría con el sistema roto: si el tope se sacara del pedido, el cuarto contacto llegaría a la
 * base; si se reordenara la lista, la prioridad viajaría cambiada; si el Asistente recibiera los
 * contactos con el turno sin empezar o ya terminado, falla la comprobación de la respuesta vacía.
 *
 * La base es de mentira. Lo que ella comprueba por dentro —el tope de tres en la tabla, que la
 * persona sea de la misma Prestadora, quién puede cambiar la lista, el alta de la persona nueva y el
 * registro de actividad— no se ve desde acá.
 *
 * Datos inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const CLIENTE = '33333333-3333-4333-8333-333333333333';
const CLIENTE_AJENO = '39393939-3939-4939-8939-393939393939';
const PERSONA_1 = '44444444-4444-4444-8444-444444444441';
const PERSONA_2 = '44444444-4444-4444-8444-444444444442';
const PERSONA_3 = '44444444-4444-4444-8444-444444444443';
const PERSONA_4 = '44444444-4444-4444-8444-444444444444';
const LEGAJO = '55555555-5555-4555-8555-555555555555';
const PACIENTE = '66666666-6666-4666-8666-666666666666';

const FILAS_DE_LA_BASE = [
  {
    prioridad: 2, persona_id: PERSONA_2, nombre: 'Pablo Inventado', telefonos: ['1155550002'],
    es_contratante: false, es_paciente: false, es_responsable_de_pagos: false, es_persona_autorizada: true,
  },
  {
    prioridad: 1, persona_id: PERSONA_1, nombre: 'Ana Inventada', telefonos: ['1155550001', '1155550011'],
    es_contratante: true, es_paciente: false, es_responsable_de_pagos: true, es_persona_autorizada: false,
  },
];

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  const partes = [];
  req.on('data', (parte) => partes.push(parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const crudo = Buffer.concat(partes).toString();
    let cuerpo = null;
    if ((req.headers['content-type'] || '').includes('json') && crudo) {
      try { cuerpo = JSON.parse(crudo); } catch { cuerpo = null; }
    }
    llamadas.push({ clave, url: decodeURIComponent(req.url), cuerpo, autorizacion: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: decodeURIComponent(req.url), cuerpo }) : preparada ?? [];
    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.__cuerpo));
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

const { default: express } = await import('express');
await import('express-async-errors');
const { panelContactosDeEmergenciaRouter } = await import('../panelContactosDeEmergencia.js');
const { appClientesContactosDeEmergenciaRouter } = await import('../appClientesContactosDeEmergencia.js');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/panel', panelContactosDeEmergenciaRouter);
app.use('/app', appClientesContactosDeEmergenciaRouter);
app.use('/asistente', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

const credencial = () => sesionDePrueba(USUARIO);
const llamadasA = (clave) => llamadas.filter((l) => l.clave === clave);
const rpc = (nombre) => llamadasA(`POST /rest/v1/rpc/${nombre}`);

function contenidoDe(autorizacion) {
  return JSON.parse(Buffer.from(String(autorizacion).replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString() || '{}');
}

async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: { Authorization: credencial() } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(`${DIRECCION}${ruta}`, opciones);
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

function sesionDelPanel() {
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'admin_prestadora', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_la_sesion', () => true);
  // Quien pide ve sólo a su Cliente, como con la política.
  respuestas.set('GET /rest/v1/clientes', ({ url }) => (
    url.includes(`id=eq.${CLIENTE}`) ? [{ id: CLIENTE, prestadora_id: PRESTADORA }] : []
  ));
}

function sesionDelCliente({ titular = true } = {}) {
  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'cliente', prestadora_id: PRESTADORA, desactivada_en: null }]);
  respuestas.set('GET /rest/v1/clientes', titular ? [{ id: CLIENTE }] : []);
  respuestas.set('GET /rest/v1/personas_autorizadas', titular ? [] : [{ cliente_id: CLIENTE }]);
  respuestas.set('GET /rest/v1/configuracion_visibilidad_app', []);
  respuestas.set('GET /rest/v1/permisos_personas_autorizadas', []);
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  respuestas.set('POST /rest/v1/rpc/contactos_de_emergencia_del_cliente', () => FILAS_DE_LA_BASE);
  respuestas.set('POST /rest/v1/rpc/reemplazar_contactos_de_emergencia', () => null);
  respuestas.set('POST /rest/v1/rpc/personas_para_contacto_de_emergencia', () => [
    {
      persona_id: PERSONA_3, nombre: 'Teresa Inventada',
      es_contratante: false, es_paciente: true, es_responsable_de_pagos: false, es_persona_autorizada: false,
    },
  ]);
});

describe('desde el Panel', () => {
  beforeEach(sesionDelPanel);

  it('lee en orden de prioridad, con los teléfonos y el lugar de cada persona en el Cliente', async () => {
    const { estado, cuerpo } = await pedir('GET', `/panel/cliente/${CLIENTE}`);

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo.contactos.map((c) => c.prioridad), [1, 2]);
    assert.deepEqual(cuerpo.contactos[0], {
      prioridad: 1,
      personaId: PERSONA_1,
      nombre: 'Ana Inventada',
      telefonos: ['1155550001', '1155550011'],
      esContratante: true,
      esPaciente: false,
      esResponsableDePagos: true,
      esPersonaAutorizada: false,
    });
    assert.equal(cuerpo.maximo, 3);
    assert.ok(cuerpo.textos && typeof cuerpo.textos.titulo === 'string');
    const [lectura] = rpc('contactos_de_emergencia_del_cliente');
    assert.equal(lectura.autorizacion, credencial(), 'el Panel lee con la credencial de quien pide');
    assert.equal(lectura.cuerpo.p_cliente, CLIENTE);
  });

  it('manda la lista a la base en el orden en que llegó, con las personas nuevas', async () => {
    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, {
      contactos: [
        { personaId: PERSONA_2 },
        { nombre: ' Pablo ', apellido: 'Inventado ', telefono: ' +54 11 5555-0009 ' },
        { personaId: PERSONA_1 },
      ],
    });

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    const [cambio] = rpc('reemplazar_contactos_de_emergencia');
    assert.equal(cambio.autorizacion, credencial());
    assert.equal(cambio.cuerpo.p_cliente, CLIENTE);
    assert.equal(cambio.cuerpo.p_usuario, null, 'desde el Panel la base ya sabe quién pide');
    assert.deepEqual(cambio.cuerpo.p_contactos, [
      { persona_id: PERSONA_2 },
      { nombre: 'Pablo', apellido: 'Inventado', telefono: '+54 11 5555-0009' },
      { persona_id: PERSONA_1 },
    ]);
  });

  it('una lista vacía deja al Cliente sin contactos de emergencia', async () => {
    const { estado } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, { contactos: [] });

    assert.equal(estado, 200);
    assert.deepEqual(rpc('reemplazar_contactos_de_emergencia')[0].cuerpo.p_contactos, []);
  });

  it('más de tres no llega a la base', async () => {
    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, {
      contactos: [PERSONA_1, PERSONA_2, PERSONA_3, PERSONA_4].map((personaId) => ({ personaId })),
    });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'demasiados_contactos_de_emergencia');
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('la misma persona dos veces no llega a la base', async () => {
    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, {
      contactos: [{ personaId: PERSONA_1 }, { personaId: PERSONA_1 }],
    });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'contacto_de_emergencia_repetido');
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('a una persona nueva sin nombre, sin apellido o sin teléfono se la rechaza antes de la base', async () => {
    const casos = [
      { apellido: 'Inventado', telefono: '1155550009' },
      { nombre: 'Pablo', apellido: '  ', telefono: '1155550009' },
      { nombre: 'Pablo', apellido: 'Inventado' },
    ];
    for (const persona of casos) {
      const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, { contactos: [persona] });
      assert.equal(estado, 400, JSON.stringify(persona));
      assert.equal(cuerpo.motivo, 'faltan_datos');
    }
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('un teléfono que no puede ser un número se rechaza antes de la base', async () => {
    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, {
      contactos: [{ nombre: 'Pablo', apellido: 'Inventado', telefono: '12' }],
    });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'telefono_invalido');
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('lo que no es ni una persona elegida ni una nueva no pasa', async () => {
    const sinLista = await pedir('PUT', `/panel/cliente/${CLIENTE}`, {});
    const conOtraCosa = await pedir('PUT', `/panel/cliente/${CLIENTE}`, { contactos: [{ personaId: 'no-es-un-identificador' }] });

    assert.equal(sinLista.estado, 400);
    assert.equal(sinLista.cuerpo.motivo, 'dato_invalido');
    assert.equal(conOtraCosa.estado, 400);
    assert.equal(conOtraCosa.cuerpo.motivo, 'dato_invalido');
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('la persona de otra Prestadora la rechaza la base, y sale como motivo sin el texto de la base', async () => {
    respuestas.set('POST /rest/v1/rpc/reemplazar_contactos_de_emergencia', () => ({
      __estado: 400,
      __cuerpo: { message: 'contacto_de_emergencia_inexistente', details: 'detalle interno de la base' },
    }));

    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, { contactos: [{ personaId: PERSONA_4 }] });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'contacto_de_emergencia_inexistente');
    assert.ok(!JSON.stringify(cuerpo).includes('detalle interno'), 'el texto de la base no sale');
  });

  it('sin permiso para cambiar al Cliente, la base lo rechaza', async () => {
    respuestas.set('POST /rest/v1/rpc/reemplazar_contactos_de_emergencia', () => ({
      __estado: 403,
      __cuerpo: { message: 'sin_permiso' },
    }));

    const { estado, cuerpo } = await pedir('PUT', `/panel/cliente/${CLIENTE}`, { contactos: [{ personaId: PERSONA_1 }] });

    assert.equal(estado, 403);
    assert.equal(cuerpo.motivo, 'sin_permiso');
  });

  it('el Cliente que la base no muestra no existe: no se lee ni se cambia nada a su nombre', async () => {
    const lectura = await pedir('GET', `/panel/cliente/${CLIENTE_AJENO}`);
    const cambio = await pedir('PUT', `/panel/cliente/${CLIENTE_AJENO}`, { contactos: [{ personaId: PERSONA_1 }] });

    assert.equal(lectura.estado, 404);
    assert.equal(cambio.estado, 404);
    assert.equal(rpc('contactos_de_emergencia_del_cliente').length, 0);
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });
});

describe('desde la aplicación del Cliente', () => {
  it('el titular lee la lista y las personas de su Cliente para elegir, con el trabajo de la Prestadora', async () => {
    sesionDelCliente();

    const { estado, cuerpo } = await pedir('GET', '/app');

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo.contactos.map((c) => c.personaId), [PERSONA_1, PERSONA_2]);
    assert.deepEqual(cuerpo.personas, [{
      personaId: PERSONA_3,
      nombre: 'Teresa Inventada',
      esContratante: false,
      esPaciente: true,
      esResponsableDePagos: false,
      esPersonaAutorizada: false,
    }]);
    const [lectura] = rpc('contactos_de_emergencia_del_cliente');
    assert.equal(contenidoDe(lectura.autorizacion).role, 'trabajo_sin_persona');
    assert.equal(lectura.cuerpo.p_cliente, CLIENTE);
    const [personas] = rpc('personas_para_contacto_de_emergencia');
    assert.equal(personas.cuerpo.p_cliente, CLIENTE);
  });

  it('el titular cambia la lista diciéndole a la base en nombre de quién', async () => {
    sesionDelCliente();

    const { estado, cuerpo } = await pedir('PUT', '/app', {
      contactos: [{ personaId: PERSONA_3 }, { nombre: 'Pablo', apellido: 'Inventado', telefono: '1155550009' }],
    });

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    const [cambio] = rpc('reemplazar_contactos_de_emergencia');
    assert.equal(contenidoDe(cambio.autorizacion).role, 'trabajo_sin_persona');
    assert.equal(cambio.cuerpo.p_cliente, CLIENTE);
    assert.equal(cambio.cuerpo.p_usuario, USUARIO);
    assert.deepEqual(cambio.cuerpo.p_contactos, [
      { persona_id: PERSONA_3 },
      { nombre: 'Pablo', apellido: 'Inventado', telefono: '1155550009' },
    ]);
  });

  it('una persona que no es de su Cliente la rechaza la base', async () => {
    sesionDelCliente();
    respuestas.set('POST /rest/v1/rpc/reemplazar_contactos_de_emergencia', () => ({
      __estado: 400,
      __cuerpo: { message: 'contacto_de_emergencia_inexistente' },
    }));

    const { estado, cuerpo } = await pedir('PUT', '/app', { contactos: [{ personaId: PERSONA_4 }] });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'contacto_de_emergencia_inexistente');
  });

  it('más de tres no llega a la base', async () => {
    sesionDelCliente();

    const { estado, cuerpo } = await pedir('PUT', '/app', {
      contactos: [PERSONA_1, PERSONA_2, PERSONA_3, PERSONA_4].map((personaId) => ({ personaId })),
    });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'demasiados_contactos_de_emergencia');
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });

  it('la Persona autorizada no los ve ni los cambia', async () => {
    sesionDelCliente({ titular: false });

    const lectura = await pedir('GET', '/app');
    const cambio = await pedir('PUT', '/app', { contactos: [] });

    assert.equal(lectura.estado, 403);
    assert.equal(cambio.estado, 403);
    assert.equal(rpc('contactos_de_emergencia_del_cliente').length, 0);
    assert.equal(rpc('reemplazar_contactos_de_emergencia').length, 0);
  });
});

describe('lo que ve el Asistente en el turno de guardia', () => {
  const turno = (cambios) => ({
    id: 'turno-guardia-1', paciente_id: PACIENTE, fecha: '2026-10-10', hora_inicio: '08:00', hora_fin: '16:00',
    dias_hasta_el_fin: 0, modalidad: null, estado: 'activa', salida_checkin_at: null, medio_transporte: null,
    checkin_at: null, checkout_at: null, ...cambios,
  });

  beforeEach(() => {
    respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
    respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
    respuestas.set('GET /rest/v1/prestadoras', () => [{ zona_horaria: 'America/Argentina/Buenos_Aires' }]);
    respuestas.set('GET /rest/v1/pacientes', () => [{
      id: PACIENTE, cliente_id: CLIENTE, obra_social_persona_id: null, numero_afiliado: null,
      personas: { nombre_visible: 'Paciente Inventado' },
    }]);
  });

  it('con el turno en curso recibe los contactos en orden de prioridad, con el nombre y los teléfonos', async () => {
    respuestas.set('GET /rest/v1/turnos_guardia', () => [turno({ checkin_at: '2026-10-10T11:00:00Z' })]);

    const { estado, cuerpo } = await pedir('GET', '/asistente/turnos-guardia/turno-guardia-1');

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo.contactosDeEmergenciaPorPaciente, {
      [PACIENTE]: [
        { prioridad: 1, nombre: 'Ana Inventada', telefonos: ['1155550001', '1155550011'] },
        { prioridad: 2, nombre: 'Pablo Inventado', telefonos: ['1155550002'] },
      ],
    });
    const [lectura] = rpc('contactos_de_emergencia_del_cliente');
    assert.equal(contenidoDe(lectura.autorizacion).role, 'trabajo_sin_persona');
    assert.equal(lectura.cuerpo.p_cliente, CLIENTE);
  });

  it('antes de marcar la llegada no los recibe ni se buscan', async () => {
    respuestas.set('GET /rest/v1/turnos_guardia', () => [turno({ checkin_at: null })]);

    const { estado, cuerpo } = await pedir('GET', '/asistente/turnos-guardia/turno-guardia-1');

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo.contactosDeEmergenciaPorPaciente, {});
    assert.equal(rpc('contactos_de_emergencia_del_cliente').length, 0);
  });

  it('después de marcar la salida no los recibe ni se buscan', async () => {
    respuestas.set('GET /rest/v1/turnos_guardia', () => [turno({
      estado: 'completada', checkin_at: '2026-10-10T11:00:00Z', checkout_at: '2026-10-10T19:00:00Z',
    })]);

    const { estado, cuerpo } = await pedir('GET', '/asistente/turnos-guardia/turno-guardia-1');

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.deepEqual(cuerpo.contactosDeEmergenciaPorPaciente, {});
    assert.equal(rpc('contactos_de_emergencia_del_cliente').length, 0);
  });
});
