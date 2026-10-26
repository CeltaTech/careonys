/**
 * La firma de la instrucción del titular de las personas autorizadas, del lado del código de un solo uso
 * (pendiente #177).
 *
 *   npm test --prefix backend
 *
 * POR QUÉ ESTE CAMINO ES EL MÁS EXPUESTO DE LOS DOS. En el pase de guardia el código lo suelta
 * alguien de la Prestadora con sesión iniciada; acá, en cambio, quien pide el código y quien lo
 * prueba son exactamente la misma persona. Un contador que volvía a cero al pedir un código nuevo
 * dejaba entonces que el titular —o cualquiera que hubiera entrado a esa cuenta— pidiera, probara
 * cinco, pidiera de nuevo, y así hasta acertar los seis dígitos.
 *
 * Lo que se prueba acá: que pedir un código nuevo no toca la cuenta, que el intento lo suma la
 * base en un solo paso, que agotado el tope no se compara nada, y que un código vencido no gasta
 * intentos —que es lo que deja intacto el caso legítimo de quien pide otro porque se le venció—.
 *
 * Y al final, el consentimiento de quien paga cuando otra persona ya lo cerró o lo anuló: dos
 * personas con la misma página abierta, una registra la firma o lo anula y la otra intenta lo
 * mismo. No hay nada que hacer y no es un error: no se toca nada y se contesta bien. Esa parte de
 * la base aplica los filtros de cada modificación: si no los aplicara, «ya estaba cerrado» no se
 * distinguiría de «se cerró ahora», y la prueba no podría fallar.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

import { verificadorDelCodigo } from '../codigoDeUnSoloUso.js';

const INSTRUCCION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENTE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PRESTADORA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** Qué contesta la base a cada `MÉTODO /ruta`. */
const respuestas = new Map();
/** Todo lo que se le pidió a la base, con el cuerpo: ahí se ve qué columnas se escribieron. */
let llamadas = [];
/** La instrucción tal como la tendría anotada la base. */
let instruccion;

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const ruta = url.pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
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

// El import va después de las variables de entorno: este archivo sí arma la conexión al cargarse.
const { confirmarConCodigo, pedirCodigo } = await import('../instruccionesPersonasAutorizadas.js');
const { anularPendiente, cerrarConPapelFirmado } = await import('../consentimientoPagador.js');

after(() => baseFalsa.close());

function actualizaciones() {
  return llamadas.filter((l) => l.clave === 'PATCH /rest/v1/instrucciones_acceso_personas_autorizadas').map((l) => l.cuerpo);
}

function intentosSumados() {
  return llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/sumar_intento_de_codigo').map((l) => l.cuerpo);
}

function enUnRato(minutos) {
  return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}
function haceUnRato(minutos) {
  return new Date(Date.now() - minutos * 60 * 1000).toISOString();
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  instruccion = {
    id: INSTRUCCION,
    prestadora_id: PRESTADORA,
    estado: 'pendiente_firma',
    codigo_verificador: verificadorDelCodigo('123456'),
    codigo_expira_en: enUnRato(10),
    codigo_intentos: 0,
  };

  respuestas.set('GET /rest/v1/instrucciones_acceso_personas_autorizadas', () => [instruccion]);
  respuestas.set('PATCH /rest/v1/instrucciones_acceso_personas_autorizadas', ({ cuerpo }) => {
    Object.assign(instruccion, cuerpo);
    return [instruccion];
  });
  // La base suma el intento en una sola sentencia y devuelve el número nuevo. Se imita de verdad:
  // una base falsa que devolviera siempre 1 dejaría pasar cualquier cantidad de intentos.
  respuestas.set('POST /rest/v1/rpc/sumar_intento_de_codigo', ({ cuerpo }) => {
    // La Prestadora viaja en el pedido y la base falsa la exige, igual que la de verdad: una suma
    // que llegara sin ella —o con otra— no cuenta nada.
    if (
      cuerpo?.p_tabla !== 'instrucciones_acceso_personas_autorizadas'
      || cuerpo.p_id !== INSTRUCCION
      || cuerpo.p_prestadora_id !== PRESTADORA
    ) return undefined;
    instruccion.codigo_intentos = (instruccion.codigo_intentos ?? 0) + 1;
    return instruccion.codigo_intentos;
  });
});

