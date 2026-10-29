/**
 * El Relevo de emergencia, y lo que la pantalla ve del rato de más esperando el relevo.
 *
 *   npm test --prefix backend
 *
 * QUÉ PROTEGEN ESTOS CASOS:
 *
 *   1. QUE EL PEDIDO SE PIERDA. Si el envío al Coordinador falla, el pedido ya quedó guardado y
 *      quien lo apretó recibe que salió bien. Su acto no depende de que el correo conteste, y la
 *      fila queda sin marca de notificada, que es lo que la deja al alcance de un reintento.
 *   2. QUE EL DETALLE SALGA POR UN CANAL PÚBLICO. Lo que escribió es información sensible
 *      (`celtatech/CLAUDE.md` §6): el aviso dice de qué guardia se trata y nada más.
 *   3. QUE SE PUEDA PEDIR UNA SOLA VEZ, O SÓLO EN EL RATO DE MÁS. Se pide en cualquier momento de la
 *      guardia en curso y más de una vez; lo único que no se duplica es el reenvío de la cola.
 *   4. QUE CIERRE LA GUARDIA. No la toca: queda como estaba, con el relevo pedido.
 *   5. QUE UNA PRESTADORA ALCANCE LA GUARDIA DE OTRA.
 *   6. QUE SE PIERDA EL MOMENTO. El pedido puede quedar en la cola sin conexión, y esa demora es
 *      justamente el dato.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';

import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = '99999999-9999-4999-8999-999999999999';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// El Legajo de esa persona en esta Prestadora, que es otro número que el de la cuenta.
const LEGAJO = 'bbbbbbbb-bbbb-4bbb-8bbb-b0000000000b';
const GUARDIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GUARDIA_DE_OTRA_PRESTADORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PACIENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const EXTENSION = '22222222-2222-4222-8222-222222222222';

const DETALLE = 'Me descompuse y no puedo seguir de pie.';

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
    const credencial = req.headers.authorization;
    llamadas.push({ clave, url: req.url, cuerpo, credencial });

    const preparada = respuestas.get(clave);
    let valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
    // La protección por fila de mentira: a quien pide, sólo lo de su Prestadora.
    if (req.method === 'GET' && Array.isArray(valor) && credencial === sesionDePrueba(USUARIO)) {
      valor = valor.filter((fila) => !Object.hasOwn(fila, 'prestadora_id') || fila.prestadora_id === PRESTADORA);
    }
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

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesRouter } = await import('../appAsistentes.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes', appAsistentesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const RAIZ = `http://127.0.0.1:${backend.address().port}`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function desdeElTelefono(id, cuerpo) {
  const respuesta = await fetch(`${RAIZ}/api/app-asistentes/guardias/${id}/relevo-de-emergencia`, {
    method: 'POST',
    headers: { Authorization: sesionDePrueba(USUARIO), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

let guardiasEnLaBase;
let extensionesEnLaBase;
let relevosEnLaBase;

/**
 * La base falsa filtra de verdad por los `eq` y los `is` de la dirección: sin esto, la prueba de
 * aislamiento pasaría aunque el backend consultara sin filtrar por Prestadora.
 */
function filasQuePasanLosFiltros(url, filas) {
  const parametros = new URL(url, 'http://interno').searchParams;
  return filas.filter((fila) =>
    [...parametros.entries()].every(([campo, condicion]) => {
      if (!Object.hasOwn(fila, campo)) return true;
      if (condicion === 'is.null') return fila[campo] === null || fila[campo] === undefined;
      if (condicion === 'not.is.null') return fila[campo] !== null && fila[campo] !== undefined;
      if (condicion.startsWith('eq.')) return String(fila[campo]) === condicion.slice(3);
      return true;
    })
  );
}

const pedidos = () =>
  llamadas
    .filter((l) => l.clave === 'POST /rest/v1/emergencias_guardia')
    .map((l) => (Array.isArray(l.cuerpo) ? l.cuerpo[0] : l.cuerpo));
const marcas = () => llamadas.filter((l) => l.clave === 'PATCH /rest/v1/emergencias_guardia');

