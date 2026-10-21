/**
 * El código que va al teléfono: el vencimiento, el tope de intentos y el tope de pedidos por hora.
 *
 *   npm test --prefix backend
 *
 * NO SE PRUEBA QUE UN SHA256 SEA UN SHA256. Lo que se prueba es lo que decide quién pasa, que es
 * lo que está escrito en `utils/codigoAlTelefono.js`, y cada caso está por el error que evita:
 *
 *   1. QUE UN CÓDIGO VENCIDO SIRVA. Seis dígitos sin vencimiento son un secreto permanente de un
 *      millón de valores.
 *   2. QUE EL VENCIMIENTO GASTE INTENTOS. Se controla **antes** de contar, así que quien pide uno
 *      nuevo porque el anterior se le venció llega con los cinco enteros.
 *   3. QUE EL TOPE DE INTENTOS NO SEA UN TOPE. Pasado el tope no entra ni el código correcto.
 *   4. QUE SE PUEDAN PEDIR CÓDIGOS SIN LÍMITE. Cada envío lo paga la Prestadora.
 *   5. QUE EL TOPE SE SALTEE CUANDO LA BASE NO CONTESTA. Todo control falla cerrado.
 *
 * LAS TRES PRUEBAS QUE IMPORTAN ROMPEN EL CONTROL A PROPÓSITO: la misma llamada, con el
 * vencimiento movido hacia adelante o con los intentos por debajo del tope, tiene que pasar. Sin
 * eso una prueba que dice «falló» no prueba nada, porque podría estar fallando por otra cosa.
 *
 * Y TODO VA CON EL TRABAJO DE LA PRESTADORA DE LA CUENTA. Ni con la credencial de una persona, que
 * no puede tocar los códigos, ni con una que alcance otra Prestadora.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TELEFONO = '+5491122334455';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo, credencial: req.headers.authorization });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, {
        'Content-Type': 'application/json',
        ...(valor.__cabeceras ?? {}),
      });
      res.end(JSON.stringify(valor.__cuerpo));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ...(valor && valor.__cabeceras ? valor.__cabeceras : {}),
    });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const {
  comprobarCodigoDelTelefono,
  mandarCodigoAlTelefono,
  topeDeCodigosPorHora,
  minutosDeVidaDelCodigo,
  verificadorDelTelefono,
  normalizarTelefono,
  telefonoAceptable,
  USO_VERIFICAR,
} = await import('../codigoAlTelefono.js');
const { verificadorDelCodigo, INTENTOS_MAXIMOS } = await import('../codigoDeUnSoloUso.js');

after(() => {
  baseFalsa.close();
});

const EL_CODIGO = '123456';

function enMinutos(minutos) {
  return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}

/** La fila del código pendiente, tal como la lee `comprobarCodigoDelTelefono`. */
function filaDelCodigo(extra = {}) {
  return {
    id: CODIGO_ID,
    telefono: TELEFONO,
    codigo_verificador: verificadorDelCodigo(EL_CODIGO),
    codigo_expira_en: enMinutos(10),
    verificado_en: null,
    anulado_en: null,
    ...extra,
  };
}

/** Deja la base falsa lista para que comprobar un código salga bien de punta a punta. */
function prepararComprobacion({ fila, intentos }) {
  respuestas.set('GET /rest/v1/codigos_al_telefono', [fila]);
  // La Prestadora viaja en el pedido y la base falsa la exige, igual que la de verdad: una suma que
  // llegara sin ella —o con otra— no cuenta nada, y el backend lo tiene que tratar como agotado.
  respuestas.set('POST /rest/v1/rpc/sumar_intento_de_codigo', ({ cuerpo }) => {
    if (cuerpo?.p_tabla !== 'codigos_al_telefono' || cuerpo.p_id !== fila.id) return undefined;
    if (cuerpo.p_prestadora_id !== PRESTADORA) return undefined;
    return intentos;
  });
  respuestas.set('PATCH /rest/v1/codigos_al_telefono', [{ id: CODIGO_ID }]);
}

