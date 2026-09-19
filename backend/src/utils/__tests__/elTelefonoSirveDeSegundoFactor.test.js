/**
 * Cuándo un número sirve de llave para recuperar la clave.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * QUÉ SE CORRIGE. Había una espera por tiempo que valía cero horas mientras nadie fijara otra cosa,
 * así que cualquier número que su dueño hubiera verificado quedaba habilitado solo. Una espera que
 * se cumple sola es una habilitación automática con otro nombre: el número que alguien cambió y
 * verificó desde una cuenta abierta se convertía en la llave de esa cuenta sin que ninguna persona
 * interviniera. Ahora la habilitación la hace una persona, y no hay ninguna otra forma de
 * conseguirla.
 *
 * CADA CASO ESTÁ POR EL ERROR QUE EVITA:
 *
 *   1. QUE EL NÚMERO VERIFICADO Y SIN HABILITAR SIRVA. Es el defecto que se viene a corregir.
 *   2. QUE LA HABILITACIÓN NO SIRVA PARA NADA. El control roto a propósito: los mismos datos, con la
 *      habilitación puesta, tienen que dar que sí.
 *   3. QUE ALCANCE CON LA HABILITACIÓN SOLA. Verificar sigue haciendo falta.
 *   4. QUE APAREZCA UNA ESPERA POR TIEMPO. Ni por vencimiento ni por antigüedad: la fecha de
 *      verificación no decide nada, y por eso una de hace un año da lo mismo que una de recién.
 *   5. QUE SE PREGUNTE POR LA CUENTA SIN NÚMERO. Sin número no hay nada que preguntar.
 *   6. QUE SE OFREZCA LA VÍA QUE LA PRESTADORA NO TIENE.
 *   7. QUE SE HABILITE UN NÚMERO Y VALGA PARA OTRO. Se pregunta por la huella del que la cuenta
 *      tiene hoy.
 *   8. QUE EL NÚMERO VIAJE EN ALGUNA DIRECCIÓN. Es dato sensible.
 *   9. QUE QUEDE VIVA LA ESPERA VIEJA. El módulo no expone nada más que la pregunta.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UN_ASISTENTE = '44444444-4444-4444-8444-444444444444';

const CELULAR = '+54 9 11 5555-1234';
const OTRO_CELULAR = '+54 9 11 5555-9999';

const respuestas = new Map();
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: req.url });

    const valor = respuestas.get(clave);
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de las variables de entorno: la conexión se arma al importar.
const segundoFactor = await import('../segundoFactorDelTelefono.js');
const { elTelefonoSirveDeSegundoFactor } = segundoFactor;
const { huellaDelTelefono } = await import('../codigoAlTelefono.js');

after(() => {
  baseFalsa.close();
});

/** La Prestadora tiene aprobada la plantilla con la que sale el código, o no la tiene. */
function viaDeTelefono(hay) {
  respuestas.set(
    'GET /rest/v1/plantillas_whatsapp',
    hay ? [{ id: 'pl-1', nombre_interno: 'codigo', idioma: 'es', cuerpo_texto: '{{1}}', estado: 'aprobada' }] : [],
  );
}

/** Alguien de la Prestadora habilitó ese número, o no lo habilitó nadie. */
function habilitadoPorUnaPersona(hay) {
  respuestas.set(
    'GET /rest/v1/telefonos_confirmados_por_la_prestadora',
    hay ? [{ id: 'co-1' }] : [],
  );
}

const HACE_UN_RATO = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const HACE_UN_ANO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

function laCuenta(extra = {}) {
  return {
    id: UN_ASISTENTE,
    prestadora_id: PRESTADORA,
    telefono: CELULAR,
    telefono_verificado_en: HACE_UN_RATO,
    ...extra,
  };
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

describe('el número sirve de llave cuando una persona lo habilitó', () => {
  it('el número verificado y sin habilitar no sirve', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(false);

    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta()), false);
  });

  // El control roto a propósito: los mismos datos, con la habilitación puesta, dan que sí. Sin esto,
  // la prueba de arriba no probaría nada: daría igual con una función que contestara siempre que no.
  it('el mismo número, habilitado por una persona, sí sirve', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(true);

    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta()), true);
  });

  it('habilitado pero sin verificar no sirve', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(true);

    const sinVerificar = laCuenta({ telefono_verificado_en: null });
    assert.equal(await elTelefonoSirveDeSegundoFactor(sinVerificar), false);
  });

  it('no hay ninguna espera por tiempo: verificado hace un año y sin habilitar sigue sin servir', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(false);

    const viejo = laCuenta({ telefono_verificado_en: HACE_UN_ANO });
    assert.equal(await elTelefonoSirveDeSegundoFactor(viejo), false);
  });

  // Y al revés tampoco: la habilitación no se vence. Un número habilitado hace un año sigue
  // habilitado.
  it('la habilitación no se vence con el tiempo', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(true);

    const viejo = laCuenta({ telefono_verificado_en: HACE_UN_ANO });
    assert.equal(await elTelefonoSirveDeSegundoFactor(viejo), true);
  });

  it('la fecha de verificación no entra en ninguna consulta', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(false);

    await elTelefonoSirveDeSegundoFactor(laCuenta());

    for (const llamada of llamadas) {
      assert.ok(
        !/verificado_en|expira|vence/.test(llamada.url),
        `la consulta preguntó por una fecha: ${llamada.url}`,
      );
    }
  });

  it('sin número no pregunta nada', async () => {
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta({ telefono: null })), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin cuenta no pregunta nada', async () => {
    assert.equal(await elTelefonoSirveDeSegundoFactor(null), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin vía para mandar el código no sirve, aunque esté habilitado', async () => {
    viaDeTelefono(false);
    habilitadoPorUnaPersona(true);

    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta()), false);
  });

  it('pregunta por la huella del número que la cuenta tiene hoy, y no por otra', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(true);

    await elTelefonoSirveDeSegundoFactor(laCuenta());

    const consulta = llamadas.find(
      (l) => l.clave === 'GET /rest/v1/telefonos_confirmados_por_la_prestadora',
    );
    assert.ok(consulta.url.includes(huellaDelTelefono(CELULAR)));
    assert.ok(!consulta.url.includes(huellaDelTelefono(OTRO_CELULAR)));
  });

  it('el número no viaja en ninguna dirección', async () => {
    viaDeTelefono(true);
    habilitadoPorUnaPersona(false);

    await elTelefonoSirveDeSegundoFactor(laCuenta());

    const crudo = llamadas.map((l) => l.url).join(' ');
    for (const numero of [CELULAR, '5491155551234', '551234', '5555-1234']) {
      assert.ok(!crudo.includes(numero), `se filtró ${numero}`);
    }
  });

  it('no queda ninguna espera por tiempo en el módulo', async () => {
    // La espera vieja se leía de una variable de entorno y se calculaba acá. Si vuelve a aparecer
    // algo que decida por tiempo, esta lista lo muestra.
    assert.deepEqual(Object.keys(segundoFactor).sort(), ['elTelefonoSirveDeSegundoFactor']);
  });
});
