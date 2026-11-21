/**
 * El equipo de un Servicio: de dónde salen los huecos del cronograma de guardias y cómo queda la
 * lista de Asistentes para sumar, con turnos sin cubrir y sin ningún turno de guardia.
 *
 *   npx vitest run src/lib/__tests__/turnosSinCubrirDelServicio.test.js
 *
 * Qué daría con el sistema roto: si los tramos sin cubrir de un mismo horario quedaran como dos
 * huecos, falla «junta los Pacientes»; si no se le preguntara a la base por el plazo de la
 * Prestadora, falla «pide desde hoy hasta el plazo»; si una falla de la base volteara la lista,
 * falla «si la base no contesta»; si un Servicio sin turnos de guardia volviera a dar el Padrón por
 * nombre y sin advertencias, falla «la lista viene ordenada»; si quien quedó afuera a mano volviera
 * a ofrecerse, falla «no se ofrece»; si el cronograma no contara en el orden, falla «con el
 * cronograma».
 */
import { describe, expect, it, vi } from 'vitest';
import { MOTIVO } from '../candidatos';
import { etiquetasDe, grupoDe, huecosDeTurnosSinCubrir, sugerenciasPara } from '../sugerenciasDeAsistentes';
import { cargarTurnosSinCubrirDelServicio } from '../turnosSinCubrirDelServicio';

const SERVICIO = 's-prueba';
const PRESTADORA = 'p-prueba';

const fila = (asistente_id, cambios = {}) => ({
  asistente_id,
  acepta_lugar: null,
  tarea_prohibida: false,
  tareas_no_incluidas: null,
  falta_especialidad: 0,
  promedio_estrellas: null,
  cantidad_calificaciones: 0,
  faltas_sin_aviso: 0,
  llegadas_tarde: 0,
  encaja_valor: null,
  ...cambios,
});
const criterios = (...filas) => new Map([[SERVICIO, new Map(filas.map((f) => [f.asistente_id, f]))]]);
const activo = (id, nombre) => ({ id, nombre, estado: 'activo', canales: ['directa'], disponible: true });
const claves = (candidato) => etiquetasDe(candidato).map((m) => m.clave);

const sinCubrir = (paciente_id, fecha, hora_inicio = '08:00:00', hora_fin = '16:00:00', dias_hasta_el_fin = 0) => ({
  prestacion_id: 1,
  guardia_id: 'gu-1',
  paciente_id,
  fecha,
  hora_inicio,
  hora_fin,
  dias_hasta_el_fin,
});

/** Un cliente de base de mentira: contesta la Prestadora y la función, y anota qué se le pidió. */
function baseDePrueba({ dias = 14, filas = [], errorPrestadora = null, errorFuncion = null } = {}) {
  const pedidos = [];
  const supabase = {
    from: (tabla) => {
      const consulta = {
        select: () => consulta,
        eq: (columna, valor) => {
          pedidos.push({ tabla, columna, valor });
          return consulta;
        },
        maybeSingle: async () => ({
          data: errorPrestadora ? null : { dias_generacion_series_turno_guardia: dias },
          error: errorPrestadora,
        }),
      };
      return consulta;
    },
    rpc: async (funcion, argumentos) => {
      pedidos.push({ funcion, argumentos });
      return { data: errorFuncion ? null : filas, error: errorFuncion };
    },
  };
  return { supabase, pedidos };
}

describe('huecosDeTurnosSinCubrir', () => {
  it('junta los Pacientes de un mismo horario en un solo hueco, sin id ni modalidad', () => {
    const huecos = huecosDeTurnosSinCubrir(
      [
        sinCubrir('pa-2', '2026-12-02'),
        sinCubrir('pa-1', '2026-12-02'),
        sinCubrir('pa-1', '2026-12-01', '22:00:00', '06:00:00', 1),
        { paciente_id: 'pa-1', fecha: '2026-12-03' },
      ],
      SERVICIO
    );
    expect(huecos).toEqual([
      {
        id: null,
        servicio_id: SERVICIO,
        fecha: '2026-12-01',
        hora_inicio: '22:00:00',
        hora_fin: '06:00:00',
        dias_hasta_el_fin: 1,
        canal_modalidad: null,
        paciente_ids: ['pa-1'],
      },
      {
        id: null,
        servicio_id: SERVICIO,
        fecha: '2026-12-02',
        hora_inicio: '08:00:00',
        hora_fin: '16:00:00',
        dias_hasta_el_fin: 0,
        canal_modalidad: null,
        paciente_ids: ['pa-1', 'pa-2'],
      },
    ]);
  });

  it('sin filas no hay huecos', () => {
    expect(huecosDeTurnosSinCubrir(null, SERVICIO)).toEqual([]);
  });
});

