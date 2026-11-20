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

import {
  CATALOGO_MENSAJES,
  mensajeDelCatalogo,
  mezclarMensajesConCatalogo,
  notificaClientePorDefecto,
  sePuedeApagar,
} from '../catalogoAvisos.js';

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
      assert.equal(typeof mensaje.admite_cliente, 'boolean');
    }
  });

  it('busca un aviso por su clave y devuelve null si no existe', () => {
    assert.equal(mensajeDelCatalogo('turno_guardia_sin_cubrir').evento, 'turno_guardia_sin_cubrir');
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
    assert.equal(primero.notificar_cliente, false);
  });

  it('lo que la Prestadora guardó le gana a lo de fábrica', () => {
    const mezclados = mezclarMensajesConCatalogo([
      {
        evento: 'turno_guardia_sin_cubrir',
        emails: ['coordinacion@ejemplo.com'],
        activo: false,
        whatsapp_activo: true,
        notificar_cliente: false,
      },
    ]);
    const turno_guardia = mezclados.find((mensaje) => mensaje.evento === 'turno_guardia_sin_cubrir');
    assert.equal(turno_guardia.configurado, true);
    assert.equal(turno_guardia.activo, false);
    assert.deepEqual(turno_guardia.emails, ['coordinacion@ejemplo.com']);
    assert.equal(turno_guardia.whatsapp_activo, true);
  });

  it('un aviso se puede apagar mientras no diga lo contrario', () => {
    assert.equal(sePuedeApagar(mensajeDelCatalogo('turno_guardia_sin_cubrir')), true);
    // El Cliente lo está esperando en la pantalla para poder firmar: acá se elige el canal, no
    // si sale.
    assert.equal(sePuedeApagar(mensajeDelCatalogo('codigo_instruccion_personas_autorizadas')), false);
  });

  it('el turno sin cubrir no se apaga, admite WhatsApp y no le llega al Cliente', () => {
    const turno = mensajeDelCatalogo('turno_sin_cubrir');
    assert.equal(turno.evento, 'turno_sin_cubrir');
    assert.equal(sePuedeApagar(turno), false);
    assert.equal(turno.admite_whatsapp, true);
    assert.equal(turno.admite_cliente, false);
    assert.equal(notificaClientePorDefecto(turno), false);

    const [mezclado] = mezclarMensajesConCatalogo([
      { evento: 'turno_sin_cubrir', emails: [], activo: false },
    ]).filter((m) => m.evento === 'turno_sin_cubrir');
    assert.equal(mezclado.activo, true);
  });

  it('el turno vacante sigue siendo otro aviso, y se puede apagar', () => {
    assert.notEqual(mensajeDelCatalogo('turno_guardia_sin_cubrir'), mensajeDelCatalogo('turno_sin_cubrir'));
    assert.equal(sePuedeApagar(mensajeDelCatalogo('turno_guardia_sin_cubrir')), true);
  });

  it('los avisos que no se apagan salen apagados de la mezcla como encendidos', () => {
    const mezclados = mezclarMensajesConCatalogo([
      { evento: 'codigo_instruccion_personas_autorizadas', emails: [], activo: false },
    ]);
    const codigo = mezclados.find((mensaje) => mensaje.evento === 'codigo_instruccion_personas_autorizadas');
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

describe('el aviso al Cliente sin nada guardado', () => {
  it('el cambio de Asistente le llega al Cliente mientras la Prestadora no lo apague', () => {
    assert.equal(notificaClientePorDefecto('cambio_de_asistente'), true);
    const [cambio] = mezclarMensajesConCatalogo([]).filter((m) => m.evento === 'cambio_de_asistente');
    assert.equal(cambio.notificar_cliente, true);
  });

  it('lo que la Prestadora guardó gana sobre el valor de fábrica', () => {
    const [cambio] = mezclarMensajesConCatalogo([
      { evento: 'cambio_de_asistente', emails: [], activo: true, notificar_cliente: false },
    ]).filter((m) => m.evento === 'cambio_de_asistente');
    assert.equal(cambio.notificar_cliente, false);
  });

  it('un aviso que no admite Cliente nunca le llega', () => {
    for (const mensaje of CATALOGO_MENSAJES.filter((m) => !m.admite_cliente)) {
      assert.equal(notificaClientePorDefecto(mensaje), false, mensaje.evento);
    }
  });
});
