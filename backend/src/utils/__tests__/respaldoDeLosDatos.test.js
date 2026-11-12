/**
 * El respaldo nocturno de los datos: un archivo por Prestadora, con sus filas y nada más, cifrado
 * con su clave.
 *
 *   node --test src/utils/__tests__/respaldoDeLosDatos.test.js
 *
 * La base es de mentira y contesta como la de verdad: entrega las filas de la Prestadora que dice
 * la credencial, nunca la que pide el pedido. Lo que no puede ver es si la base de verdad hace eso:
 * eso se prueba contra la base local, con dos Prestadoras con datos cargados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { IDENTIDAD } from '../../config/identidadProducto.js';

const UNA = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';

// UNA tiene más filas que un tramo, para que se vea que pide de a tramos hasta el final.
const FILAS = {
  [UNA]: Array.from({ length: 1500 }, (_, i) => ({ id: `una-${i}`, prestadora_id: UNA })),
  [OTRA]: [{ id: 'otra-0', prestadora_id: OTRA }],
};

let pedidos = [];

function contenidoDe(credencial) {
  return JSON.parse(Buffer.from(credencial.replace(/^Bearer /, '').split('.')[1], 'base64url').toString());
}

const base = createServer((req, res) => {
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
    const pase = contenidoDe(pedido.credencial);
    if (pase.role !== 'copia_de_respaldo' || !FILAS[pase.prestadora_id]) {
      res.writeHead(403);
      res.end(JSON.stringify({ message: 'sin permiso' }));
      return;
    }
    if (ruta === '/rest/v1/rpc/tablas_del_respaldo') {
      res.end(JSON.stringify(['prestadoras', 'clientes']));
      return;
    }
    if (ruta === '/rest/v1/rpc/filas_del_respaldo') {
      const { p_tabla: tabla, p_desde: desde, p_cantidad: cantidad } = pedido.cuerpo;
      const todas = tabla === 'clientes' ? FILAS[pase.prestadora_id] : [{ id: pase.prestadora_id }];
      res.end(JSON.stringify(todas.slice(desde, desde + cantidad)));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
});

await new Promise((listo) => base.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${base.address().port}`;
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';

const { respaldarLosDatos } = await import('../respaldoDeLosDatos.js');

const privadas = { [UNA]: await generateIdentity(), [OTRA]: await generateIdentity() };
const claves = { [UNA]: await identityToRecipient(privadas[UNA]), [OTRA]: await identityToRecipient(privadas[OTRA]) };

async function abrir(prestadora, cuerpo) {
  const d = new Decrypter();
  d.addIdentity(privadas[prestadora]);
  return JSON.parse(gunzipSync(Buffer.from(await d.decrypt(new Uint8Array(cuerpo)))).toString());
}

after(() => base.close());
beforeEach(() => { pedidos = []; });

function destino(yaHabia = []) {
  const guardado = new Map(yaHabia.map((k) => [k, Buffer.from('viejo')]));
  return {
    guardado,
    async subir(clave, cuerpo) { guardado.set(clave, cuerpo); },
    async listar(prefijo) { return [...guardado.keys()].filter((k) => k.startsWith(prefijo)); },
    async borrar(clave) { guardado.delete(clave); },
  };
}

const AHORA = new Date('2026-11-11T04:00:00.000Z');
const archivoDe = (d, prestadora) => [...d.guardado.entries()].find(([k]) => k.startsWith(`datos/${prestadora}/`) && k.includes('2026-11-11'));

describe('el respaldo de los datos', () => {
  it('deja un archivo cifrado por Prestadora, con sus filas y ninguna de la otra, en los dos destinos', async () => {
    const uno = destino();
    const otro = destino();
    const total = await respaldarLosDatos({ destinos: [uno, otro], avisar: () => {}, claves, ahora: AHORA });

    assert.equal(total.respaldadas, 2);
    for (const prestadora of [UNA, OTRA]) {
      for (const d of [uno, otro]) {
        const [clave, cuerpo] = archivoDe(d, prestadora);
        assert.match(clave, /_datos_2026-11-11T04-00-00-000Z\.json\.gz\.age$/);
        const contenido = await abrir(prestadora, cuerpo);
        assert.equal(contenido.prestadora, prestadora);
        assert.deepEqual(contenido.tablas.clientes, FILAS[prestadora]);
        assert.ok(contenido.tablas.clientes.every((f) => f.prestadora_id === prestadora));
      }
      const ajena = prestadora === UNA ? OTRA : UNA;
      await assert.rejects(abrir(ajena, archivoDe(uno, prestadora)[1]));
    }

    for (const p of pedidos.filter((x) => x.ruta !== '/rest/v1/rpc/prestadoras_a_recorrer')) {
      assert.equal(contenidoDe(p.credencial).role, 'copia_de_respaldo', `${p.ruta} fue con otra credencial`);
      assert.equal(Object.keys(p.cuerpo).some((k) => /prestadora/i.test(k)), false, 'el pedido nombró una Prestadora');
    }
  });

  it('una Prestadora sin clave no se lee ni se sube, y el respaldo termina con error', async () => {
    const uno = destino();
    await assert.rejects(
      respaldarLosDatos({ destinos: [uno], avisar: () => {}, claves: { [OTRA]: claves[OTRA] }, ahora: AHORA }),
      /1 Prestadoras no se pudieron respaldar/,
    );
    assert.equal(archivoDe(uno, UNA), undefined);
    assert.ok(archivoDe(uno, OTRA));
    const leyoUNA = pedidos.some((p) => p.ruta.includes('respaldo') && contenidoDe(p.credencial).prestadora_id === UNA);
    assert.equal(leyoUNA, false, 'leyó los datos de la Prestadora sin clave');
  });

  it('si los dos destinos ya tienen el de hoy, esa Prestadora no se vuelve a leer', async () => {
    const deHoy = `datos/${UNA}/${IDENTIDAD.codigo}_datos_2026-11-11T01-00-00-000Z.json.gz.age`;
    const uno = destino([deHoy]);
    const otro = destino([deHoy]);
    const total = await respaldarLosDatos({ destinos: [uno, otro], avisar: () => {}, claves, ahora: AHORA });
    assert.equal(total.yaEstaban, 1);
    assert.equal(total.respaldadas, 1);
    const leyoUNA = pedidos.some((p) => p.ruta.includes('respaldo') && contenidoDe(p.credencial).prestadora_id === UNA);
    assert.equal(leyoUNA, false);
  });

  it('borra lo vencido de la carpeta de cada Prestadora y deja lo reciente', async () => {
    const vencido = `datos/${UNA}/${IDENTIDAD.codigo}_datos_2026-08-02T03-00-00-000Z.json.gz.age`;
    const mensual = `datos/${UNA}/${IDENTIDAD.codigo}_datos_2026-08-01T03-00-00-000Z.json.gz.age`;
    const reciente = `datos/${UNA}/${IDENTIDAD.codigo}_datos_2026-11-01T03-00-00-000Z.json.gz.age`;
    const uno = destino([vencido, mensual, reciente]);
    const lineas = [];
    await respaldarLosDatos({ destinos: [uno], avisar: (t) => lineas.push(t), claves, ahora: AHORA });
    assert.equal(uno.guardado.has(vencido), false);
    assert.ok(uno.guardado.has(mensual));
    assert.ok(uno.guardado.has(reciente));
    assert.equal(lineas.some((l) => l.includes('11111111')), false, 'el registro nombró una Prestadora');
  });
});
