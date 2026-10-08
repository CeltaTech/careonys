/**
 * `GET /api/panel/informes-obra-social/preview` — armar el informe de un Paciente para su obra
 * social.
 *
 *   node --test backend/src/routes/__tests__/panelInformesObraSocial.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La ruta (`../panelInformesObraSocial.js`) lee con la llave maestra,
 * todavía, porque la base es más estrecha que lo que la ruta hace: `personas_las_lee_su_organizacion`
 * pide el permiso `ver_personas`, y sin él el informe saldría con la obra social vacía; las políticas
 * de zona le recortarían a quien coordina los turnos de Asistentes de otras zonas; y
 * `oculta_pendientes_de_conformidad` escondería al Paciente importado que espera conformidad.
 * Entonces lo que separa una Prestadora de otra es el filtro escrito en cada consulta, y eso es lo
 * que se sostiene acá. La anotación de quién vio el informe sí va con la credencial de quien pide.
 *
 * La base es de mentira y contesta por HTTP como la de verdad. Con la llave maestra contesta lo que
 * pide el filtro de la Prestadora; con la credencial de quien pide imita las políticas: sin Ficha
 * de la obra social, sin Paciente pendiente y, para quien coordina, sin guardias. Con el sistema
 * roto —una consulta sin filtro, o de vuelta con la credencial de quien pide— dan al revés la prueba
 * del nombre de la obra social, la del Paciente pendiente, la de quien coordina o la del filtro.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '99999999-9999-9999-9999-999999999999';
const USUARIO = '22222222-2222-2222-2222-222222222222';
const PACIENTE = '33333333-3333-3333-3333-333333333333';
const OBRA_SOCIAL = '44444444-4444-4444-4444-444444444444';
const GUARDIA = '55555555-5555-5555-5555-555555555555';

/** La llave maestra, tal como la manda la conexión del backend. */
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

const respuestas = new Map();
let llamadas = [];
let rolDelUsuario = 'admin_prestadora';

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function'
      ? preparada(req.headers.authorization, decodeURIComponent(req.url))
      : preparada ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

const { default: express } = await import('express');
await import('express-async-errors');
const { panelInformesObraSocialRouter } = await import('../panelInformesObraSocial.js');

