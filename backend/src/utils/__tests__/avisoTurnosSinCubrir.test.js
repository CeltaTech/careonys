import { test } from 'node:test';
import assert from 'node:assert/strict';

// La conexión a la base se arma sola al importar, y `createClient` no acepta una dirección vacía.
// Acá no se consulta ninguna base: la conexión que se usa es una falsa, armada abajo. Mismo recurso
// que en `avisoCambioDeAsistente.test.js`.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
const { avisosPorServicio, avisarTurnosSinCubrir, EVENTO_TURNO_SIN_CUBRIR } = await import('../avisoTurnosSinCubrir.js');
const { mensajeDelSistema, IDIOMAS_DEL_CATALOGO } = await import('../../i18n/avisos.js');
const { sembrarMensajesDelSistema } = await import('../../i18n/mensajesDelSistema.js');
const { filasSembradas } = await import('../../i18n/__tests__/mensajesSembrados.js');

// Las frases de este aviso las siembra la base. Acá se cargan marcas en su lugar, que no son el
// texto del aviso: sirven para ver qué clave eligió el armado y qué valor fue a cada marcador.
// La conjunción y el Paciente sin nombre salen de la siembra de verdad.
const MARCAS = {
  'turno_sin_cubrir.asunto_uno': 'ASUNTO_UNO',
  'turno_sin_cubrir.asunto': 'ASUNTO_VARIOS',
  'turno_sin_cubrir.cuerpo': '<{{pacientes}}|{{fecha}}|{{horaInicio}}|{{horaFin}}>',
};
const marcaEnLosTresIdiomas = (texto) => Object.fromEntries(IDIOMAS_DEL_CATALOGO.map((i) => [i, `${i}:${texto}`]));
const FILAS = filasSembradas();
sembrarMensajesDelSistema([
  ...FILAS.filter((fila) => !(fila.clave in MARCAS)),
  ...Object.entries(MARCAS).map(([clave, texto]) => ({ clave, prestadora_id: null, i18n: marcaEnLosTresIdiomas(texto) })),
]);
const conjuncion = (idioma) => FILAS.find((f) => f.clave === 'comun.conjuncion').i18n[idioma];

const PRESTADORA = 'prestadora-1';

// Datos inventados (CLAUDE.md §6).
const NOMBRES = new Map([['p-1', 'Elena'], ['p-2', 'Aníbal'], ['p-3', 'Rosa']]);
const PENDIENTES = [
  { id: 'a-3', servicio_id: 's-1', paciente_id: 'p-1', inicio: '2026-11-22T08:00:00', fin: '2026-11-22T16:00:00' },
  { id: 'a-1', servicio_id: 's-1', paciente_id: 'p-1', inicio: '2026-11-21T22:00:00', fin: '2026-11-22T06:00:00' },
  { id: 'a-2', servicio_id: 's-1', paciente_id: 'p-2', inicio: '2026-11-21T22:00:00', fin: '2026-11-22T06:00:00' },
  { id: 'a-4', servicio_id: 's-2', paciente_id: 'p-3', inicio: '2026-11-21T08:00:00', fin: '2026-11-21T20:00:00' },
];

// ── El armado del mensaje ────────────────────────────────────────────────────────────────

test('con un turno, el asunto va en singular y el cuerpo es un renglón', () => {
  for (const idioma of IDIOMAS_DEL_CATALOGO) {
    const { asunto, texto } = mensajeDelSistema(EVENTO_TURNO_SIN_CUBRIR, idioma, {
      turnos: [{ fecha: '2026-11-21', horaInicio: '08:00', horaFin: '20:00', pacientes: ['Rosa'] }],
    });
    assert.equal(asunto, `${idioma}:ASUNTO_UNO`);
    assert.equal(texto, `${idioma}:<Rosa|2026-11-21|08:00|20:00>`);
  }
});

