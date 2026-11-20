// Un Servicio puede tener varios Responsables de pagos a la vez, y cada uno firma su documento. El
// Panel tiene que ver, por cada uno, qué firmó, qué tiene pendiente y si su ficha tiene email para
// mostrarle a cada documento su botón. Y si firmaron todos los que rigen hoy.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import './../../__tests__/secretoDePrueba.js';

const { estadoDelPagador } = await import('../consentimientoPagador.js');

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CLIENTE = '22222222-2222-4222-8222-222222222222';
const PRIMERO = '33333333-3333-4333-8333-333333333333';
const SEGUNDO = '44444444-4444-4444-8444-444444444444';
const SERVICIO = '55555555-5555-4555-8555-555555555555';

const AYER = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const MANIANA = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const consentimiento = (estado, personaId) => ({
  id: `${estado}-${personaId}`,
  estado,
  pagador_persona_id: personaId,
  firmante_persona_id: null,
  cerrado_en: estado === 'cerrado' ? '2026-01-02T00:00:00Z' : null,
});

const responsable = (id, personaId, desde) => ({
  id,
  pagador_persona_id: personaId,
  pagador_tipo: null,
  vigente_desde: desde,
  vigente_hasta: null,
  factura_al_responsable: false,
});

// Base de mentira: cada consulta contesta según la tabla y la persona que pidió.
function baseCon({ responsables, consentimientos, emails }) {
  return {
    from(tabla) {
      const filtros = {};
      const consulta = {
        select: () => consulta,
        eq(columna, valor) {
          filtros[columna] = valor;
          return consulta;
        },
        in: () => consulta,
        is: () => consulta,
        or: () => consulta,
        order: () => consulta,
        maybeSingle: async () => {
          if (tabla === 'servicios') {
            return { data: { id: SERVICIO, prestadora_id: PRESTADORA, cliente_id: CLIENTE }, error: null };
          }
          if (tabla === 'personas') {
            return { data: { id: filtros.id, nombre_visible: `Persona ${filtros.id.slice(0, 4)}`, email: emails[filtros.id] ?? null }, error: null };
          }
          if (tabla === 'prestadoras') {
            return { data: { zona_horaria: 'America/Argentina/Buenos_Aires' }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolver) {
          const data = tabla === 'consentimientos_pagador'
            ? consentimientos
            : tabla === 'pagadores_del_servicio' ? responsables : [];
          return Promise.resolve({ data, error: null }).then(resolver);
        },
      };
      return consulta;
    },
  };
}

const estado = (datos) =>
  estadoDelPagador({ db: baseCon(datos), servicioId: SERVICIO, prestadoraId: PRESTADORA, idioma: 'es-AR' });

const dosDeHoy = [responsable('r1', PRIMERO, AYER), responsable('r2', SEGUNDO, AYER)];

describe('estadoDelPagador: varios Responsables de pagos a la vez', () => {
  it('cada uno ve sólo sus propios documentos', async () => {
    const r = await estado({
      responsables: dosDeHoy,
      consentimientos: [consentimiento('cerrado', PRIMERO), consentimiento('pendiente_firma', SEGUNDO)],
      emails: {},
    });
    const [primero, segundo] = r.responsables;
    assert.equal(primero.persona.id, PRIMERO);
    assert.equal(primero.consentimientoCerrado.id, `cerrado-${PRIMERO}`);
    assert.equal(primero.consentimientoPendiente, null);
    assert.equal(segundo.persona.id, SEGUNDO);
    assert.equal(segundo.consentimientoCerrado, null);
    assert.equal(segundo.consentimientoPendiente.id, `pendiente_firma-${SEGUNDO}`);
  });

  it('la firma está completa sólo cuando firmaron todos los que rigen hoy', async () => {
    const falta = await estado({
      responsables: dosDeHoy,
      consentimientos: [consentimiento('cerrado', PRIMERO)],
      emails: {},
    });
    assert.equal(falta.firmaCompleta, false);

    const todos = await estado({
      responsables: dosDeHoy,
      consentimientos: [consentimiento('cerrado', PRIMERO), consentimiento('cerrado', SEGUNDO)],
      emails: {},
    });
    assert.equal(todos.firmaCompleta, true);
  });

  it('el que todavía no empezó a regir no pide firma para hoy', async () => {
    const r = await estado({
      responsables: [responsable('r1', PRIMERO, AYER), responsable('r2', SEGUNDO, MANIANA)],
      consentimientos: [consentimiento('cerrado', PRIMERO)],
      emails: {},
    });
    assert.equal(r.responsables[1].rigeHoy, false);
    assert.equal(r.firmaCompleta, true);
  });

  it('sin ningún Responsable de pagos la firma no está completa', async () => {
    const r = await estado({ responsables: [], consentimientos: [], emails: {} });
    assert.deepEqual(r.responsables, []);
    assert.equal(r.firmaCompleta, false);
  });
});

describe('estadoDelPagador: quién tiene email', () => {
  const documentos = [consentimiento('cerrado', PRIMERO), consentimiento('pendiente_firma', SEGUNDO)];

  it('sólo el que ya firmó', async () => {
    const r = await estado({ responsables: dosDeHoy, consentimientos: documentos, emails: { [PRIMERO]: 'primero@ejemplo.invalid' } });
    assert.equal(r.responsables[0].cerradoConEmail, true);
    assert.equal(r.responsables[1].pendienteConEmail, false);
  });

  it('sólo el que tiene que firmar ahora', async () => {
    const r = await estado({ responsables: dosDeHoy, consentimientos: documentos, emails: { [SEGUNDO]: 'segundo@ejemplo.invalid' } });
    assert.equal(r.responsables[0].cerradoConEmail, false);
    assert.equal(r.responsables[1].pendienteConEmail, true);
  });

  it('sin documentos, ninguno', async () => {
    const r = await estado({ responsables: dosDeHoy, consentimientos: [], emails: { [PRIMERO]: 'primero@ejemplo.invalid' } });
    assert.equal(r.responsables[0].cerradoConEmail, false);
    assert.equal(r.responsables[0].pendienteConEmail, false);
  });
});