const app = express();
app.use(express.json());
app.use('/api/panel/informes-obra-social', panelInformesObraSocialRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/informes-obra-social`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedirVistaPrevia() {
  const parametros = new URLSearchParams({
    paciente_id: PACIENTE,
    tipo: 'resumen_mensual',
    periodo_desde: '2026-08-01',
    periodo_hasta: '2026-08-31',
  });
  const respuesta = await fetch(`${DIRECCION}/preview?${parametros}`, {
    headers: { Authorization: sesionDePrueba(USUARIO) },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** Filtra por la Prestadora que pide la dirección, como la base con la llave maestra. */
function segunElFiltro(filas, url) {
  const filtro = url.match(/prestadora_id=eq\.([^&]+)/);
  return filtro ? filas.filter((fila) => fila.prestadora_id === filtro[1]) : filas;
}

function prepararLaBase({ paciente = {} } = {}) {
  const pacientes = [{
    id: PACIENTE, prestadora_id: PRESTADORA, nombre: 'Paciente de prueba', obra_social_persona_id: OBRA_SOCIAL,
    numero_afiliado: 'A-0001', cliente_id: null, pendiente_conformidad: false, ...paciente,
  }];
  respuestas.set('GET /rest/v1/pacientes', (credencial, url) => (credencial === LLAVE_MAESTRA
    ? segunElFiltro(pacientes, url)
    // `oculta_pendientes_de_conformidad`, restrictiva, para todos los roles.
    : pacientes.filter((p) => p.prestadora_id === PRESTADORA && !p.pendiente_conformidad)));

  const personas = [{ id: OBRA_SOCIAL, prestadora_id: PRESTADORA, nombre_visible: 'Obra social inventada' }];
  respuestas.set('GET /rest/v1/personas', (credencial, url) => (credencial === LLAVE_MAESTRA
    ? segunElFiltro(personas, url)
    // `personas_las_lee_su_organizacion` pide `ver_personas`, que quien pide en esta prueba no tiene.
    : []));

  const enLista = [{ guardia_id: GUARDIA, paciente_id: PACIENTE, prestadora_id: PRESTADORA }];
  respuestas.set('GET /rest/v1/guardia_pacientes', (credencial, url) => (credencial === LLAVE_MAESTRA
    ? segunElFiltro(enLista, url)
    : []));

  const guardias = [{
    id: GUARDIA, prestadora_id: PRESTADORA, fecha: '2026-08-10', hora_inicio: '08:00', hora_fin: '16:00',
    dias_hasta_el_fin: 0, modalidad: 'diurna', estado: 'completada', asistente_id: null,
  }];
  respuestas.set('GET /rest/v1/guardias', (credencial, url) => {
    if (credencial === LLAVE_MAESTRA) return segunElFiltro(guardias, url);
    // La política de zona: quien coordina en esta prueba no alcanza a ningún Asistente.
    return rolDelUsuario === 'coordinador' ? [] : guardias;
  });
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/consultas_a_hce', () => []);
  respuestas.set('POST /rest/v1/registro_actividad', () => []);
});

describe('la vista previa del informe para la obra social', () => {
  it('sale con el nombre de la obra social, aunque quien pide no tenga el permiso del Directorio', async () => {
    prepararLaBase();

    const { estado, cuerpo } = await pedirVistaPrevia();

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.contenido.paciente.obra_social, 'Obra social inventada');
  });

  it('cada lectura va con la llave maestra y atada a la Prestadora de quien pide', async () => {
    prepararLaBase();

    await pedirVistaPrevia();

    const tablas = ['pacientes', 'personas', 'guardia_pacientes', 'guardias'];
    for (const tabla of tablas) {
      const lecturas = llamadas.filter((l) => l.clave === `GET /rest/v1/${tabla}`);
      assert.ok(lecturas.length > 0, `no se leyó ${tabla}`);
      for (const lectura of lecturas) {
        assert.equal(lectura.credencial, LLAVE_MAESTRA, `${tabla} no fue con la llave maestra`);
        assert.ok(lectura.url.includes(`prestadora_id=eq.${PRESTADORA}`), `${tabla} sin la Prestadora: ${lectura.url}`);
      }
    }
  });

  it('quien coordina ve los turnos de todos los Asistentes del Paciente, como antes', async () => {
    rolDelUsuario = 'coordinador';
    prepararLaBase();

    const { estado, cuerpo } = await pedirVistaPrevia();

    assert.equal(estado, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.contenido.guardias.length, 1);
  });

  it('el Paciente importado que espera conformidad se encuentra igual', async () => {
    prepararLaBase({ paciente: { pendiente_conformidad: true } });

    const { estado } = await pedirVistaPrevia();

    assert.equal(estado, 200);
  });

  it('el Paciente de otra Prestadora no existe para ésta, y no se anota ninguna consulta', async () => {
    prepararLaBase({ paciente: { prestadora_id: OTRA_PRESTADORA } });

    const { estado } = await pedirVistaPrevia();

    assert.notEqual(estado, 200);
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/consultas_a_hce'), false);
  });

  it('quién vio el informe se anota con la credencial de quien pide', async () => {
    prepararLaBase();

    await pedirVistaPrevia();

    const anotaciones = llamadas.filter((l) => l.clave === 'POST /rest/v1/consultas_a_hce');
    assert.equal(anotaciones.length, 1);
    assert.notEqual(anotaciones[0].credencial, LLAVE_MAESTRA);
    assert.ok(anotaciones[0].credencial, 'la anotación salió sin credencial');
  });
});
