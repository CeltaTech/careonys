/**
 * La entrevista de una postulación, llamada de frente, sin ninguna ruta que la cuide antes.
 *
 *   npm test --prefix backend
 *   node --test backend/src/utils/__tests__/entrevistaDePostulacion.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Acá hay una puerta que se abre sin sesión: quien se postuló no tiene
 * cuenta, así que entra con una llave que le llegó por correo. Una puerta así se comprueba por lo
 * que NO deja salir, y eso no se ve mirando la pantalla: se ve mirando qué le pidió a la base y qué
 * devolvió. Las tres cosas que no pueden pasar son que la dirección de la sala salga fuera de hora,
 * que una postulación de otra Prestadora se pueda agendar, y que agendar dos veces cree dos citas.
 *
 * Y adentro del Panel, quién hace qué: agenda y elige al Entrevistador sólo el Responsable del
 * reclutamiento; mueve, cancela y carga el informe sólo el Entrevistador.
 *
 * La base es de mentira y contesta por HTTP igual que la de verdad, así que lo que se afirma no es
 * que la función haya pensado bien por dentro sino qué terminó pidiéndole a la base.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const PRESTADORA_AJENA = '22222222-2222-2222-2222-222222222222';
/** El único Administrador de la Prestadora: sin elección, es el Responsable del reclutamiento. */
const USUARIO = '33333333-3333-3333-3333-333333333333';
const COORDINADORA = '44444444-4444-4444-4444-444444444444';
const OTRO_COORDINADOR = '55555555-5555-5555-5555-555555555555';
const DE_OTRA_PRESTADORA = '66666666-6666-6666-6666-666666666666';
const POSTULACION = 4100;
const LLAVE = 'una-llave-larga-de-mentira-que-pasa-el-minimo-de-treinta-y-dos';
const BASE_DE_SALAS = 'https://salas.ejemplo/aca';

const EN_UNA_HORA = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