test('con varios turnos, el asunto va en plural y hay un renglón por turno', () => {
  for (const idioma of IDIOMAS_DEL_CATALOGO) {
    const { asunto, texto } = mensajeDelSistema(EVENTO_TURNO_SIN_CUBRIR, idioma, {
      turnos: [
        { fecha: '2026-11-21', horaInicio: '22:00', horaFin: '06:00', pacientes: ['Aníbal', 'Elena'] },
        { fecha: '2026-11-22', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] },
      ],
    });
    assert.equal(asunto, `${idioma}:ASUNTO_VARIOS`);
    assert.deepEqual(texto.split('\n'), [
      `${idioma}:<Aníbal ${conjuncion(idioma)} Elena|2026-11-21|22:00|06:00>`,
      `${idioma}:<Elena|2026-11-22|08:00|16:00>`,
    ]);
  }
});

test('un turno sin nombres cargados no deja el renglón cortado', () => {
  for (const idioma of IDIOMAS_DEL_CATALOGO) {
    const { texto } = mensajeDelSistema(EVENTO_TURNO_SIN_CUBRIR, idioma, {
      turnos: [{ fecha: '2026-11-21', horaInicio: '08:00', horaFin: '20:00', pacientes: [] }],
    });
    assert.ok(!texto.includes('<|'), `${idioma}: ${texto}`);
    assert.ok(!texto.includes('[falta:'), `${idioma}: ${texto}`);
  }
});

// ── La agrupación ───────────────────────────────────────────────────────────────────────

test('agrupa por Servicio y junta en un renglón a los Pacientes del mismo horario', () => {
  const avisos = avisosPorServicio(PENDIENTES, NOMBRES);
  assert.deepEqual(avisos.map((a) => a.servicioId), ['s-1', 's-2']);

  const [primero, segundo] = avisos;
  assert.deepEqual(primero.filas.sort(), ['a-1', 'a-2', 'a-3']);
  assert.deepEqual(primero.turnos, [
    { fecha: '2026-11-21', horaInicio: '22:00', horaFin: '06:00', pacientes: ['Aníbal', 'Elena'] },
    { fecha: '2026-11-22', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] },
  ]);
  assert.deepEqual(segundo.filas, ['a-4']);
  assert.deepEqual(segundo.turnos, [
    { fecha: '2026-11-21', horaInicio: '08:00', horaFin: '20:00', pacientes: ['Rosa'] },
  ]);
});

test('el mismo día con otro horario es otro renglón', () => {
  const avisos = avisosPorServicio([
    { id: 'x-1', servicio_id: 's-1', paciente_id: 'p-1', inicio: '2026-11-21 00:00:00', fin: '2026-11-21 08:00:00' },
    { id: 'x-2', servicio_id: 's-1', paciente_id: 'p-2', inicio: '2026-11-21 08:00:00', fin: '2026-11-22 00:00:00' },
  ], NOMBRES);
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0].turnos.map((t) => [t.horaInicio, t.horaFin, t.pacientes]), [
    ['00:00', '08:00', ['Elena']],
    ['08:00', '00:00', ['Aníbal']],
  ]);
});

test('sin filas no hay avisos', () => {
  assert.deepEqual(avisosPorServicio([], NOMBRES), []);
  assert.deepEqual(avisosPorServicio(null, null), []);
});

// ── El envío ────────────────────────────────────────────────────────────────────────────

/** Una conexión falsa que contesta lo justo y anota cada consulta. */
function baseFalsa(pendientes) {
  const consultas = [];
  const marcadas = [];
  return {
    consultas,
    marcadas,
    from(tabla) {
      const q = { tabla, accion: 'select', filtros: [] };
      const b = {
        select: () => b,
        order: () => b,
        maybeSingle: () => b,
        update: (valores) => { q.accion = 'update'; q.valores = valores; return b; },
        eq: (c, v) => { q.filtros.push(['eq', c, v]); return b; },
        is: (c, v) => { q.filtros.push(['is', c, v]); return b; },
        in: (c, v) => { q.filtros.push(['in', c, v]); return b; },
        then: (bien, mal) => {
          consultas.push(q);
          let respuesta = { data: null, error: null };
          if (tabla === 'turnos_sin_cubrir_avisados' && q.accion === 'select') respuesta = { data: pendientes, error: null };
          if (tabla === 'turnos_sin_cubrir_avisados' && q.accion === 'update') {
            marcadas.push(...q.filtros.find(([op, c]) => op === 'in' && c === 'id')[2]);
          }
          if (tabla === 'pacientes') {
            const ids = q.filtros.find(([op]) => op === 'in')[2];
            respuesta = { data: ids.map((id) => ({ id, persona: { nombre_visible: NOMBRES.get(id) } })), error: null };
          }
          if (tabla === 'prestadoras') respuesta = { data: { pais: 'AR' }, error: null };
          return Promise.resolve(respuesta).then(bien, mal);
        },
      };
      return b;
    },
  };
}