function seContoUnIntento() {
  return llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/sumar_intento_de_codigo');
}

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(String(autorizacion).replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** Que todo lo que se le pidió a la base haya ido con el trabajo de la Prestadora de la cuenta. */
function todoConElTrabajoDeLaPrestadora() {
  assert.ok(llamadas.length > 0, 'tenía que haber consultado la base');
  for (const llamada of llamadas) {
    const credencial = leerCredencial(llamada.credencial);
    assert.equal(credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
    assert.equal(credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
  }
}

async function motivoDe(promesa) {
  try {
    await promesa;
    return null;
  } catch (err) {
    return err.motivo ?? err.message;
  }
}

async function errorDe(promesa) {
  try {
    await promesa;
  } catch (err) {
    return err;
  }
  assert.fail('tenía que rechazar');
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  delete process.env.MINUTOS_DEL_CODIGO_AL_TELEFONO;
  delete process.env.TOPE_CODIGOS_AL_TELEFONO_POR_HORA;
});

describe('el número, escrito siempre igual', () => {
  it('le saca el adorno y conserva el signo de más', () => {
    assert.equal(normalizarTelefono(' +54 9 11 2233-4455 '), '+5491122334455');
    assert.equal(normalizarTelefono('(011) 2233 4455'), '01122334455');
  });

  it('el mismo número escrito de dos maneras tiene un solo identificador de verificación', () => {
    assert.equal(verificadorDelTelefono('+54 9 11 2233 4455'), verificadorDelTelefono('+5491122334455'));
  });

  it('lo que no puede ser un teléfono no pasa', () => {
    assert.equal(telefonoAceptable('123'), false);
    assert.equal(telefonoAceptable('1'.repeat(16)), false);
    assert.equal(telefonoAceptable(''), false);
    assert.equal(telefonoAceptable(null), false);
    assert.equal(telefonoAceptable('+5491122334455'), true);
  });
});

describe('el vencimiento', () => {
  it('un código vencido no entra, ni siendo el correcto', async () => {
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(-1) }), intentos: 1 });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(motivo, 'codigo_vencido');
  });

  it('y el mismo código, con el vencimiento movido hacia adelante, entra', async () => {
    // El control roto a propósito: si esto no pasara, la prueba de arriba no probaría nada.
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(1) }), intentos: 1 });

    const usado = await comprobarCodigoDelTelefono({
      prestadoraId: PRESTADORA,
      usuarioId: USUARIO,
      uso: USO_VERIFICAR,
      codigo: EL_CODIGO,
    });

    assert.equal(usado.id, CODIGO_ID);
    assert.equal(usado.telefono, TELEFONO);
  });

  it('vencer no gasta intentos: se controla antes de contar', async () => {
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(-1) }), intentos: 1 });

    await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(seContoUnIntento(), false);
  });

  it('una fila sin vencimiento cargado se trata como vencida', async () => {
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: null }), intentos: 1 });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(motivo, 'codigo_vencido');
  });
});