/** Lo que la base contesta. Cada prueba deja acá el mundo que quiere. */
let postulacion = null;
let entrevistas = [];
let prestadora = null;
/** La elección guardada en Configuración → Reclutamiento, o null si nadie eligió. */
let configuracion = null;
const USUARIOS = [
  { id: USUARIO, nombre: 'Ana Admin', rol: 'admin_prestadora', prestadora_id: PRESTADORA },
  { id: COORDINADORA, nombre: 'Clara Coord', rol: 'coordinador', prestadora_id: PRESTADORA },
  { id: OTRO_COORDINADOR, nombre: 'Omar Coord', rol: 'coordinador', prestadora_id: PRESTADORA },
  { id: DE_OTRA_PRESTADORA, nombre: 'Elena Externa', rol: 'coordinador', prestadora_id: PRESTADORA_AJENA },
];
let usuarios = USUARIOS;
/** Todo lo que se le pidió a la base, para poder afirmar lo que NO salió. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ metodo: req.method, ruta: url.pathname, cuerpo, select: url.searchParams.get('select'), credencial: req.headers.authorization });

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');

    /* La base de verdad aplica los filtros de la consulta, y ésta también tiene que aplicarlos: una
       base falsa que contesta lo mismo se le pida lo que se le pida deja pasar la prueba de
       aislamiento sin que exista el filtro. Sería una prueba que no puede fallar. */
    const contestar = (filas) => {
      const filtradas = filas.filter((fila) =>
        [...url.searchParams].every(([columna, condicion]) => {
          if (!(columna in fila)) return true;
          const texto = String(condicion);
          if (texto.startsWith('eq.')) return String(fila[columna]) === texto.slice(3);
          if (texto.startsWith('in.(')) {
            return texto.slice(4, -1).split(',').map((v) => v.replace(/"/g, '')).includes(String(fila[columna]));
          }
          return true;
        }),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(unoSolo ? (filtradas[0] ?? null) : filtradas));
    };

    if (url.pathname === '/rest/v1/postulaciones') return contestar(postulacion ? [postulacion] : []);
    if (url.pathname === '/rest/v1/prestadoras') return contestar(prestadora ? [prestadora] : []);
    if (url.pathname === '/rest/v1/usuarios') return contestar(usuarios);
    if (url.pathname === '/rest/v1/configuracion_reclutamiento') return contestar(configuracion ? [configuracion] : []);

    if (url.pathname === '/rest/v1/entrevistas_postulacion') {
      if (req.method === 'POST') {
        const fila = { id: 'e-1', llave_publica: LLAVE, estado: 'agendada', ...cuerpo };
        entrevistas = [...entrevistas, fila];
        return contestar([fila]);
      }
      if (req.method === 'PATCH') {
        const fila = { ...entrevistas[0], ...cuerpo };
        entrevistas = [fila];
        // La fila modificada vuelve tal cual, sin pasar por los filtros: es lo que hace la base de
        // verdad, que devuelve lo que acaba de escribir aunque ya no cumpla la condición de la
        // consulta —cerrar una entrevista es justamente eso—.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(unoSolo ? fila : [fila]));
        return;
      }
      return contestar(entrevistas);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
prepararCredencialDePrueba();
process.env.PANEL_URL = 'https://panel.ejemplo';

// El import va después de las variables de entorno: la conexión se arma al importarse, con la
// dirección que haya en ese instante.
const {
  agendarEntrevista,
  cambiarEntrevistador,
  cancelarEntrevista,
  cargarInforme,
  entrevistaPorLlave,
  reprogramarEntrevista,
} = await import('../entrevistaDePostulacion.js');
const { MINUTOS_DE_TOLERANCIA } = await import('../videollamada.js');

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  entrevistas = [];
  configuracion = null;
  usuarios = USUARIOS;
  postulacion = {
    id: POSTULACION,
    nombre: 'Marta Ledesma',
    email: 'marta@ejemplo',
    idioma: 'es-AR',
    prestadora_id: PRESTADORA,
  };
  prestadora = {
    id: PRESTADORA,
    nombre_fantasia: 'Cuidados del Sur',
    logo_url: null,
    videollamada_base_url: BASE_DE_SALAS,
  };
});

const insertos = () =>
  llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/rest/v1/entrevistas_postulacion');

async function elMotivo(promesa) {
  return promesa.then(
    () => null,
    (error) => error.motivo ?? error.message,
  );
}

/** Deja una entrevista ya agendada, como si alguien la hubiera creado antes. */
function yaHayUnaAgendada(campos = {}) {
  entrevistas = [
    {
      id: 'e-1',
      prestadora_id: PRESTADORA,
      postulacion_id: POSTULACION,
      agendada_para: EN_UNA_HORA(),
      llave_publica: LLAVE,
      sala_videollamada: 'sala-de-mentira',
      estado: 'agendada',
      entrevistador_id: USUARIO,
      ...campos,
    },
  ];
}

describe('agendar', () => {
  it('crea la cita con su llave y su sala', async () => {
    const entrevista = await agendarEntrevista({
      prestadoraId: PRESTADORA,
      postulacionId: POSTULACION,
      agendadaPara: EN_UNA_HORA(),
      usuarioId: USUARIO,
    });

    assert.equal(entrevista.estado, 'agendada');
    const [insertado] = insertos();
    assert.equal(insertado.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(insertado.cuerpo.agendada_por, USUARIO);
    assert.ok(insertado.cuerpo.sala_videollamada, 'la sala tendría que existir');
    // La llave es toda la credencial de quien no tiene cuenta: si fuera corta o deducible de algún
    // dato de la persona, la puerta se abriría probando.
    assert.ok(insertado.cuerpo.llave_publica.length >= 32);
    assert.ok(!insertado.cuerpo.llave_publica.includes(String(POSTULACION)));
  });

  // «El producto no prohíbe ni bloquea: avisa» (celtatech/CLAUDE.md §7). Sin dirección base no hay
  // sala, pero acordar el día y dejar la constancia sirve lo mismo.
  it('sin videollamada configurada, la cita se agenda igual y sin sala', async () => {
    prestadora = { ...prestadora, videollamada_base_url: null };

    await agendarEntrevista({
      prestadoraId: PRESTADORA,
      postulacionId: POSTULACION,
      agendadaPara: EN_UNA_HORA(),
      usuarioId: USUARIO,
    });

    assert.equal(insertos()[0].cuerpo.sala_videollamada, null);
  });

  it('no agenda una segunda cuando ya hay una viva', async () => {
    yaHayUnaAgendada();

    const motivo = await elMotivo(
      agendarEntrevista({
        prestadoraId: PRESTADORA,
        postulacionId: POSTULACION,
        agendadaPara: EN_UNA_HORA(),
        usuarioId: USUARIO,
      }),
    );

    assert.equal(motivo, 'entrevista_ya_agendada');
    assert.deepEqual(insertos(), [], 'no tendría que haber salido ningún alta');
  });

  // Ésta es la que mira el aislamiento: la postulación es de otra Prestadora, así que para esta
  // sesión no existe, y el motivo que sale es «no encontrado» y no «sin permiso».
  it('no agenda sobre una postulación de otra Prestadora', async () => {
    const motivo = await elMotivo(
      agendarEntrevista({
        prestadoraId: PRESTADORA_AJENA,
        postulacionId: POSTULACION,
        agendadaPara: EN_UNA_HORA(),
        usuarioId: USUARIO,
      }),
    );

    assert.equal(motivo, 'no_encontrado');
    assert.deepEqual(insertos(), []);
  });

  it('no agenda para ayer', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      await elMotivo(
        agendarEntrevista({
          prestadoraId: PRESTADORA,
          postulacionId: POSTULACION,
          agendadaPara: ayer,
          usuarioId: USUARIO,
        }),
      ),
      'entrevista_en_el_pasado',
    );
    assert.equal(
      await elMotivo(
        agendarEntrevista({
          prestadoraId: PRESTADORA,
          postulacionId: POSTULACION,
          agendadaPara: 'el jueves',
          usuarioId: USUARIO,
        }),
      ),
      'fecha_invalida',
    );
    assert.deepEqual(insertos(), []);
  });
});

