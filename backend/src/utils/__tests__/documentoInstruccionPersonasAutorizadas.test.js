/**
 * Pruebas de la autorización que firma el titular.
 *
 * Es el documento que queda como constancia el día que alguien diga «yo nunca autoricé eso», así
 * que lo que se cuida acá no es la estética: que cada persona autorizada aparezca con nombre y DNI,
 * que figure sólo lo que se le permitió, que el texto no se contradiga con lo que rige, y que el
 * identificador de verificación cambie ante cualquier retoque del texto.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  IDIOMA_DEL_DOCUMENTO,
  textoDeLaInstruccion,
  verificadorDelDocumento,
} from '../documentoInstruccionPersonasAutorizadas.js';
import { CATALOGO_PERSONAS_AUTORIZADAS, accesosDeFabrica } from '../catalogoPersonasAutorizadas.js';

const PRESTADORA = { nombre: 'Cuidados del Sur' };
const TITULAR = { nombre: 'Ana Gómez' };
const FECHA = new Date('2026-09-08T15:30:00Z');
const QR = '- Mostrar el QR de entrada y salida del Asistente';

const MARCELA = { nombre: 'Marcela Gómez', dni: '30111222', accesos: accesosDeFabrica() };

function unaHoja(personas) {
  return textoDeLaInstruccion({ prestadora: PRESTADORA, titular: TITULAR, personas, fecha: FECHA });
}

// Devuelve los renglones de la lista de una persona: los que siguen a su encabezado hasta el
// siguiente renglón vacío.
function listaDe(texto, encabezado) {
  const renglones = texto.split('\n');
  const desde = renglones.indexOf(encabezado);
  assert.notEqual(desde, -1, `la hoja no tiene a «${encabezado}»`);
  const resto = renglones.slice(desde + 1);
  const hasta = resto.indexOf('');
  return resto.slice(0, hasta === -1 ? resto.length : hasta);
}

describe('textoDeLaInstruccion', () => {
  it('el documento se guarda en castellano y así queda declarado', () => {
    assert.equal(IDIOMA_DEL_DOCUMENTO, 'es-AR');
  });

  it('empieza con el título y la fecha', () => {
    const renglones = unaHoja([MARCELA]).split('\n');
    assert.equal(renglones[0], 'AUTORIZACIÓN DE ACCESO Y ASIGNACIÓN DE PERMISOS');
    assert.ok(renglones.includes('Fecha: 08/09/2026'));
  });

  it('dice quién autoriza a quién', () => {
    assert.match(
      unaHoja([MARCELA]),
      /Ana Gómez, titular de la cuenta, autoriza a Cuidados del Sur a dar acceso a la aplicación a las personas que figuran abajo, con los permisos que se detallan para cada una\./,
    );
  });

  it('cada persona autorizada aparece con su nombre y su DNI', () => {
    const texto = unaHoja([MARCELA, { nombre: 'Jorge Gómez', dni: '8765432', accesos: accesosDeFabrica() }]);
    assert.ok(texto.split('\n').includes('Marcela Gómez — DNI 30.111.222'));
    assert.ok(texto.split('\n').includes('Jorge Gómez — DNI 8.765.432'));
  });

  it('lista sólo lo permitido, en el orden del catálogo, y cierra con el QR', () => {
    const esperado = CATALOGO_PERSONAS_AUTORIZADAS
      .filter((cosa) => cosa.de_fabrica)
      .map((cosa) => `- ${cosa.descripcion}`);
    assert.deepEqual(listaDe(unaHoja([MARCELA]), 'Marcela Gómez — DNI 30.111.222'), [...esperado, QR]);
  });

  it('lo negado no figura', () => {
    const accesos = { ...accesosDeFabrica(), persona_autorizada_dinero: true };
    const sinDinero = { ...accesos, persona_autorizada_dinero: false };
    const dinero = CATALOGO_PERSONAS_AUTORIZADAS.find((cosa) => cosa.clave === 'persona_autorizada_dinero').descripcion;
    assert.match(unaHoja([{ ...MARCELA, accesos }]), new RegExp(dinero));
    assert.doesNotMatch(unaHoja([{ ...MARCELA, accesos: sinDinero }]), new RegExp(dinero));
  });

  it('a quien no le dieron nada le queda sólo el QR', () => {
    const accesos = Object.fromEntries(CATALOGO_PERSONAS_AUTORIZADAS.map((cosa) => [cosa.clave, false]));
    assert.deepEqual(listaDe(unaHoja([{ ...MARCELA, accesos }]), 'Marcela Gómez — DNI 30.111.222'), [QR]);
  });

  it('sin personas lo dice con todas las letras', () => {
    assert.match(unaHoja([]), /No hay ninguna persona autorizada\./);
  });

  it('lleva las tres condiciones', () => {
    const texto = unaHoja([MARCELA]);
    assert.match(texto, /\nCondiciones\n1\. Cada persona puede ver y hacer sólo lo que figura en su lista\.\n/);
    assert.match(texto, /\n2\. Ana Gómez, como titular, conserva el acceso a toda la información de la cuenta\.\n/);
    assert.match(texto, /\n3\. Esta autorización rige desde su firma\. .*reemplaza a esta por completo\.$/);
  });

  it('no trae lo que se sacó del documento', () => {
    const texto = unaHoja([MARCELA]);
    assert.doesNotMatch(texto, /Cargada por/);
    assert.doesNotMatch(texto, /No puede/);
    assert.doesNotMatch(texto, /Prestadora:/);
    assert.doesNotMatch(texto, /instrucción/i);
  });

  it('un dato que falta no rompe la hoja ni escribe «undefined»', () => {
    const texto = textoDeLaInstruccion({ personas: [{ accesos: accesosDeFabrica() }] });
    assert.ok(!texto.includes('undefined'));
    assert.ok(!texto.includes('null'));
  });
});

describe('verificadorDelDocumento', () => {
  it('el mismo texto da siempre el mismo identificador de verificación', () => {
    const texto = unaHoja([MARCELA]);
    assert.equal(verificadorDelDocumento(texto), verificadorDelDocumento(texto));
  });

  it('mover una sola coma cambia el identificador de verificación', () => {
    // Es todo lo que el identificador de verificación promete: no es firma digital, es la
    // constancia de que el texto guardado es el que se firmó.
    const texto = unaHoja([MARCELA]);
    assert.notEqual(verificadorDelDocumento(texto), verificadorDelDocumento(`${texto} `));
  });

  it('dos hojas que se diferencian en un solo acceso no comparten identificador de verificación', () => {
    const otra = unaHoja([{ ...MARCELA, accesos: { ...accesosDeFabrica(), persona_autorizada_dinero: !accesosDeFabrica().persona_autorizada_dinero } }]);
    assert.notEqual(verificadorDelDocumento(unaHoja([MARCELA])), verificadorDelDocumento(otra));
  });

  it('el identificador de verificación es sha256 en hexadecimal', () => {
    assert.match(verificadorDelDocumento('lo que sea'), /^[0-9a-f]{64}$/);
  });
});
