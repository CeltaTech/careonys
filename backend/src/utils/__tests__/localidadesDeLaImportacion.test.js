import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverLocalidades, OPCIONES_A_MOSTRAR } from '../localidadesDeLaImportacion.js';

// Un servicio de direcciones de mentira: contesta lo que dice cada tabla y anota lo que le
// preguntaron, para ver si la pieza le preguntó o no. Los identificadores son inventados.

const PROVINCIAS = [
  { idOficial: '06', nombre: 'Buenos Aires' },
  { idOficial: '02', nombre: 'Ciudad Autónoma de Buenos Aires' },
  { idOficial: '14', nombre: 'Córdoba' },
];

function oficial(idOficial, nombre, municipio, censal = `${idOficial}c`) {
  return {
    idOficial, nombre, provincia: PROVINCIAS.find((p) => p.idOficial === idOficial.slice(0, 2)).nombre,
    municipio, departamento: municipio, localidadCensal: censal, lat: -34.5, lng: -58.5, fuente: 'georef',
  };
}

function servicio({ localidades = {}, direcciones = {}, censales = {}, caido = false } = {}) {
  const preguntas = { localidades: [], direcciones: [], censales: [] };
  return {
    preguntas,
    listarProvincias: async () => {
      if (caido) throw new Error('caído');
      return PROVINCIAS;
    },
    provinciaDelCodigoPostal: (cp) => ({ B: '06', C: '02', X: '14' })[String(cp ?? '').charAt(0).toUpperCase()] ?? null,
    localidadesLlamadas: async (consultas) => {
      preguntas.localidades.push(...consultas);
      return consultas.map(({ nombre, provincia }) => (localidades[nombre] ?? [])
        .filter((l) => !provincia || l.idOficial.startsWith(provincia)));
    },
    localidadCensalDeDirecciones: async (consultas) => {
      preguntas.direcciones.push(...consultas);
      return consultas.map(({ direccion }) => direcciones[direccion] ?? { total: 0, localidadCensal: null });
    },
    localidadesDeLaCensal: async (lista) => {
      preguntas.censales.push(...lista);
      return lista.map((censal) => censales[censal] ?? []);
    },
  };
}

function agregador() {
  const agregados = [];
  return {
    agregados,
    agregar: async (lugar) => {
      agregados.push(lugar);
      return `nuevo-${lugar.idOficial}`;
    },
  };
}

const BALLESTER = { id: 'L1', nombre: 'Villa Ballester', id_oficial: '06371010', localidad_censal: '06371010', municipio: 'General San Martín', provincia: 'Buenos Aires' };

const fila = (domicilio, lugaresDeTrabajo) => ({ domicilio, lugaresDeTrabajo });

test('sin calle, la fila vuelve por falta de domicilio', async () => {
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ localidad: 'Villa Ballester' })], lugares: [BALLESTER], zonas: [], herramientas: servicio(), proponer: null, agregar,
  });
  assert.deepEqual(r.motivo, { codigo: 'falta_domicilio' });
  assert.equal(r.partes, null);
});

test('una localidad de la lista se reconoce sin preguntarle al servicio', async () => {
  const herramientas = servicio();
  const { agregar, agregados } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Calle Falsa', numero: '123', localidad: 'villa  BALLESTER' })],
    lugares: [BALLESTER], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(r.motivo, null);
  assert.equal(r.partes.lugar_id, 'L1');
  assert.equal(r.partes.calle, 'Calle Falsa');
  assert.equal(herramientas.preguntas.localidades.length, 0);
  assert.equal(agregados.length, 0);
});

test('el domicilio en una celda se separa, y el código postal dice la provincia', async () => {
  const otraBallester = { ...BALLESTER, id: 'L9', id_oficial: '14000001', localidad_censal: '14000001', provincia: 'Córdoba', municipio: 'Otro' };
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ renglon: 'Av. Siempre Viva 742, piso 3, Villa Ballester, B1653ABC' })],
    lugares: [BALLESTER, otraBallester], zonas: [], herramientas: servicio(), proponer: null, agregar,
  });
  assert.equal(r.motivo, null);
  assert.deepEqual(r.partes, {
    calle: 'Av. Siempre Viva', numero: '742', piso: '3', unidad: null, codigo_postal: 'B1653ABC', lugar_id: 'L1',
  });
});