const IDENTIFICADOR_DEL_TELEFONO = '77777777-7777-4777-8777-777777777777';

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  guardiasEnLaBase = [
    {
      id: GUARDIA,
      prestadora_id: PRESTADORA,
      asistente_id: LEGAJO,
      paciente_id: PACIENTE,
      fecha: '2026-09-15',
      hora_inicio: '22:00',
      hora_fin: '06:00',
      estado: 'programada',
      checkin_at: '2026-09-15T22:01:00Z',
      checkout_at: null,
    },
    {
      id: GUARDIA_DE_OTRA_PRESTADORA,
      prestadora_id: OTRA_PRESTADORA,
      asistente_id: LEGAJO,
      paciente_id: PACIENTE,
      fecha: '2026-09-15',
      hora_inicio: '22:00',
      hora_fin: '06:00',
      estado: 'programada',
      checkin_at: '2026-09-15T22:01:00Z',
      checkout_at: null,
    },
  ];
  extensionesEnLaBase = [
    {
      id: EXTENSION,
      prestadora_id: PRESTADORA,
      guardia_id: GUARDIA,
      hasta_at: null,
    },
  ];
  relevosEnLaBase = [];

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  // El Legajo con el que entra la sesión: lo busca el middleware por la cuenta y la Prestadora.
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/guardias', ({ url }) => filasQuePasanLosFiltros(url, guardiasEnLaBase));
  respuestas.set('GET /rest/v1/extensiones_de_turno', ({ url }) =>
    filasQuePasanLosFiltros(url, extensionesEnLaBase)
  );
  respuestas.set('GET /rest/v1/emergencias_guardia', ({ url }) => filasQuePasanLosFiltros(url, relevosEnLaBase));
  respuestas.set('POST /rest/v1/emergencias_guardia', () => [{ id: '33333333-3333-4333-8333-333333333333' }]);
  respuestas.set('PATCH /rest/v1/emergencias_guardia', () => []);
  // El aviso al Coordinador pasa por acá antes de salir. Sin configuración cargada el evento se
  // considera encendido, y el correo no sale porque en las pruebas no hay servidor de correo.
  respuestas.set('GET /rest/v1/configuracion_notificaciones', () => []);
  respuestas.set('GET /rest/v1/configuracion_prestadora', () => []);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ idioma: 'es-AR' }]);
});

