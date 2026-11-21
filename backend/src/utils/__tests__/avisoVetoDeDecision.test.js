import { test } from 'node:test';
import assert from 'node:assert/strict';

// La conexión a la base se arma sola al importar, y `createClient` no acepta una dirección vacía.
// Acá no se consulta ninguna base: se prueba lo que se arma sin ella.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
const { avisosALosAsistentes, fechaDeLaDecision, EVENTO_VETO_DE_DECISION } = await import('../avisoVetoDeDecision.js');
const { mensajeDelSistema, IDIOMAS_DEL_CATALOGO } = await import('../../i18n/avisos.js');
const { sembrarMensajesDelSistema } = await import('../../i18n/mensajesDelSistema.js');
const { filasSembradas } = await import('../../i18n/__tests__/mensajesSembrados.js');

// Marcas en lugar de las frases sembradas: sirven para ver qué clave eligió el armado y qué valor
// fue a cada marcador.
const MARCAS = {
  'veto_de_decision.asunto': 'ASUNTO',
  'veto_de_decision.texto': '<{{fecha}}|{{servicio}}|{{motivo}}>',
};
const marcaEnLosTresIdiomas = (texto) => Object.fromEntries(IDIOMAS_DEL_CATALOGO.map((i) => [i, `${i}:${texto}`]));
const FILAS = filasSembradas();
sembrarMensajesDelSistema([
  ...FILAS.filter((fila) => !(fila.clave in MARCAS)),
  ...Object.entries(MARCAS).map(([clave, texto]) => ({ clave, prestadora_id: null, i18n: marcaEnLosTresIdiomas(texto) })),
]);

test('la siembra trae el aviso del veto en los tres idiomas', () => {
  for (const clave of Object.keys(MARCAS)) {
    const fila = FILAS.find((f) => f.clave === clave);
    assert.ok(fila, `falta sembrar ${clave}`);
    for (const idioma of IDIOMAS_DEL_CATALOGO) assert.ok(fila.i18n[idioma], `falta ${clave} en ${idioma}`);
  }
});

test('el aviso al Coordinador lleva el día, el Servicio y el motivo', () => {
  for (const idioma of IDIOMAS_DEL_CATALOGO) {
    const { asunto, texto } = mensajeDelSistema(EVENTO_VETO_DE_DECISION, idioma, {
      fecha: '07/10/2026', servicio: 'Cuidado nocturno', motivo: 'El horario es el pactado',
    });
    assert.equal(asunto, `${idioma}:ASUNTO`);
    assert.equal(texto, `${idioma}:<07/10/2026|Cuidado nocturno|El horario es el pactado>`);
  }
});

test('el día se escribe en la hora de la Prestadora', () => {
  // Las 2 de la mañana en Greenwich todavía son el día anterior en Buenos Aires.
  assert.equal(fechaDeLaDecision('2026-10-08T02:00:00Z', 'es-AR', 'America/Argentina/Buenos_Aires'), '07/10/2026');
  assert.equal(fechaDeLaDecision('2026-10-08T02:00:00Z', 'es-AR', 'UTC'), '08/10/2026');
  assert.equal(fechaDeLaDecision(null, 'es-AR', 'UTC'), '');
  assert.equal(fechaDeLaDecision('no es una fecha', 'es-AR', 'UTC'), '');
});

test('a quién se le avisa qué: sin repetir, y quien recupera su turno no recibe que lo perdió', () => {
  const { retirados, devueltos } = avisosALosAsistentes({
    turnos_retirados: [
      { turno_guardia_id: 't-1', asistente_id: 'a-1', fecha: '2026-11-25' },
      { turno_guardia_id: 't-2', asistente_id: 'a-2', fecha: '2026-11-26' },
      { turno_guardia_id: 't-3', asistente_id: null },
    ],
    asignaciones_retiradas: [
      { id: 'x-1', turno_guardia_id: 't-1', asistente_id: 'a-1' },
      { id: 'x-2', turno_guardia_id: 't-4', asistente_id: 'a-3' },
    ],
    asignaciones_devueltas: [
      { asignacion_id: 'y-1', turno_guardia_id: 't-2', asistente_id: 'a-2' },
      { asignacion_id: 'y-2', turno_guardia_id: 't-2', asistente_id: 'a-2' },
      { asignacion_id: 'y-3', turno_guardia_id: 't-5', asistente_id: 'a-4' },
    ],
  });
  assert.deepEqual(retirados, [
    { asistenteId: 'a-1', turnoGuardiaId: 't-1' },
    { asistenteId: 'a-3', turnoGuardiaId: 't-4' },
  ]);
  assert.deepEqual(devueltos, [
    { asistenteId: 'a-2', turnoGuardiaId: 't-2' },
    { asistenteId: 'a-4', turnoGuardiaId: 't-5' },
  ]);
});

test('un veto que no tocó a ningún Asistente no avisa a nadie', () => {
  assert.deepEqual(avisosALosAsistentes({}), { retirados: [], devueltos: [] });
  assert.deepEqual(avisosALosAsistentes(null), { retirados: [], devueltos: [] });
});