describe('confirmar la instrucción con el código', () => {
  it('el código correcto la cierra, y el identificador de verificación no queda vivo', async () => {
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.ok, true);

    const [cierre] = actualizaciones();
    assert.equal(cierre.estado, 'cerrada');
    assert.equal(cierre.cerrada_como, 'confirmada_en_la_app');
    assert.equal(cierre.codigo_verificador, null);
    assert.equal(cierre.codigo_expira_en, null);
  });

  it('el intento lo suma la base en un solo paso, no el backend leyendo y escribiendo', async () => {
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '000000' });
    assert.equal(resultado.motivo, 'codigo_incorrecto');

    const [sumado] = intentosSumados();
    assert.deepEqual(sumado, {
      p_tabla: 'instrucciones_acceso_personas_autorizadas',
      p_id: INSTRUCCION,
      p_prestadora_id: PRESTADORA,
    });
    assert.equal(instruccion.codigo_intentos, 1);
    // Y el backend no escribió la cuenta por su lado: si lo hiciera, dos intentos a la vez contarían
    // como uno.
    assert.equal(actualizaciones().some((a) => 'codigo_intentos' in a), false);
  });

  it('el sexto intento no compara nada y bloquea por el tiempo de vida del código', async () => {
    instruccion.codigo_intentos = 5;
    instruccion.codigo_expira_en = enUnRato(2);
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, 'demasiados_intentos');
    assert.equal(resultado.minutos, 10);
    assert.deepEqual(actualizaciones().map((a) => Object.keys(a)), [['codigo_expira_en']], 'sólo se corre el vencimiento: no se cierra nada');
    assert.equal(instruccion.estado, 'pendiente_firma');
  });

  it('durante el bloqueo se informa cuánto falta, sin correrlo', async () => {
    instruccion.codigo_intentos = 6;
    instruccion.codigo_expira_en = enUnRato(3);
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.motivo, 'demasiados_intentos');
    assert.equal(resultado.minutos, 3);
    assert.equal(actualizaciones().length, 0);
  });

  it('un código vencido no gasta ningún intento', async () => {
    instruccion.codigo_expira_en = haceUnRato(1);
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.motivo, 'vencido');
    assert.equal(intentosSumados().length, 0);
    assert.equal(instruccion.codigo_intentos, 0);
  });

  it('si la base no puede contar el intento, se niega: falla cerrado', async () => {
    respuestas.set('POST /rest/v1/rpc/sumar_intento_de_codigo', () => undefined);
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, 'demasiados_intentos');
    assert.equal(actualizaciones().length, 0);
  });

  it('sobre una instrucción que ya no está pendiente no se cuenta ni se compara', async () => {
    instruccion.estado = 'cerrada';
    const resultado = await confirmarConCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA, codigo: '123456' });
    assert.equal(resultado.motivo, 'ya_cerrada');
    assert.equal(intentosSumados().length, 0);
  });
});

describe('pedir un código nuevo', () => {
  beforeEach(() => {
    respuestas.set('GET /rest/v1/prestadoras', () => [{ nombre_fantasia: 'Prestadora de prueba' }]);
    // Sin teléfono no se sale hacia WhatsApp, y sin cuenta de correo la función corta con
    // «sin_canal» antes de mandar nada: la prueba nunca llama a un servicio de afuera.
    respuestas.set('GET /rest/v1/usuarios', () => [{ telefono: null }]);
  });

  it('escribe el identificador de verificación y el vencimiento, y NO vuelve a cero la cuenta de intentos', async () => {
    instruccion.codigo_intentos = 4;

    await pedirCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA }).catch(() => {});

    const [emision] = actualizaciones();
    assert.ok(emision, 'tiene que haberse escrito el código nuevo');
    assert.match(emision.codigo_verificador, /^[0-9a-f]{64}$/);
    assert.ok(new Date(emision.codigo_expira_en) > new Date());
    // Ésta es la prueba del defecto: con `codigo_intentos: 0` acá, pedir otro código devolvía
    // cinco intentos más y el tope dejaba de ser un tope.
    assert.equal(
      Object.prototype.hasOwnProperty.call(emision, 'codigo_intentos'),
      false,
      'pedir un código nuevo no puede devolver intentos',
    );
    assert.equal(instruccion.codigo_intentos, 4, 'la cuenta tiene que quedar donde estaba');
  });

  it('se escriben esas dos columnas y ninguna más: ni el código en claro ni la cuenta', async () => {
    await pedirCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA }).catch(() => {});
    const [emision] = actualizaciones();
    assert.deepEqual(Object.keys(emision).sort(), ['codigo_expira_en', 'codigo_verificador']);
  });

  it('sobre una instrucción que ya no está pendiente no se emite ningún código', async () => {
    instruccion.estado = 'cerrada';
    await assert.rejects(
      () => pedirCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA }),
      (error) => error.motivo === 'ya_cerrada',
    );
    assert.equal(actualizaciones().length, 0);
  });

  it('durante el bloqueo no se emite ningún código, y se dice cuánto falta', async () => {
    instruccion.codigo_intentos = 6;
    instruccion.codigo_expira_en = enUnRato(4);
    await assert.rejects(
      () => pedirCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA }),
      (error) => error.motivo === 'demasiados_intentos' && error.minutos === 4,
    );
    assert.equal(actualizaciones().length, 0);
  });

  it('pasado el bloqueo, el código nuevo trae los cinco intentos', async () => {
    instruccion.codigo_intentos = 6;
    instruccion.codigo_expira_en = haceUnRato(1);
    await pedirCodigo({ instruccionId: INSTRUCCION, clienteId: CLIENTE, prestadoraId: PRESTADORA }).catch(() => {});
    const [emision] = actualizaciones();
    assert.ok(emision, 'tiene que haberse escrito el código nuevo');
    assert.equal(emision.codigo_intentos, 0);
    assert.ok(new Date(emision.codigo_expira_en) > new Date());
  });
});

