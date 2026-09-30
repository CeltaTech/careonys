/**
 * Los documentos del cese quedan guardados, y sólo los de la Prestadora de quien pide.
 *
 *   npm test --prefix backend
 *   node --test backend/src/routes/__tests__/panelCeses.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Adentro del depósito `documentos-cese` hay documentos de baja con
 * nombre, documento y montos. La ruta (`../panelCeses.js`) entra a la base y al depósito con la
 * llave maestra, todavía: la política `admin_gestiona_ceses` de la base deja los ceses sólo a
 * Superadmin y a la administración, y esta ruta la usa también quien coordina. Entonces lo que
 * separa una Prestadora de otra es el filtro de la Prestadora escrito en cada consulta del cese, y
 * lo que hay que sostener acá es que ese filtro esté. Y dos decisiones más: que el tipo de
 * documento salga de una lista cerrada —si no, quien manda el pedido elige el nombre del archivo
 * adentro del depósito— y que la ruta de la dirección firmada se arme con los datos del cese y no
 * con nada que venga de afuera.
 *
 * Por eso la base es de mentira y contesta por HTTP como la de verdad: además del resultado se
 * mira **qué se le pidió y con qué credencial**. La base de mentira imita las dos cosas que hacen
 * falta: con la llave maestra contesta los ceses que pide el filtro de la dirección, y todos si no
 * hay filtro; con la credencial de quien pide imita `admin_gestiona_ceses`, que no le contesta
 * nada a quien coordina.
 *
 * Con el sistema roto —una consulta sin el filtro de la Prestadora, una que vuelva a la
 * credencial de quien pide, o el tipo tomado tal como viene— las pruebas del cese ajeno, las de
 * quien coordina y la del tipo inventado dan al revés.
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
const CESE = '33333333-3333-3333-3333-333333333333';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió, con la dirección entera: los filtros van ahí. */
let llamadas = [];

let rolDelUsuario = 'admin_prestadora';
/** Qué contesta el depósito de archivos. `null` es «salió bien». */
let errorDelDeposito = null;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({
      clave,
      url: req.url,
      cuerpo: crudo && req.headers['content-type']?.includes('json') ? JSON.parse(crudo) : crudo,
      credencial: req.headers.authorization,
    });

    // El depósito de archivos: subir y firmar. No se guarda nada, alcanza con contestar como
    // contesta el de verdad y dejar anotado qué ruta se tocó.
    if (ruta.startsWith('/storage/v1/')) {
      if (errorDelDeposito) {
        res.writeHead(errorDelDeposito.__estado, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorDelDeposito.__cuerpo));
        return;
      }
      const cuerpo = ruta.includes('/object/sign/')
        ? { signedURL: `${ruta.replace('/storage/v1', '')}?token=firma-de-mentira` }
        : { Key: ruta };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cuerpo));
      return;
    }

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function'
      ? preparada(crudo ? JSON.parse(crudo) : null, req.headers.authorization, req.url)
      : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }
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
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { default: express } = await import('express');
await import('express-async-errors');
const { panelCesesRouter } = await import('../panelCeses.js');
const { TIPO_LIQUIDACION, TIPO_TELEGRAMA } = await import('../../utils/documentosDeCese.js');

