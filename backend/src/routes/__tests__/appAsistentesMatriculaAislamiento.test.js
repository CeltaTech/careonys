/**
 * Lo que el Asistente ve de su propia Matrícula se pide por Prestadora.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `matriculas_asistente` era la única tabla de las que consultan las
 * dos aplicaciones de teléfono sin columna de Organización: colgaba del Asistente y nada más. La
 * migración `20260916040000_la_matricula_del_asistente_dice_de_que_prestadora_es.sql` le puso la
 * columna. La ruta entra a la base con la credencial de quien pide, y lo que separa una Prestadora
 * de otra es la protección por fila: lo que se sostiene acá es que cada consulta vaya de verdad con
 * esa credencial. Si volviera a la llave de servicio no se vería en la pantalla, que anda igual de
 * bien.
 *
 * De esta lectura cuelga si el Asistente puede trabajar, porque la base lo frena sin Matrícula
 * vigente. Una Matrícula leída de la Prestadora equivocada lo habilita donde no corresponde.
 *
 * La base de mentira imita la protección por fila en lo único que hace falta: con la credencial de
 * quien pide contesta sólo lo de su Prestadora, y con la llave de servicio contesta todo. Qué daría
 * con el sistema roto: cualquiera de las consultas con la llave de servicio hace fallar su
 * comprobación, y la Matrícula de la otra Prestadora aparece. La protección por fila en sí no se
 * ve acá: la prueba `scripts/probar_aislamiento.mjs` contra una base de verdad. Los datos son
 * inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // la cuenta: usuarios.id === auth.uid()
// El Legajo de esa persona en esta Prestadora, que es otro número que el de la cuenta.
const LEGAJO = 'bbbbbbbb-bbbb-4bbb-8bbb-b0000000000b';
const OTRA_PRESTADORA = '99999999-9999-4999-8999-999999999999';

/** La credencial que mandó el último pedido: la base tiene que recibir esa, y no la llave de servicio. */
let credencialEnviada = null;

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera: los filtros van ahí. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const credencial = req.headers.authorization;
    llamadas.push({ clave, url: req.url, credencial });

    const preparada = respuestas.get(clave);
    let valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
    // La protección por fila de mentira: a quien pide, sólo lo de su Prestadora.
    if (req.method === 'GET' && Array.isArray(valor) && credencial === credencialEnviada) {
      valor = valor.filter((fila) => !Object.hasOwn(fila, 'prestadora_id') || fila.prestadora_id === PRESTADORA);
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesMatriculaRouter } = await import('../appAsistentesMatricula.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/matricula', appAsistentesMatriculaRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/matricula`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** Las consultas a una tabla, con su dirección y su credencial. */
function consultasA(tabla, metodo = 'GET') {
  return llamadas.filter((l) => l.clave === `${metodo} /rest/v1/${tabla}`);
}

/** Pide con la credencial de la persona de prueba, y la deja anotada. */
function pedir(ruta = '') {
  credencialEnviada = sesionDePrueba(USUARIO);
  return fetch(`${DIRECCION}${ruta}`, { headers: { Authorization: credencialEnviada } });
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  respuestas.set('GET /auth/v1/user', { id: USUARIO, aud: 'authenticated' });
  respuestas.set('GET /rest/v1/usuarios', [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  // El Legajo con el que entra la sesión: lo busca el middleware por la cuenta y la Prestadora.
  respuestas.set('GET /rest/v1/asistentes', [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
});

describe('la Matrícula que el Asistente ve de sí mismo', () => {
  it('se pide con la credencial de quien pide, y la de otra Prestadora no aparece', async () => {
    respuestas.set('GET /rest/v1/estado_matricula_asistente', [
      { asistente_id: LEGAJO, prestadora_id: PRESTADORA, requiere_matricula: true, tipo_matricula: 'enfermeria',
        motivo_bloqueo: null, matricula_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        vigente_hasta: '2027-01-01', verificada_at: '2026-09-01T10:00:00Z', dias_para_vencer: 108 },
    ]);
    respuestas.set('GET /rest/v1/prestadoras', [{ dias_aviso_vencimiento_documentos: 30 }]);
    respuestas.set('GET /rest/v1/matriculas_asistente', [
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', prestadora_id: PRESTADORA, tipo: 'enfermeria', numero_matricula: '00000',
        vigente_desde: '2026-01-01', vigente_hasta: '2027-01-01', archivo_url: null,
        verificada_at: '2026-09-01T10:00:00Z', cargada_por_el_asistente: false,
        created_at: '2026-01-01T10:00:00Z' },
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', prestadora_id: OTRA_PRESTADORA, tipo: 'enfermeria', numero_matricula: '11111',
        vigente_desde: '2026-01-01', vigente_hasta: '2027-01-01', archivo_url: null,
        verificada_at: '2026-09-01T10:00:00Z', cargada_por_el_asistente: false,
        created_at: '2026-01-01T10:00:00Z' },
    ]);

    const respuesta = await pedir();
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.deepEqual(cuerpo.matriculas.map((m) => m.numero_matricula), ['00000']);

    const [estado] = consultasA('estado_matricula_asistente');
    assert.ok(estado, 'no se consultó el estado de la Matrícula');
    assert.equal(estado.credencial, credencialEnviada, 'el estado de la Matrícula no fue con la credencial de quien pide');
    assert.ok(estado.url.includes(`asistente_id=eq.${LEGAJO}`), estado.url);

    const [matriculas] = consultasA('matriculas_asistente');
    assert.ok(matriculas, 'no se consultaron las Matrículas');
    assert.equal(matriculas.credencial, credencialEnviada, 'la lista de Matrículas no fue con la credencial de quien pide');
    assert.ok(matriculas.url.includes(`asistente_id=eq.${LEGAJO}`), matriculas.url);

    const [prestadora] = consultasA('prestadoras');
    assert.equal(prestadora.credencial, credencialEnviada);
  });

  // La firma sigue con la llave maestra: la política del depósito mira la cuenta y la carpeta es
  // la ficha, así que con la credencial de la persona el Asistente no abriría su propio archivo.
  // Lo que la acota es la comprobación de la ruta contra la sesión.
  it('la firma de su propio archivo sale, y va con la llave maestra', async () => {
    respuestas.set(
      `POST /storage/v1/object/sign/prescripciones-medicacion/${PRESTADORA}/matriculas/${LEGAJO}/m.pdf`,
      { signedURL: '/object/sign/x?token=y' },
    );

    const respuesta = await pedir(`/archivo-url?ruta=${PRESTADORA}/matriculas/${LEGAJO}/m.pdf`);
    assert.equal(respuesta.status, 200);

    const firma = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/sign/'));
    assert.ok(firma, 'no se pidió la firma');
    assert.notEqual(firma.credencial, credencialEnviada, 'la firma fue con la credencial de quien pide');
  });

  it('un archivo de otra Prestadora o de otro Asistente no se firma', async () => {
    for (const ruta of [
      `${OTRA_PRESTADORA}/matriculas/${LEGAJO}/m.pdf`,
      `${PRESTADORA}/matriculas/${USUARIO}/m.pdf`,
      `${PRESTADORA}/matriculas/${LEGAJO}/../x/m.pdf`,
    ]) {
      llamadas = [];
      const respuesta = await pedir(`/archivo-url?ruta=${encodeURIComponent(ruta)}`);
      assert.equal(respuesta.status, 400, ruta);
      assert.ok(!llamadas.some((l) => l.clave.startsWith('POST /storage/')), `se pidió la firma de ${ruta}`);
    }
  });
});
