import test from 'node:test';
import assert from 'node:assert/strict';

import { carpetaDeDocumentos, esRutaDeDocumentoDe, extensionDeArchivo, rutaDeDocumentoNuevo } from '../archivosSubidos.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const OTRA_PRESTADORA = '22222222-2222-2222-2222-222222222222';
const ASISTENTE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTRO_ASISTENTE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const RUTA_PROPIA = `${PRESTADORA}/${ASISTENTE}/cccccccc-cccc-cccc-cccc-cccccccccccc.pdf`;

test('extensionDeArchivo', async (t) => {
  await t.test('conoce los tipos que aceptan las rutas de subida', () => {
    assert.equal(extensionDeArchivo('application/pdf'), 'pdf');
    assert.equal(extensionDeArchivo('image/png'), 'png');
    assert.equal(extensionDeArchivo('image/jpeg'), 'jpg');
    assert.equal(extensionDeArchivo('image/webp'), 'webp');
    assert.equal(extensionDeArchivo('image/heic'), 'heic');
  });

  // Las rutas ya filtran el tipo antes de llegar acá, así que este caso no debería ocurrir.
  // Si ocurriera, la extensión no puede quedar vacía: un archivo sin extensión en el depósito
  // no se abre en ningún lado.
  await t.test('ante un tipo desconocido no devuelve vacío', () => {
    assert.equal(extensionDeArchivo('application/octet-stream'), 'jpg');
    assert.equal(extensionDeArchivo(undefined), 'jpg');
  });
});

test('rutaDeDocumentoNuevo', async (t) => {
  await t.test('empieza por la Prestadora y sigue por el Asistente', () => {
    const ruta = rutaDeDocumentoNuevo(PRESTADORA, ASISTENTE, 'pdf');
    assert.ok(ruta.startsWith(`${PRESTADORA}/${ASISTENTE}/`));
    assert.ok(ruta.endsWith('.pdf'));
  });

  await t.test('dos subidas no pisan el mismo nombre', () => {
    assert.notEqual(rutaDeDocumentoNuevo(PRESTADORA, ASISTENTE, 'pdf'), rutaDeDocumentoNuevo(PRESTADORA, ASISTENTE, 'pdf'));
  });

  // Lo que arma la ruta y lo que la comprueba tienen que estar de acuerdo: si se despegan,
  // el Asistente sube un archivo que después no puede volver a mirar.
  await t.test('lo que arma pasa lo que comprueba', () => {
    const ruta = rutaDeDocumentoNuevo(PRESTADORA, ASISTENTE, 'png');
    assert.equal(esRutaDeDocumentoDe(ruta, PRESTADORA, ASISTENTE), true);
  });
});

test('esRutaDeDocumentoDe', async (t) => {
  await t.test('acepta la carpeta propia', () => {
    assert.equal(esRutaDeDocumentoDe(RUTA_PROPIA, PRESTADORA, ASISTENTE), true);
  });

  await t.test('rechaza el mismo Asistente bajo otra Prestadora', () => {
    const ajena = `${OTRA_PRESTADORA}/${ASISTENTE}/doc.pdf`;
    assert.equal(esRutaDeDocumentoDe(ajena, PRESTADORA, ASISTENTE), false);
  });

  await t.test('rechaza otro Asistente de la misma Prestadora', () => {
    const ajena = `${PRESTADORA}/${OTRO_ASISTENTE}/doc.pdf`;
    assert.equal(esRutaDeDocumentoDe(ajena, PRESTADORA, ASISTENTE), false);
  });

  await t.test('rechaza la carpeta propia escondida adentro de otra ruta', () => {
    const disfrazada = `${OTRA_PRESTADORA}/${PRESTADORA}/${ASISTENTE}/doc.pdf`;
    assert.equal(esRutaDeDocumentoDe(disfrazada, PRESTADORA, ASISTENTE), false);
  });

  await t.test('rechaza lo que siga bajando después de la carpeta', () => {
    const masAbajo = `${carpetaDeDocumentos(PRESTADORA, ASISTENTE)}sub/doc.pdf`;
    assert.equal(esRutaDeDocumentoDe(masAbajo, PRESTADORA, ASISTENTE), false);
  });

  await t.test('rechaza subir un escalón con puntos', () => {
    assert.equal(esRutaDeDocumentoDe(`${carpetaDeDocumentos(PRESTADORA, ASISTENTE)}..`, PRESTADORA, ASISTENTE), false);
    assert.equal(esRutaDeDocumentoDe(`${carpetaDeDocumentos(PRESTADORA, ASISTENTE)}.`, PRESTADORA, ASISTENTE), false);
  });

  await t.test('rechaza la carpeta sin archivo', () => {
    assert.equal(esRutaDeDocumentoDe(carpetaDeDocumentos(PRESTADORA, ASISTENTE), PRESTADORA, ASISTENTE), false);
  });

  // Falla cerrado: si no se pudo resolver quién pregunta, no se contesta que sí.
  await t.test('sin Prestadora o sin Asistente no acepta nada', () => {
    assert.equal(esRutaDeDocumentoDe(RUTA_PROPIA, undefined, ASISTENTE), false);
    assert.equal(esRutaDeDocumentoDe(RUTA_PROPIA, PRESTADORA, undefined), false);
    assert.equal(esRutaDeDocumentoDe(RUTA_PROPIA, null, null), false);
  });

  await t.test('lo que no es texto no es una ruta', () => {
    assert.equal(esRutaDeDocumentoDe(undefined, PRESTADORA, ASISTENTE), false);
    assert.equal(esRutaDeDocumentoDe(['ruta'], PRESTADORA, ASISTENTE), false);
    assert.equal(esRutaDeDocumentoDe(42, PRESTADORA, ASISTENTE), false);
  });
});