const app = express();
app.use(express.json());
app.use('/api/panel/ceses', panelCesesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/panel/ceses`;

after(() => {
  backend.close();
  baseFalsa.close();
});

/** Un PDF de mentira, del tamaño de uno de verdad de una carilla. */
function unPdf(tipoDeclarado = 'application/pdf') {
  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], { type: tipoDeclarado });
}

/** La credencial que mandó el último pedido: la base tiene que recibir esa y ninguna otra. */
let credencialEnviada = null;

async function subir(ceseId, { tipo, archivo = unPdf() } = {}) {
  const cuerpo = new FormData();
  if (tipo !== undefined) cuerpo.append('tipo', tipo);
  if (archivo !== null) cuerpo.append('archivo', archivo, 'documento.pdf');

  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}/${ceseId}/documento`, {
    method: 'POST',
    headers: { Authorization: credencialEnviada },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

async function pedirDireccion(ruta) {
  credencialEnviada = sesionDePrueba(USUARIO);
  const respuesta = await fetch(`${DIRECCION}${ruta}`, {
    headers: { Authorization: credencialEnviada },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

/** El cese como sale de la base, con lo que cada prueba le ponga encima. */
function unCese(cambios = {}) {
  return { id: CESE, prestadora_id: PRESTADORA, documentos_generados: null, ...cambios };
}

beforeEach(() => {
  llamadas = [];
  rolDelUsuario = 'admin_prestadora';
  errorDelDeposito = null;
  respuestas.clear();
  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: rolDelUsuario, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/tiene_permiso_de', () => true);
});

/** La llave maestra, tal como la manda la conexión del backend. */
const LLAVE_MAESTRA = 'Bearer clave-de-mentira';

/** Los ceses que hay en la base, para leerlos o escribirlos. Con la llave maestra la base contesta
 *  los que pide el filtro de la Prestadora de la dirección, y todos si no hay filtro: si la ruta
 *  perdiera el filtro, el cese ajeno aparecería. Con la credencial de quien pide imita
 *  `admin_gestiona_ceses`: sólo los de su Prestadora, y a quien coordina ninguno. */
function cesesEnLaBase(...filas) {
  const contestar = (_cuerpo, credencial, url) => {
    if (credencial !== LLAVE_MAESTRA) {
      if (rolDelUsuario === 'coordinador') return [];
      return filas.filter((fila) => fila.prestadora_id === PRESTADORA);
    }
    const filtro = url.match(/prestadora_id=eq\.([^&]+)/);
    return filtro ? filas.filter((fila) => fila.prestadora_id === decodeURIComponent(filtro[1])) : filas;
  };
  respuestas.set('GET /rest/v1/ceses', contestar);
  respuestas.set('PATCH /rest/v1/ceses', (cuerpo, credencial, url) =>
    contestar(cuerpo, credencial, url).map((fila) => ({ id: fila.id })));
}

/** Lo que se le preguntó a la tabla de ceses. */
function consultasDeCeses() {
  return llamadas.filter((l) => l.clave.endsWith(' /rest/v1/ceses'));
}

// ---------------------------------------------------------------------------------------
// Guardar el documento que se bajó
// ---------------------------------------------------------------------------------------

describe('guardar un documento de cese', () => {
  it('el documento sube al depósito y queda apuntado en el cese', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese()]);
    respuestas.set('PATCH /rest/v1/ceses', () => [{ id: CESE }]);

    const { estado, cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.equal(estado, 200);
    assert.equal(cuerpo.ok, true);
    assert.equal(cuerpo.documentos_generados[TIPO_LIQUIDACION].ruta, `${PRESTADORA}/${CESE}/${TIPO_LIQUIDACION}.pdf`);
    assert.ok(cuerpo.documentos_generados[TIPO_LIQUIDACION].generado_en);

    const subida = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/'));
    assert.equal(subida.clave, `POST /storage/v1/object/documentos-cese/${PRESTADORA}/${CESE}/${TIPO_LIQUIDACION}.pdf`);
  });

  it('lo que ya estaba guardado no se pierde al guardar otro documento', async () => {
    const antes = { ruta: `${PRESTADORA}/${CESE}/${TIPO_TELEGRAMA}.pdf`, generado_en: '2026-09-01T10:00:00.000Z' };
    respuestas.set('GET /rest/v1/ceses', () => [unCese({ documentos_generados: { [TIPO_TELEGRAMA]: antes } })]);
    respuestas.set('PATCH /rest/v1/ceses', () => [{ id: CESE }]);

    const { cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.deepEqual(cuerpo.documentos_generados[TIPO_TELEGRAMA], antes);
    assert.ok(cuerpo.documentos_generados[TIPO_LIQUIDACION]);
  });

  it('un tipo que no está en la lista no llega al depósito', async () => {
    const { estado, cuerpo } = await subir(CESE, { tipo: '../../otra-prestadora/algo' });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'documento_invalido');
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('sin tipo tampoco', async () => {
    const { estado } = await subir(CESE, {});
    assert.equal(estado, 400);
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('lo que no es un PDF no entra', async () => {
    const { estado, cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION, archivo: unPdf('text/html') });

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'documento_invalido');
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('el cese de otra Prestadora no existe para ésta, y nada se sube a su nombre', async () => {
    cesesEnLaBase(unCese({ prestadora_id: OTRA_PRESTADORA }));

    const { estado, cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'cese_no_encontrado');
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('si la fila del cese ya no está, no se contesta que salió todo bien', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese()]);
    respuestas.set('PATCH /rest/v1/ceses', () => []);

    const { estado, cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'cese_no_encontrado');
  });

  it('el error del depósito no cuenta hacia afuera qué pasó adentro', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese()]);
    errorDelDeposito = { __estado: 400, __cuerpo: { message: 'new row violates row-level security policy for bucket "documentos-cese"' } };

    const { cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.equal(JSON.stringify(cuerpo).includes('row-level security'), false);
    assert.equal(JSON.stringify(cuerpo).includes('documentos-cese'), false);
  });

  it('el cese se lee y se escribe atado a la Prestadora de quien pide', async () => {
    cesesEnLaBase(unCese());

    await subir(CESE, { tipo: TIPO_LIQUIDACION });

    const consultas = consultasDeCeses();
    assert.ok(consultas.length >= 2);
    for (const consulta of consultas) {
      assert.equal(consulta.credencial, LLAVE_MAESTRA, `${consulta.clave} no fue con la llave maestra`);
      assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`), `${consulta.clave} sin la Prestadora: ${consulta.url}`);
    }
    // La escritura apunta al cese comprobado, y a ningún otro.
    const escritura = consultas.find((l) => l.clave.startsWith('PATCH '));
    assert.ok(escritura.url.includes(`id=eq.${CESE}`), escritura.url);
  });

  it('quien coordina también guarda el documento, como antes', async () => {
    rolDelUsuario = 'coordinador';
    cesesEnLaBase(unCese());

    const { estado, cuerpo } = await subir(CESE, { tipo: TIPO_LIQUIDACION });

    assert.equal(estado, 200);
    assert.ok(cuerpo.documentos_generados[TIPO_LIQUIDACION]);
    const subida = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/'));
    assert.equal(subida.credencial, LLAVE_MAESTRA);
    assert.equal(subida.clave, `POST /storage/v1/object/documentos-cese/${PRESTADORA}/${CESE}/${TIPO_LIQUIDACION}.pdf`);
  });

  it('quien no es del Panel no guarda nada', async () => {
    rolDelUsuario = 'familia';
    const { estado } = await subir(CESE, { tipo: TIPO_LIQUIDACION });
    assert.equal(estado, 403);
  });
});

// ---------------------------------------------------------------------------------------
// Volver a ver el documento guardado
// ---------------------------------------------------------------------------------------

describe('la dirección firmada del documento guardado', () => {
  it('se firma la ruta armada con los datos del cese, y vence', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese({
      documentos_generados: { [TIPO_LIQUIDACION]: { ruta: 'da-lo-mismo-lo-que-diga-acá', generado_en: '2026-09-01T10:00:00.000Z' } },
    })]);

    const { estado, cuerpo } = await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);

    assert.equal(estado, 200);
    assert.ok(cuerpo.url.includes(`/object/sign/documentos-cese/${PRESTADORA}/${CESE}/${TIPO_LIQUIDACION}.pdf`));

    const firma = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/sign/'));
    // La ruta se arma acá, no se lee la que quedó guardada: lo guardado sólo dice si existe.
    assert.equal(firma.clave, `POST /storage/v1/object/sign/documentos-cese/${PRESTADORA}/${CESE}/${TIPO_LIQUIDACION}.pdf`);
    assert.equal(firma.cuerpo.expiresIn, 60);
  });

  it('la ruta que venga en el pedido no se usa para firmar nada', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese({
      documentos_generados: { [TIPO_LIQUIDACION]: { ruta: `${OTRA_PRESTADORA}/otro-cese/${TIPO_LIQUIDACION}.pdf` } },
    })]);

    const { cuerpo } = await pedirDireccion(
      `/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}&ruta=${OTRA_PRESTADORA}%2Fotro-cese%2F${TIPO_LIQUIDACION}.pdf`
    );

    assert.equal(cuerpo.url.includes(OTRA_PRESTADORA), false);
    assert.ok(cuerpo.url.includes(PRESTADORA));
  });

  it('un documento que todavía no se generó no tiene copia que mostrar', async () => {
    respuestas.set('GET /rest/v1/ceses', () => [unCese()]);

    const { estado, cuerpo } = await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'documento_no_generado');
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('un tipo inventado no se firma', async () => {
    const { estado, cuerpo } = await pedirDireccion(`/${CESE}/documento-url?tipo=certificado_trabajo`);

    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'documento_invalido');
    assert.equal(consultasDeCeses().length, 0);
  });

  it('el cese de otra Prestadora no se firma', async () => {
    cesesEnLaBase(unCese({
      prestadora_id: OTRA_PRESTADORA,
      documentos_generados: { [TIPO_LIQUIDACION]: { ruta: 'x', generado_en: '2026-09-01T10:00:00.000Z' } },
    }));

    const { estado, cuerpo } = await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);

    assert.equal(estado, 404);
    assert.equal(cuerpo.motivo, 'cese_no_encontrado');
    assert.equal(llamadas.some((l) => l.clave.startsWith('POST /storage/v1/')), false);
  });

  it('el cese se busca atado a la Prestadora de quien pide', async () => {
    cesesEnLaBase(unCese({
      documentos_generados: { [TIPO_LIQUIDACION]: { ruta: 'x', generado_en: '2026-09-01T10:00:00.000Z' } },
    }));

    await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);

    const lectura = consultasDeCeses()[0];
    assert.ok(lectura.url.includes(`prestadora_id=eq.${PRESTADORA}`), lectura.url);
  });

  it('quien coordina también ve el documento guardado, como antes', async () => {
    rolDelUsuario = 'coordinador';
    cesesEnLaBase(unCese({
      documentos_generados: { [TIPO_LIQUIDACION]: { ruta: 'x', generado_en: '2026-09-01T10:00:00.000Z' } },
    }));

    const { estado } = await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);

    assert.equal(estado, 200);
    const firma = llamadas.find((l) => l.clave.startsWith('POST /storage/v1/object/sign/'));
    assert.equal(firma.credencial, LLAVE_MAESTRA);
  });

  it('quien no es del Panel no pide direcciones firmadas', async () => {
    rolDelUsuario = 'asistente';
    const { estado } = await pedirDireccion(`/${CESE}/documento-url?tipo=${TIPO_LIQUIDACION}`);
    assert.equal(estado, 403);
  });
});