describe('mover, cancelar y cargar el informe', () => {
  // La llave viajó por correo una sola vez. Si reprogramar la cambiara, el postulante tendría que
  // ir a buscar el correo nuevo y el viejo lo dejaría afuera.
  it('reprogramar no cambia la llave ni la sala', async () => {
    yaHayUnaAgendada();
    const nueva = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const entrevista = await reprogramarEntrevista({
      prestadoraId: PRESTADORA,
      postulacionId: POSTULACION,
      agendadaPara: nueva,
      usuarioId: USUARIO,
    });

    assert.equal(entrevista.llave_publica, LLAVE);
    assert.equal(entrevista.sala_videollamada, 'sala-de-mentira');
    const [patch] = llamadas.filter((l) => l.metodo === 'PATCH');
    assert.deepEqual(Object.keys(patch.cuerpo), ['agendada_para']);
  });

  it('cancelar apaga la sala en el momento y guarda el motivo si lo hay', async () => {
    yaHayUnaAgendada();

    const entrevista = await cancelarEntrevista({
      prestadoraId: PRESTADORA,
      postulacionId: POSTULACION,
      usuarioId: USUARIO,
      observaciones: '  No se presentó  ',
    });

    assert.equal(entrevista.estado, 'cancelada');
    assert.equal(entrevista.sala_videollamada, null);
    assert.equal(entrevista.cerrada_por, USUARIO);
    assert.equal(entrevista.observaciones, 'No se presentó');
  });

  // Haber entrevistado a alguien no es haberlo aprobado: esa decisión se toma en la pantalla de
  // Postulantes. Si esta función tocara la postulación, la estaría tomando sola.
  it('cargar el informe la deja realizada y no toca la postulación', async () => {
    yaHayUnaAgendada();

    const entrevista = await cargarInforme({
      prestadoraId: PRESTADORA,
      postulacionId: POSTULACION,
      usuarioId: USUARIO,
      informe: '  Buena disposición y experiencia con personas mayores.  ',
    });

    assert.equal(entrevista.estado, 'realizada');
    assert.equal(entrevista.sala_videollamada, null);
    assert.equal(entrevista.observaciones, 'Buena disposición y experiencia con personas mayores.');
    const escrituras = llamadas.filter(
      (l) => l.ruta === '/rest/v1/postulaciones' && l.metodo !== 'GET',
    );
    assert.deepEqual(escrituras, [], 'la postulación no se toca al cargar el informe');
  });

  it('un informe vacío no pasa', async () => {
    yaHayUnaAgendada();
    for (const informe of ['', '   ', null, undefined]) {
      assert.equal(
        await elMotivo(cargarInforme({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, usuarioId: USUARIO, informe })),
        'faltan_datos',
      );
    }
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'PATCH'), []);
  });

  it('lo que ya no está agendado no existe para moverlo ni para cargarle el informe', async () => {
    yaHayUnaAgendada({ estado: 'realizada' });

    assert.equal(
      await elMotivo(cargarInforme({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, usuarioId: USUARIO, informe: 'Otro' })),
      'no_encontrado',
    );
    assert.equal(
      await elMotivo(
        reprogramarEntrevista({
          prestadoraId: PRESTADORA,
          postulacionId: POSTULACION,
          agendadaPara: EN_UNA_HORA(),
          usuarioId: USUARIO,
        }),
      ),
      'no_encontrado',
    );
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'PATCH'), []);
  });
});