test('manda un aviso por Servicio y marca como avisado sólo lo que salió', async () => {
  const db = baseFalsa(PENDIENTES);
  const enviados = [];
  const resultado = await avisarTurnosSinCubrir(db, PRESTADORA, { notificar: async (aviso) => { enviados.push(aviso); } });

  assert.deepEqual(resultado, { avisados: 2, fallidos: 0 });
  assert.equal(enviados.length, 2);
  assert.ok(enviados.every((a) => a.evento === EVENTO_TURNO_SIN_CUBRIR && a.prestadoraId === PRESTADORA));
  assert.equal(enviados[0].texto.split('\n').length, 2);
  assert.ok(enviados[1].texto.includes('Rosa'));
  assert.deepEqual(db.marcadas.sort(), ['a-1', 'a-2', 'a-3', 'a-4']);

  const marca = db.consultas.find((q) => q.accion === 'update');
  assert.deepEqual(Object.keys(marca.valores), ['avisado_at']);
});

test('si el envío de un Servicio falla, sus turnos quedan sin marcar y los demás se marcan', async () => {
  const db = baseFalsa(PENDIENTES);
  const original = console.error;
  console.error = () => {};
  let resultado;
  try {
    resultado = await avisarTurnosSinCubrir(db, PRESTADORA, {
      notificar: async ({ texto }) => { if (texto.includes('Rosa')) throw new Error('no salió'); },
    });
  } finally {
    console.error = original;
  }

  assert.deepEqual(resultado, { avisados: 1, fallidos: 1 });
  assert.deepEqual(db.marcadas.sort(), ['a-1', 'a-2', 'a-3']);
});

test('si todos los envíos fallan, no se marca nada', async () => {
  const db = baseFalsa(PENDIENTES);
  const original = console.error;
  console.error = () => {};
  try {
    await avisarTurnosSinCubrir(db, PRESTADORA, { notificar: async () => { throw new Error('no salió'); } });
  } finally {
    console.error = original;
  }
  assert.deepEqual(db.marcadas, []);
  assert.equal(db.consultas.filter((q) => q.accion === 'update').length, 0);
});

test('sólo lee lo pendiente, y cada consulta nombra la Prestadora', async () => {
  const db = baseFalsa(PENDIENTES);
  await avisarTurnosSinCubrir(db, PRESTADORA, { notificar: async () => {} });

  const lectura = db.consultas.find((q) => q.tabla === 'turnos_sin_cubrir_avisados' && q.accion === 'select');
  assert.deepEqual(lectura.filtros.filter(([op]) => op === 'is'), [['is', 'avisado_at', null], ['is', 'resuelto_at', null]]);
  for (const q of db.consultas.filter((c) => c.tabla !== 'prestadoras')) {
    assert.ok(q.filtros.some(([op, c, v]) => op === 'eq' && c === 'prestadora_id' && v === PRESTADORA), `${q.tabla} ${q.accion}`);
  }
});

test('sin nada pendiente no manda ni marca nada', async () => {
  const db = baseFalsa([]);
  let llamadas = 0;
  const resultado = await avisarTurnosSinCubrir(db, PRESTADORA, { notificar: async () => { llamadas += 1; } });
  assert.deepEqual(resultado, { avisados: 0, fallidos: 0 });
  assert.equal(llamadas, 0);
  assert.equal(db.consultas.length, 1);
});
