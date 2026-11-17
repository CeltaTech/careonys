// Las contraseñas de terceros se cifran con la clave de cada Prestadora. Estas pruebas miran lo que
// tiene que fallar: la clave de una Prestadora no abre lo de otra, sin clave no se guarda ni se
// lee nada, y un texto alterado no se lee. Las Prestadoras y las claves son inventadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  USO,
  MOTIVO_SECRETO,
  cifrarSecreto,
  descifrarSecreto,
  clavesDeLosSecretos,
  guardarSecretoDeTercero,
  leerSecretoDeTercero,
} from '../secretosDeTerceros.js';

const PRESTADORA_A = '11111111-1111-4111-8111-111111111111';
const PRESTADORA_B = '22222222-2222-4222-8222-222222222222';
const TEXTO = 'contraseña-inventada-de-un-tercero';

const clave = () => randomBytes(32).toString('base64');
const CLAVES = {
  [PRESTADORA_A]: { version: 1, claves: { 1: clave() } },
  [PRESTADORA_B]: { version: 1, claves: { 1: clave() } },
};

test('lo cifrado para una Prestadora se lee con su propia clave', () => {
  const fila = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, CLAVES);
  assert.equal(fila.version_de_clave, 1);
  assert.ok(!fila.texto_cifrado.includes(TEXTO));
  assert.equal(descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, ...fila }, CLAVES), TEXTO);
});

test('la clave de una Prestadora no descifra lo de otra', () => {
  const fila = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, CLAVES);
  // La fila de A, leída como si fuera de B: otra clave y otro dato autenticado.
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_B, uso: USO.AVISO_DE_COBRANZA, ...fila }, CLAVES),
    (error) => error.motivo === MOTIVO_SECRETO.ILEGIBLE,
  );
  // Y aun si B tuviera por error la misma clave que A, la fila de A no se lee como de B.
  const mismaClave = { ...CLAVES, [PRESTADORA_B]: CLAVES[PRESTADORA_A] };
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_B, uso: USO.AVISO_DE_COBRANZA, ...fila }, mismaClave),
    (error) => error.motivo === MOTIVO_SECRETO.ILEGIBLE,
  );
});

test('una contraseña no se puede pasar de un uso a otro', () => {
  const fila = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, CLAVES);
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_FACTURACION, ...fila }, CLAVES),
    (error) => error.motivo === MOTIVO_SECRETO.ILEGIBLE,
  );
});

test('sin clave de la Prestadora no se cifra ni se descifra: falla cerrado', () => {
  const soloA = { [PRESTADORA_A]: CLAVES[PRESTADORA_A] };
  assert.throws(
    () => cifrarSecreto({ prestadoraId: PRESTADORA_B, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, soloA),
    (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
  );
  const fila = cifrarSecreto({ prestadoraId: PRESTADORA_B, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, CLAVES);
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_B, uso: USO.AVISO_DE_COBRANZA, ...fila }, soloA),
    (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
  );
  // Ni con la variable vacía.
  assert.throws(
    () => cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, {}),
    (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
  );
});

test('una clave que no mide 32 bytes no sirve', () => {
  const corta = { [PRESTADORA_A]: { version: 1, claves: { 1: randomBytes(16).toString('base64') } } };
  assert.throws(
    () => cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, corta),
    (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
  );
});

test('la variable mal escrita falla cerrado', () => {
  assert.throws(() => clavesDeLosSecretos('{no es json'), (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE);
  assert.throws(() => clavesDeLosSecretos('[]'), (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE);
});

test('un texto cifrado alterado no se lee', () => {
  const fila = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto: TEXTO }, CLAVES);
  const [inicio, etiqueta, datos] = fila.texto_cifrado.split('.');
  const bytes = Buffer.from(datos, 'base64');
  bytes[0] ^= 1;
  const alterado = [inicio, etiqueta, bytes.toString('base64')].join('.');
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto_cifrado: alterado, version_de_clave: 1 }, CLAVES),
    (error) => error.motivo === MOTIVO_SECRETO.ILEGIBLE,
  );
  assert.throws(
    () => descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.AVISO_DE_COBRANZA, texto_cifrado: 'basura', version_de_clave: 1 }, CLAVES),
    (error) => error.motivo === MOTIVO_SECRETO.ILEGIBLE,
  );
});

test('con una versión nueva de la clave se sigue leyendo lo guardado con la anterior', () => {
  const vieja = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.MENSAJE_DE_TEXTO, texto: TEXTO }, CLAVES);
  const rotada = { [PRESTADORA_A]: { version: 2, claves: { ...CLAVES[PRESTADORA_A].claves, 2: clave() } } };
  const nueva = cifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.MENSAJE_DE_TEXTO, texto: TEXTO }, rotada);
  assert.equal(nueva.version_de_clave, 2);
  assert.equal(descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.MENSAJE_DE_TEXTO, ...vieja }, rotada), TEXTO);
  assert.equal(descifrarSecreto({ prestadoraId: PRESTADORA_A, uso: USO.MENSAJE_DE_TEXTO, ...nueva }, rotada), TEXTO);
});

/** Una base de mentira con una sola tabla, para ver qué llega a la base y qué vuelve. */
function baseDeMentira() {
  const filas = new Map();
  return {
    filas,
    from() {
      const filtros = {};
      const consulta = {
        upsert(fila) {
          filas.set(`${fila.prestadora_id}|${fila.uso}`, fila);
          return Promise.resolve({ error: null });
        },
        select() { return consulta; },
        eq(campo, valor) { filtros[campo] = valor; return consulta; },
        maybeSingle() {
          return Promise.resolve({ data: filas.get(`${filtros.prestadora_id}|${filtros.uso}`) ?? null, error: null });
        },
      };
      return consulta;
    },
  };
}

test('a la base llega sólo el texto cifrado, y se lee de vuelta con la variable de entorno', async () => {
  const antes = process.env.CLAVES_DE_LOS_SECRETOS_DE_TERCEROS;
  process.env.CLAVES_DE_LOS_SECRETOS_DE_TERCEROS = JSON.stringify(CLAVES);
  try {
    const db = baseDeMentira();
    await guardarSecretoDeTercero(db, PRESTADORA_A, USO.WHATSAPP_TOKEN_DE_ACCESO, TEXTO);
    const guardada = db.filas.get(`${PRESTADORA_A}|${USO.WHATSAPP_TOKEN_DE_ACCESO}`);
    assert.ok(!JSON.stringify(guardada).includes(TEXTO));
    assert.equal(await leerSecretoDeTercero(db, PRESTADORA_A, USO.WHATSAPP_TOKEN_DE_ACCESO), TEXTO);
    assert.equal(await leerSecretoDeTercero(db, PRESTADORA_A, USO.WHATSAPP_SECRETO_DE_LA_APLICACION), null);

    process.env.CLAVES_DE_LOS_SECRETOS_DE_TERCEROS = '';
    await assert.rejects(
      () => leerSecretoDeTercero(db, PRESTADORA_A, USO.WHATSAPP_TOKEN_DE_ACCESO),
      (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
    );
    await assert.rejects(
      () => guardarSecretoDeTercero(db, PRESTADORA_A, USO.WHATSAPP_TOKEN_DE_ACCESO, TEXTO),
      (error) => error.motivo === MOTIVO_SECRETO.SIN_CLAVE,
    );
  } finally {
    if (antes === undefined) delete process.env.CLAVES_DE_LOS_SECRETOS_DE_TERCEROS;
    else process.env.CLAVES_DE_LOS_SECRETOS_DE_TERCEROS = antes;
  }
});