describe('quién hace qué', () => {
  const sobreLaViva = { prestadoraId: PRESTADORA, postulacionId: POSTULACION };

  it('sólo el Entrevistador mueve, cancela y carga el informe', async () => {
    yaHayUnaAgendada({ entrevistador_id: COORDINADORA });

    // Ni el Responsable, que la delegó, ni otra persona del Panel.
    for (const usuarioId of [USUARIO, OTRO_COORDINADOR, null]) {
      assert.equal(await elMotivo(reprogramarEntrevista({ ...sobreLaViva, usuarioId, agendadaPara: EN_UNA_HORA() })), 'sin_permiso');
      assert.equal(await elMotivo(cancelarEntrevista({ ...sobreLaViva, usuarioId })), 'sin_permiso');
      assert.equal(await elMotivo(cargarInforme({ ...sobreLaViva, usuarioId, informe: 'Texto' })), 'sin_permiso');
    }
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'PATCH'), []);

    // Y el Entrevistador sí: la prueba de arriba no pasa porque no deje a nadie.
    const entrevista = await cargarInforme({ ...sobreLaViva, usuarioId: COORDINADORA, informe: 'Texto' });
    assert.equal(entrevista.estado, 'realizada');
    assert.equal(entrevista.cerrada_por, COORDINADORA);
  });

  it('el Responsable cambia al Entrevistador, y nadie más', async () => {
    yaHayUnaAgendada({ entrevistador_id: COORDINADORA });

    assert.equal(
      await elMotivo(cambiarEntrevistador({ ...sobreLaViva, usuarioId: COORDINADORA, entrevistadorId: OTRO_COORDINADOR })),
      'sin_permiso',
    );
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'PATCH'), []);

    const entrevista = await cambiarEntrevistador({ ...sobreLaViva, usuarioId: USUARIO, entrevistadorId: OTRO_COORDINADOR });
    assert.equal(entrevista.entrevistador_id, OTRO_COORDINADOR);
    const [patch] = llamadas.filter((l) => l.metodo === 'PATCH');
    assert.deepEqual(patch.cuerpo, { entrevistador_id: OTRO_COORDINADOR });
  });

  it('el Entrevistador tiene que ser del Panel de la Prestadora', async () => {
    yaHayUnaAgendada();
    assert.equal(
      await elMotivo(cambiarEntrevistador({ ...sobreLaViva, usuarioId: USUARIO, entrevistadorId: DE_OTRA_PRESTADORA })),
      'faltan_datos',
    );
    entrevistas = [];
    assert.equal(
      await elMotivo(agendarEntrevista({ ...sobreLaViva, usuarioId: USUARIO, agendadaPara: EN_UNA_HORA(), entrevistadorId: DE_OTRA_PRESTADORA })),
      'faltan_datos',
    );
    assert.deepEqual(insertos(), []);
    assert.deepEqual(llamadas.filter((l) => l.metodo === 'PATCH'), []);
  });

  it('sin designar a nadie, el Entrevistador es el Responsable que agenda', async () => {
    await agendarEntrevista({ ...sobreLaViva, usuarioId: USUARIO, agendadaPara: EN_UNA_HORA() });
    assert.equal(insertos()[0].cuerpo.entrevistador_id, USUARIO);
  });

  it('designado, el Entrevistador es el elegido', async () => {
    await agendarEntrevista({ ...sobreLaViva, usuarioId: USUARIO, agendadaPara: EN_UNA_HORA(), entrevistadorId: COORDINADORA });
    assert.equal(insertos()[0].cuerpo.entrevistador_id, COORDINADORA);
  });

  it('sólo el Responsable agenda', async () => {
    assert.equal(
      await elMotivo(agendarEntrevista({ ...sobreLaViva, usuarioId: COORDINADORA, agendadaPara: EN_UNA_HORA() })),
      'sin_permiso',
    );
    assert.deepEqual(insertos(), []);
  });

  it('el Responsable elegido en Configuración agenda, y el Administrador ya no', async () => {
    configuracion = { prestadora_id: PRESTADORA, responsable_id: COORDINADORA };
    assert.equal(
      await elMotivo(agendarEntrevista({ ...sobreLaViva, usuarioId: USUARIO, agendadaPara: EN_UNA_HORA() })),
      'sin_permiso',
    );
    await agendarEntrevista({ ...sobreLaViva, usuarioId: COORDINADORA, agendadaPara: EN_UNA_HORA() });
    assert.equal(insertos()[0].cuerpo.entrevistador_id, COORDINADORA);
  });

  it('sin Responsable configurado, lo es el Administrador; sin Administrador único, nadie', async () => {
    configuracion = { prestadora_id: PRESTADORA, responsable_id: null };
    await agendarEntrevista({ ...sobreLaViva, usuarioId: USUARIO, agendadaPara: EN_UNA_HORA() });
    assert.equal(insertos().length, 1);

    // Falla cerrado: sin un Administrador único y sin elección, nadie agenda.
    entrevistas = [];
    llamadas = [];
    usuarios = USUARIOS.filter((u) => u.rol !== 'admin_prestadora');
    for (const usuarioId of [USUARIO, COORDINADORA, null]) {
      assert.equal(
        await elMotivo(agendarEntrevista({ ...sobreLaViva, usuarioId, agendadaPara: EN_UNA_HORA() })),
        'sin_permiso',
      );
    }
    assert.deepEqual(insertos(), []);
  });
});

