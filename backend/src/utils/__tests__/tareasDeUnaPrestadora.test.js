/**
 * Que cada trabajo de fondo trabaje en una sola Prestadora, la que le pasa `programar`, y no vuelva
 * a recorrerlas todas por su cuenta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. `programar`, en server.js, ya recorre las Prestadoras de a una. Un
 * trabajo que además las recorría todas adentro daba, con tres Prestadoras, nueve vueltas en vez de
 * tres: cada Prestadora recibía sus avisos tres veces. Acá se corre cada trabajo igual que lo corre
 * `programar` y se cuenta cuántas veces se leyó la tabla propia de ese trabajo: tiene que ser una
 * vez por Prestadora, cada una con su propia credencial.
 *
 * Con el defecto, la cuenta da nueve y la prueba falla.
 *
 * Además se mira server.js: ningún trabajo que programa puede volver a recorrer las Prestadoras.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const TRES = [
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003',
];
const RECORRER = 'POST /rest/v1/rpc/prestadoras_a_recorrer';
const PRESTADORAS = 'GET /rest/v1/prestadoras';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no está preparado contesta una lista vacía. */
const respuestas = new Map();
let llamadas = [];
let anotados = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => (crudo += parte));
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, credencial: leerCredencial(req.headers.authorization ?? '') });
    const valor = respuestas.get(clave) ?? [];
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
prepararCredencialDePrueba();

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma en
// el momento en que se importa el archivo.
const { paraCadaPrestadora } = await import('../../db/connection.js');
const { revisarRecordatoriosPush } = await import('../revisarRecordatoriosPush.js');
const { extenderCoberturasDeAusencia } = await import('../coberturaDeAusencia.js');
const { revisarExtensionesDeTurnoGuardia } = await import('../revisarExtensionesDeTurnoGuardia.js');
const { revisarVencimientos } = await import('../vencimientos.js');
const { revisarAusenciasAutomaticas } = await import('../ausenciaAutomatica.js');

const avisarDeVerdad = console.error;
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.error = avisarDeVerdad;
  baseFalsa.close();
});

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
  anotados = [];
  respuestas.set(RECORRER, TRES);
  respuestas.set(PRESTADORAS, [{ id: TRES[0], estado: 'certificada', dias_aviso_vencimiento_documentos: 30, zona_horaria: 'America/Argentina/Buenos_Aires' }]);
});

/** Cada trabajo, con la tabla que lee una vez por Prestadora. */
const TRABAJOS = [
  ['los avisos al teléfono de los Asistentes', revisarRecordatoriosPush, 'GET /rest/v1/mensajes_asistente'],
  ['la extensión de las coberturas de ausencia', extenderCoberturasDeAusencia, 'GET /rest/v1/coberturas_de_ausencia'],
  ['la revisión de las extensiones de turno', revisarExtensionesDeTurnoGuardia, 'GET /rest/v1/turnos_guardia'],
  ['los vencimientos de documentos', revisarVencimientos, 'GET /rest/v1/documentos_pedidos_al_asistente'],
  ['la ausencia automática', revisarAusenciasAutomaticas, 'GET /rest/v1/configuracion_ausencia_automatica'],
];

for (const [nombre, trabajo, tabla] of TRABAJOS) {
  describe(nombre, () => {
    it('con tres Prestadoras da tres vueltas, una por Prestadora, y no nueve', async () => {
      // Lo mismo que hace `programar` en server.js con `conLaPrestadora`.
      await paraCadaPrestadora(trabajo.name, (prestadoraId) => trabajo(prestadoraId));

      const vueltas = llamadas.filter((l) => l.clave === tabla);
      assert.equal(vueltas.length, 3, anotados.join('\n'));
      assert.deepEqual(vueltas.map((l) => l.credencial?.prestadora_id).sort(), [...TRES].sort());
      assert.equal(llamadas.filter((l) => l.clave === RECORRER).length, 1);
    });

    it('sin Prestadora no trabaja callado: avisa que se lo programó mal', async () => {
      await assert.rejects(() => trabajo(undefined));
      assert.equal(llamadas.length, 0);
    });
  });
}

describe('los trabajos que sólo corren para las Prestadoras certificadas', () => {
  for (const [nombre, trabajo, tabla] of TRABAJOS.slice(0, 3)) {
    it(`${nombre}: una Prestadora que no está certificada no se trabaja`, async () => {
      respuestas.set(PRESTADORAS, []);

      await trabajo(TRES[0]);

      assert.equal(llamadas.some((l) => l.clave === tabla), false);
    });
  }
});

describe('server.js', () => {
  const servidor = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');

  it('los trabajos arreglados se programan recibiendo la Prestadora', () => {
    for (const [, trabajo] of TRABAJOS) {
      assert.match(servidor, new RegExp(`programar\\(${trabajo.name},[^)]*conLaPrestadora: true`), trabajo.name);
    }
  });

  it('ningún trabajo que programa vuelve a recorrer las Prestadoras por su cuenta', () => {
    const programados = [...servidor.matchAll(/^programar\((\w+),/gm)].map((m) => m[1]);
    assert.ok(programados.length > 10, 'no se encontraron los trabajos programados');

    const deDonde = new Map();
    for (const [, nombres, archivo] of servidor.matchAll(/^import \{([^}]+)\} from '\.\/(utils\/[^']+)';/gm)) {
      for (const nombre of nombres.split(',').map((n) => n.trim())) deDonde.set(nombre, archivo);
    }

    for (const nombre of programados) {
      const archivo = deDonde.get(nombre);
      assert.ok(archivo, `no se encontró de dónde sale ${nombre}`);
      const codigo = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(codigo, /paraCadaPrestadora\(|prestadoras_a_recorrer/, `${nombre} recorre las Prestadoras por su cuenta`);
    }
  });
});
