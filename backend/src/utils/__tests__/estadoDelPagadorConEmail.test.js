// Mientras hay un documento pendiente, quien firmó el anterior puede ser otra persona: el Panel
// tiene que saber por separado si cada una tiene email, para mostrarle a cada documento su botón.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import './../../__tests__/secretoDePrueba.js';

const { estadoDelPagador } = await import('../consentimientoPagador.js');

const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const CLIENTE = '22222222-2222-4222-8222-222222222222';
const QUIEN_FIRMO = '33333333-3333-4333-8333-333333333333';
const QUIEN_FIRMA_AHORA = '44444444-4444-4444-8444-444444444444';
const SERVICIO = '55555555-5555-4555-8555-555555555555';

const consentimiento = (estado, personaId) => ({
  id: `${estado}-id`,
  estado,
  pagador_persona_id: personaId,
  firmante_persona_id: null,
});

// Base de mentira: cada consulta contesta según la tabla y la persona que pidió.
function baseCon({ consentimientos, emails }) {
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
            return { data: { id: SERVICIO, prestadora_id: PRESTADORA, contratante_id: CLIENTE, pagador_persona_id: QUIEN_FIRMA_AHORA, pagador_tipo: null }, error: null };
          }
          if (tabla === 'personas') {
            return { data: { id: filtros.id, nombre_visible: 'Persona inventada', email: emails[filtros.id] ?? null }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolver) {
          const data = tabla === 'consentimientos_pagador' ? consentimientos : [];
          return Promise.resolve({ data, error: null }).then(resolver);
        },
      };
      return consulta;
    },
  };
}

const estado = (datos) =>
  estadoDelPagador({ db: baseCon(datos), servicioId: SERVICIO, prestadoraId: PRESTADORA, idioma: 'es-AR' });

describe('estadoDelPagador: quién de los dos tiene email', () => {
  const ambos = [consentimiento('pendiente_firma', QUIEN_FIRMA_AHORA), consentimiento('cerrado', QUIEN_FIRMO)];

  it('sólo quien firmó el documento anterior', async () => {
    const r = await estado({ consentimientos: ambos, emails: { [QUIEN_FIRMO]: 'firmo@ejemplo.invalid' } });
    assert.equal(r.cerradoConEmail, true);
    assert.equal(r.pendienteConEmail, false);
  });

  it('sólo quien tiene que firmar ahora', async () => {
    const r = await estado({ consentimientos: ambos, emails: { [QUIEN_FIRMA_AHORA]: 'ahora@ejemplo.invalid' } });
    assert.equal(r.cerradoConEmail, false);
    assert.equal(r.pendienteConEmail, true);
  });

  it('sin documentos, ninguno', async () => {
    const r = await estado({ consentimientos: [], emails: { [QUIEN_FIRMO]: 'firmo@ejemplo.invalid' } });
    assert.equal(r.cerradoConEmail, false);
    assert.equal(r.pendienteConEmail, false);
  });
});
