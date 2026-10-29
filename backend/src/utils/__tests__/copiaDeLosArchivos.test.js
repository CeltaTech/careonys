/**
 * La copia nocturna de los archivos entra al almacenamiento de a una Prestadora, con la credencial
 * de la copia de respaldo y con ninguna otra.
 *
 *   node --test src/utils/__tests__/copiaDeLosArchivos.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La copia entra con una credencial que la base sólo deja leer la
 * carpeta de una Prestadora. Si alguien la cambiara por la del trabajo sin persona, por una sin
 * Prestadora —o volviera a la llave maestra—, la copia seguiría funcionando y nadie lo notaría.
 * Esta prueba lo nota: mira qué credencial llega con cada pedido, y que la Prestadora que dice
 * sea la de la carpeta que pide.
 *
 * El almacenamiento es de mentira y contesta por HTTP como el de verdad. Lo que no puede ver es si
 * la base de verdad le niega a esa credencial la carpeta de otra Prestadora: eso se probó contra la
 * base local, con dos Prestadoras con archivos cargados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const DEPOSITO = 'documentos';
const UNA = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';

let pedidos = [];
let falla = null;

function contenidoDe(credencial) {
  return JSON.parse(Buffer.from(credencial.replace(/^Bearer /, '').split('.')[1], 'base64url').toString());
}

const almacenamiento = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://interno').pathname);
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    const pedido = { ruta, credencial: req.headers.authorization, cuerpo: cuerpo ? JSON.parse(cuerpo) : {} };
    pedidos.push(pedido);
    res.setHeader('Content-Type', 'application/json');
    if (ruta === '/rest/v1/rpc/prestadoras_a_recorrer') {
      res.end(JSON.stringify([UNA, OTRA]));
      return;
    }
    if (ruta === '/storage/v1/bucket') {
      res.end(JSON.stringify([{ id: DEPOSITO, name: DEPOSITO }]));
      return;
    }
    if (ruta === `/storage/v1/object/list/${DEPOSITO}`) {
      // Contesta sólo por la carpeta que pide, como hace la base con la regla de la copia.
      const { prefix } = pedido.cuerpo;
      res.end(JSON.stringify(prefix === UNA || prefix === OTRA
        ? [{ id: prefix, name: 'archivo.pdf', updated_at: '2026-01-01T00:00:00Z', metadata: { size: 4 } }]
        : []));
      return;
    }
    for (const prestadora of [UNA, OTRA]) {
      if (ruta === `/storage/v1/object/${DEPOSITO}/${prestadora}/archivo.pdf`) {
        if (falla === prestadora) {
          res.writeHead(500);
          res.end(JSON.stringify({ message: 'se cayó' }));
          return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(`de ${prestadora}`);
        return;
      }
    }
    res.writeHead(404);
    res.end('{}');
  });
});

await new Promise((listo) => almacenamiento.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${almacenamiento.address().port}`;
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
// Una clave inventada para firmar las credenciales, nacida acá y descartada al terminar.
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });

const { copiarLosArchivosAlRespaldo } = await import('../copiaDeLosArchivos.js');

after(() => almacenamiento.close());

beforeEach(() => {
  pedidos = [];
  falla = null;
});

function destino() {
  const guardado = new Map();
  return {
    guardado,
    async yaEstaIgual() { return false; },
    async subir(clave, cuerpo) { guardado.set(clave, cuerpo.toString()); },
  };
}

describe('la copia nocturna de los archivos', () => {
  it('copia cada Prestadora con su propia credencial de la copia, a los dos destinos', async () => {
    const uno = destino();
    const otro = destino();

    const cuenta = await copiarLosArchivosAlRespaldo({ destinos: [uno, otro], avisar: () => {} });

    assert.equal(cuenta.prestadoras, 2);
    assert.equal(cuenta.copiados, 2);
    for (const prestadora of [UNA, OTRA]) {
      assert.equal(uno.guardado.get(`archivos/${DEPOSITO}/${prestadora}/archivo.pdf`), `de ${prestadora}`);
      assert.equal(otro.guardado.get(`archivos/${DEPOSITO}/${prestadora}/archivo.pdf`), `de ${prestadora}`);
    }

    const alAlmacenamiento = pedidos.filter((p) => p.ruta.startsWith('/storage/'));
    assert.ok(alAlmacenamiento.length > 0);
    for (const pedido of alAlmacenamiento) {
      const contenido = contenidoDe(pedido.credencial);
      assert.equal(contenido.role, 'copia_de_respaldo', `${pedido.ruta} fue con otra credencial`);
      assert.ok([UNA, OTRA].includes(contenido.prestadora_id), `${pedido.ruta} fue sin Prestadora`);
      const carpeta = pedido.cuerpo.prefix ?? pedido.ruta.split('/')[5];
      if (carpeta) assert.equal(carpeta, contenido.prestadora_id, `${pedido.ruta} pidió la carpeta de otra Prestadora`);
    }
  });

  it('si un archivo no se pudo copiar, sigue con las demás y termina con error, sin la ruta en el registro', async () => {
    falla = UNA;
    const lineas = [];
    const uno = destino();

    await assert.rejects(
      copiarLosArchivosAlRespaldo({ destinos: [uno], avisar: (t) => lineas.push(t) }),
      /1 archivos no se pudieron copiar/,
    );
    assert.equal(uno.guardado.get(`archivos/${DEPOSITO}/${OTRA}/archivo.pdf`), `de ${OTRA}`);
    assert.ok(lineas.some((l) => l.includes('1 fallados')));
    assert.equal(lineas.some((l) => l.includes('11111111')), false);
  });
});
