/**
 * La importación de Servicios en curso.
 *
 *   npm test --prefix backend
 *
 * Lo que se prueba: los renglones del mismo Cliente y Paciente arman un solo Servicio; cada renglón
 * llega hasta su serie de turnos de guardia con el Asistente buscado por CUIL; un CUIL que no está
 * en el Padrón no frena la serie; sin Coordinador la serie espera y queda un solo pedido; al
 * contestar, la guardia sigue desde donde quedó. Todo contra una base en memoria y altas falsas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseEnMemoria } from './baseEnMemoria.js';
import {
  agruparRenglones, claveDelServicio, coordinadorNombrado, renglonDeLaLista,
  procesarGrupo, continuarGrupo, responderDeServicio, horarioDeLaRespuesta,
} from '../servicioImportado.js';
import { responderPedido } from '../pedidosDeImportacion.js';

const PRESTADORA = 'prestadora-a';
const OTRA = 'prestadora-b';
const LOTE = 'lote-1';
const HORARIO = { dias: ['lunes', 'miercoles'], horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 0, dudoso: false };

function inicial(extra = {}) {
  return {
    importaciones_prestadora: [{ id: LOTE, prestadora_id: PRESTADORA, tipo: 'servicio', estado_conformidad: 'confirmada' }],
    usuarios: [
      { id: 'coord-1', prestadora_id: PRESTADORA, rol: 'coordinador', nombre: 'Laura Prueba', email: 'laura@ejemplo.test', desactivada_en: null },
      { id: 'coord-2', prestadora_id: PRESTADORA, rol: 'coordinador', nombre: 'Pedro Prueba', email: 'pedro@ejemplo.test', desactivada_en: null },
      { id: 'coord-otra', prestadora_id: OTRA, rol: 'coordinador', nombre: 'Laura Prueba', desactivada_en: null },
    ],
    lista_precios: [
      { id: 'lp-1', prestadora_id: PRESTADORA, tipo_servicio: 'Acompañamiento', modalidad: 'Diurna', precio: '1000', moneda: 'ARS', activo: true, vigente_desde: '2026-01-01', vigente_hasta: null },
      { id: 'lp-2', prestadora_id: PRESTADORA, tipo_servicio: 'Acompañamiento', modalidad: 'Nocturna', precio: '1200', moneda: 'ARS', activo: true, vigente_desde: '2026-01-01', vigente_hasta: null },
    ],
    asistentes: [
      { id: 'asis-1', prestadora_id: PRESTADORA, documento_numero: '27111111113', nombre: 'Ana', estado: 'activo', pendiente_conformidad: false, deleted_at: null },
      { id: 'asis-otra', prestadora_id: OTRA, documento_numero: '27222222223', nombre: 'Eva', estado: 'activo', pendiente_conformidad: false, deleted_at: null },
    ],
    servicios: [],
    ...extra,
  };
}

function contexto(base, { horarios = new Map(), asignar } = {}) {
  base.rpcs.crear_turno_guardia_recurrente = (args) => {
    const servicio = base.tablas.servicios.find((s) => s.id === args.p_servicio);
    if (!servicio?.coordinador_id) return { data: null, error: { message: 'sin_coordinador' } };
    base.tablas.series ??= [];
    const id = `serie-${base.tablas.series.length + 1}`;
    base.tablas.series.push({ id, ...args });
    return { data: id, error: null };
  };
  base.rpcs.asignar_serie_en_curso = (args) => {
    if (asignar) return asignar(args);
    base.tablas.asignaciones ??= [];
    base.tablas.asignaciones.push(args);
    return { data: null, error: null };
  };
  return {
    db: base,
    prestadoraId: PRESTADORA,
    importacionId: LOTE,
    usuarioPanelId: 'usuario-1',
    hoy: '2026-11-27',
    crear: {
      asistente: async () => ({ asistenteId: 'x' }),
      cliente: async () => ({ clienteId: 'cliente-1', pacienteId: 'paciente-1', numeroCliente: '1' }),
      servicio: async (_db, { prestadoraId, clienteId, vigenteDesde }) => {
        const id = `servicio-${base.tablas.servicios.length + 1}`;
        base.tablas.servicios.push({ id, prestadora_id: prestadoraId, cliente_id: clienteId, vigente_desde: vigenteDesde ?? '2026-11-27', vigente_hasta: null, coordinador_id: null });
        return id;
      },
    },
    leerGeneros: async (textos) => new Map(textos.map((t) => [t, t])),
    leerHorarios: async () => horarios,
    listarLugares: async () => [],
    motivoDeLaAsignacion: (error) => (String(error.message).includes('documentos') ? { motivo: 'documentos_bloquean' } : null),
  };
}

const persona = {
  nombreContacto: 'Juan', apellidoContacto: 'Prueba', documentoContacto: '20-33333333-4', email: 'juan@ejemplo.test',
  nombrePaciente: 'Rosa Prueba', documentoPaciente: '27444444445',
};

function renglon(fila, extra = {}) {
  return {
    fila,
    datos: {
      ...persona, tipoServicio: 'Acompañamiento', modalidad: 'Diurna', dias: 'lunes y miércoles', horario: '8 a 16',
      cuilAsistente: '27-11111111-3', coordinador: 'Laura Prueba', ...extra,
    },
  };
}

const abiertos = (base) => (base.tablas.pedidos_de_importacion ?? []).filter((p) => p.estado === 'abierto');

const horariosLeidos = new Map([['lunes y miércoles 8 a 16', HORARIO]]);

test('los renglones del mismo Cliente y Paciente arman un solo Servicio, en orden', () => {
  const grupos = agruparRenglones([
    renglon(1),
    renglon(2, { documentoPaciente: '27555555556', nombrePaciente: 'Otra' }),
    renglon(3, { horario: '20 a 8' }),
  ]);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0].guardias.map((g) => g.fila), [1, 3]);
  assert.equal(grupos[0].guardias[1].textoHorario, 'lunes y miércoles 20 a 8');
  assert.equal(grupos[0].guardias[0].cuil, '27111111113');
  // Sin números, los junta el nombre escrito igual aunque cambien mayúsculas y acentos.
  assert.equal(
    claveDelServicio({ nombreContacto: 'José', apellidoContacto: 'Pérez', nombrePaciente: 'Rosa' }),
    claveDelServicio({ nombreContacto: 'jose', apellidoContacto: 'PEREZ', nombrePaciente: 'rosa' }),
  );
});

test('el Coordinador y la lista de precios se toman sólo si coinciden con uno solo', () => {
  const coordinadores = [{ id: 'a', nombre: 'Laura' }, { id: 'b', nombre: 'Laura' }, { id: 'c', nombre: 'Pedro', email: 'p@ejemplo.test' }];
  assert.equal(coordinadorNombrado(coordinadores, 'Laura'), null);
  assert.equal(coordinadorNombrado(coordinadores, 'P@EJEMPLO.TEST').id, 'c');
  assert.equal(coordinadorNombrado(coordinadores, ''), null);
  const lista = inicial().lista_precios;
  assert.equal(renglonDeLaLista(lista, 'Acompañamiento', ''), null);
  assert.equal(renglonDeLaLista(lista, 'acompanamiento', 'nocturna').id, 'lp-2');
});

test('con todos los datos, el Servicio llega hasta la serie con su Asistente y sin pedidos', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1)]);
  const r = await procesarGrupo(ctx, grupo);
  assert.equal(r.estado, 'creada');
  const [servicio] = base.tablas.servicios;
  assert.equal(servicio.coordinador_id, 'coord-1');
  const [prestacion] = base.tablas.prestaciones;
  assert.equal(prestacion.precio_lista_id, 'lp-1');
  assert.equal(prestacion.precio_final, 1000);
  assert.equal(prestacion.moneda, 'ARS');
  assert.deepEqual(base.tablas.cronograma_de_guardias[0].dias_semana, ['lunes', 'miercoles']);
  const [serie] = base.tablas.series;
  assert.equal(serie.p_hora_inicio, '08:00');
  assert.equal(serie.p_modalidad, 'Diurna');
  assert.deepEqual(serie.p_pacientes, ['paciente-1']);
  assert.deepEqual(base.tablas.asignaciones, [{ p_serie_id: 'serie-1', p_asistente_id: 'asis-1' }]);
  assert.equal((base.tablas.pedidos_de_importacion ?? []).length, 0);
});

test('dos renglones del mismo turno no duplican la Prestación ni la guardia del cronograma', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1), renglon(2)]);
  await procesarGrupo(ctx, grupo);
  assert.equal(base.tablas.prestaciones.length, 1);
  assert.equal(base.tablas.cronograma_de_guardias.length, 1);
  assert.equal(base.tablas.series.length, 2);
});

test('un CUIL que no está en el Padrón crea la serie igual y deja el pedido del Asistente', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  // El CUIL es de un Asistente de otra Prestadora: para ésta no existe.
  const [grupo] = agruparRenglones([renglon(1, { cuilAsistente: '27222222223' })]);
  await procesarGrupo(ctx, grupo);
  assert.equal(base.tablas.series.length, 1);
  assert.equal((base.tablas.asignaciones ?? []).length, 0);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.dato, 'asistente');
  assert.equal(pedido.motivo, 'asistente_no_encontrado');
  assert.equal(pedido.valor_original, '27222222223');
  assert.deepEqual(pedido.sugerencias.map((s) => s.valor), ['asis-1']);
});

test('sin Coordinador la serie espera, y queda un solo pedido con todas las guardias', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { coordinador: '' }), renglon(2, { coordinador: '' })]);
  await procesarGrupo(ctx, grupo);
  assert.equal((base.tablas.series ?? []).length, 0);
  assert.equal(base.tablas.prestaciones.length, 1);
  // Sin serie no se agrega la guardia al cronograma.
  assert.equal((base.tablas.cronograma_de_guardias ?? []).length, 0);
  const pedidos = abiertos(base);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].dato, 'coordinador');
  assert.equal(pedidos[0].motivo, 'faltan_datos');
  assert.equal(pedidos[0].renglon.guardias.length, 2);
  assert.deepEqual(pedidos[0].sugerencias.map((s) => s.valor), ['coord-1', 'coord-2']);
});

test('un Coordinador que no se reconoce queda pedido con lo que decía la planilla', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { coordinador: 'Alguien Más' })]);
  await procesarGrupo(ctx, grupo);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.motivo, 'coordinador_no_encontrado');
  assert.equal(pedido.valor_original, 'Alguien Más');
});

test('al elegir el Coordinador, las guardias siguen hasta la serie y el pedido se cierra', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { coordinador: '' }), renglon(2, { coordinador: '' })]);
  await procesarGrupo(ctx, grupo);
  const [{ id }] = abiertos(base);

  await assert.rejects(responderPedido(ctx, id, 'coord-otra', { responderDeServicio, continuarGrupo }), (e) => e.motivo === 'respuesta_invalida');
  const r = await responderPedido(ctx, id, 'coord-2', { responderDeServicio, continuarGrupo });
  assert.equal(r.pendientes, 0);
  assert.equal(base.tablas.servicios[0].coordinador_id, 'coord-2');
  assert.equal(base.tablas.series.length, 2);
  assert.equal(base.tablas.asignaciones.length, 2);
  assert.equal(abiertos(base).length, 0);
});

test('un horario que no se lee deja el pedido; contestado, la serie se crea con ese horario', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: new Map([['lunes y miércoles 8 a 16', { ...HORARIO, dudoso: true }]]) });
  const [grupo] = agruparRenglones([renglon(1)]);
  await procesarGrupo(ctx, grupo);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.dato, 'horario');
  assert.equal(pedido.motivo, 'horario_no_reconocido');
  assert.equal((base.tablas.cronograma_de_guardias ?? []).length, 0);

  const fresco = { ...pedido, renglon: structuredClone(pedido.renglon) };
  await assert.rejects(responderDeServicio(ctx, fresco, { dias: ['feriado'], horaInicio: '08:00', horaFin: '16:00' }), (e) => e.motivo === 'respuesta_invalida');
  const r = await responderDeServicio(ctx, fresco, { dias: ['martes'], horaInicio: '20:00', horaFin: '08:00', diasHastaElFin: 1 });
  assert.equal(r.pedidos, 0);
  assert.deepEqual(base.tablas.series[0].p_dias_semana, ['martes']);
  assert.equal(base.tablas.series[0].p_dias_hasta_el_fin, 1);
});

test('un tipo de servicio que no está en la lista queda pedido; contestado con otro renglón ajeno, no sirve', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { tipoServicio: 'Enfermería' })]);
  await procesarGrupo(ctx, grupo);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.dato, 'tipo_servicio');
  assert.equal(pedido.motivo, 'tipo_servicio_no_reconocido');
  assert.deepEqual(pedido.sugerencias.map((s) => s.valor), ['lp-1', 'lp-2']);
  await assert.rejects(responderDeServicio(ctx, pedido, 'lp-de-otra'), (e) => e.motivo === 'respuesta_invalida');
  const r = await responderDeServicio(ctx, pedido, 'lp-2');
  assert.equal(r.pedidos, 0);
  assert.equal(base.tablas.prestaciones[0].precio_lista_id, 'lp-2');
});

test('si la base rechaza al Asistente elegido, el pedido queda abierto con el motivo', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, {
    horarios: horariosLeidos,
    asignar: () => ({ data: null, error: { message: 'documentos pendientes' } }),
  });
  const [grupo] = agruparRenglones([renglon(1)]);
  await procesarGrupo(ctx, grupo);
  const [pedido] = base.tablas.pedidos_de_importacion;
  assert.equal(pedido.dato, 'asistente');
  assert.equal(pedido.motivo, 'documentos_bloquean');
  await assert.rejects(responderDeServicio(ctx, pedido, 'asis-otra'), (e) => e.motivo === 'respuesta_invalida');
  await assert.rejects(responderDeServicio(ctx, pedido, 'asis-1'), (e) => e.motivo === 'documentos_bloquean');
  assert.equal(base.tablas.pedidos_de_importacion.length, 1);
});

test('el horario contestado se comprueba en el servidor', () => {
  assert.deepEqual(
    horarioDeLaRespuesta({ dias: ['miercoles', 'lunes'], horaInicio: '08:00', horaFin: '16:00' }),
    { dias: ['lunes', 'miercoles'], horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 0 },
  );
  for (const malo of [
    null, 'lunes', { dias: [], horaInicio: '08:00', horaFin: '16:00' },
    { dias: ['lunes'], horaInicio: '8', horaFin: '16:00' },
    { dias: ['lunes'], horaInicio: '16:00', horaFin: '08:00' },
    { dias: ['lunes'], horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: -1 },
    { dias: ['lunes'], horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 1.5 },
  ]) {
    assert.throws(() => horarioDeLaRespuesta(malo), (e) => e.motivo === 'respuesta_invalida');
  }
});

test('si la base rechaza la serie, la guardia recién agregada sale del cronograma', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  base.rpcs.crear_turno_guardia_recurrente = () => ({ data: null, error: { message: 'fuera_del_periodo_del_servicio' } });
  const [grupo] = agruparRenglones([renglon(1)]);
  await procesarGrupo(ctx, grupo);
  assert.equal(base.tablas.cronograma_de_guardias.length, 0);
  const [pedido] = abiertos(base);
  assert.equal(pedido.dato, 'horario');
  assert.equal(pedido.motivo, 'fuera_del_periodo_del_servicio');
});

test('si la serie se rechaza, una guardia que ya estaba en el cronograma no se quita', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1)]);
  await procesarGrupo(ctx, grupo);
  assert.equal(base.tablas.cronograma_de_guardias.length, 1);
  // Un segundo renglón con el mismo horario usa esa misma guardia; si su serie falla, la guardia sigue.
  base.rpcs.crear_turno_guardia_recurrente = () => ({ data: null, error: { message: 'fuera_del_periodo_del_servicio' } });
  const servicio = { servicioId: base.tablas.servicios[0].id, clienteId: 'cliente-1', pacienteId: 'paciente-1', vigenteDesde: '2026-11-27' };
  const { avanzarGuardia } = await import('../servicioImportado.js');
  const [otra] = agruparRenglones([renglon(2)]);
  const bloqueo = await avanzarGuardia(ctx, servicio, otra.guardias[0], horariosLeidos);
  assert.equal(bloqueo.dato, 'horario');
  assert.equal(base.tablas.cronograma_de_guardias.length, 1);
});

test('una fecha de inicio que no se entiende frena el grupo y queda pedida con su campo', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { vigenteDesde: 'pronto' }), renglon(2, { vigenteDesde: 'pronto' })]);
  const r = await procesarGrupo(ctx, grupo);
  assert.equal(r.estado, 'pedido');
  assert.equal(base.tablas.servicios.length, 0);
  const [pedido] = abiertos(base);
  assert.equal(pedido.dato, 'dato');
  assert.equal(pedido.motivo, 'fecha_invalida');
  assert.equal(pedido.renglon.campo, 'vigenteDesde');
  assert.equal(pedido.valor_original, 'pronto');

  const deps = { responderDeServicio, continuarGrupo };
  await assert.rejects(responderPedido(ctx, pedido.id, 'el mes que viene', deps), (e) => e.motivo === 'fecha_invalida');
  assert.equal(base.tablas.servicios.length, 0);
  await responderPedido(ctx, pedido.id, '01/12/2026', deps);
  assert.equal(base.tablas.servicios[0].vigente_desde, '2026-12-01');
  // Las dos guardias decían lo mismo: las dos toman la fecha contestada y llegan a su serie.
  assert.equal(base.tablas.series.length, 2);
  assert.ok(base.tablas.series.every((serie) => serie.p_vigente_desde === '2026-12-01'));
  assert.equal(abiertos(base).length, 0);
});

test('dos fechas distintas que no se entienden se piden de a una, y el Servicio espera a las dos', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const [grupo] = agruparRenglones([renglon(1, { vigenteDesde: 'pronto' }), renglon(2, { vigenteDesde: 'luego' })]);
  await procesarGrupo(ctx, grupo);
  const deps = { responderDeServicio, continuarGrupo };
  const [primero] = abiertos(base);
  assert.equal(primero.valor_original, 'pronto');
  await responderPedido(ctx, primero.id, '15/12/2026', deps);
  assert.equal(base.tablas.servicios.length, 0);
  const [segundo] = abiertos(base);
  assert.equal(segundo.valor_original, 'luego');
  assert.equal(segundo.fila, 2);
  await responderPedido(ctx, segundo.id, '01/12/2026', deps);
  assert.equal(base.tablas.servicios.length, 1);
  assert.equal(base.tablas.servicios[0].vigente_desde, '2026-12-01');
  assert.equal(abiertos(base).length, 0);
});

test('las sugerencias de Coordinador son las de la base para el Servicio; si no hay, todos los activos', async () => {
  const base = baseEnMemoria(inicial());
  const ctx = contexto(base, { horarios: horariosLeidos });
  const preguntados = [];
  // La base sugiere también uno de otra Prestadora: no entra.
  ctx.coordinadoresSugeridos = async (servicioId) => {
    preguntados.push(servicioId);
    return ['coord-2', 'coord-otra'];
  };
  const [grupo] = agruparRenglones([renglon(1, { coordinador: '' })]);
  await procesarGrupo(ctx, grupo);
  const [pedido] = abiertos(base);
  assert.deepEqual(pedido.sugerencias.map((s) => s.valor), ['coord-2']);
  assert.deepEqual(preguntados, [base.tablas.servicios[0].id]);

  const otra = baseEnMemoria(inicial());
  const ctxOtra = contexto(otra, { horarios: horariosLeidos });
  ctxOtra.coordinadoresSugeridos = async () => [];
  const [grupoOtra] = agruparRenglones([renglon(1, { coordinador: '' })]);
  await procesarGrupo(ctxOtra, grupoOtra);
  assert.deepEqual(abiertos(otra)[0].sugerencias.map((s) => s.valor), ['coord-1', 'coord-2']);
});
