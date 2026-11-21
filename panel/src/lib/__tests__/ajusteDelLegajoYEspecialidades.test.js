/**
 * La lógica de tres piezas: qué Especialidad pide cada tarea, el ajuste por índice guardado en la
 * regla de pago y las propuestas de ajuste del valor del Legajo.
 *
 *   npx vitest run src/lib/__tests__/ajusteDelLegajoYEspecialidades.test.js
 *
 * Qué daría con el sistema roto: si una tarea prohibida pidiera Especialidad, si un rechazo de la
 * base quedara sin su frase, si al guardar la regla de pago se perdiera el prorrateo o el índice,
 * si se guardaran los meses sin índice o si una propuesta mostrara valores que no cambia, alguna
 * de estas falla.
 */
import { describe, expect, it, vi } from 'vitest';

const llamadasAlBackend = vi.hoisted(() => []);
// Cualquier escritura directa en la base rompe la prueba: el guardado es uno solo, por el backend.
vi.mock('../supabaseClient', () => ({
  supabase: { from: () => { throw new Error('el guardado no va directo a la base'); } },
}));
vi.mock('../apiConfiguracion', () => ({
  llamarApiConfiguracion: async (ruta, opciones) => {
    llamadasAlBackend.push({ ruta, opciones });
    return {};
  },
}));

const { clasePideEspecialidad, motivoDeLaEspecialidadDeLaTarea, especialidadPorTarea } = await import('../tiposAsistente.js');
const { ajusteDeLaRegla, ajusteDeLaReglaQueSePuedeGuardar } = await import('../ajustePorIndice.js');
const { reglaConAjuste, guardarConfiguracionDePago } = await import('../configuracionDePagoAsistentes.js');
const { COLUMNAS_DE_LA_PROPUESTA, motivoDeLaRevisionDelLegajo, valoresDeLaPropuesta } = await import('../propuestasDelLegajo.js');

describe('la Especialidad que pide cada tarea', () => {
  it('la piden la habilitada y la no incluida; la prohibida no', () => {
    expect(clasePideEspecialidad('habilitada')).toBe(true);
    expect(clasePideEspecialidad('no_incluida')).toBe(true);
    expect(clasePideEspecialidad('prohibida')).toBe(false);
    expect(clasePideEspecialidad(undefined)).toBe(false);
  });

  it('reconoce los tres rechazos de la base y deja pasar los demás', () => {
    expect(motivoDeLaEspecialidadDeLaTarea({ message: 'tarea_ajena: x' })).toBe('tarea_ajena');
    expect(motivoDeLaEspecialidadDeLaTarea({ message: 'tarea_prohibida: x' })).toBe('tarea_prohibida');
    expect(motivoDeLaEspecialidadDeLaTarea({ message: 'especialidad_de_otro_tipo: x' })).toBe('especialidad_de_otro_tipo');
    expect(motivoDeLaEspecialidadDeLaTarea({ message: 'otra cosa' })).toBeNull();
    expect(motivoDeLaEspecialidadDeLaTarea(null)).toBeNull();
  });

  it('arma el mapa de tarea a Especialidad sin renglones incompletos', () => {
    expect(especialidadPorTarea([
      { tarea_id: 't1', especialidad_id: 'e1' },
      { tarea_id: 't2', especialidad_id: null },
    ])).toEqual({ t1: 'e1' });
    expect(especialidadPorTarea(null)).toEqual({});
  });
});