test('una localidad oficial que falta se agrega una sola vez aunque la traigan varias filas', async () => {
  const herramientas = servicio({ localidades: { 'Villa Adelina': [oficial('06756010', 'Villa Adelina', 'San Isidro')] } });
  const { agregar, agregados } = agregador();
  const resultados = await resolverLocalidades({
    filas: [
      fila({ calle: 'A', numero: '1', localidad: 'Villa Adelina', provincia: 'Buenos Aires' }),
      fila({ calle: 'B', numero: '2', localidad: 'Villa Adelina' }),
    ],
    lugares: [BALLESTER], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(agregados.length, 1);
  assert.equal(agregados[0].idOficial, '06756010');
  assert.equal(resultados[0].partes.lugar_id, 'nuevo-06756010');
  assert.equal(resultados[1].partes.lugar_id, 'nuevo-06756010');
});

test('una localidad oficial que ya está en la lista no se agrega de nuevo', async () => {
  const herramientas = servicio({ localidades: { Ballester: [oficial('06371010', 'Villa Ballester', 'General San Martín')] } });
  const { agregar, agregados } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Ballester' })],
    lugares: [BALLESTER], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(r.partes.lugar_id, 'L1');
  assert.equal(agregados.length, 0);
});

test('con muchas candidatas y una dirección que no las desempata, vuelve ambigua con cinco opciones y «hay más»', async () => {
  const sanJose = Array.from({ length: 7 }, (_, n) => oficial(`06${String(n).padStart(6, '0')}`, 'San José', `Partido ${n}`));
  const herramientas = servicio({
    localidades: { 'San José': sanJose },
    direcciones: { 'Mitre 100': { total: 4, localidadCensal: null } },
  });
  const { agregar, agregados } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '100', localidad: 'San José' })],
    lugares: [], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(r.motivo.codigo, 'localidad_ambigua');
  assert.equal(r.motivo.opciones.length, OPCIONES_A_MOSTRAR);
  assert.equal(r.motivo.hayMas, true);
  assert.equal(r.motivo.opciones[0], 'San José (Partido 0, Buenos Aires)');
  assert.equal(agregados.length, 0);
});

test('la dirección que cae en una sola localidad censal desempata entre las de la lista', async () => {
  const uno = { id: 'S1', nombre: 'San José', id_oficial: '06028010', localidad_censal: '06028010', municipio: 'Almirante Brown', provincia: 'Buenos Aires' };
  const dos = { id: 'S2', nombre: 'San José', id_oficial: '06861010', localidad_censal: '06861010', municipio: 'Tres de Febrero', provincia: 'Buenos Aires' };
  const herramientas = servicio({ direcciones: { 'Mitre 100': { total: 1, localidadCensal: '06861010' } } });
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '100', localidad: 'San José' })],
    lugares: [uno, dos], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(r.motivo, null);
  assert.equal(r.partes.lugar_id, 'S2');
});

test('el partido escrito desempata sin preguntar por la dirección', async () => {
  const uno = { id: 'S1', nombre: 'San José', id_oficial: '06028010', municipio: 'Almirante Brown', provincia: 'Buenos Aires' };
  const dos = { id: 'S2', nombre: 'San José', id_oficial: '06861010', municipio: 'Tres de Febrero', provincia: 'Buenos Aires' };
  const herramientas = servicio();
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '100', localidad: 'San José', partido: 'almirante brown' })],
    lugares: [uno, dos], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(r.partes.lugar_id, 'S1');
  assert.equal(herramientas.preguntas.direcciones.length, 0);
});

test('sin localidad escrita, una dirección que el servicio encuentra en más de un lugar es dudosa', async () => {
  const herramientas = servicio({ direcciones: { 'Mitre 100': { total: 3, localidadCensal: null } } });
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '100' })], lugares: [], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.deepEqual(r.motivo, { codigo: 'localidad_no_reconocida' });
});

test('sin localidad escrita, la dirección alcanza si su localidad censal abarca una sola', async () => {
  const herramientas = servicio({
    direcciones: { 'Mitre 100': { total: 1, localidadCensal: '06756010' }, 'Corrientes 500': { total: 1, localidadCensal: '02000010' } },
    censales: {
      '06756010': [oficial('06756010', 'Villa Adelina', 'San Isidro')],
      '02000010': [oficial('02000011', 'Palermo', 'Comuna 14'), oficial('02000012', 'Recoleta', 'Comuna 2')],
    },
  });
  const { agregar, agregados } = agregador();
  const [unaSola, varias] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '100' }), fila({ calle: 'Corrientes', numero: '500' })],
    lugares: [], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.equal(unaSola.partes.lugar_id, 'nuevo-06756010');
  assert.equal(varias.motivo.codigo, 'localidad_ambigua');
  assert.equal(varias.motivo.hayMas, false);
  assert.equal(agregados.length, 1);
});

test('lo que propone la IA se vuelve a comprobar: lo que el servicio reconoce entra, lo que no, vuelve', async () => {
  const herramientas = servicio({ localidades: { Palermo: [oficial('02000011', 'Palermo', 'Comuna 14')] } });
  const { agregar } = agregador();
  const vistos = [];
  const proponer = async (pendientes) => {
    vistos.push(...pendientes);
    return pendientes.map((p) => (p.localidad === 'Palermo, Cap. Fed.'
      ? { clave: p.clave, localidad: 'Palermo', provincia: 'Ciudad Autónoma de Buenos Aires' }
      : { clave: p.clave, localidad: 'Villa Inventada', provincia: 'Buenos Aires' }));
  };
  const [reconocida, inventada] = await resolverLocalidades({
    filas: [
      fila({ calle: 'Santa Fe', numero: '3000', localidad: 'Palermo, Cap. Fed.' }),
      fila({ calle: 'Mitre', numero: '1', localidad: 'V. Inv.' }),
    ],
    lugares: [], zonas: [], herramientas, proponer, agregar,
  });
  assert.equal(vistos.length, 2);
  assert.equal(reconocida.motivo, null);
  assert.equal(reconocida.partes.lugar_id, 'nuevo-02000011');
  assert.deepEqual(inventada.motivo, { codigo: 'localidad_no_reconocida' });
});

