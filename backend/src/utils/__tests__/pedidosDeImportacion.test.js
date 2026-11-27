/**
 * Los pedidos de dato de una importación.
 *
 *   npm test --prefix backend
 *
 * Lo que se prueba: que ningún renglón quede afuera. Lo que falta deja un pedido con el renglón
 * guardado; al contestarlo la persona se crea en el lote del pedido y el pedido se cierra; una
 * respuesta que no sirve deja el pedido abierto; un pedido de otra Prestadora no existe para ésta.
 * Todo contra una base en memoria y altas falsas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseEnMemoria } from './baseEnMemoria.js';
import { ErrorConMotivo } from '../errorConMotivo.js';
import {
  altaConPedidos, responderPedido, listarPedidos, contarAbiertos, cerrarPedidosDelLote, pedidoPorFalta, quienDelRenglon,
} from '../pedidosDeImportacion.js';

const PRESTADORA = 'prestadora-a';
const OTRA = 'prestadora-b';
const LOTE = 'lote-1';
const LUGAR = 'lugar-1';

function contexto(base, { crearAsistente, crearCliente, importacionId = LOTE, prestadoraId = PRESTADORA } = {}) {
  const altas = [];
  return {
    altas,
    db: base,
    prestadoraId,
    importacionId,
    usuarioPanelId: 'usuario-1',
    hoy: '2026-11-27',
    crear: {
      asistente: async (datos) => {
        altas.push({ tipo: 'asistente', datos });
        if (crearAsistente) return crearAsistente(datos);
        return { asistenteId: 'asistente-nuevo' };
      },
      cliente: async (datos) => {
        altas.push({ tipo: 'cliente', datos });
        if (crearCliente) return crearCliente(datos);
        return { clienteId: 'cliente-nuevo', pacienteId: 'paciente-nuevo', numeroCliente: '7' };
      },
      servicio: async () => 'servicio-nuevo',
    },
    leerGeneros: async (textos) => new Map(textos.map((t) => [t, t])),
    listarLugares: async () => [{ id: LUGAR, nombre: 'Lanús', activo: true, provincia: 'Buenos Aires' }],
    nombreDelLugar: async () => 'Lanús',
    agregarLugar: async () => 'lugar-agregado',
    ubicar: async () => ({ partes: { calle: 'Mitre', numero: '10', lugar_id: LUGAR } }),
    coordenadas: async () => ({ lat: -34.7, lng: -58.4 }),
  };
}

function lotes(estado = 'pendiente', tipo = 'asistente') {
  return [
    { id: LOTE, prestadora_id: PRESTADORA, tipo, estado_conformidad: estado },
    { id: 'lote-otra', prestadora_id: OTRA, tipo, estado_conformidad: 'pendiente' },
  ];
}

const datosAsistente = { nombre: 'Ana Prueba', email: 'ana@ejemplo.test', documento: '' };

test('la persona que entra firme se crea sin pedidos', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  const ctx = contexto(base);
  const r = await altaConPedidos(ctx, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana Prueba' });
  assert.equal(r.estado, 'creada');
  assert.equal(ctx.altas.length, 1);
  assert.equal(ctx.altas[0].datos.importacionId, LOTE);
  assert.equal(ctx.altas[0].datos.prestadoraId, PRESTADORA);
  assert.equal((base.tablas.pedidos_de_importacion ?? []).length, 0);
});

test('lo que falta deja un pedido con el renglón guardado, y no corta el lote', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  const ctx = contexto(base, { crearAsistente: () => { throw new ErrorConMotivo('falta_el_documento'); } });
  const r = await altaConPedidos(ctx, { tipo: 'asistente', fila: 3, datos: datosAsistente, quien: 'Ana Prueba' });
  assert.equal(r.estado, 'pedido');
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.prestadora_id, PRESTADORA);
  assert.equal(pedido.importacion_id, LOTE);
  assert.equal(pedido.fila, 3);
  assert.equal(pedido.dato, 'documento');
  assert.equal(pedido.motivo, 'falta_el_documento');
  assert.equal(pedido.estado, 'abierto');
  assert.equal(pedido.renglon.campo, 'documento');
  assert.deepEqual(pedido.renglon.datos, datosAsistente);
});

test('una falla del sistema también queda como pedido, con su motivo', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  const ctx = contexto(base, { crearAsistente: () => { throw new Error('se cortó la base'); } });
  const original = console.error;
  console.error = () => {};
  try {
    const r = await altaConPedidos(ctx, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana' });
    assert.equal(r.estado, 'pedido');
  } finally {
    console.error = original;
  }
  assert.equal(base.tablas.pedidos_de_importacion[0].motivo, 'falla_del_sistema');
});

test('la localidad dudosa no deja afuera a la persona: entra y queda el pedido con las opciones', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes('pendiente', 'cliente') });
  const ctx = contexto(base);
  const localidad = {
    motivo: { codigo: 'localidad_ambigua', candidatos: [{ texto: 'Lanús Oeste', lugar: { id: LUGAR } }, { texto: 'Lanús Este', lugar: { idOficial: 99 } }] },
    domicilioQueEntra: { calle: 'Mitre', numero: '10' },
    valorOriginal: 'Mitre 10, Lanus',
  };
  const datos = { nombreContacto: 'Juan', apellidoContacto: 'Prueba', email: 'j@ejemplo.test', nombrePaciente: 'Rosa Prueba' };
  const r = await altaConPedidos(ctx, { tipo: 'cliente', fila: 2, datos, localidad, quien: 'Rosa Prueba' });
  assert.equal(r.estado, 'creada');
  assert.equal(ctx.altas[0].datos.pendienteConformidad, true);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.dato, 'localidad');
  assert.equal(pedido.paciente_id, 'paciente-nuevo');
  assert.deepEqual(pedido.sugerencias.map((s) => s.valor), [LUGAR, 'oficial:99']);
  assert.equal(pedido.valor_original, 'Mitre 10, Lanus');
});

test('el renglón ya cargado en otra importación no abre pedidos', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes('pendiente', 'cliente') });
  const ctx = contexto(base, { crearCliente: () => ({ yaEstaba: true, clienteId: 'c', numeroCliente: '3' }) });
  const r = await altaConPedidos(ctx, {
    tipo: 'cliente', fila: 1, datos: {}, localidad: { motivo: { codigo: 'localidad_ambigua' }, domicilioQueEntra: { calle: 'x' } }, quien: 'x',
  });
  assert.equal(r.estado, 'yaEstaba');
  assert.equal((base.tablas.pedidos_de_importacion ?? []).length, 0);
});

test('al contestar, la persona se crea en el lote del pedido y el pedido se cierra', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  let veces = 0;
  const ctxImportacion = contexto(base, {
    crearAsistente: (datos) => {
      veces += 1;
      if (!datos.documento) throw new ErrorConMotivo('falta_el_documento');
      return { asistenteId: 'asistente-nuevo' };
    },
  });
  await altaConPedidos(ctxImportacion, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana' });
  const id = base.tablas.pedidos_de_importacion[0].id;

  // La respuesta llega sin lote en el contexto: lo toma del pedido.
  const ctx = { ...ctxImportacion, importacionId: null };
  const r = await responderPedido(ctx, id, '27123456784', {});
  assert.deepEqual(r, { ok: true, pendientes: 0 });
  assert.equal(veces, 2);
  const ultima = ctxImportacion.altas.at(-1).datos;
  assert.equal(ultima.documento, '27123456784');
  assert.equal(ultima.importacionId, LOTE);
  const pedido = base.tablas.pedidos_de_importacion[0];
  assert.equal(pedido.estado, 'resuelto');
  assert.equal(pedido.resuelto_por, 'usuario-1');
});

test('si el lote ya se conformó, el Asistente creado al contestar queda operable', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes('confirmada') });
  const conformados = [];
  const ctx = contexto(base, {
    crearAsistente: (datos) => {
      if (!datos.documento) throw new ErrorConMotivo('falta_el_documento');
      return { asistenteId: 'asistente-nuevo' };
    },
  });
  ctx.conformarAsistente = async (idAsistente) => conformados.push(idAsistente);
  await altaConPedidos(ctx, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana' });
  await responderPedido(ctx, base.tablas.pedidos_de_importacion[0].id, '27123456784', {});
  assert.deepEqual(conformados, ['asistente-nuevo']);
});

test('una respuesta que no sirve deja el pedido abierto y devuelve el motivo', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  const ctx = contexto(base, { crearAsistente: () => { throw new ErrorConMotivo('numero_no_valido'); } });
  await altaConPedidos(ctx, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana' });
  const id = base.tablas.pedidos_de_importacion[0].id;
  await assert.rejects(responderPedido(ctx, id, '123', {}), (e) => e.motivo === 'numero_no_valido');
  await assert.rejects(responderPedido(ctx, id, '   ', {}), (e) => e.motivo === 'respuesta_invalida');
  assert.equal(base.tablas.pedidos_de_importacion[0].estado, 'abierto');
  assert.equal(base.tablas.pedidos_de_importacion.length, 1);
});

test('si ese dato quedó bien y falta otro, el pedido pasa a ser del que falta', async () => {
  const base = baseEnMemoria({ importaciones_prestadora: lotes() });
  const ctx = contexto(base, {
    crearAsistente: (datos) => {
      if (!datos.documento) throw new ErrorConMotivo('falta_el_documento');
      throw new ErrorConMotivo('falta_el_genero');
    },
  });
  await altaConPedidos(ctx, { tipo: 'asistente', fila: 1, datos: datosAsistente, quien: 'Ana' });
  const [viejo] = base.tablas.pedidos_de_importacion;
  const r = await responderPedido(ctx, viejo.id, '27123456784', {});
  assert.equal(r.pendientes, 1);
  const [cerrado, nuevo] = base.tablas.pedidos_de_importacion;
  assert.equal(cerrado.estado, 'resuelto');
  assert.equal(cerrado.respuesta.reemplazadoPor, nuevo.id);
  assert.equal(nuevo.estado, 'abierto');
  assert.equal(nuevo.motivo, 'falta_el_genero');
  assert.equal(nuevo.renglon.campo, 'genero');
  assert.equal(nuevo.renglon.datos.documento, '27123456784');
});

test('un pedido de otra Prestadora, uno ya resuelto o de un lote rechazado no se contesta', async () => {
  const base = baseEnMemoria({
    importaciones_prestadora: [...lotes(), { id: 'lote-rechazado', prestadora_id: PRESTADORA, tipo: 'asistente', estado_conformidad: 'rechazada' }],
    pedidos_de_importacion: [
      { id: 'p-otra', prestadora_id: OTRA, importacion_id: 'lote-otra', fila: 1, dato: 'dato', estado: 'abierto', renglon: { tipo: 'asistente', datos: {}, campo: 'email' } },
      { id: 'p-resuelto', prestadora_id: PRESTADORA, importacion_id: LOTE, fila: 1, dato: 'dato', estado: 'resuelto', renglon: {} },
      { id: 'p-rechazado', prestadora_id: PRESTADORA, importacion_id: 'lote-rechazado', fila: 1, dato: 'dato', estado: 'abierto', renglon: {} },
    ],
  });
  const ctx = contexto(base);
  await assert.rejects(responderPedido(ctx, 'p-otra', 'x@ejemplo.test', {}), (e) => e.motivo === 'pedido_inexistente');
  await assert.rejects(responderPedido(ctx, 'p-resuelto', 'x', {}), (e) => e.motivo === 'pedido_ya_resuelto');
  await assert.rejects(responderPedido(ctx, 'p-rechazado', 'x', {}), (e) => e.motivo === 'lote_no_abierto');
  assert.equal(base.tablas.pedidos_de_importacion[0].estado, 'abierto');
  assert.equal(ctx.altas.length, 0);
});

test('la localidad elegida se guarda en la persona y no se acepta una que no es de la lista', async () => {
  const base = baseEnMemoria({
    importaciones_prestadora: lotes('pendiente', 'cliente'),
    pacientes: [{ id: 'pac-1', prestadora_id: PRESTADORA, persona_id: 'per-1' }],
    personas: [{ id: 'per-1', prestadora_id: PRESTADORA }],
    pedidos_de_importacion: [{
      id: 'p-loc', prestadora_id: PRESTADORA, importacion_id: LOTE, fila: 1, dato: 'localidad', estado: 'abierto',
      paciente_id: 'pac-1', renglon: { para: 'domicilio', tipo: 'cliente', oficiales: {}, domicilio: { calle: 'Mitre', numero: '10' } },
    }],
  });
  const ctx = contexto(base);
  await assert.rejects(responderPedido(ctx, 'p-loc', 'lugar-inventado', {}), (e) => e.motivo === 'respuesta_invalida');
  await responderPedido(ctx, 'p-loc', LUGAR, {});
  const persona = base.tablas.personas[0];
  assert.equal(persona.lugar_id, LUGAR);
  assert.equal(persona.calle, 'Mitre');
  assert.equal(persona.lat, -34.7);
  assert.equal(base.tablas.pedidos_de_importacion[0].estado, 'resuelto');
});

test('la lista de pedidos es de la Prestadora, sólo los abiertos, y no muestra el renglón guardado', async () => {
  const base = baseEnMemoria({
    pedidos_de_importacion: [
      { id: 'a', prestadora_id: PRESTADORA, importacion_id: LOTE, fila: 1, dato: 'dato', estado: 'abierto', renglon: { quien: 'Ana', campo: 'email', datos: { email: 'secreto' } }, created_at: '1' },
      { id: 'b', prestadora_id: PRESTADORA, importacion_id: 'lote-2', fila: 2, dato: 'dato', estado: 'abierto', renglon: {}, created_at: '2' },
      { id: 'c', prestadora_id: PRESTADORA, importacion_id: LOTE, fila: 3, dato: 'dato', estado: 'resuelto', renglon: {}, created_at: '3' },
      { id: 'd', prestadora_id: OTRA, importacion_id: LOTE, fila: 4, dato: 'dato', estado: 'abierto', renglon: {}, created_at: '4' },
    ],
  });
  const todos = await listarPedidos(base, { prestadoraId: PRESTADORA });
  assert.deepEqual(todos.map((p) => p.id), ['a', 'b']);
  const delLote = await listarPedidos(base, { prestadoraId: PRESTADORA, importacionId: LOTE });
  assert.deepEqual(delLote.map((p) => p.id), ['a']);
  assert.equal(delLote[0].quien, 'Ana');
  assert.equal('renglon' in delLote[0], false);
  assert.equal('datos' in delLote[0], false);
  assert.equal(delLote[0].campo, 'email');
  assert.equal(todos[1].campo, null);
  assert.deepEqual(delLote[0].sugerencias, []);
  assert.equal(await contarAbiertos(base, { prestadoraId: PRESTADORA }), 2);
  assert.equal(await contarAbiertos(base, { prestadoraId: OTRA }), 1);
});

test('al rechazar el lote se cierran sus pedidos abiertos, y sólo los suyos', async () => {
  const base = baseEnMemoria({
    pedidos_de_importacion: [
      { id: 'a', prestadora_id: PRESTADORA, importacion_id: LOTE, estado: 'abierto' },
      { id: 'b', prestadora_id: PRESTADORA, importacion_id: 'lote-2', estado: 'abierto' },
      { id: 'c', prestadora_id: OTRA, importacion_id: LOTE, estado: 'abierto' },
    ],
  });
  await cerrarPedidosDelLote(base, { prestadoraId: PRESTADORA, importacionId: LOTE, usuarioPanelId: 'u' });
  assert.deepEqual(base.tablas.pedidos_de_importacion.map((p) => p.estado), ['resuelto', 'abierto', 'abierto']);
  assert.deepEqual(base.tablas.pedidos_de_importacion[0].respuesta, { loteRechazado: true });
});

test('cada motivo pide el dato que corresponde', () => {
  assert.deepEqual(pedidoPorFalta('falta_el_documento', 'asistente'), { dato: 'documento', campo: 'documento' });
  assert.deepEqual(pedidoPorFalta('falta_el_documento', 'cliente'), { dato: 'documento', campo: 'documentoContacto' });
  assert.deepEqual(pedidoPorFalta('faltan_datos', 'cliente', { nombreContacto: 'J', apellidoContacto: 'P' }), { dato: 'dato', campo: 'email' });
  assert.deepEqual(pedidoPorFalta('falta_el_genero_del_paciente', 'servicio'), { dato: 'dato', campo: 'generoPaciente' });
  assert.deepEqual(pedidoPorFalta('falla_del_sistema', 'asistente'), { dato: 'dato', campo: null });
  // La fecha que se pide es la que no se entiende, en el orden en que el alta las comprueba.
  assert.deepEqual(pedidoPorFalta('fecha_invalida', 'servicio', { vigenteDesde: 'pronto' }), { dato: 'dato', campo: 'vigenteDesde' });
  assert.deepEqual(
    pedidoPorFalta('fecha_invalida', 'servicio', { fechaNacimientoPaciente: 'hace mucho', vigenteDesde: 'pronto' }),
    { dato: 'dato', campo: 'fechaNacimientoPaciente' },
  );
  assert.deepEqual(pedidoPorFalta('fecha_invalida', 'cliente', { vigenteDesde: 'pronto' }), { dato: 'dato', campo: 'fechaNacimientoPaciente' });
  assert.deepEqual(pedidoPorFalta('fecha_invalida', 'asistente'), { dato: 'dato', campo: 'valor_hora_rige_desde' });
});

test('el renglón se nombra por la persona que la Prestadora reconoce', () => {
  assert.equal(quienDelRenglon('asistente', { nombre: ' Ana ' }), 'Ana');
  assert.equal(quienDelRenglon('servicio', { nombrePaciente: 'Rosa' }), 'Rosa');
  assert.equal(quienDelRenglon('cliente', { nombreContacto: 'Juan', apellidoContacto: 'Prueba' }), 'Juan Prueba');
  assert.equal(quienDelRenglon('cliente', {}), null);
});
