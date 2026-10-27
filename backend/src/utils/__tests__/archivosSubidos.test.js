import test from 'node:test';
import assert from 'node:assert/strict';

import { carpetaDeDocumentos, extensionDeArchivo, rutaDeDocumentoNuevo } from '../archivosSubidos.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const ASISTENTE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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

  // Las políticas del depósito leen la Prestadora y el Legajo de las dos primeras carpetas: si
  // se despegan, el Asistente sube un archivo que después no puede volver a mirar.
  await t.test('es la carpeta del Legajo y un nombre de archivo, nada más', () => {
    const ruta = rutaDeDocumentoNuevo(PRESTADORA, ASISTENTE, 'png');
    assert.ok(ruta.startsWith(carpetaDeDocumentos(PRESTADORA, ASISTENTE)));
    assert.equal(ruta.split('/').length, 3);
  });
});
