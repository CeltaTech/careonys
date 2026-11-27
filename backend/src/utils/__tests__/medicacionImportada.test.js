/**
 * La medicación importada: el renglón original queda en la historia anterior del Paciente antes
 * de cargar la indicación, y sólo se carga si la regla de salud le deja a quien importa alcanzar a
 * ese Paciente. Todo con datos inventados.
 *
 *   npm test --prefix backend
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { cargarMedicacion, guardarMedicacion, importarHojaDeMedicacion } from '../medicacionImportada.js';

const LEIDO = { personas: [{ id: 'per-1' }], pacientes: [{ id: 'pac-1', cliente_id: null }] };

/** Una conexión inventada que anota cada alta y contesta lo justo. */
function conexion({ alcanza = true, falla = null } = {}) {
  const altas = [];
  const rpcs = [];
  const tabla = (nombre) => {
    const consulta = {
      insert(fila) {
        altas.push({ tabla: nombre, fila });
        return {
          select: () => ({
            single: async () => (falla === nombre
              ? { data: null, error: { message: 'sin permiso' } }
              : { data: { id: `id-${altas.length}` }, error: null }),
          }),
        };
      },
      select: () => consulta,
      eq: () => consulta,
      in: () => consulta,
      is: () => consulta,
      then: (ok) => ok({ data: LEIDO[nombre] ?? [], error: null }),
      order: async () => ({ data: nombre === 'vias_administracion' ? [{ id: 'via-oral', clave: 'oral' }] : [], error: null }),
      maybeSingle: async () => ({
        data: nombre === 'configuracion_medicacion' ? { pide_firma_del_cliente: false } : null,
        error: null,
      }),
    };
    return consulta;
  };
  return {
    altas,
    rpcs,
    from: tabla,
    rpc: async (nombre, args) => {
      rpcs.push({ nombre, args });
      return { data: alcanza, error: null };
    },
  };
}

function contexto(opciones) {
  const db = conexion({ falla: opciones?.falla ?? null });
  const sesion = conexion(opciones);
  return {
    db, sesion,
    ctx: { db, conexionDeQuienPide: sesion, prestadoraId: 'prest-1', importacionId: 'imp-1', usuarioPanelId: 'usu-1' },
  };
}

const LISTA = {
  medicamento: 'Paracetamol', dosis: '500 mg', frecuencia: 'cada 8 horas', via_administracion_id: 'via-oral',
  fecha_desde: '2026-01-10', fecha_hasta: null, nota_aclaratoria: 'Con comida',
};
const ORIGINAL = { Droga: 'Paracetamol', Dosis: '500 mg', Nota: 'Con comida', Observación: 'dato viejo' };

describe('la medicación importada no se pierde', () => {
  it('el renglón original entero queda en la historia anterior del Paciente', async () => {
    const { ctx, db } = contexto();
    await guardarMedicacion(ctx, { fila: 3, hoja: 'Medicación', lista: LISTA, pacienteId: 'pac-1', clienteId: 'cli-1', original: ORIGINAL });
    const historia = db.altas.find((a) => a.tabla === 'historia_anterior_del_paciente');
    assert.ok(historia, 'falta la copia en la historia');
    assert.equal(historia.fila.clase, 'otro');
    assert.equal(historia.fila.etiqueta, 'medicacion');
    assert.equal(historia.fila.paciente_id, 'pac-1');
    assert.equal(historia.fila.hoja, 'Medicación');
    assert.deepEqual(historia.fila.datos, ORIGINAL);
    assert.ok(db.altas.some((a) => a.tabla === 'indicaciones_medicacion'));
  });

  it('la indicación la escribe la cuenta de la importación, con quien importa como quien la pidió', async () => {
    const { ctx, db, sesion } = contexto();
    await guardarMedicacion(ctx, { fila: 1, lista: LISTA, pacienteId: 'pac-1', clienteId: null });
    const indicacion = db.altas.find((a) => a.tabla === 'indicaciones_medicacion');
    assert.equal(indicacion.fila.solicitado_por, 'usu-1');
    assert.equal(indicacion.fila.estado, 'aceptada');
    assert.equal(sesion.altas.length, 0);
  });

  it('sin renglón original, la historia guarda lo que se cargó', async () => {
    const { ctx, db } = contexto();
    await guardarMedicacion(ctx, { fila: 1, lista: LISTA, pacienteId: 'pac-1', clienteId: null });
    const historia = db.altas.find((a) => a.tabla === 'historia_anterior_del_paciente');
    assert.equal(historia.fila.datos.nota_aclaratoria, 'Con comida');
  });

  it('si la base rechaza la indicación, el renglón ya quedó en la historia', async () => {
    const { ctx, db } = contexto({ falla: 'indicaciones_medicacion' });
    await assert.rejects(guardarMedicacion(ctx, { fila: 2, lista: LISTA, pacienteId: 'pac-1', clienteId: null, original: ORIGINAL }));
    assert.ok(db.altas.some((a) => a.tabla === 'historia_anterior_del_paciente'));
  });
});