test('la IA no puede poner una localidad donde no había ninguna escrita', async () => {
  const herramientas = servicio({ localidades: { Palermo: [oficial('02000011', 'Palermo', 'Comuna 14')] } });
  const { agregar, agregados } = agregador();
  const proponer = async (pendientes) => pendientes.map((p) => ({ clave: p.clave, localidad: 'Palermo' }));
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '1' })], lugares: [], zonas: [], herramientas, proponer, agregar,
  });
  assert.deepEqual(r.motivo, { codigo: 'localidad_no_reconocida' });
  assert.equal(agregados.length, 0);
});

test('si la IA falla, lo que no se reconoció vuelve con su motivo', async () => {
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'Mitre', numero: '1', localidad: 'Cap. Fed.' })], lugares: [], zonas: [],
    herramientas: servicio(), proponer: async () => { throw new Error('sin IA'); }, agregar,
  });
  assert.deepEqual(r.motivo, { codigo: 'localidad_no_reconocida' });
});

test('con el servicio de direcciones caído, lo que no está en la lista vuelve con ese motivo', async () => {
  const { agregar } = agregador();
  const resultados = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Villa Ballester' }), fila({ calle: 'B', numero: '2', localidad: 'Otra' })],
    lugares: [BALLESTER], zonas: [], herramientas: servicio({ caido: true }), proponer: null, agregar,
  });
  for (const r of resultados) assert.deepEqual(r.motivo, { codigo: 'servicio_de_direcciones_caido' });
});

test('dónde acepta trabajar: la zona se abre en sus lugares, lo de la lista se usa y lo oficial se agrega', async () => {
  const herramientas = servicio({ localidades: { 'Villa Adelina': [oficial('06756010', 'Villa Adelina', 'San Isidro')] } });
  const { agregar, agregados } = agregador();
  const zonas = [{ id: 'Z1', codigo: 'ZN', nombre: 'Zona Norte', lugares: ['L1', 'L2'] }];
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Villa Ballester' }, ['zona norte', 'Villa Ballester', 'Villa Adelina'])],
    lugares: [BALLESTER], zonas, herramientas, proponer: null, agregar,
  });
  assert.equal(r.motivo, null);
  assert.deepEqual(r.lugares.sort(), ['L1', 'L2', 'nuevo-06756010']);
  assert.equal(agregados.length, 1);
});

test('dónde acepta trabajar: lo que no se reconoce devuelve la fila entera', async () => {
  const { agregar, agregados } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Villa Adelina' }, ['Por todos lados'])],
    lugares: [], zonas: [],
    herramientas: servicio({ localidades: { 'Villa Adelina': [oficial('06756010', 'Villa Adelina', 'San Isidro')] } }),
    proponer: null, agregar,
  });
  assert.deepEqual(r.motivo, { codigo: 'lugar_de_trabajo_no_reconocido' });
  assert.equal(r.partes, null);
  assert.equal(agregados.length, 0, 'una fila que vuelve no agrega su localidad a la lista');
});

test('dónde acepta trabajar: lo que no está en su provincia se busca en todo el país', async () => {
  const herramientas = servicio({ localidades: { 'Villa Carlos Paz': [oficial('14000020', 'Villa Carlos Paz', 'Punilla')] } });
  const { agregar } = agregador();
  const [r] = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Villa Ballester' }, ['Villa Carlos Paz'])],
    lugares: [BALLESTER], zonas: [], herramientas, proponer: null, agregar,
  });
  assert.deepEqual(r.lugares, ['nuevo-14000020']);
  assert.equal(herramientas.preguntas.localidades.length, 2);
  assert.equal(herramientas.preguntas.localidades[0].provincia, '06');
  assert.equal(herramientas.preguntas.localidades[1].provincia, undefined);
});

test('un país sin servicio de direcciones sólo reconoce lo que está en la lista', async () => {
  const lugar = { id: 'U1', nombre: 'Pocitos', id_oficial: null, provincia: 'Montevideo', municipio: null };
  const { agregar, agregados } = agregador();
  const [enLaLista, fuera] = await resolverLocalidades({
    filas: [fila({ calle: 'A', numero: '1', localidad: 'Pocitos', provincia: 'Montevideo' }), fila({ calle: 'B', numero: '2', localidad: 'Carrasco' })],
    lugares: [lugar], zonas: [], herramientas: null, proponer: null, agregar,
  });
  assert.equal(enLaLista.partes.lugar_id, 'U1');
  assert.deepEqual(fuera.motivo, { codigo: 'localidad_no_reconocida' });
  assert.equal(agregados.length, 0);
});