describe('pedir un Relevo de emergencia', () => {
  it('queda guardado como emergencia de la guardia, con el detalle, quién y la Prestadora', async () => {
    const { estado, cuerpo } = await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    assert.ok(cuerpo.avisadoAt);

    const [pedido] = pedidos();
    assert.ok(pedido, 'el pedido tiene que quedar guardado');
    assert.equal(pedido.relevo_de_emergencia, true);
    assert.equal(pedido.detalle, DETALLE);
    assert.equal(pedido.reportado_por, USUARIO);
    assert.equal(pedido.prestadora_id, PRESTADORA);
    assert.equal(pedido.guardia_id, GUARDIA);
  });

  it('no cierra la guardia: no escribe nada en ella ni en la extensión', async () => {
    await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    const tocadas = llamadas.filter(
      (l) => !l.clave.startsWith('GET ') && !l.clave.endsWith('/emergencias_guardia')
    );
    assert.deepEqual(tocadas.map((l) => l.clave), []);
  });

  it('se pide en cualquier momento de la guardia, sin extensión abierta', async () => {
    extensionesEnLaBase = [];
    const { estado } = await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    assert.equal(estado, 200);
    assert.equal(pedidos().length, 1);
  });

  it('se puede pedir más de una vez: cada pedido es un hecho con su hora', async () => {
    relevosEnLaBase = [
      {
        id: 'r-1',
        prestadora_id: PRESTADORA,
        guardia_id: GUARDIA,
        cliente_uuid: '88888888-8888-4888-8888-888888888888',
        reportado_at: '2026-09-15T23:00:00Z',
      },
    ];
    const { estado, cuerpo } = await desdeElTelefono(GUARDIA, {
      detalle: 'otra vez',
      clienteUuid: IDENTIFICADOR_DEL_TELEFONO,
    });
    assert.equal(estado, 200);
    assert.equal(cuerpo.yaRegistrado, undefined);
    assert.equal(pedidos().length, 1);
  });

  it('el detalle es opcional: quien está en el medio de algo puede no poder escribir nada', async () => {
    const { estado, cuerpo } = await desdeElTelefono(GUARDIA, {});
    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    assert.equal(pedidos()[0].detalle, null);
  });

  it('un detalle en blanco se guarda en blanco, no como texto vacío', async () => {
    await desdeElTelefono(GUARDIA, { detalle: '   ' });
    assert.equal(pedidos()[0].detalle, null);
  });

  it('un texto sin fin se recorta y el pedido sale igual', async () => {
    await desdeElTelefono(GUARDIA, { detalle: 'a'.repeat(5000) });
    assert.equal(pedidos()[0].detalle.length, 2000);
  });

  it('el momento en que pasó viaja con el pedido: el rato en la cola no se pierde', async () => {
    const ocurrio = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { cuerpo } = await desdeElTelefono(GUARDIA, { detalle: DETALLE, ocurrido_at: ocurrio });
    assert.equal(cuerpo.avisadoAt, ocurrio);
    assert.equal(pedidos()[0].reportado_at, ocurrio);
  });

  it('una hora futura se descarta: es un reloj mal puesto, no un dato', async () => {
    const enUnRato = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { cuerpo } = await desdeElTelefono(GUARDIA, { detalle: DETALLE, ocurrido_at: enUnRato });
    assert.ok(Date.parse(cuerpo.avisadoAt) <= Date.now() + 1000);
  });

  it('el aviso al Coordinador sale en el mismo pedido, y la fila queda marcada', async () => {
    await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/configuracion_notificaciones');
    assert.ok(consulta, 'el aviso al Coordinador tiene que salir en el momento');
    assert.ok(consulta.url.includes('evento=eq.relevo_de_emergencia'), consulta.url);
    const [marcada] = marcas();
    assert.ok(marcada, 'la fila tiene que quedar marcada como notificada');
    assert.equal(marcada.cuerpo.veces_notificado, 1);
    assert.ok(marcada.cuerpo.ultima_notificacion_at);
  });

  it('el detalle no sale en el aviso: se lee entrando al Panel', async () => {
    respuestas.set('GET /rest/v1/configuracion_notificaciones', () => [
      { emails: ['coordinacion@ejemplo.test'], activo: true, whatsapp_activo: false },
    ]);
    const salido = [];
    const fetchDeVerdad = globalThis.fetch;
    globalThis.fetch = async (direccion, opciones) => {
      if (String(direccion).startsWith('https://api.resend.com/')) {
        salido.push(String(opciones?.body ?? ''));
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return fetchDeVerdad(direccion, opciones);
    };
    process.env.RESEND_API_KEY = 'clave-de-mentira';
    process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
    try {
      await desdeElTelefono(GUARDIA, { detalle: DETALLE });
      for (const cuerpoEnviado of salido) {
        assert.ok(!cuerpoEnviado.includes('descompuse'), 'el detalle no puede viajar en el aviso');
      }
    } finally {
      globalThis.fetch = fetchDeVerdad;
      delete process.env.RESEND_API_KEY;
      delete process.env.REMITENTE_AVISOS;
    }
  });

  it('si el aviso al Coordinador falla, lo guardado queda igual y sin marca de notificado', async () => {
    process.env.RESEND_API_KEY = 'clave-de-mentira';
    process.env.REMITENTE_AVISOS = 'avisos@ejemplo.test';
    const fetchDeVerdad = globalThis.fetch;
    globalThis.fetch = async (direccion, opciones) => {
      if (String(direccion).startsWith('https://api.resend.com/')) {
        throw new Error('el despachante no contesta');
      }
      return fetchDeVerdad(direccion, opciones);
    };
    respuestas.set('GET /rest/v1/configuracion_notificaciones', () => [
      { emails: ['coordinacion@ejemplo.test'], activo: true, whatsapp_activo: false },
    ]);
    respuestas.set('GET /rest/v1/prestadoras', () => [
      { casilla_envio: null, nombre_fantasia: null, logo_url: null },
    ]);
    respuestas.set('GET /rest/v1/configuracion_prestadora', () => [{ email: 'contacto@ejemplo.test' }]);

    try {
      const { estado, cuerpo } = await desdeElTelefono(GUARDIA, { detalle: DETALLE });
      assert.equal(estado, 200);
      assert.equal(cuerpo.ok, true);
      assert.equal(pedidos().length, 1);
      assert.equal(marcas().length, 0, 'ninguna marca de notificado');
    } finally {
      globalThis.fetch = fetchDeVerdad;
      delete process.env.RESEND_API_KEY;
      delete process.env.REMITENTE_AVISOS;
    }
  });

  it('un reenvío de la cola no escribe un segundo pedido ni vuelve a avisar', async () => {
    const yaAvisado = '2026-09-16T06:30:00.000Z';
    relevosEnLaBase = [
      {
        id: 'r-1',
        prestadora_id: PRESTADORA,
        guardia_id: GUARDIA,
        cliente_uuid: IDENTIFICADOR_DEL_TELEFONO,
        reportado_at: yaAvisado,
      },
    ];
    const { estado, cuerpo } = await desdeElTelefono(GUARDIA, { clienteUuid: IDENTIFICADOR_DEL_TELEFONO });
    assert.equal(estado, 200);
    assert.equal(cuerpo.yaRegistrado, true);
    assert.equal(cuerpo.avisadoAt, yaAvisado);
    const escrituras = llamadas.filter((l) => !l.clave.startsWith('GET '));
    assert.deepEqual(escrituras.map((l) => l.clave), []);
  });

  it('la guardia que todavía no empezó no recibe el pedido', async () => {
    guardiasEnLaBase[0].checkin_at = null;
    const { estado, cuerpo } = await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'no_encontrado');
    assert.equal(pedidos().length, 0);
  });

  it('la guardia ya cerrada tampoco, salvo que haya pasado antes de cerrar', async () => {
    guardiasEnLaBase[0].checkout_at = '2026-09-16T06:05:00Z';
    const despues = await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    assert.equal(despues.estado, 404);
    assert.equal(pedidos().length, 0);

    const antes = await desdeElTelefono(GUARDIA, { detalle: DETALLE, ocurrido_at: '2026-09-16T05:40:00Z' });
    assert.equal(antes.estado, 200);
    assert.equal(pedidos().length, 1);
  });

  it('la guardia de otra Prestadora no existe para este Asistente', async () => {
    const { estado } = await desdeElTelefono(GUARDIA_DE_OTRA_PRESTADORA, { detalle: DETALLE });
    assert.equal(estado, 404);
    assert.equal(pedidos().length, 0);
  });

  it('la guardia y el pedido van con la credencial de quien lo aprieta, no con la llave de servicio', async () => {
    await desdeElTelefono(GUARDIA, { detalle: DETALLE });
    const deLaGuardia = llamadas.filter((l) =>
      ['GET /rest/v1/guardias', 'GET /rest/v1/emergencias_guardia', 'POST /rest/v1/emergencias_guardia', 'PATCH /rest/v1/emergencias_guardia'].includes(l.clave)
    );
    assert.ok(deLaGuardia.length >= 3);
    for (const llamada of deLaGuardia) {
      assert.equal(llamada.credencial, sesionDePrueba(USUARIO), `${llamada.clave} no fue con la credencial de quien lo aprieta`);
    }
  });
});

