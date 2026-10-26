import { beforeEach, describe, expect, it, vi } from 'vitest';
import { T } from '../../i18n/translations';

// Este archivo prueba qué camino toma cada cambio de Asistente, no la base. La base se reemplaza
// por una que anota lo que se le pidió, y el backend por uno al que se le dice qué contestar.
const pedidosALaBase = [];
const funcionesLlamadas = [];
const llamadasAlBackend = [];
let respuestaDelBackend = null;
// Las asignaciones sin responder que la base de mentira contesta, filtradas por la columna que
// pida la consulta.
let pendientesEnLaBase = [];

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: async (nombre, argumentos) => {
      funcionesLlamadas.push({ nombre, argumentos });
      return { error: null };
    },
    from: (tabla) => ({
      select: () => {
        let columna = null;
        let valores = [];
        const encadenable = {
          in: (c, v) => {
            columna = c;
            valores = v;
            return encadenable;
          },
          eq: () => encadenable,
          then: (...a) =>
            Promise.resolve({
              data: pendientesEnLaBase.filter((f) => f[columna] && valores.includes(f[columna])),
              error: null,
            }).then(...a),
        };
        return encadenable;
      },
      update: (cambios) => {
        const pedido = { tabla, cambios };
        pedidosALaBase.push(pedido);
        const resultado = Promise.resolve({ error: null });
        const encadenable = {
          eq: () => encadenable,
          is: () => encadenable,
          then: (...a) => resultado.then(...a),
        };
        return encadenable;
      },
    }),
  },
}));

vi.mock('../apiPanel', () => ({
  llamarApiPanel: async (ruta, opciones) => {
    llamadasAlBackend.push({ ruta, cuerpo: JSON.parse(opciones.body) });
    if (respuestaDelBackend) throw respuestaDelBackend;
    return { sinCambios: false };
  },
}));

vi.mock('../avisarCambioDeAsistente', () => ({ avisarCambioDeAsistente: async () => {} }));

const { asignarSerie, asignarTurno, cargarAsignacionesPendientes, pedidoDeConfirmacion, pedidoDeConfirmacionDelMovimiento } =
  await import('../asignarTurno');
const { moverGuardia, seArrastra } = await import('../moverGuardia');
const { reasignarGuardia } = await import('../reasignarGuardia');

const t = T['es-AR'];
const ANA = 'a1';
const BRUNO = 'a2';

function guardia(extra = {}) {
  return {
    id: 'g1',
    fecha: '2026-10-20',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    estado: 'programada',
    asistente_id: null,
    asistente_nombre: '—',
    pendiente_asistente_id: null,
    pendiente_nombre: null,
    ...extra,
  };
}

const asignaciones = () => pedidosALaBase.filter((p) => 'asistente_id' in p.cambios);

beforeEach(() => {
  pedidosALaBase.length = 0;
  funcionesLlamadas.length = 0;
  llamadasAlBackend.length = 0;
  respuestaDelBackend = null;
  pendientesEnLaBase = [];
});

describe('asignarSerie', () => {
  it('pide la asignación del turno fijo al backend', async () => {
    const { error } = await asignarSerie('s1', ANA, t);
    expect(error).toBeNull();
    expect(llamadasAlBackend).toEqual([{ ruta: '/guardias/series/s1/asignar', cuerpo: { asistente_id: ANA } }]);
  });
});

describe('cargarAsignacionesPendientes', () => {
  it('cada día de un turno fijo espera a quien se le asignó el turno fijo', async () => {
    pendientesEnLaBase = [{ serie_id: 's1', asistente_id: ANA }];
    const mapa = await cargarAsignacionesPendientes([
      { id: 'g1', serie_id: 's1' },
      { id: 'g2', serie_id: 's1' },
      { id: 'g3', serie_id: null },
    ]);
    expect(mapa.get('g1')).toBe(ANA);
    expect(mapa.get('g2')).toBe(ANA);
    expect(mapa.has('g3')).toBe(false);
  });

  it('un día con asignación propia espera a ése, no al del turno fijo', async () => {
    pendientesEnLaBase = [
      { serie_id: 's1', asistente_id: ANA },
      { guardia_id: 'g2', asistente_id: BRUNO },
    ];
    const mapa = await cargarAsignacionesPendientes([
      { id: 'g1', serie_id: 's1' },
      { id: 'g2', serie_id: 's1' },
    ]);
    expect(mapa.get('g1')).toBe(ANA);
    expect(mapa.get('g2')).toBe(BRUNO);
  });
});