// ---------------------------------------------------------------------------------------
// El consentimiento de quien paga cuando otra persona ya lo cerró o lo anuló

const CONSENTIMIENTO = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PRESTADORA_AJENA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('el consentimiento de quien paga que ya no espera firma', () => {
  let consentimientos;
  const cumple = (fila, url) =>
    [...url.searchParams].every(([columna, condicion]) =>
      !(columna in fila) || !String(condicion).startsWith('eq.') || String(fila[columna]) === String(condicion).slice(3));
  const unConsentimiento = (estado) => ({
    id: CONSENTIMIENTO,
    prestadora_id: PRESTADORA,
    estado,
    archivo_firmado_url: estado === 'cerrado' ? 'otra/ruta.pdf' : null,
  });
  const modificaciones = () => llamadas.filter((l) => l.clave === 'PATCH /rest/v1/consentimientos_pagador');
  const pedido = { consentimientoId: CONSENTIMIENTO, prestadoraId: PRESTADORA };

  beforeEach(() => {
    consentimientos = [];
    respuestas.set('GET /rest/v1/consentimientos_pagador', ({ url }) => consentimientos.filter((fila) => cumple(fila, url)));
    respuestas.set('PATCH /rest/v1/consentimientos_pagador', ({ cuerpo, url }) => {
      const tocadas = [];
      consentimientos = consentimientos.map((fila) => {
        if (!cumple(fila, url)) return fila;
        const nueva = { ...fila, ...cuerpo };
        tocadas.push(nueva);
        return nueva;
      });
      return tocadas;
    });
  });

  it('registrar la firma de uno pendiente lo cierra con el archivo', async () => {
    consentimientos = [unConsentimiento('pendiente_firma')];
    assert.equal(await cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' }), true);
    assert.equal(consentimientos[0].estado, 'cerrado');
    assert.equal(consentimientos[0].archivo_firmado_url, 'ruta/nueva.pdf');
  });

  for (const estado of ['cerrado', 'anulado']) {
    it(`registrar la firma de uno ya ${estado} contesta sin error y no toca nada`, async () => {
      consentimientos = [unConsentimiento(estado)];
      const antes = structuredClone(consentimientos);
      assert.equal(await cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' }), false);
      assert.deepEqual(consentimientos, antes);
      assert.equal(modificaciones().length, 0, 'no se le pidió ninguna modificación a la base');
    });
  }

  it('registrar la firma de uno de otra Prestadora no lo encuentra', async () => {
    consentimientos = [{ ...unConsentimiento('pendiente_firma'), prestadora_id: PRESTADORA_AJENA }];
    await assert.rejects(
      cerrarConPapelFirmado({ ...pedido, archivoUrl: 'ruta/nueva.pdf' }),
      (err) => err.motivo === 'no_encontrado',
    );
    assert.equal(consentimientos[0].estado, 'pendiente_firma');
  });

  it('anular uno pendiente lo anula', async () => {
    consentimientos = [unConsentimiento('pendiente_firma')];
    assert.equal(await anularPendiente(pedido), true);
    assert.equal(consentimientos[0].estado, 'anulado');
  });

  for (const estado of ['cerrado', 'anulado']) {
    it(`anular uno ya ${estado} contesta sin error y no toca nada`, async () => {
      consentimientos = [unConsentimiento(estado)];
      const antes = structuredClone(consentimientos);
      assert.equal(await anularPendiente(pedido), false);
      assert.deepEqual(consentimientos, antes);
    });
  }

  it('anular uno de otra Prestadora no lo toca', async () => {
    consentimientos = [{ ...unConsentimiento('pendiente_firma'), prestadora_id: PRESTADORA_AJENA }];
    await anularPendiente(pedido);
    assert.equal(consentimientos[0].estado, 'pendiente_firma');
  });
});
