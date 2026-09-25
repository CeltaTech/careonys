/**
 * Pruebas del candado del lado del backend.
 *
 * La aplicación ya sabe qué no le dieron a cada persona y no dibuja la pantalla, pero cualquiera
 * puede llamar a la dirección igual desde un navegador. Esto es lo que la frena, y sin esto la
 * instrucción que el titular firmó sería una decoración.
 *
 * No hace falta base de datos: las dos funciones guardan su respuesta en el pedido —igual que
 * `visibilidadDelPedido`—, así que la prueba deja las dos respuestas puestas y comprueba qué se
 * decide con ellas.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { accesosDeFabrica } from '../catalogoPersonasAutorizadas.js';
import { visibilidadDeFabrica } from '../catalogoVisibilidad.js';

// La conexión a la base se arma sola al importar, y `createClient` no acepta una dirección vacía.
// Acá no se consulta nada —las dos respuestas ya vienen puestas en el pedido—, pero el import la
// trae igual. Mismo recurso que en `marcarAusente.test.js`.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
const { exigeDePersonasAutorizadas, soloElTitular, visibilidadDeLaPersona } = await import('../accesosDePersonasAutorizadas.js');

function unPedido({ esTitular = false, accesos = accesosDeFabrica(), visibilidad = visibilidadDeFabrica() } = {}) {
  return {
    usuarioCliente: { id: 'quien-sea', clienteId: 'la-cliente', prestadoraId: 'la-prestadora', esTitular },
    visibilidadApp: visibilidad,
    accesosDePersonasAutorizadas: accesos,
  };
}

function unaRespuesta() {
  const res = { estado: null, cuerpo: null };
  res.status = (codigo) => { res.estado = codigo; return res; };
  res.json = (cuerpo) => { res.cuerpo = cuerpo; return res; };
  return res;
}

describe('exigeDePersonasAutorizadas', () => {
  it('deja pasar a quien tiene el acceso', async () => {
    const res = unaRespuesta();
    let siguio = false;
    await exigeDePersonasAutorizadas('persona_autorizada_reportes')(unPedido(), res, () => { siguio = true; });
    assert.equal(siguio, true);
    assert.equal(res.estado, null);
  });

  it('corta a quien no lo tiene, y dice por qué', async () => {
    // El motivo viaja aparte del texto porque «la Prestadora no ofrece esto» y «a usted no se lo
    // dieron» se explican distinto. Sin esa diferencia, la persona busca un botón que no le van a
    // habilitar nunca.
    const res = unaRespuesta();
    let siguio = false;
    const pedido = unPedido({ accesos: { ...accesosDeFabrica(), persona_autorizada_dinero: false } });
    await exigeDePersonasAutorizadas('persona_autorizada_dinero')(pedido, res, () => { siguio = true; });
    assert.equal(siguio, false);
    assert.equal(res.estado, 403);
    assert.equal(res.cuerpo.motivo, 'sin_acceso');
  });

  it('las dos acciones de escritura vienen negadas de fábrica', async () => {
    for (const clave of ['persona_autorizada_califica_al_asistente', 'persona_autorizada_pide_medicacion']) {
      const res = unaRespuesta();
      let siguio = false;
      await exigeDePersonasAutorizadas(clave)(unPedido(), res, () => { siguio = true; });
      assert.equal(siguio, false, clave);
      assert.equal(res.estado, 403, clave);
    }
  });

  it('falla cerrado ante un acceso que no está en la lista', async () => {
    // Pasa mientras una versión vieja del backend y una nueva del catálogo conviven un rato.
    // CLAUDE.md: ante un dato que no se pudo resolver, la respuesta es denegar.
    const res = unaRespuesta();
    let siguio = false;
    await exigeDePersonasAutorizadas('persona_autorizada_que_todavia_no_existe')(unPedido(), res, () => { siguio = true; });
    assert.equal(siguio, false);
    assert.equal(res.estado, 403);
  });
});

describe('soloElTitular', () => {
  it('el titular pasa', () => {
    const res = unaRespuesta();
    let siguio = false;
    soloElTitular(unPedido({ esTitular: true }), res, () => { siguio = true; });
    assert.equal(siguio, true);
  });

  it('nadie más firma la hoja que le recorta los accesos a él mismo', () => {
    const res = unaRespuesta();
    let siguio = false;
    soloElTitular(unPedido(), res, () => { siguio = true; });
    assert.equal(siguio, false);
    assert.equal(res.estado, 403);
    assert.equal(res.cuerpo.motivo, 'sin_acceso');
  });

  it('sin sesión de Cliente tampoco pasa', () => {
    // Falla cerrado: un pedido sin `usuarioCliente` no es un titular, y comparar contra un valor
    // ausente es justo el caso que `CLAUDE.md` avisa que deja pasar sin querer.
    const res = unaRespuesta();
    let siguio = false;
    soloElTitular({}, res, () => { siguio = true; });
    assert.equal(siguio, false);
    assert.equal(res.estado, 403);
  });
});

describe('visibilidadDeLaPersona', () => {
  it('al titular no le recorta nada: ve todo lo de su cuenta', async () => {
    const pedido = unPedido({ esTitular: true, accesos: { persona_autorizada_ubicacion_en_vivo: false } });
    assert.deepEqual(await visibilidadDeLaPersona(pedido), visibilidadDeFabrica());
  });

  it('apaga el interruptor de la columna que esta persona no tiene', async () => {
    // El mapa vive adentro de la guardia: cortar la ruta le sacaría la agenda entera a quien sí
    // puede verla. Lo que se apaga es la columna, y entonces el dato ni sale de la base.
    const pedido = unPedido({ accesos: { ...accesosDeFabrica(), persona_autorizada_ubicacion_en_vivo: false } });
    const recortada = await visibilidadDeLaPersona(pedido);
    assert.equal(recortada.cliente_ubicacion_en_vivo, false);
    assert.equal(recortada.cliente_signos_vitales, true);
  });

  it('un acceso sin interruptor no inventa ninguno', async () => {
    // Los reportes son una pantalla entera: la corta la ruta, no una casilla. Negarlos no tiene
    // que mover ninguna casilla de la Prestadora, ni de más ni de menos. La comparación va contra
    // lo que ve una persona con los accesos de fábrica, que ya trae apagadas las dos casillas de
    // las acciones de escritura.
    const conLoDeFabrica = await visibilidadDeLaPersona(unPedido());
    const sinReportes = await visibilidadDeLaPersona(
      unPedido({ accesos: { ...accesosDeFabrica(), persona_autorizada_reportes: false } }),
    );
    assert.deepEqual(sinReportes, conLoDeFabrica);
  });

  it('de fábrica ya vienen apagadas las dos casillas de escritura', async () => {
    // Calificar y pedir medicación vienen negadas para todo las personas autorizadas hasta que el titular firme
    // otra cosa, así que la aplicación no tiene que dibujar ninguno de los dos botones.
    const recortada = await visibilidadDeLaPersona(unPedido());
    assert.equal(recortada.cliente_califica_al_asistente, false);
    assert.equal(recortada.cliente_pide_medicacion, false);
    assert.equal(recortada.cliente_medicacion_del_paciente, true);
  });

  it('nunca enciende lo que la Prestadora apagó', async () => {
    // El recorte va en un solo sentido: quita, no agrega. Si esto fallara, una instrucción de una
    // Cliente estaría levantando la decisión de quien presta el servicio.
    const visibilidad = { ...visibilidadDeFabrica(), cliente_medicacion_del_paciente: false };
    const pedido = unPedido({ visibilidad, accesos: { ...accesosDeFabrica(), persona_autorizada_medicacion: true } });
    assert.equal((await visibilidadDeLaPersona(pedido)).cliente_medicacion_del_paciente, false);
  });

  it('no toca la visibilidad de la Prestadora, que viaja aparte al teléfono', async () => {
    // `/perfil` manda las dos cosas por separado: qué ofrece la Prestadora y qué le dieron a esta
    // persona. Si el recorte pisara la primera, la aplicación no podría distinguir «esto no existe
    // acá» de «esto existe pero a usted no se lo dieron».
    const visibilidad = visibilidadDeFabrica();
    const pedido = unPedido({ visibilidad, accesos: { ...accesosDeFabrica(), persona_autorizada_dinero: false } });
    await visibilidadDeLaPersona(pedido);
    assert.equal(visibilidad.cliente_pagos_y_suscripcion, true);
    assert.equal(pedido.visibilidadApp.cliente_pagos_y_suscripcion, true);
  });

  it('contesta una sola vez por pedido', async () => {
    const pedido = unPedido({ accesos: { ...accesosDeFabrica(), persona_autorizada_dinero: false } });
    const primera = await visibilidadDeLaPersona(pedido);
    assert.equal(await visibilidadDeLaPersona(pedido), primera);
  });
});