describe('asignarTurno', () => {
  it('pide la asignación al backend, y sin Asistente la pide vacía', async () => {
    await asignarTurno('g1', null, t);
    expect(llamadasAlBackend).toEqual([{ ruta: '/guardias/g1/asignar', cuerpo: { asistente_id: null } }]);
  });

  it('los documentos pendientes vuelven con su frase y con la lista, no con el código', async () => {
    respuestaDelBackend = Object.assign(new Error('x'), {
      motivo: 'documentos_bloquean',
      documentos: ['Certificado de antecedentes', 'Seguro'],
    });
    const { error, documentosPendientes } = await asignarTurno('g1', ANA, t);
    expect(error).toBe('Documentos pendientes: Certificado de antecedentes, Seguro.');
    expect(documentosPendientes).toEqual(['Certificado de antecedentes', 'Seguro']);
  });

  it('el rechazo de la base por documentos también se lee', async () => {
    respuestaDelBackend = Object.assign(new Error('documentos_bloquean:Seguro:'), {});
    const { error, documentosPendientes } = await asignarTurno('g1', ANA, t);
    expect(error).not.toContain('documentos_bloquean');
    expect(documentosPendientes).toEqual(['Seguro']);
  });

  it('el motivo de la excepción viaja en el pedido', async () => {
    await asignarTurno('g1', ANA, t, 'Lo cubre por única vez');
    expect(llamadasAlBackend).toEqual([
      { ruta: '/guardias/g1/asignar', cuerpo: { asistente_id: ANA, motivo_excepcion: 'Lo cubre por única vez' } },
    ]);
  });

  it('cualquier otro rechazo no trae documentos', async () => {
    respuestaDelBackend = Object.assign(new Error('x'), { motivo: 'guardia_no_se_asigna' });
    const { documentosPendientes } = await asignarTurno('g1', ANA, t);
    expect(documentosPendientes).toBeNull();
  });

  it('un turno que ya no se asigna vuelve con la frase de su motivo', async () => {
    respuestaDelBackend = Object.assign(new Error('x'), { motivo: 'guardia_no_se_asigna' });
    const { error } = await asignarTurno('g1', ANA, t);
    expect(error).toBe(t.errores.motivos.guardia_no_se_asigna);
  });
});

describe('arrastrar en la vista de Asistentes', () => {
  it('a otra fila: se asigna por el backend y nunca se escribe el Asistente directo', async () => {
    const { error } = await moverGuardia(guardia({ asistente_id: ANA }), { fila: BRUNO, fecha: '2026-10-20', vista: 'asistente' }, t);
    expect(error).toBeNull();
    expect(llamadasAlBackend).toEqual([{ ruta: '/guardias/g1/asignar', cuerpo: { asistente_id: BRUNO } }]);
    expect(asignaciones()).toEqual([]);
  });

  it('a la fila sin cubrir: lo deja sin asignar', async () => {
    await moverGuardia(guardia({ asistente_id: ANA }), { fila: 'sin-cubrir', fecha: '2026-10-20', vista: 'asistente' }, t);
    expect(llamadasAlBackend.map((l) => l.cuerpo)).toEqual([{ asistente_id: null }]);
  });

  it('en la misma fila y otro día: sólo se corre la fecha', async () => {
    await moverGuardia(guardia({ asistente_id: ANA }), { fila: ANA, fecha: '2026-10-21', vista: 'asistente' }, t);
    expect(llamadasAlBackend).toEqual([]);
    expect(pedidosALaBase).toEqual([{ tabla: 'guardias', cambios: { fecha: '2026-10-21' } }]);
  });

  it('a otro día y otra fila: la fecha va antes que la asignación', async () => {
    await moverGuardia(guardia({ asistente_id: ANA }), { fila: BRUNO, fecha: '2026-10-22', vista: 'asistente' }, t);
    expect(pedidosALaBase[0]).toEqual({ tabla: 'guardias', cambios: { fecha: '2026-10-22' } });
    expect(llamadasAlBackend).toHaveLength(1);
  });

  it('si la asignación no pasa, la fecha vuelve a la que tenía', async () => {
    respuestaDelBackend = Object.assign(new Error('x'), { motivo: 'asistente_no_encontrado' });
    const { error } = await moverGuardia(guardia({ asistente_id: ANA }), { fila: BRUNO, fecha: '2026-10-22', vista: 'asistente' }, t);
    expect(error).toBe(t.errores.motivos.asistente_no_encontrado);
    expect(pedidosALaBase.map((p) => p.cambios.fecha)).toEqual(['2026-10-22', '2026-10-20']);
  });

  it('un turno ausente ya empezó: no se arrastra, se cubre desde el detalle con el motivo', async () => {
    const ausente = guardia({ estado: 'ausente', asistente_id: ANA });
    expect(seArrastra(ausente)).toBe(false);
    await moverGuardia(ausente, { fila: BRUNO, fecha: '2026-10-21', vista: 'asistente' }, t);
    expect(llamadasAlBackend).toEqual([]);
    expect(pedidosALaBase).toEqual([]);
    expect(funcionesLlamadas).toEqual([]);
  });

  it('ninguna guardia empezada se arrastra, y un estado desconocido cuenta como empezada', () => {
    for (const estado of ['activa', 'ausente', 'completada', 'otro']) {
      expect(seArrastra(guardia({ estado }))).toBe(false);
    }
    for (const estado of ['programada', 'pausada', 'cancelada']) {
      expect(seArrastra(guardia({ estado }))).toBe(true);
    }
  });
});

