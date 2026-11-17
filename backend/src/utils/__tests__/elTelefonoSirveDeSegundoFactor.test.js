/**
 * Cuándo un número sirve de llave para recuperar la clave.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * LA REGLA. Un número sirve cuando está verificado y la Prestadora tiene por dónde mandar el código.
 * Nadie de la oficina tiene que confirmar nada: el número se verificó con el código que le llegó a
 * ese mismo número, y eso alcanza.
 *
 * CADA CASO ESTÁ POR EL ERROR QUE EVITA:
 *
 *   1. QUE EL NÚMERO VERIFICADO NO SIRVA. Es la regla.
 *   2. QUE SIRVA SIN VERIFICAR. El control roto a propósito: los mismos datos, sin la verificación,
 *      tienen que dar que no.
 *   3. QUE APAREZCA UNA ESPERA POR TIEMPO. La fecha de verificación no decide nada: una de hace un
 *      año da lo mismo que una de recién.
 *   4. QUE SE PREGUNTE POR LA CUENTA SIN NÚMERO. Sin número no hay nada que preguntar.
 *   5. QUE SE OFREZCA LA VÍA QUE LA PRESTADORA NO TIENE.
 *   6. QUE VUELVA LA CONFIRMACIÓN POR LA OFICINA. No se pregunta a la base nada más que la vía.
 *   7. QUE EL NÚMERO VIAJE EN ALGUNA DIRECCIÓN. Es dato sensible.
 *   8. QUE EL MÓDULO EXPONGA ALGO MÁS QUE LA PREGUNTA.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UN_ASISTENTE = '44444444-4444-4444-8444-444444444444';

const CELULAR = '+54 9 11 5555-1234';

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
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const segundoFactor = await import('../segundoFactorDelTelefono.js');
const { elTelefonoSirveDeSegundoFactor } = segundoFactor;

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

describe('el número sirve de llave cuando está verificado', () => {
  it('el número verificado sirve', async () => {
    viaDeTelefono(true);
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta()), true);
  });

  // El control roto a propósito: los mismos datos, sin verificar, dan que no. Sin esto, la prueba
  // de arriba no probaría nada: daría igual con una función que contestara siempre que sí.
  it('el mismo número, sin verificar, no sirve', async () => {
    viaDeTelefono(true);
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta({ telefono_verificado_en: null })), false);
  });

  it('no hay ninguna espera por tiempo: verificado hace un año sirve igual', async () => {
    viaDeTelefono(true);
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta({ telefono_verificado_en: HACE_UN_ANO })), true);
  });

  it('sin número no pregunta nada', async () => {
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta({ telefono: null })), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin cuenta no pregunta nada', async () => {
    assert.equal(await elTelefonoSirveDeSegundoFactor(null), false);
    assert.deepEqual(llamadas, []);
  });

  it('sin vía para mandar el código no sirve, aunque esté verificado', async () => {
    viaDeTelefono(false);
    assert.equal(await elTelefonoSirveDeSegundoFactor(laCuenta()), false);
  });

  it('no le pregunta a la base si alguien de la oficina confirmó el número', async () => {
    viaDeTelefono(true);
    await elTelefonoSirveDeSegundoFactor(laCuenta());
    for (const llamada of llamadas) {
      assert.equal(llamada.clave, 'GET /rest/v1/plantillas_whatsapp', `consulta de más: ${llamada.clave}`);
    }
  });

  it('el número no viaja en ninguna dirección', async () => {
    viaDeTelefono(true);
    await elTelefonoSirveDeSegundoFactor(laCuenta());

    const crudo = llamadas.map((l) => l.url).join(' ');
    for (const numero of [CELULAR, '5491155551234', '551234', '5555-1234']) {
      assert.ok(!crudo.includes(numero), `se filtró ${numero}`);
    }
  });

  it('el módulo no expone nada más que la pregunta', async () => {
    assert.deepEqual(Object.keys(segundoFactor).sort(), ['elTelefonoSirveDeSegundoFactor']);
  });
});