describe('el ajuste por índice guardado en la regla', () => {
  it('lee las tres claves, y null la que falta', () => {
    expect(ajusteDeLaRegla({ indice_de_actualizacion: 'ipc', prorratear_monto_fijo: false })).toEqual({
      indice_de_actualizacion: 'ipc',
      meses_entre_actualizaciones: null,
      ajuste_por_indice: null,
    });
    expect(ajusteDeLaRegla(undefined).indice_de_actualizacion).toBeNull();
  });

  it('sin índice no guarda meses ni forma de aplicarlo', () => {
    const r = ajusteDeLaReglaQueSePuedeGuardar({ indice_de_actualizacion: 'ninguno', meses_entre_actualizaciones: '3', ajuste_por_indice: 'revision_previa' });
    expect(r).toEqual({ ok: true, valor: {} });
  });

  it('con índice guarda lo que difiere de fábrica', () => {
    // De fábrica: mensual y con revisión previa. Esos dos no se escriben en la regla.
    const r = ajusteDeLaReglaQueSePuedeGuardar({ indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: '3', ajuste_por_indice: 'automatico' });
    expect(r).toEqual({ ok: true, valor: { indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: 3, ajuste_por_indice: 'automatico' } });
    const deFabrica = ajusteDeLaReglaQueSePuedeGuardar({ indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: '1', ajuste_por_indice: 'revision_previa' });
    expect(deFabrica).toEqual({ ok: true, valor: { indice_de_actualizacion: 'ipc' } });
  });

  it('señala los meses mal cargados', () => {
    expect(ajusteDeLaReglaQueSePuedeGuardar({ indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: '7' })).toEqual({
      ok: false,
      clave: 'meses_entre_actualizaciones',
    });
  });

  it('la regla de pago conserva el prorrateo y suma el ajuste', () => {
    expect(reglaConAjuste({ prorratear_monto_fijo: false, otra: 1 }, { indice_de_actualizacion: 'ipc' })).toEqual({
      prorratear_monto_fijo: false,
      indice_de_actualizacion: 'ipc',
    });
    expect(reglaConAjuste({ prorratear_monto_fijo: true }, null)).toEqual({});
  });

  it('el ajuste que regía al abrir no pisa al que quedó en los casilleros', () => {
    // La regla leída trae el índice de antes; el ajuste nuevo dice «ninguno», que no se escribe.
    expect(reglaConAjuste({ prorratear_monto_fijo: true, indice_de_actualizacion: 'ipc' }, {})).toEqual({});
  });

  it('guarda en un solo pedido al backend, con el prorrateo, el ajuste y la frecuencia', async () => {
    llamadasAlBackend.length = 0;
    await guardarConfiguracionDePago({
      regla: { prorratear_monto_fijo: false, indice_de_actualizacion: 'viejo' },
      frecuencia: { cada_cuanto: 'mensual' },
      ajuste: { indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: 3, ajuste_por_indice: 'automatico' },
    });
    expect(llamadasAlBackend).toHaveLength(1);
    const [{ ruta, opciones }] = llamadasAlBackend;
    expect(ruta).toBe('/pago-asistentes');
    expect(opciones.method).toBe('PUT');
    expect(JSON.parse(opciones.body)).toEqual({
      regla: {
        prorratear_monto_fijo: false,
        indice_de_actualizacion: 'ipc',
        meses_entre_actualizaciones: 3,
        ajuste_por_indice: 'automatico',
      },
      frecuencia: { cada_cuanto: 'mensual' },
    });
  });
});

describe('las propuestas de ajuste del valor del Legajo', () => {
  it('lee el nombre del Asistente y los valores de los dos lados', () => {
    expect(COLUMNAS_DE_LA_PROPUESTA).toContain('asistente:asistentes(nombre)');
    expect(COLUMNAS_DE_LA_PROPUESTA).toContain('valor_hora_actual');
    expect(COLUMNAS_DE_LA_PROPUESTA).toContain('valor_hora_extra_propuesto');
  });

  it('muestra sólo los valores que tienen un número de algún lado', () => {
    expect(valoresDeLaPropuesta({ valor_hora_actual: 100, valor_hora_propuesto: 110, valor_semana_actual: null })).toEqual([
      { valor: 'valor_hora', actual: 100, propuesto: 110 },
    ]);
  });

  it('reconoce los tres rechazos de la revisión', () => {
    expect(motivoDeLaRevisionDelLegajo({ message: 'ya_reemplazado' })).toBe('ya_reemplazado');
    expect(motivoDeLaRevisionDelLegajo({ message: 'no_encontrado: x' })).toBe('no_encontrado');
    expect(motivoDeLaRevisionDelLegajo({ message: 'sin_permiso' })).toBe('sin_permiso');
    expect(motivoDeLaRevisionDelLegajo({ message: 'sin_permisos' })).toBeNull();
  });
});