describe('la puerta del postulante', () => {
  it('a la hora de la cita da la dirección de la sala y nada más', async () => {
    yaHayUnaAgendada({ agendada_para: new Date().toISOString() });

    const vista = await entrevistaPorLlave(LLAVE, PRESTADORA);

    assert.equal(vista.momento, 'ahora');
    assert.equal(vista.url, `${BASE_DE_SALAS}/sala-de-mentira`);
    // Nada del postulante, nada de quien entrevista, nada de lo anotado por dentro.
    assert.deepEqual(Object.keys(vista).sort(), [
      'agendada_para',
      'anticipo',
      'hay_videollamada',
      'logo_url',
      'momento',
      'prestadora',
      'url',
    ]);
    // La marca de la Prestadora —su nombre y su logo— y la dirección de sus salas se leen con la
    // credencial del trabajo de esa Prestadora, y con ninguna otra.
    const marcas = llamadas.filter((l) => l.ruta === '/rest/v1/prestadoras' && l.select?.includes('logo_url'));
    const salas = llamadas.filter((l) => l.ruta === '/rest/v1/prestadoras' && l.select?.includes('videollamada_base_url'));
    assert.ok(marcas.length > 0, 'la marca tendría que leerse');
    assert.ok(salas.length > 0, 'la dirección de las salas tendría que leerse');
    for (const marca of [...marcas, ...salas]) {
      const credencial = JSON.parse(Buffer.from(marca.credencial.replace('Bearer ', '').split('.')[1], 'base64url').toString());
      assert.equal(credencial.role, 'trabajo_sin_persona', 'la marca se leyó con otra credencial');
      assert.equal(credencial.prestadora_id, PRESTADORA, 'la marca se leyó fuera de la Prestadora');
    }
  });

  it('antes de tiempo dice cuándo volver, sin dar la sala', async () => {
    yaHayUnaAgendada({ agendada_para: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() });

    const vista = await entrevistaPorLlave(LLAVE, PRESTADORA);

    assert.equal(vista.momento, 'todavia_no');
    assert.equal(vista.url, null);
    // Y distingue «todavía no es la hora» de «esta entrevista no tiene videollamada»: una se
    // arregla volviendo más tarde y la otra no se arregla sola.
    assert.equal(vista.hay_videollamada, true);
  });

  it('pasada la tolerancia tampoco da la sala', async () => {
    const hace = MINUTOS_DE_TOLERANCIA + 10;
    yaHayUnaAgendada({ agendada_para: new Date(Date.now() - hace * 60 * 1000).toISOString() });

    const vista = await entrevistaPorLlave(LLAVE, PRESTADORA);

    assert.equal(vista.momento, 'ya_paso');
    assert.equal(vista.url, null);
  });

  // Falla cerrado, y contesta lo mismo en los tres casos: probar llaves no dice nada.
  it('una llave que no existe, una vacía y una entrevista cerrada contestan igual', async () => {
    entrevistas = [];
    assert.equal(await elMotivo(entrevistaPorLlave('otra-llave', PRESTADORA)), 'no_encontrado');
    assert.equal(await elMotivo(entrevistaPorLlave('', PRESTADORA)), 'no_encontrado');
    assert.equal(await elMotivo(entrevistaPorLlave(null, PRESTADORA)), 'no_encontrado');

    yaHayUnaAgendada({ estado: 'cancelada', sala_videollamada: null });
    assert.equal(await elMotivo(entrevistaPorLlave(LLAVE, PRESTADORA)), 'no_encontrado');
  });

  // La base falsa aplica el filtro: si la consulta dejara de nombrar la Prestadora, la llave
  // aparecería desde la puerta de la otra y esta prueba fallaría.
  it('la llave de una Prestadora no existe desde la puerta de otra, ni sin puerta', async () => {
    yaHayUnaAgendada();
    assert.equal(await elMotivo(entrevistaPorLlave(LLAVE, PRESTADORA_AJENA)), 'no_encontrado');
    assert.equal(await elMotivo(entrevistaPorLlave(LLAVE, null)), 'no_encontrado');
    // Y desde la propia sí: la prueba de arriba no pasa porque no se encuentre nada nunca.
    assert.equal((await entrevistaPorLlave(LLAVE, PRESTADORA)).momento, 'todavia_no');
  });
});