describe('el tope de intentos', () => {
  it('pasado el tope no entra ni el código correcto', async () => {
    prepararComprobacion({ fila: filaDelCodigo(), intentos: INTENTOS_MAXIMOS + 1 });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(motivo, 'demasiados_intentos');
    // Y no se tomó: un código que se rechazó por el tope tiene que seguir sin usarse.
    assert.equal(
      llamadas.some((l) => l.clave === 'PATCH /rest/v1/codigos_al_telefono' && l.cuerpo?.verificado_en),
      false,
    );
  });

  it('el intento que agota el tope bloquea el código por los minutos que vive uno', async () => {
    process.env.MINUTOS_DEL_CODIGO_AL_TELEFONO = '10';
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(1) }), intentos: INTENTOS_MAXIMOS + 1 });

    await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: '000000' }),
    );

    const bloqueo = llamadas.find((l) => l.clave === 'PATCH /rest/v1/codigos_al_telefono' && l.cuerpo?.codigo_expira_en);
    assert.ok(bloqueo, 'tenía que correr el vencimiento');
    const minutos = (new Date(bloqueo.cuerpo.codigo_expira_en).getTime() - Date.now()) / 60000;
    assert.ok(minutos > 9.9 && minutos <= 10, `el bloqueo tenía que ser de 10 minutos y fue de ${minutos}`);
    todoConElTrabajoDeLaPrestadora();
  });

  it('los intentos durante el bloqueo no lo estiran', async () => {
    prepararComprobacion({ fila: filaDelCodigo(), intentos: INTENTOS_MAXIMOS + 2 });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: '000000' }),
    );

    assert.equal(motivo, 'demasiados_intentos');
    assert.equal(llamadas.some((l) => l.clave === 'PATCH /rest/v1/codigos_al_telefono'), false);
  });

  it('el rechazo dice cuántos minutos esperar: los del bloqueo entero al agotarlo', async () => {
    process.env.MINUTOS_DEL_CODIGO_AL_TELEFONO = '10';
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(1) }), intentos: INTENTOS_MAXIMOS + 1 });

    const err = await errorDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: '000000' }),
    );

    assert.equal(err.motivo, 'demasiados_intentos');
    assert.equal(err.minutos, 10);
  });

  it('y durante el bloqueo, los que le quedan, redondeados para arriba', async () => {
    prepararComprobacion({ fila: filaDelCodigo({ codigo_expira_en: enMinutos(3.5) }), intentos: INTENTOS_MAXIMOS + 2 });

    const err = await errorDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: '000000' }),
    );

    assert.equal(err.motivo, 'demasiados_intentos');
    assert.equal(err.minutos, 4);
  });

  it('justo en el tope todavía entra', async () => {
    // El control roto a propósito, del otro lado del borde.
    prepararComprobacion({ fila: filaDelCodigo(), intentos: INTENTOS_MAXIMOS });

    const usado = await comprobarCodigoDelTelefono({
      prestadoraId: PRESTADORA,
      usuarioId: USUARIO,
      uso: USO_VERIFICAR,
      codigo: EL_CODIGO,
    });

    assert.equal(usado.id, CODIGO_ID);
    todoConElTrabajoDeLaPrestadora();
  });

  it('si la base no pudo contar el intento, no pasa nadie', async () => {
    prepararComprobacion({ fila: filaDelCodigo(), intentos: null });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(motivo, 'demasiados_intentos');
  });

  it('el código equivocado gasta intento y no dice más que «incorrecto»', async () => {
    prepararComprobacion({ fila: filaDelCodigo(), intentos: 2 });

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: '000000' }),
    );

    assert.equal(motivo, 'codigo_incorrecto');
    assert.equal(seContoUnIntento(), true);
  });

  it('sin código pendiente se contesta lo mismo que con uno equivocado', async () => {
    respuestas.set('GET /rest/v1/codigos_al_telefono', []);

    const motivo = await motivoDe(
      comprobarCodigoDelTelefono({ prestadoraId: PRESTADORA, usuarioId: USUARIO, uso: USO_VERIFICAR, codigo: EL_CODIGO }),
    );

    assert.equal(motivo, 'codigo_incorrecto');
  });
});

