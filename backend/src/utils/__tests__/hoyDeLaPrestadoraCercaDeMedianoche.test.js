/**
 * Cerca de la medianoche, el día y la hora se cuentan con la zona horaria de la Prestadora y no con
 * la hora universal del servidor.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Entre las 21 y las 24 de Argentina la hora universal ya está en el
 * día siguiente. Dos cuentas lo hacían mal: cuántas horas faltan para un turno de guardia sin
 * cubrir, y qué Responsables de pagos rigen hoy en un Servicio. Con la versión vieja, las dos
 * pruebas de abajo dan al revés.
 *
 * Datos inventados, como manda CLAUDE.md §6.
 */
// El servidor de verdad cuenta en hora universal. Va antes de cualquier fecha.
process.env.TZ = 'UTC';

const { strict: assert } = await import('node:assert');
const { afterEach, describe, it, mock } = await import('node:test');
await import('./../../__tests__/secretoDePrueba.js');

const { horasHastaElTurnoGuardia, elTurnoGuardiaYaEsGrave } = await import('../incidenteTurnoGuardiaSinCubrir.js');
const { servicioConSusResponsables } = await import('../consentimientoPagador.js');

const ZONA = 'America/Argentina/Buenos_Aires';
const PRESTADORA = '0a000000-0000-4000-8000-0000000000b1';
const CLIENTE = '0a000000-0000-4000-8000-0000000000b2';
const SERVICIO = '0a000000-0000-4000-8000-0000000000b3';

// Las 22:30 del 20 de noviembre en Buenos Aires: en hora universal ya es la 01:30 del 21.
const CERCA_DE_MEDIANOCHE = new Date('2026-11-21T01:30:00Z');

afterEach(() => mock.timers.reset());

describe('horas hasta un turno de guardia sin cubrir, cerca de la medianoche', () => {
  const turno_guardia = {
    asistente_id: null,
    estado: 'programada',
    fecha: '2026-11-21',
    hora_inicio: '00:30:00',
  };

  it('el turno de las 00:30 del 21 de Argentina todavía no empezó a las 22:30 del 20', () => {
    // 00:30 de Buenos Aires son las 03:30 en hora universal: faltan dos horas.
    assert.equal(horasHastaElTurnoGuardia(turno_guardia, CERCA_DE_MEDIANOCHE, ZONA), 2);
  });

  it('con el borde en una hora, todavía no es grave; leído en hora universal ya habría empezado', () => {
    const regla = { horas_para_abrirlo: 1 };
    assert.equal(elTurnoGuardiaYaEsGrave({ turno_guardia, regla, ahora: CERCA_DE_MEDIANOCHE, zona: ZONA }), false);
  });

  it('sin la zona de la Prestadora no hay cuenta', () => {
    assert.equal(horasHastaElTurnoGuardia(turno_guardia, CERCA_DE_MEDIANOCHE), null);
  });
});

describe('los Responsables de pagos que rigen hoy, cerca de la medianoche', () => {
  // Base de mentira: contesta la zona de la Prestadora, el Servicio y sus Responsables de pagos, y
  // anota el filtro con el que se pidieron.
  function baseFalsa(responsables) {
    const pedidos = [];
    const db = {
      from(tabla) {
        const consulta = {
          select: () => consulta,
          eq: () => consulta,
          order: () => consulta,
          or(filtro) {
            pedidos.push(filtro);
            return consulta;
          },
          maybeSingle: async () => {
            if (tabla === 'prestadoras') return { data: { zona_horaria: ZONA }, error: null };
            if (tabla === 'servicios') {
              return { data: { id: SERVICIO, prestadora_id: PRESTADORA, cliente_id: CLIENTE }, error: null };
            }
            return { data: null, error: null };
          },
          then(resolver) {
            const data = tabla === 'pagadores_del_servicio' ? responsables : [];
            return Promise.resolve({ data, error: null }).then(resolver);
          },
        };
        return consulta;
      },
    };
    return { db, pedidos };
  }

  const responsable = (id, desde, hasta = null) => ({
    id,
    pagador_persona_id: `persona-${id}`,
    pagador_tipo: null,
    vigente_desde: desde,
    vigente_hasta: hasta,
    factura_al_responsable: false,
  });

  it('a las 22:30 del 20 en Argentina, el que empieza el 21 todavía no rige', async () => {
    mock.timers.enable({ apis: ['Date'], now: CERCA_DE_MEDIANOCHE });
    const { db, pedidos } = baseFalsa([
      responsable('hoy', '2026-11-20'),
      responsable('maniana', '2026-11-21'),
    ]);

    const servicio = await servicioConSusResponsables({ db, servicioId: SERVICIO, prestadoraId: PRESTADORA });

    const rige = Object.fromEntries(servicio.responsables.map((r) => [r.id, r.rige_hoy]));
    assert.deepEqual(rige, { hoy: true, maniana: false });
    // Y el que terminó el 20 sigue apareciendo: hoy todavía es el 20.
    assert.deepEqual(pedidos, ['vigente_hasta.is.null,vigente_hasta.gte.2026-11-20']);
  });
});