// ============================================================================
// Lo que la pantalla ve del rato de más
// ============================================================================

describe('la extensión que viaja con el turno', () => {
  async function verElTurno() {
    const respuesta = await fetch(`${RAIZ}/api/app-asistentes/guardias/${GUARDIA}`, {
      headers: { Authorization: sesionDePrueba(USUARIO) },
    });
    return { estado: respuesta.status, cuerpo: await respuesta.json() };
  }

  beforeEach(() => {
    // Lo que el resto de la pantalla del turno consulta y que acá no se mira: se contesta vacío
    // para que el pedido llegue entero hasta la extensión, que es lo que esta prueba vigila.
    for (const tabla of [
      'guardia_pacientes',
      'pacientes',
      'reportes',
      'descansos_guardia',
      'tipos_asistente',
      'tipo_asistente_tareas',
      'tareas_catalogo',
      'configuracion_visibilidad_asistente',
      'incidentes_relevo',
      'incidentes_turno_sin_cubrir',
      'escalones_de_alarma_avisados',
    ]) {
      respuestas.set(`GET /rest/v1/${tabla}`, () => []);
    }
    // `asistentes` no entra en esa lista: todo pedido con sesión pasa antes por el middleware,
    // que consulta esa tabla para saber cuál es el Legajo de quien entró. Lo que la pantalla del
    // turno le pregunta a la misma tabla —el nombre— sí se contesta vacío, y las dos consultas se
    // reparten por el `select`.
    respuestas.set('GET /rest/v1/asistentes', ({ url }) => {
      const select = new URL(url, 'http://interno').searchParams.get('select') ?? '';
      if (select.includes('nombre')) return [];
      return [{ id: LEGAJO, prestadora_id: PRESTADORA }];
    });
    respuestas.set('POST /rest/v1/rpc/domicilios_de_pacientes_en', () => []);
  });

  it('sin extensión abierta no viaja nada: es lo normal en casi todos los turnos', async () => {
    extensionesEnLaBase = [];
    const { estado, cuerpo } = await verElTurno();
    assert.equal(estado, 200);
    assert.equal(cuerpo.extension, null);
  });

  it('con extensión abierta viaja desde cuándo y los pasos de la búsqueda, y nada del Relevo de emergencia', async () => {
    extensionesEnLaBase[0].desde_at = '2026-09-16T06:00:00.000Z';
    const { estado, cuerpo } = await verElTurno();
    assert.equal(estado, 200);
    assert.equal(cuerpo.extension.desdeAt, '2026-09-16T06:00:00.000Z');
    assert.deepEqual(Object.keys(cuerpo.extension).sort(), ['desdeAt', 'pasos']);
    assert.deepEqual(cuerpo.extension.pasos, ['sin_novedades']);
  });

  it('el aviso a quien coordina se cuenta cuando salió, no cuando se abrió el expediente', async () => {
    extensionesEnLaBase[0].desde_at = '2026-09-16T06:00:00.000Z';
    // Expediente abierto y todavía sin ningún aviso enviado: decirle que ya avisaron sería mentir.
    respuestas.set('GET /rest/v1/incidentes_relevo', () => [{ id: 'inc-1', ultima_notificacion_at: null }]);
    const sinAvisar = await verElTurno();
    assert.deepEqual(sinAvisar.cuerpo.extension.pasos, ['sin_novedades']);

    respuestas.set('GET /rest/v1/incidentes_relevo', () => [
      { id: 'inc-1', ultima_notificacion_at: '2026-09-16T06:10:00.000Z' },
    ]);
    const avisado = await verElTurno();
    assert.deepEqual(avisado.cuerpo.extension.pasos, ['coordinacion_avisada']);
  });

  it('no sale ningún nombre en lo que ve quien está esperando', async () => {
    extensionesEnLaBase[0].desde_at = '2026-09-16T06:00:00.000Z';
    extensionesEnLaBase[0].relevo_guardia_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    respuestas.set('GET /rest/v1/guardias', ({ url }) =>
      filasQuePasanLosFiltros(url, [
        ...guardiasEnLaBase,
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          prestadora_id: PRESTADORA,
          asistente_id: 'otra-persona',
          nombre: 'Inventada Pérez',
          checkin_at: null,
        },
      ])
    );
    const { cuerpo } = await verElTurno();
    assert.deepEqual(cuerpo.extension.pasos, ['relevo_asignado']);
    assert.ok(!JSON.stringify(cuerpo.extension).includes('Inventada'));
    assert.ok(!JSON.stringify(cuerpo.extension).includes('otra-persona'));
  });
});
