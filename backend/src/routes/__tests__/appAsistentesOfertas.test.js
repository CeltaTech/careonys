/**
 * `GET /api/app-asistentes/ofertas` — las guardias que se le ofrecieron al Asistente.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La lista sigue con la llave maestra y con el filtro escrito: con la
 * credencial del Asistente, la política de `guardias` que le deja ver una guardia sin cubrir
 * (`asistente_ve_guardias_ofrecidas`) pide además que la guardia esté marcada como ofrecida, y el
 * código nunca pidió eso. Una invitación sobre una guardia sin esa marca desaparecería de la
 * lista sin que nadie lo notara.
 *
 * Qué daría con el sistema roto: si la consulta volviera a la credencial del Asistente, la
 * comprobación de la llave maestra falla; si perdiera el filtro de la Prestadora o del Asistente,
 * falla la del aislamiento. La base de mentira no aplica políticas, así que lo que se prueba es
 * con qué credencial y con qué filtros se pregunta, no qué filas devolvería la base real.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';
const GUARDIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no se preparó contesta vacío. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera y la credencial. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
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
const { appAsistentesOfertasRouter } = await import('../appAsistentesOfertas.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/ofertas', appAsistentesOfertasRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/ofertas`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedirOfertas() {
  const respuesta = await fetch(DIRECCION, { headers: { Authorization: sesionDePrueba(USUARIO) } });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  // Una invitación viva cuya guardia no tiene la marca de ofrecida: es la que la política de la
  // base le escondería al Asistente.
  respuestas.set('GET /rest/v1/ofertas_guardia', () => [
    {
      id: 'oferta-1',
      invitado_at: '2026-09-01T10:00:00Z',
      guardia_id: GUARDIA,
      guardias: {
        id: GUARDIA, paciente_id: null, fecha: '2099-01-01', hora_inicio: '08:00', hora_fin: '16:00',
        dias_hasta_el_fin: 0, modalidad: null, estado: 'programada', asistente_id: null,
        ofrecida_at: null, ofrecida_por: null, oferta_limite_at: null,
      },
    },
  ]);
});

describe('la lista de guardias ofrecidas al Asistente', () => {
  it('se busca con la llave maestra, acotada a la Prestadora y al Asistente de la sesión', async () => {
    const { estado } = await pedirOfertas();
    assert.equal(estado, 200);
    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/ofertas_guardia');
    assert.equal(lecturas.length, 1);
    assert.equal(lecturas[0].credencial, LLAVE_MAESTRA, 'la lista no fue con la llave maestra');
    assert.ok(lecturas[0].url.includes(`prestadora_id=eq.${PRESTADORA}`), 'falta el filtro de la Prestadora');
    assert.ok(lecturas[0].url.includes(`asistente_id=eq.${LEGAJO}`), 'falta el filtro del Asistente');
  });

  it('la invitación sobre una guardia sin marca de ofrecida también sale', async () => {
    const { cuerpo } = await pedirOfertas();
    assert.equal(cuerpo.ofertas.length, 1);
    assert.equal(cuerpo.ofertas[0].id, 'oferta-1');
  });

  it('quien no es Asistente no entra, aunque tenga sesión', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA }]);
    const { estado } = await pedirOfertas();
    assert.equal(estado, 403);
  });
});
