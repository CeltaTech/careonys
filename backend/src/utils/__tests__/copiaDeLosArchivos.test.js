/**
 * La copia nocturna de los archivos entra al almacenamiento con la credencial de la copia de
 * respaldo, y con ninguna otra.
 *
 *   node --test src/utils/__tests__/copiaDeLosArchivos.test.js
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Antes la copia entraba con la llave maestra, que alcanza todo. Ahora
 * entra con una credencial que la base sólo deja leer los depósitos. Si alguien la cambiara por la
 * del trabajo sin persona —o volviera a la llave maestra—, la copia seguiría funcionando y nadie lo
 * notaría. Esta prueba lo nota: mira qué credencial llega a la base.
 *
 * El almacenamiento es de mentira y contesta por HTTP como el de verdad. Lo que no puede ver es si
 * la base de verdad le niega a esa credencial escribir o leer tablas: eso lo dice la migración que
 * crea el rol, y se probó contra la base local.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const DEPOSITO = 'documentos';
const RUTA = '11111111-1111-4111-8111-111111111111/archivo.pdf';

let pedidos = [];
let falla = false;

const almacenamiento = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://interno').pathname);
  pedidos.push({ ruta, credencial: req.headers.authorization });
  res.setHeader('Content-Type', 'application/json');
  if (ruta === '/storage/v1/bucket') {
    res.end(JSON.stringify([{ id: DEPOSITO, name: DEPOSITO }]));
    return;
  }
  if (ruta === `/storage/v1/object/list/${DEPOSITO}`) {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const { prefix } = JSON.parse(cuerpo || '{}');
      res.end(JSON.stringify(prefix
        ? [{ id: 'a', name: 'archivo.pdf', updated_at: '2026-01-01T00:00:00Z', metadata: { size: 4 } }]
        : [{ id: null, name: '11111111-1111-4111-8111-111111111111' }]));
    });
    return;
  }
  if (ruta === `/storage/v1/object/${DEPOSITO}/${RUTA}`) {
    if (falla) {
      res.writeHead(500);
      res.end(JSON.stringify({ message: 'se cayó' }));
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end('hola');
    return;
  }
  res.writeHead(404);
  res.end('{}');
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
  falla = false;
});

function contenidoDe(credencial) {
  return JSON.parse(Buffer.from(credencial.replace(/^Bearer /, '').split('.')[1], 'base64url').toString());
}

function destino() {
  const guardado = new Map();
  return {
    guardado,
    async yaEstaIgual() { return false; },
    async subir(clave, cuerpo) { guardado.set(clave, cuerpo.toString()); },
  };
}

describe('la copia nocturna de los archivos', () => {
  it('entra con la credencial de la copia de respaldo y copia a los dos destinos', async () => {
    const uno = destino();
    const otro = destino();

    const cuenta = await copiarLosArchivosAlRespaldo({ destinos: [uno, otro], avisar: () => {} });

    assert.equal(cuenta.copiados, 1);
    assert.equal(uno.guardado.get(`archivos/${DEPOSITO}/${RUTA}`), 'hola');
    assert.equal(otro.guardado.get(`archivos/${DEPOSITO}/${RUTA}`), 'hola');
    assert.ok(pedidos.length > 0);
    for (const pedido of pedidos) {
      const contenido = contenidoDe(pedido.credencial);
      assert.equal(contenido.role, 'copia_de_respaldo', `${pedido.ruta} fue con otra credencial`);
      assert.equal(contenido.prestadora_id ?? null, null);
    }
  });

  it('si un archivo no se pudo copiar, termina con error y sin la ruta en el registro', async () => {
    falla = true;
    const lineas = [];

    await assert.rejects(
      copiarLosArchivosAlRespaldo({ destinos: [destino()], avisar: (t) => lineas.push(t) }),
      /1 archivos no se pudieron copiar/,
    );
    assert.ok(lineas.some((l) => l.includes('1 fallados')));
    assert.equal(lineas.some((l) => l.includes('11111111')), false);
  });
});
