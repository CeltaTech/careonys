// La envoltura de la conexión de una persona: lo de salud va por las funciones que anotan, lo
// demás va directo. Se prueba contra una conexión falsa que registra lo que le piden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conRegistroDeSalud } from '../db/informacionDeSalud.js';

function conexionFalsa(respuestas = {}) {
  const pedidos = [];
  const directo = (tabla) => {
    const consulta = { tabla, pasos: [] };
    pedidos.push({ directo: consulta });
    const cadena = new Proxy({}, {
      get(_, metodo) {
        if (metodo === 'then') {
          return (ok) => ok({ data: respuestas[tabla] ?? [], error: null });
        }
        return (...args) => { consulta.pasos.push([metodo, ...args]); return cadena; };
      },
    });
    return cadena;
  };
  return {
    pedidos,
    from: directo,
    async rpc(nombre, args) {
      pedidos.push({ rpc: nombre, args });
      const r = respuestas[nombre];
      return typeof r === 'function' ? r(args) : { data: r ?? [], error: null };
    },
  };
}

test('una tabla que no es de salud va directo', async () => {
  const falsa = conexionFalsa();
  const db = conRegistroDeSalud(falsa, 'GET /x');
  await db.from('clientes').select('id').eq('id', 1);
  assert.equal(falsa.pedidos.length, 1);
  assert.equal(falsa.pedidos[0].directo.tabla, 'clientes');
});

test('una lectura de salud va por la función que anota, con filtros, «o», orden y tope', async () => {
  const falsa = conexionFalsa({ leer_informacion_de_salud: [{ id: 'a', medicamento: 'x' }] });
  const db = conRegistroDeSalud(falsa, () => 'GET /medicacion');
  const { data, error } = await db
    .from('indicaciones_medicacion')
    .select('id, medicamento')
    .eq('paciente_id', 'p1')
    .lte('fecha_desde', '2026-11-10')
    .or('fecha_hasta.is.null,fecha_hasta.gte.2026-11-10')
    .is('resuelta_at', null)
    .order('created_at', { ascending: false })
    .limit(60);
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 'a', medicamento: 'x' }]);
  const [{ rpc, args }] = falsa.pedidos;
  assert.equal(rpc, 'leer_informacion_de_salud');
  assert.equal(args.p_origen, 'GET /medicacion');
  assert.deepEqual(args.p_columnas, ['id', 'medicamento']);
  assert.deepEqual(args.p_filtros, [
    { columna: 'paciente_id', op: 'eq', valor: 'p1' },
    { columna: 'fecha_desde', op: 'lte', valor: '2026-11-10' },
    { o: [{ columna: 'fecha_hasta', op: 'is_null' }, { columna: 'fecha_hasta', op: 'gte', valor: '2026-11-10' }] },
    { columna: 'resuelta_at', op: 'is_null' },
  ]);
  assert.deepEqual(args.p_orden, [{ columna: 'created_at', desc: true }]);
  assert.equal(args.p_limite, 60);
});

test('lo pegado se lee aparte con la misma conexión, y la columna pedida sólo para pegar no sale', async () => {
  const falsa = conexionFalsa({
    leer_informacion_de_salud: [{ id: 'a', via_administracion_id: 'v1' }],
    vias_administracion: [{ id: 'v1', clave: 'oral' }],
  });
  const db = conRegistroDeSalud(falsa, 'GET /x');
  const { data } = await db.from('indicaciones_medicacion').select('id, via:vias_administracion(clave)');
  assert.deepEqual(data, [{ id: 'a', via: { clave: 'oral' } }]);
  assert.deepEqual(falsa.pedidos[0].args.p_columnas, ['id', 'via_administracion_id']);
  assert.equal(falsa.pedidos[1].directo.tabla, 'vias_administracion');
});

test('!inner descarta las filas sin lo pegado, y el filtro de la guardia va a la base', async () => {
  const falsa = conexionFalsa({
    leer_informacion_de_salud: [{ id: 'a', guardia_id: 'g1' }, { id: 'b', guardia_id: 'g2' }],
    guardias: [{ id: 'g1', fecha: '2026-11-10' }],
  });
  const db = conRegistroDeSalud(falsa, 'GET /x');
  const { data } = await db.from('reportes').select('id, guardias!inner(fecha)').eq('guardias.servicio_id', 's1');
  assert.deepEqual(data, [{ id: 'a', guardias: { fecha: '2026-11-10' } }]);
  assert.deepEqual(falsa.pedidos[0].args.p_filtros, [{ guardia: [{ columna: 'servicio_id', op: 'eq', valor: 's1' }] }]);
});

