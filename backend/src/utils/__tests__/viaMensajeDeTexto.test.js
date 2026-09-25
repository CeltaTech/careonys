/**
 * Pruebas de la vía del mensaje de texto.
 *
 * Lo que se cuida acá es la regla entera de esta vía: existe y sale en la lista aunque no haya
 * ningún proveedor contratado, y no se puede elegir mientras no lo haya. Las dos mitades importan
 * por igual —una vía escondida no se puede planificar, y una vía elegible que no manda nada deja
 * mensajes sin salir—, así que las dos están probadas.
 *
 * Y se prueba también que lo que llega del navegador no alcanza para encenderla: la pantalla no
 * es la que manda, porque el pedido se puede armar a mano.
 *
 *   node --test "src/utils/__tests__/viaMensajeDeTexto.test.js"
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { admiteMensajeDeTexto, sePuedeElegirMensajeDeTexto, mensajeDeTextoQueSeGuarda } from '../viaMensajeDeTexto.js';
import { CATALOGO_MENSAJES, mensajeDelCatalogo, mezclarMensajesConCatalogo } from '../catalogoAvisos.js';

const UN_MENSAJE = { admite_whatsapp: true };
const UN_MENSAJE_QUE_NO_LA_USA = { admite_whatsapp: false };

describe('la vía del mensaje de texto existe', () => {
  it('la admite todo aviso que sale por la misma cascada que WhatsApp', () => {
    assert.equal(admiteMensajeDeTexto(UN_MENSAJE), true);
    assert.equal(admiteMensajeDeTexto(mensajeDelCatalogo('guardia_sin_cubrir')), true);
  });

  it('el aviso que no usa esa cascada tampoco usa esta vía', () => {
    assert.equal(admiteMensajeDeTexto(UN_MENSAJE_QUE_NO_LA_USA), false);
  });

  it('sale en la lista de todos los avisos, con proveedor y sin proveedor', () => {
    for (const hayProveedorDeMensajeDeTexto of [false, true]) {
      const mezclados = mezclarMensajesConCatalogo([], { hayProveedorDeMensajeDeTexto });
      assert.equal(mezclados.length, CATALOGO_MENSAJES.length);
      assert.ok(
        mezclados.every((mensaje) => typeof mensaje.admite_mensaje_de_texto === 'boolean'),
        'algún aviso viajó sin decir si admite la vía',
      );
      assert.ok(
        mezclados.some((mensaje) => mensaje.admite_mensaje_de_texto === true),
        'ningún aviso admite la vía: la vía no está en la lista',
      );
    }
  });
});

describe('la vía del mensaje de texto no se puede elegir sin proveedor', () => {
  it('sin proveedor cargado, no se puede elegir en ningún aviso', () => {
    const mezclados = mezclarMensajesConCatalogo([], { hayProveedorDeMensajeDeTexto: false });
    assert.ok(
      mezclados.every((mensaje) => mensaje.mensaje_de_texto_disponible === false),
      'algún aviso quedó elegible sin proveedor cargado',
    );
    assert.equal(sePuedeElegirMensajeDeTexto({ mensaje: UN_MENSAJE, hayProveedor: false }), false);
  });

  it('sin proveedor es lo que pasa hoy: la mezcla sin opciones no la ofrece', () => {
    // La llamada sin decir nada es la de una Prestadora sin proveedor, que hoy son todas.
    const mezclados = mezclarMensajesConCatalogo([]);
    assert.ok(mezclados.every((mensaje) => mensaje.mensaje_de_texto_disponible === false));
  });

  it('con proveedor cargado, se puede elegir en los avisos que la admiten', () => {
    const mezclados = mezclarMensajesConCatalogo([], { hayProveedorDeMensajeDeTexto: true });
    const elegibles = mezclados.filter((mensaje) => mensaje.mensaje_de_texto_disponible === true);
    assert.ok(elegibles.length > 0, 'con proveedor cargado la vía sigue sin poder elegirse');
    assert.ok(elegibles.every((mensaje) => mensaje.admite_mensaje_de_texto === true));
    assert.equal(sePuedeElegirMensajeDeTexto({ mensaje: UN_MENSAJE, hayProveedor: true }), true);
  });

  it('una elección guardada de antes no enciende la vía si el proveedor ya no está', () => {
    const guardadas = [{ evento: 'guardia_sin_cubrir', emails: [], activo: true, mensaje_de_texto_activo: true }];

    const conProveedor = mezclarMensajesConCatalogo(guardadas, { hayProveedorDeMensajeDeTexto: true });
    assert.equal(conProveedor.find((a) => a.evento === 'guardia_sin_cubrir').mensaje_de_texto_activo, true);

    const sinProveedor = mezclarMensajesConCatalogo(guardadas, { hayProveedorDeMensajeDeTexto: false });
    assert.equal(sinProveedor.find((a) => a.evento === 'guardia_sin_cubrir').mensaje_de_texto_activo, false);
  });
});

describe('lo que se guarda no lo decide el navegador', () => {
  it('sin proveedor, un pedido que la enciende se guarda apagada', () => {
    assert.equal(mensajeDeTextoQueSeGuarda({ mensaje: UN_MENSAJE, hayProveedor: false, pedido: true }), false);
  });

  it('un aviso que no usa la vía la guarda apagada aunque haya proveedor', () => {
    assert.equal(mensajeDeTextoQueSeGuarda({ mensaje: UN_MENSAJE_QUE_NO_LA_USA, hayProveedor: true, pedido: true }), false);
  });

  it('con proveedor y en un aviso que la admite, se guarda lo que se pidió', () => {
    assert.equal(mensajeDeTextoQueSeGuarda({ mensaje: UN_MENSAJE, hayProveedor: true, pedido: true }), true);
    assert.equal(mensajeDeTextoQueSeGuarda({ mensaje: UN_MENSAJE, hayProveedor: true, pedido: false }), false);
  });

  it('falla cerrado: sin saber si hay proveedor, la vía queda apagada', () => {
    assert.equal(mensajeDeTextoQueSeGuarda({ mensaje: UN_MENSAJE, hayProveedor: undefined, pedido: true }), false);
    assert.equal(sePuedeElegirMensajeDeTexto({ mensaje: UN_MENSAJE, hayProveedor: undefined }), false);
  });
});
