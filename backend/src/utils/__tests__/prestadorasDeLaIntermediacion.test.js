/**
 * Las listas de Prestadoras de los trabajos de fondo se arman de a una Prestadora, con el trabajo de
 * cada una, y nunca con la llave maestra.
 *
 *   node --test src/utils/__tests__/prestadorasDeLaIntermediacion.test.js
 *
 * La base es de mentira y anota con qué credencial le llegó cada consulta. Contesta como lo haría la
 * protección por fila: a cada Prestadora le muestra sólo su propia fila, y sólo la primera la tiene.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const LA_QUE_CUMPLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LA_QUE_NO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Lo que lleva adentro la credencial con la que llegó un pedido: quién es y de qué Prestadora. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

let llamadas = [];
let fallaLaLista = false;

const baseFalsa = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url, 'http://interno');
    const credencial = leerCredencial(req.headers.authorization ?? '');
    llamadas.push({ ruta: url.pathname, consulta: url.searchParams, credencial });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/rest/v1/rpc/prestadoras_a_recorrer') {
      if (fallaLaLista) {
        res.writeHead(500);
        res.end(JSON.stringify({ message: 'la base no contesta' }));
        return;
      }
      res.end(JSON.stringify([LA_QUE_CUMPLE, LA_QUE_NO]));
      return;
    }
    // Lo que vería la protección por fila: sólo la fila de la Prestadora de la credencial, y sólo
    // la primera tiene una.
    res.end(JSON.stringify(credencial?.prestadora_id === LA_QUE_CUMPLE ? [{ prestadora_id: LA_QUE_CUMPLE, id: LA_QUE_CUMPLE }] : []));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const { prestadorasDeLaIntermediacion, prestadorasConAusenciaAutomatica, prestadorasCertificadas } = await import(
  '../prestadorasDeLaIntermediacion.js'
);

after(() => {
  baseFalsa.close();
});

beforeEach(() => {
  llamadas = [];
  fallaLaLista = false;
});

const LISTAS = [
  ['las del Match', prestadorasDeLaIntermediacion, '/rest/v1/configuracion_cobro_intermediacion', 'prestadora_id'],
  ['las de la ausencia automática', prestadorasConAusenciaAutomatica, '/rest/v1/configuracion_ausencia_automatica', 'prestadora_id'],
  ['las certificadas', prestadorasCertificadas, '/rest/v1/prestadoras', 'id'],
];

for (const [nombre, armar, ruta, columna] of LISTAS) {
  describe(nombre, () => {
    it('se miran de a una con el trabajo de cada una, y no con la llave maestra', async () => {
      assert.deepEqual(await armar(), [LA_QUE_CUMPLE]);

      const [lista, ...deCadaUna] = llamadas;
      assert.equal(lista.ruta, '/rest/v1/rpc/prestadoras_a_recorrer');
      assert.equal(lista.credencial?.role, 'trabajo_sin_persona');
      assert.ok(!lista.credencial?.prestadora_id, 'la lista sale sin Prestadora');

      assert.equal(deCadaUna.length, 2);
      for (const llamada of deCadaUna) {
        assert.equal(llamada.ruta, ruta);
        assert.equal(llamada.credencial?.role, 'trabajo_sin_persona');
        assert.equal(llamada.consulta.get(columna), `eq.${llamada.credencial?.prestadora_id}`, 'nombra la misma que su credencial');
      }
      assert.deepEqual(deCadaUna.map((l) => l.credencial.prestadora_id), [LA_QUE_CUMPLE, LA_QUE_NO]);
    });

    it('sin la lista de a quiénes recorrer no recorre a nadie', async () => {
      fallaLaLista = true;
      const original = console.error;
      console.error = () => {};
      try {
        assert.deepEqual(await armar(), []);
      } finally {
        console.error = original;
      }
      assert.equal(llamadas.length, 1);
    });
  });
}