// Lo que se lee y se escribe de la postulación y de sus entrevistas va con el trabajo de la
// Prestadora de la sesión o de la puerta, y con ninguna otra credencial.
describe('con qué credencial', () => {
  function conElTrabajoDeLaPrestadora() {
    const propias = llamadas.filter((l) => l.ruta === '/rest/v1/postulaciones' || l.ruta === '/rest/v1/entrevistas_postulacion');
    assert.ok(propias.length > 0, 'no se consultó nada');
    for (const l of propias) {
      const credencial = JSON.parse(Buffer.from(String(l.credencial).replace('Bearer ', '').split('.')[1] ?? '', 'base64url').toString() || 'null');
      assert.equal(credencial?.role, 'trabajo_sin_persona', `${l.metodo} ${l.ruta} fue con otra credencial`);
      assert.equal(credencial.prestadora_id, PRESTADORA, `${l.metodo} ${l.ruta} fue fuera de la Prestadora`);
    }
  }

  it('agendar, mover y cargar el informe van con el trabajo de la Prestadora', async () => {
    await agendarEntrevista({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, agendadaPara: EN_UNA_HORA(), usuarioId: USUARIO });
    await reprogramarEntrevista({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, agendadaPara: EN_UNA_HORA(), usuarioId: USUARIO });
    await cargarInforme({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, usuarioId: USUARIO, informe: 'Texto' });
    conElTrabajoDeLaPrestadora();
  });

  it('cancelar va con el trabajo de la Prestadora', async () => {
    yaHayUnaAgendada();
    await cancelarEntrevista({ prestadoraId: PRESTADORA, postulacionId: POSTULACION, usuarioId: USUARIO });
    conElTrabajoDeLaPrestadora();
  });

  it('la llave se busca con el trabajo de la Prestadora de la puerta', async () => {
    yaHayUnaAgendada();
    await entrevistaPorLlave(LLAVE, PRESTADORA);
    conElTrabajoDeLaPrestadora();
  });
});