describe('reasignar desde el detalle', () => {
  it('un turno ausente se cubre por la función de emergencia, con el motivo y sin tocar la fecha', async () => {
    const { error } = await reasignarGuardia(guardia({ estado: 'ausente', asistente_id: ANA }), BRUNO, '2026-10-25', t, 'No llegó');
    expect(error).toBeNull();
    expect(llamadasAlBackend).toEqual([]);
    expect(funcionesLlamadas).toEqual([
      { nombre: 'reasignar_guardia_por_emergencia', argumentos: { p_guardia_id: 'g1', p_asistente_id: BRUNO, p_motivo: 'No llegó' } },
    ]);
    expect(asignaciones()).toEqual([]);
    expect(pedidosALaBase.map((p) => p.tabla)).toEqual(['incidentes_relevo']);
  });

  it('elegir a quien ya lo aceptó no lo vuelve a preguntar', async () => {
    await reasignarGuardia(guardia({ asistente_id: ANA }), ANA, '2026-10-20', t);
    expect(llamadasAlBackend).toEqual([]);
  });

  it('con alguien esperando respuesta, elegir a otro va al backend', async () => {
    await reasignarGuardia(guardia({ pendiente_asistente_id: ANA }), BRUNO, '2026-10-20', t);
    expect(llamadasAlBackend.map((l) => l.cuerpo)).toEqual([{ asistente_id: BRUNO }]);
  });

  it('«Sin asignar» sobre un turno que esperaba respuesta lo retira', async () => {
    await reasignarGuardia(guardia({ pendiente_asistente_id: ANA }), null, '2026-10-20', t);
    expect(llamadasAlBackend.map((l) => l.cuerpo)).toEqual([{ asistente_id: null }]);
  });
});

describe('pedidoDeConfirmacion', () => {
  it('sin nadie en el turno no pregunta', () => {
    expect(pedidoDeConfirmacion(guardia(), BRUNO, 'Bruno', t)).toBeNull();
  });

  it('eligiendo al mismo no pregunta', () => {
    expect(pedidoDeConfirmacion(guardia({ asistente_id: ANA }), ANA, 'Ana', t)).toBeNull();
    expect(pedidoDeConfirmacion(guardia({ pendiente_asistente_id: ANA }), ANA, 'Ana', t)).toBeNull();
  });

  it('un turno ausente no pregunta', () => {
    expect(pedidoDeConfirmacion(guardia({ estado: 'ausente', asistente_id: ANA }), BRUNO, 'Bruno', t)).toBeNull();
  });

  it('esperando respuesta: lo dice, con los dos nombres y el botón que nombra al nuevo', () => {
    const p = pedidoDeConfirmacion(guardia({ pendiente_asistente_id: ANA, pendiente_nombre: 'Ana' }), BRUNO, 'Bruno', t);
    expect(p.texto).toContain('Ana');
    expect(p.texto).toContain('Bruno');
    expect(p.texto).not.toContain('{');
    expect(p.confirmar).toContain('Bruno');
  });

  it('ya aceptado y dejándolo sin asignar: la otra frase y el otro botón', () => {
    const p = pedidoDeConfirmacion(guardia({ asistente_id: ANA, asistente_nombre: 'Ana' }), null, null, t);
    expect(p.texto).toBe(t.guardias.confirmar_asignacion.aceptado_sin_asignar.replaceAll('{nombre}', 'Ana'));
    expect(p.confirmar).toBe(t.guardias.confirmar_asignacion.dejar_sin_asignar);
  });

  it('las cuatro frases y los dos botones están en los tres idiomas', () => {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const tc = T[idioma].guardias.confirmar_asignacion;
      for (const clave of ['sin_responder', 'aceptado', 'sin_responder_sin_asignar', 'aceptado_sin_asignar', 'asignar_a', 'dejar_sin_asignar']) {
        expect(tc[clave], `${idioma}.${clave}`).toBeTruthy();
      }
    }
  });
});