describe('quién puede importar la medicación', () => {
  it('se pregunta con la sesión de quien importa si alcanza a ese Paciente', async () => {
    const { ctx, sesion } = contexto();
    await guardarMedicacion(ctx, { fila: 1, lista: LISTA, pacienteId: 'pac-9', clienteId: null });
    assert.deepEqual(sesion.rpcs[0], { nombre: 'alcanza_la_informacion_de_salud_la_sesion', args: { p_paciente: 'pac-9' } });
  });

  it('si la regla de salud no lo alcanza, no se carga, pero el renglón queda en la historia', async () => {
    const { ctx, db, sesion } = contexto({ alcanza: false });
    await assert.rejects(
      guardarMedicacion(ctx, { fila: 1, lista: LISTA, pacienteId: 'pac-1', clienteId: null, original: ORIGINAL }),
      (error) => error.motivo === 'sin_alcance_al_paciente',
    );
    assert.deepEqual(db.altas.map((a) => a.tabla), ['historia_anterior_del_paciente']);
    assert.deepEqual(db.altas[0].fila.datos, ORIGINAL);
    assert.equal(sesion.altas.length, 0);
  });

  it('sin sesión de quien importa, falla cerrado', async () => {
    const { ctx } = contexto();
    await assert.rejects(
      guardarMedicacion({ ...ctx, conexionDeQuienPide: null }, { fila: 1, lista: LISTA, pacienteId: 'pac-1', clienteId: null }),
      (error) => error.motivo === 'sin_permiso',
    );
  });

  it('un renglón de un Paciente fuera de alcance no abre pedidos, y queda en la historia', async () => {
    const { ctx, db, sesion } = contexto({ alcanza: false });
    await assert.rejects(
      cargarMedicacion(ctx, { fila: 1, datos: { medicamento: 'Paracetamol' }, original: ORIGINAL, pacienteId: 'pac-1', clienteId: null }),
      (error) => error.motivo === 'sin_alcance_al_paciente',
    );
    assert.deepEqual(db.altas.map((a) => a.tabla), ['historia_anterior_del_paciente']);
    assert.equal(sesion.altas.length, 0);
  });

  it('en una hoja, el renglón fuera de alcance queda en los errores del lote con su motivo', async () => {
    const { ctx } = contexto({ alcanza: false });
    const mapeo = { DNI: 'documentoPaciente', Droga: 'medicamento' };
    const resultado = await importarHojaDeMedicacion(ctx, {
      hoja: { indice: 0, nombre: 'Medicación' }, filas: [{ DNI: '20111222', Droga: 'Paracetamol' }], mapeo,
    });
    assert.deepEqual(resultado.errores, [{ hoja: 0, fila: 1, motivo: 'sin_alcance_al_paciente' }]);
  });

  it('un dato que falta lleva el renglón original al pedido', async () => {
    const { ctx, db } = contexto();
    await cargarMedicacion(ctx, { fila: 4, datos: { medicamento: 'Paracetamol' }, original: ORIGINAL, pacienteId: 'pac-1', clienteId: null });
    const pedido = db.altas.find((a) => a.tabla === 'pedidos_de_importacion');
    assert.deepEqual(pedido.fila.renglon.original, ORIGINAL);
  });
});