describe('el tope de pedidos por hora', () => {
  /** La Prestadora con la plantilla del código aprobada. */
  function conPlantillaAprobada() {
    respuestas.set('GET /rest/v1/plantillas_whatsapp', [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        nombre_interno: 'codigo_de_acceso',
        idioma: 'es',
        cuerpo_texto: 'Su código es {{1}}',
        estado: 'aprobada',
      },
    ]);
  }

  /* Cuántos pedidos contesta la base para la última hora.
     Contar sin traer filas es un `HEAD`, y el número viene en `Content-Range`. */
  function conPedidosEnLaHora(cuantos) {
    respuestas.set('HEAD /rest/v1/pedidos_de_codigo_al_telefono', {
      __estado: 200,
      __cabeceras: { 'Content-Range': `0-0/${cuantos}` },
      __cuerpo: null,
    });
  }

  const usuario = { id: USUARIO, prestadora_id: PRESTADORA, telefono: TELEFONO };

  it('alcanzado el tope no sale ningún código más', async () => {
    conPlantillaAprobada();
    conPedidosEnLaHora(topeDeCodigosPorHora());

    const motivo = await motivoDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.equal(motivo, 'demasiados_pedidos');
    // Y no se emitió ninguno: el tope tiene que frenar antes de escribir.
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/codigos_al_telefono'), false);
  });

  it('el tope dice cuántos minutos faltan para que el pedido más viejo cumpla la hora', async () => {
    conPlantillaAprobada();
    conPedidosEnLaHora(topeDeCodigosPorHora());
    respuestas.set('GET /rest/v1/pedidos_de_codigo_al_telefono', [{ pedido_en: enMinutos(-45) }]);

    const err = await errorDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.equal(err.motivo, 'demasiados_pedidos');
    assert.equal(err.minutos, 15);
    todoConElTrabajoDeLaPrestadora();
  });

  it('y si la base no dice cuándo fue el más viejo, la hora entera', async () => {
    conPlantillaAprobada();
    conPedidosEnLaHora(topeDeCodigosPorHora());

    const err = await errorDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.equal(err.motivo, 'demasiados_pedidos');
    assert.equal(err.minutos, 60);
  });

  it('un pedido por debajo del tope sí sale', async () => {
    // El control roto a propósito. Acá el envío por WhatsApp falla —no hay proveedor de verdad—,
    // y lo que importa es que el motivo ya no sea el del tope: se pasó de largo.
    conPlantillaAprobada();
    conPedidosEnLaHora(topeDeCodigosPorHora() - 1);
    respuestas.set('PATCH /rest/v1/codigos_al_telefono', []);
    respuestas.set('POST /rest/v1/codigos_al_telefono', [
      { id: CODIGO_ID, codigo_expira_en: enMinutos(10) },
    ]);
    respuestas.set('POST /rest/v1/pedidos_de_codigo_al_telefono', []);
    respuestas.set('GET /rest/v1/canales_whatsapp', []);

    const motivo = await motivoDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.notEqual(motivo, 'demasiados_pedidos');
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/codigos_al_telefono'), true);
    todoConElTrabajoDeLaPrestadora();
  });

  it('si no se pudieron contar los pedidos, no sale ninguno', async () => {
    conPlantillaAprobada();
    respuestas.set('HEAD /rest/v1/pedidos_de_codigo_al_telefono', {
      __estado: 500,
      __cuerpo: { message: 'la base no contesta' },
    });

    const motivo = await motivoDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.equal(motivo, 'demasiados_pedidos');
  });

  it('sin plantilla aprobada la vía del teléfono no se ofrece', async () => {
    respuestas.set('GET /rest/v1/plantillas_whatsapp', []);

    const motivo = await motivoDe(mandarCodigoAlTelefono({ usuario, uso: USO_VERIFICAR }));

    assert.equal(motivo, 'via_de_telefono_no_disponible');
  });

  it('el tope y los minutos salen del entorno, y lo mal cargado no manda', () => {
    process.env.TOPE_CODIGOS_AL_TELEFONO_POR_HORA = '3';
    assert.equal(topeDeCodigosPorHora(), 3);

    process.env.TOPE_CODIGOS_AL_TELEFONO_POR_HORA = '0';
    assert.equal(topeDeCodigosPorHora(), 5);

    process.env.MINUTOS_DEL_CODIGO_AL_TELEFONO = 'diez';
    assert.equal(minutosDeVidaDelCodigo(), 10);

    process.env.MINUTOS_DEL_CODIGO_AL_TELEFONO = '';
    assert.equal(minutosDeVidaDelCodigo(), 10);
  });
});
