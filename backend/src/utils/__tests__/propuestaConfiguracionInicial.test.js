/**
 * Qué configuración inicial propone una planilla que la Prestadora ya tiene.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La guía de primeros pasos lee la planilla y avisa qué nombra que
 * todavía no está configurado. Esa alerta vale sólo si dice **lo mismo que va a hacer la
 * importación**: si la guía dice «ese tipo ya existe» y la importación después no lo reconoce, el
 * Asistente entra sin tipo —y el tipo es lo que decide si se le va a exigir Matrícula—, sin que
 * nadie se entere hasta revisar los Legajos de a uno.
 *
 * Entonces lo que se cuida acá es que la comparación no se despegue: que un tipo ambiguo se avise
 * en vez de darse por resuelto, y que la consulta lleve escrito el filtro por Prestadora, que es lo
 * único que separa una de otra cuando el backend entra con la llave maestra (celtatech/CLAUDE.md
 * §5). Las localidades no se proponen: la importación las reconoce sola.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Las direcciones completas que se le pidieron a la base, para poder mirar los filtros. */
let pedidos = [];

const baseFalsa = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://interno').pathname;
  pedidos.push({ clave: `${req.method} ${ruta}`, url: req.url });

  const preparada = respuestas.get(`${req.method} ${ruta}`);
  const valor = typeof preparada === 'function' ? preparada() : preparada;
  if (valor === undefined) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${req.method} ${ruta}` }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(valor));
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de dejar puestas las variables de entorno: la conexión a la base se arma
// en el momento en que se importa, y con la dirección que haya en ese instante.
const { proponerConfiguracionInicial } = await import('../propuestaConfiguracionInicial.js');

after(() => baseFalsa.close());

/** El mapeo ya revisado: qué columna de la planilla es qué campo del producto. */
const MAPEO = {
  Nombre: 'nombre',
  Lugares: 'dondeAceptaTrabajar',
  Tipo: 'tipo_asistente',
};

function fila(nombre, lugares, tipo) {
  return { Nombre: nombre, Lugares: lugares, Tipo: tipo };
}

/** Un tipo de Asistente del catálogo. Sin Prestadora es uno de fábrica. */
function tipoDeFabrica(clave, nombre) {
  return { id: `id-${clave}`, clave, nombre, prestadora_id: null };
}

beforeEach(() => {
  pedidos = [];
  respuestas.clear();
  // Por omisión, una Prestadora sin nada configurado.
  respuestas.set('GET /rest/v1/tipos_asistente', () => []);
});

// ---------------------------------------------------------------------------------------

describe('la planilla de Clientes no propone configuración', () => {
  it('contesta las filas y nada más, sin ir a la base', async () => {
    const propuesta = await proponerConfiguracionInicial({
      tipo: 'cliente',
      filas: [{ Nombre: 'Contacto Uno' }, { Nombre: 'Contacto Dos' }],
      mapeo: { Nombre: 'nombreContacto' },
      prestadoraId: PRESTADORA,
    });

    assert.deepEqual(propuesta, { filasTotales: 2, tiposNuevos: [] });
    assert.deepEqual(pedidos, [], 'preguntó por configuración que ese archivo no trae');
  });
});

describe('los tipos de Asistente que la planilla nombra', () => {
  it('se propone el que la importación no va a poder resolver', async () => {
    respuestas.set('GET /rest/v1/tipos_asistente', () => [tipoDeFabrica('cuidador', 'Cuidador/a')]);

    const propuesta = await proponerConfiguracionInicial({
      tipo: 'asistente',
      filas: [fila('Una', '', 'cuidador'), fila('Otra', '', 'Enfermero'), fila('Tercera', '', 'Cuidador/a')],
      mapeo: MAPEO,
      prestadoraId: PRESTADORA,
    });

    assert.deepEqual(propuesta.tiposNuevos, ['Enfermero']);
  });

  it('un nombre que calza con dos tipos se avisa igual', async () => {
    // La importación, ante la duda, deja al Asistente sin tipo. Si acá se diera por resuelto, la
    // guía diría que está todo listo y la persona entraría sin tipo lo mismo.
    respuestas.set('GET /rest/v1/tipos_asistente', () => [
      tipoDeFabrica('cuidador', 'Cuidador'),
      { id: 'id-propio', clave: 'cuidador_propio', nombre: 'cuidador', prestadora_id: PRESTADORA },
    ]);

    const propuesta = await proponerConfiguracionInicial({
      tipo: 'asistente',
      filas: [fila('Una', '', 'Cuidador')],
      mapeo: MAPEO,
      prestadoraId: PRESTADORA,
    });

    assert.deepEqual(propuesta.tiposNuevos, ['Cuidador']);
  });
});

describe('el aislamiento entre Prestadoras', () => {
  it('la consulta lleva escrito el filtro por Prestadora', async () => {
    await proponerConfiguracionInicial({
      tipo: 'asistente',
      filas: [fila('Una', 'Zona Norte', 'Cuidador')],
      mapeo: MAPEO,
      prestadoraId: PRESTADORA,
    });

    const tipos = pedidos.find((p) => p.clave === 'GET /rest/v1/tipos_asistente');

    assert.ok(tipos, 'no consultó el catálogo de tipos');
    assert.match(decodeURIComponent(tipos.url), new RegExp(`prestadora_id\\.eq\\.${PRESTADORA}`));
  });
});

describe('lo que la planilla no trae', () => {
  it('una columna sin mapear no propone nada', async () => {
    // Con el mapeo sin la columna de tipos, no hay de dónde sacarlos.
    const propuesta = await proponerConfiguracionInicial({
      tipo: 'asistente',
      filas: [fila('Una', 'Zona Norte', 'Cuidador')],
      mapeo: { Nombre: 'nombre' },
      prestadoraId: PRESTADORA,
    });

    assert.deepEqual(propuesta.tiposNuevos, []);
  });

  it('las celdas vacías no entran como un tipo sin nombre', async () => {
    const propuesta = await proponerConfiguracionInicial({
      tipo: 'asistente',
      filas: [fila('Una', '', ''), fila('Otra', 'Zona Sur', null), fila('Tercera', '', 'Enfermero')],
      mapeo: MAPEO,
      prestadoraId: PRESTADORA,
    });

    assert.deepEqual(propuesta.tiposNuevos, ['Enfermero']);
    assert.ok(!('zonasNuevas' in propuesta), 'las localidades no se proponen');
  });
});