describe('cargarTurnosSinCubrirDelServicio', () => {
  it('pide desde hoy hasta el plazo en que la Prestadora genera los turnos de guardia', async () => {
    const { supabase, pedidos } = baseDePrueba({ dias: 14, filas: [sinCubrir('pa-1', '2026-12-02')] });
    const huecos = await cargarTurnosSinCubrirDelServicio(supabase, PRESTADORA, SERVICIO, '2026-11-21');
    expect(pedidos).toContainEqual({ tabla: 'prestadoras', columna: 'id', valor: PRESTADORA });
    expect(pedidos).toContainEqual({
      funcion: 'turnos_sin_cubrir',
      argumentos: { p_servicio: SERVICIO, p_desde: '2026-11-21', p_hasta: '2026-12-05' },
    });
    expect(huecos).toHaveLength(1);
    expect(huecos[0].servicio_id).toBe(SERVICIO);
  });

  it('si la base no contesta, no hay huecos y la lista sigue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sinPermiso = baseDePrueba({ errorFuncion: { code: '42501', message: 'sin_permiso' } });
    expect(await cargarTurnosSinCubrirDelServicio(sinPermiso.supabase, PRESTADORA, SERVICIO, '2026-11-21')).toEqual([]);
    const sinPrestadora = baseDePrueba({ errorPrestadora: { message: 'x' } });
    expect(await cargarTurnosSinCubrirDelServicio(sinPrestadora.supabase, PRESTADORA, SERVICIO, '2026-11-21')).toEqual(
      []
    );
    expect(sinPrestadora.pedidos.some((p) => p.funcion)).toBe(false);
    error.mockRestore();
  });

  it('sin plazo configurado no le pregunta a la función', async () => {
    const { supabase, pedidos } = baseDePrueba({ dias: 0 });
    expect(await cargarTurnosSinCubrirDelServicio(supabase, PRESTADORA, SERVICIO, '2026-11-21')).toEqual([]);
    expect(pedidos.some((p) => p.funcion)).toBe(false);
  });

  it('sin Servicio no le pregunta nada a la base', async () => {
    const { supabase, pedidos } = baseDePrueba();
    expect(await cargarTurnosSinCubrirDelServicio(supabase, PRESTADORA, null, '2026-11-21')).toEqual([]);
    expect(pedidos).toEqual([]);
  });
});

describe('Servicio sin turnos de guardia', () => {
  const ANA = activo('a-ana', 'Ana Prueba');
  const BERTA = activo('a-berta', 'Berta Prueba');
  const CELIA = activo('a-celia', 'Celia Prueba');
  const DORA = activo('a-dora', 'Dora Prueba');
  const DATOS = {
    asistentes: [ANA, BERTA, CELIA, DORA],
    servicio_id: SERVICIO,
    criterios: criterios(
      fila(ANA.id, { tarea_prohibida: true }),
      fila(BERTA.id, { acepta_lugar: false, tareas_no_incluidas: 2, falta_especialidad: 1 }),
      fila(CELIA.id, { promedio_estrellas: 5, cantidad_calificaciones: 4, encaja_valor: false }),
      fila(DORA.id, { faltas_sin_aviso: 2, llegadas_tarde: 1 })
    ),
  };
  const de = (lista, id) => lista.find((c) => c.asistente.id === id);

  it('la lista viene ordenada y con las advertencias del Servicio y del Paciente', () => {
    const lista = sugerenciasPara([], DATOS, { excluir: [] });
    expect(lista[0].asistente.id).toBe(CELIA.id);
    expect(lista[lista.length - 1].asistente.id).toBe(ANA.id);
    expect(grupoDe(de(lista, ANA.id))).toBe(2);
    expect(claves(de(lista, CELIA.id))).toEqual([MOTIVO.VALOR_NO_ENCAJA]);
    expect(claves(de(lista, BERTA.id))).toEqual([
      MOTIVO.LUGAR_NO_ACEPTADO,
      MOTIVO.TAREAS_NO_INCLUIDAS,
      MOTIVO.FALTA_ESPECIALIDAD,
    ]);
    expect(claves(de(lista, DORA.id))).toEqual([MOTIVO.FALTAS_SIN_AVISO, MOTIVO.LLEGADAS_TARDE]);
    expect(claves(de(lista, ANA.id))).toEqual([MOTIVO.TAREA_PROHIBIDA]);
    expect(lista.map((c) => c.puntaje)).toEqual([...lista.map((c) => c.puntaje)].sort((a, b) => b - a));
  });

  it('quien ya está en el equipo o quedó afuera a mano no se ofrece', () => {
    const lista = sugerenciasPara([], DATOS, { excluir: [CELIA.id, ANA.id] });
    expect(lista.map((c) => c.asistente.id).sort()).toEqual([BERTA.id, DORA.id]);
  });

  it('con el cronograma, el horario también cuenta: quien ya tiene un turno de guardia encima baja', async () => {
    const { supabase } = baseDePrueba({ filas: [sinCubrir('pa-1', '2026-12-02')] });
    const huecos = await cargarTurnosSinCubrirDelServicio(supabase, PRESTADORA, SERVICIO, '2026-11-21');
    const lista = sugerenciasPara(
      huecos,
      {
        asistentes: [ANA, BERTA, CELIA],
        servicio_id: SERVICIO,
        criterios: criterios(fila(ANA.id, { tarea_prohibida: true })),
        ahora: new Date('2026-11-21T10:00:00'),
        turnos_guardia: [
          {
            id: 'g-otro',
            servicio_id: 's-otro',
            asistente_id: CELIA.id,
            estado: 'programada',
            fecha: '2026-12-02',
            hora_inicio: '07:00:00',
            hora_fin: '15:00:00',
            dias_hasta_el_fin: 0,
            paciente_ids: [],
          },
        ],
        ausencias: [],
      },
      { excluir: [] }
    );
    const celia = de(lista, CELIA.id);
    expect(celia.enContra.map((m) => m.clave)).toContain(MOTIVO.OCUPADO);
    expect(grupoDe(celia)).toBe(1);
    expect(lista.map((c) => c.asistente.id)).toEqual([BERTA.id, CELIA.id, ANA.id]);
  });
});
