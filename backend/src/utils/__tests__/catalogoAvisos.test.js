/**
 * Pruebas del catálogo de mensajes del sistema.
 *
 * Lo que se cuida acá es lo que salió mal antes: que un mensaje desaparezca de la pantalla
 * porque nadie le sembró la fila. La mezcla tiene que devolver siempre el catálogo entero,
 * tenga las filas que tenga esa Prestadora.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { CATALOGO_MENSAJES, mensajeDelCatalogo, mezclarMensajesConCatalogo, sePuedeApagar } from '../catalogoAvisos.js';

describe('catálogo de avisos', () => {
  it('no hay dos avisos con la misma clave', () => {
    const claves = CATALOGO_MENSAJES.map((mensaje) => mensaje.evento);
    assert.equal(new Set(claves).size, claves.length);
  });

  it('todos los avisos tienen sus cuatro datos', () => {
    for (const mensaje of CATALOGO_MENSAJES) {
      assert.equal(typeof mensaje.evento, 'string');
      assert.ok(mensaje.descripcion.length > 0, `${mensaje.evento} sin descripción`);
      assert.equal(typeof mensaje.admite_whatsapp, 'boolean');
      assert.equal(typeof mensaje.admite_familia, 'boolean');
    }
  });

  it('busca un aviso por su clave y devuelve null si no existe', () => {
    assert.equal(mensajeDelCatalogo('guardia_sin_cubrir').evento, 'guardia_sin_cubrir');
    assert.equal(mensajeDelCatalogo('un_aviso_que_no_existe'), null);
  });
});

describe('mezclarMensajesConCatalogo', () => {
  it('sin ninguna fila guardada, igual devuelve todos los avisos', () => {
    const mezclados = mezclarMensajesConCatalogo([]);
    assert.equal(mezclados.length, CATALOGO_MENSAJES.length);
    assert.ok(mezclados.every((mensaje) => mensaje.configurado === false));
  });

  it('sin fila, el aviso se manda igual: arranca encendido y sin correos', () => {
    const [primero] = mezclarMensajesConCatalogo(null);
    assert.equal(primero.activo, true);
    assert.deepEqual(primero.emails, []);
    assert.equal(primero.whatsapp_activo, false);
    assert.equal(primero.notificar_familia, false);
  });

  it('lo que la Prestadora guardó le gana a lo de fábrica', () => {
    const mezclados = mezclarMensajesConCatalogo([
      {
        evento: 'guardia_sin_cubrir',
        emails: ['coordinacion@ejemplo.com'],
        activo: false,
        whatsapp_activo: true,
        notificar_familia: false,
      },
    ]);
    const guardia = mezclados.find((mensaje) => mensaje.evento === 'guardia_sin_cubrir');
    assert.equal(guardia.configurado, true);
    assert.equal(guardia.activo, false);
    assert.deepEqual(guardia.emails, ['coordinacion@ejemplo.com']);
    assert.equal(guardia.whatsapp_activo, true);
  });

  it('un aviso se puede apagar mientras no diga lo contrario', () => {
    assert.equal(sePuedeApagar(mensajeDelCatalogo('guardia_sin_cubrir')), true);
    // La Familia lo está esperando en la pantalla para poder firmar: acá se elige el canal, no
    // si sale.
    assert.equal(sePuedeApagar(mensajeDelCatalogo('codigo_instruccion_circulo')), false);
  });

  it('los avisos que no se apagan salen apagados de la mezcla como encendidos', () => {
    const mezclados = mezclarMensajesConCatalogo([
      { evento: 'codigo_instruccion_circulo', emails: [], activo: false },
    ]);
    const codigo = mezclados.find((mensaje) => mensaje.evento === 'codigo_instruccion_circulo');
    assert.equal(codigo.se_puede_apagar, false);
    assert.equal(codigo.activo, true);
  });

  it('una fila vieja de un aviso que ya no existe no reaparece', () => {
    const mezclados = mezclarMensajesConCatalogo([
      { evento: 'vencimiento_monotributo', emails: [], activo: true },
    ]);
    assert.equal(mezclados.length, CATALOGO_MENSAJES.length);
    assert.ok(!mezclados.some((mensaje) => mensaje.evento === 'vencimiento_monotributo'));
  });
});