test('la relación nombrada dice qué tabla y por qué columna se pega', async () => {
  const falsa = conexionFalsa({
    leer_informacion_de_salud: [{ id: 'c', cargado_por: 'u1', paciente_id: 'p1' }],
    usuarios: [{ id: 'u1', nombre: 'Ana' }],
    pacientes: [{ id: 'p1', apellido: 'Paz' }],
  });
  const db = conRegistroDeSalud(falsa, 'GET /x');
  const { data, error } = await db.from('cargas_sujetas_a_aprobacion').select(
    'id, cargador:usuarios!cargas_sujetas_a_aprobacion_cargado_por_fkey(nombre), paciente:pacientes!cargas_sujetas_a_aprobacion_del_paciente(apellido)',
  );
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 'c', cargador: { nombre: 'Ana' }, paciente: { apellido: 'Paz' } }]);
  assert.deepEqual(falsa.pedidos[0].args.p_columnas, ['id', 'cargado_por', 'paciente_id']);
  // Una relación que no conoce, o que no lleva a esa tabla, se rechaza.
  assert.ok((await db.from('reportes').select('id, usuarios!otra_fkey(nombre)')).error);
  assert.ok((await db.from('reportes').select('id, usuarios!cargas_sujetas_a_aprobacion_del_paciente(nombre)')).error);
});

test('el conteo sin filas pide sólo el número', async () => {
  const falsa = conexionFalsa({ leer_informacion_de_salud: 17 });
  const db = conRegistroDeSalud(falsa, 'GET /x');
  const { count, data } = await db.from('alertas').select('id', { count: 'exact', head: true });
  assert.equal(count, 17);
  assert.equal(data, null);
  assert.equal(falsa.pedidos.length, 1);
  assert.equal(falsa.pedidos[0].args.p_contar, true);
});

test('agregar y modificar: sin select no devuelve filas; con select() vacío pide la fila entera', async () => {
  const falsa = conexionFalsa({
    agregar_informacion_de_salud: [{ id: 'n' }],
    modificar_informacion_de_salud: [{ id: 'n', estado: 'anulado' }],
  });
  const db = conRegistroDeSalud(falsa, 'POST /x');
  const alta = await db.from('reportes').insert({ paciente_id: 'p' });
  assert.equal(alta.data, null);
  assert.equal(falsa.pedidos[0].args.p_columnas_devueltas, null);

  const { data } = await db.from('informes_obra_social').update({ estado: 'anulado' }).eq('id', 'n').select().single();
  assert.deepEqual(data, { id: 'n', estado: 'anulado' });
  assert.deepEqual(falsa.pedidos[1].args.p_columnas_devueltas, ['*']);
});

test('falla cerrado: sin filtro no se modifica, no se borra, y lo que no entiende se rechaza', async () => {
  const falsa = conexionFalsa();
  const db = conRegistroDeSalud(falsa, 'X');
  const sinFiltro = await db.from('reportes').update({ texto_libre: 'x' });
  assert.ok(sinFiltro.error);
  assert.throws(() => db.from('reportes').delete());
  const desconocido = await db.from('reportes').select('id, personas(nombre)');
  assert.ok(desconocido.error);
  const deSalud = await db.from('reportes').select('id, alertas(id)');
  assert.ok(deSalud.error);
  assert.equal(falsa.pedidos.length, 0);
});

test('maybeSingle con dos filas es error; single sin filas también', async () => {
  const dos = conexionFalsa({ leer_informacion_de_salud: [{ id: 1 }, { id: 2 }] });
  assert.ok((await conRegistroDeSalud(dos, 'X').from('alertas').select('id').maybeSingle()).error);
  const ninguna = conexionFalsa({ leer_informacion_de_salud: [] });
  assert.equal((await conRegistroDeSalud(ninguna, 'X').from('alertas').select('id').maybeSingle()).data, null);
  assert.ok((await conRegistroDeSalud(ninguna, 'X').from('alertas').select('id').single()).error);
});

test('un error de la base llega con su código', async () => {
  const falsa = conexionFalsa({
    agregar_informacion_de_salud: () => ({ data: null, error: { code: '23505', message: 'duplicada' } }),
  });
  const { error } = await conRegistroDeSalud(falsa, 'X').from('emergencias_guardia').insert({ a: 1 }).select('id').maybeSingle();
  assert.equal(error.code, '23505');
});