describe('arrastrar en la vista de Pacientes', () => {
  const mover = (g) => moverGuardia(g, { fila: 'p2', filaOrigen: 'p1', fecha: '2026-10-21', vista: 'paciente' }, t);

  it('con Asistente: el turno nuevo lo arma el backend y nada se escribe directo', async () => {
    await mover(guardia({ paciente_id: 'p1', asistente_id: ANA, asistente_nombre: 'Ana' }));
    expect(llamadasAlBackend).toEqual([{
      ruta: '/guardias/g1/mover-a-paciente',
      cuerpo: { paciente_id: 'p2', fecha: '2026-10-21', hora_inicio: null, hora_fin: null },
    }]);
    expect(pedidosALaBase).toEqual([]);
  });

  it('con alguien esperando respuesta también va al backend', async () => {
    await mover(guardia({ paciente_id: 'p1', pendiente_asistente_id: BRUNO, pendiente_nombre: 'Bruno' }));
    expect(llamadasAlBackend[0].ruta).toBe('/guardias/g1/mover-a-paciente');
  });

  it('sin Asistente: sólo cambia de Paciente y de fecha, sin pasar por el backend', async () => {
    await mover(guardia({ paciente_id: 'p1' }));
    expect(llamadasAlBackend).toEqual([]);
    expect(pedidosALaBase.map((p) => p.cambios)).toEqual([{ paciente_id: 'p2' }, { fecha: '2026-10-21' }]);
  });

  it('con check-in: la guardia ya empezó y no se mueve ni cambia de Paciente', async () => {
    const empezada = guardia({ paciente_id: 'p1', estado: 'activa', asistente_id: ANA, checkin_at: '2026-10-20T08:00:00Z' });
    expect(seArrastra(empezada)).toBe(false);
    expect(seArrastra(guardia({ paciente_id: 'p1' }))).toBe(true);
    const { error } = await mover(empezada);
    expect(error).toBeNull();
    expect(llamadasAlBackend).toEqual([]);
    expect(pedidosALaBase).toEqual([]);
  });
});

describe('pedidoDeConfirmacionDelMovimiento', () => {
  it('con Asistente: dice quién deja el turno y que debe aceptar el nuevo', () => {
    const p = pedidoDeConfirmacionDelMovimiento(guardia({ asistente_id: ANA, asistente_nombre: 'Ana' }), 'García', 'López', t);
    expect(p.texto).toContain('Ana');
    expect(p.texto).toContain('García');
    expect(p.texto).toContain('López');
    expect(p.texto).not.toContain('{');
    expect(p.confirmar).toContain('López');
  });

  it('sin Asistente: la frase corta', () => {
    const p = pedidoDeConfirmacionDelMovimiento(guardia(), 'García', 'López', t);
    expect(p.texto).not.toContain('Ana');
    expect(p.texto).toContain('López');
    expect(p.texto).not.toContain('{');
  });

  it('las frases, el botón y el motivo nuevo están en los tres idiomas', () => {
    for (const idioma of ['es-AR', 'en', 'pt-BR']) {
      const tc = T[idioma].guardias.confirmar_asignacion;
      for (const clave of ['mover_con_asistente', 'mover_sin_asistente', 'mover_a']) {
        expect(tc[clave], `${idioma}.${clave}`).toBeTruthy();
      }
      expect(T[idioma].errores.motivos.guardia_sin_asistente, `${idioma}.guardia_sin_asistente`).toBeTruthy();
    }
  });
});
