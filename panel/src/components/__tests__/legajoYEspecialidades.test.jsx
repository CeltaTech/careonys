/**
 * Lo que se dibuja de tres piezas: los casilleros compartidos del ajuste por índice, la
 * Especialidad que pide cada tarea y la revisión de los valores del Legajo.
 *
 *   npx vitest run src/components/__tests__/legajoYEspecialidades.test.jsx
 *
 * Se dibuja con el catálogo real más los textos nuevos de esta tarea, que todavía no están en
 * `translations.js`. Qué daría con el sistema roto: si los meses se muestran sin índice, si la
 * tarea prohibida pide Especialidad, si quien no administra puede cambiarla, si la lista del
 * Legajo no dice cada valor con su moneda, si los botones siguen vivos mientras se revisa otra
 * propuesta o si la franja del Legajo aparece sin nada que revisar, alguna de estas falla.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { T } from '../../i18n/translations.js';

const base = T['es-AR'];
const t = {
  ...base,
  actualizacion_de_precios: { ...base.actualizacion_de_precios, sin_indice: 'Manual' },
  configuracion: {
    ...base.configuracion,
    tareas_especialidad: 'Especialidad',
    tareas_especialidad_ninguna: 'Ninguna',
    tareas_especialidad_fuera_de_uso: 'Especialidad fuera de uso',
    condiciones_cliente: {
      ...base.configuracion.condiciones_cliente,
      meses_entre_actualizaciones: 'Tiempo entre actualizaciones',
      ajuste_por_indice: 'Ajuste',
      valores: {
        ...base.configuracion.condiciones_cliente.valores,
        meses_entre_actualizaciones: { 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral' },
        ajuste_por_indice: { automatico: 'Automático', revision_previa: 'Con revisión previa' },
      },
    },
  },
  ajustes_por_indice: {
    ...base.ajustes_por_indice,
    legajo_titulo: 'Valores del Legajo ajustados por índice',
    legajo_col_asistente: 'Asistente',
    legajo_col_unidad: 'Unidad',
    legajo_valor_actual: 'Valor actual',
    legajo_valor_nuevo: 'Valor nuevo',
    legajo_aceptar: 'Aplicar',
    legajo_rechazar: 'Rechazar',
    legajo_alarma_una: 'Hay {cantidad} valor del Legajo ajustado por índice para revisar.',
    legajo_alarma_varias: 'Hay {cantidad} valores del Legajo ajustados por índice para revisar.',
    legajo_revisar: 'Revisar valores',
  },
};

vi.mock('../../i18n/LocaleContext', () => ({ useLocale: () => ({ t, locale: 'es-AR' }) }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: null }) }));
vi.mock('../../context/ConfirmacionContext', () => ({ useConfirmarDestructivo: () => async () => false }));
vi.mock('../../context/PermisosContext', () => ({ usePermisos: () => ({ puede: () => false, estado: 'listo', cargado: true }) }));

const { AjustePorIndiceConfig } = await import('../AjustePorIndiceConfig.jsx');
const { FranjaDeAjustesPorIndice } = await import('../AlarmaDeAjustesPorIndice.jsx');
const { ListaDePropuestasDelLegajo } = await import('../../pages/AjustesPorIndice.jsx');
const { ListaDeClase } = await import('../../pages/configuracion/TiposAsistenteTab.jsx');

const nada = () => {};
const INDICES = [{ codigo: 'ipc', nombre: 'IPC' }];

/* Las etiquetas se arman con una función: escritas a mano, el verificador de
   texto visible las toma por texto de pantalla. */
const texto = (etiqueta, contenido) => `>${contenido}</${etiqueta}>`;
const opcion = (valor, contenido) => `<option value="${valor}" selected="">${contenido}</option>`;

describe('los casilleros compartidos del ajuste por índice', () => {
  const dibujar = (valores, props = {}) =>
    renderToStaticMarkup(<AjustePorIndiceConfig t={t} valores={valores} indices={INDICES} onCambiar={nada} {...props} />);

  it('sin índice muestra sólo el índice, con «Manual» elegido', () => {
    const html = dibujar({ indice_de_actualizacion: null });
    expect(html).toContain(opcion('ninguno', 'Manual'));
    expect(html).not.toContain('Tiempo entre actualizaciones');
    expect(html).not.toContain('name="ajuste_por_indice"');
  });

  it('con índice muestra los meses y el ajuste, y de fábrica mensual con revisión previa', () => {
    const html = dibujar({ indice_de_actualizacion: 'ipc' });
    expect(html).toContain(opcion('ipc', 'IPC'));
    expect(html).toContain(opcion('1', 'Mensual'));
    expect(html).toContain(opcion('revision_previa', 'Con revisión previa'));
  });

  it('señala los meses mal cargados y se apaga entero', () => {
    const html = dibujar({ indice_de_actualizacion: 'ipc' }, { claveMal: 'meses_entre_actualizaciones', disabled: true });
    expect(html).toContain(t.formularios.falta_un_dato_obligatorio);
    expect(html.match(/<select[^>]*disabled=""/g)).toHaveLength(3);
  });
});

describe('la Especialidad que pide cada tarea', () => {
  const TAREAS = [{ id: 't1', prestadora_id: null, clave: 'higiene', nombre: 'Higiene' }];
  const ESPECIALIDADES = [{ id: 'e1', nombre: 'Enfermería' }];
  const dibujar = (props) =>
    renderToStaticMarkup(
      <ListaDeClase
        clase="habilitada"
        tareas={TAREAS}
        tipo={{ id: 'tipo' }}
        prestadoraId="p1"
        especialidades={ESPECIALIDADES}
        onCambio={nada}
        {...props}
      />,
    );

  it('la tarea habilitada ofrece las Especialidades, con la pedida elegida', () => {
    const html = dibujar({ pedidas: { t1: 'e1' }, administra: true });
    expect(html).toContain(texto('option', 'Ninguna'));
    expect(html).toContain(opcion('e1', 'Enfermería'));
    expect(html).not.toMatch(/<select[^>]*disabled/);
  });

  it('quien no administra la ve y no la cambia', () => {
    const html = dibujar({ administra: false });
    expect(html).toMatch(/<select[^>]*disabled/);
  });

  it('la Especialidad que ya no está activa se nombra como fuera de uso', () => {
    const html = dibujar({ pedidas: { t1: 'vieja' }, administra: true });
    expect(html).toContain(opcion('vieja', 'Especialidad fuera de uso'));
  });

  it('la tarea prohibida no pide Especialidad', () => {
    const html = dibujar({ clase: 'prohibida', administra: true });
    expect(html).not.toContain('name="especialidad_de_la_tarea_t1"');
  });
});

describe('la revisión de los valores del Legajo', () => {
  const PROPUESTA = {
    id: 'p1',
    indice: 'ipc',
    rige_desde: '2026-12-01',
    moneda: 'ARS',
    unidad_medicion: 'hora',
    valor_hora_actual: 1000,
    valor_hora_propuesto: 1100,
    asistente: { nombre: 'Ana Inventada' },
  };
  const dibujar = (props = {}) =>
    renderToStaticMarkup(
      <ListaDePropuestasDelLegajo
        t={t}
        locale="es-AR"
        estado="listo"
        recargar={nada}
        propuestas={[PROPUESTA]}
        indices={{ ipc: 'IPC' }}
        revisando={null}
        revisar={nada}
        {...props}
      />,
    );

  it('dice el Asistente, el índice, la unidad, cada valor con su moneda y desde cuándo', () => {
    const html = dibujar();
    expect(html).toContain('Ana Inventada');
    expect(html).toContain(texto('td', 'IPC'));
    expect(html).toContain(t.asistentes.unidad_hora);
    expect(html).toContain(`${t.asistentes.valor_hora}: `);
    expect(html).toMatch(/1\.000/);
    expect(html).toMatch(/1\.100/);
    expect(html).toContain('$');
    expect(html).toContain(texto('td', '12/2026'));
    expect(html).not.toContain(t.asistentes.valor_semana);
  });

  it('los botones se apagan mientras se revisa una propuesta', () => {
    expect(dibujar().match(/disabled=""/g)).toBeNull();
    expect(dibujar({ revisando: 'otra' }).match(/disabled=""/g)).toHaveLength(2);
  });

  it('sin nada que revisar no queda la tarjeta', () => {
    expect(dibujar({ propuestas: [] })).toBe('');
  });

  it('muestra el error de la revisión', () => {
    expect(dibujar({ error: 'Otro ajuste reemplazó este valor.' })).toContain('Otro ajuste reemplazó este valor.');
  });
});

describe('la franja del Legajo', () => {
  const dibujar = (props) =>
    renderToStaticMarkup(
      <StaticRouter location="/">
        <FranjaDeAjustesPorIndice
          t={t}
          recargar={nada}
          una={t.ajustes_por_indice.legajo_alarma_una}
          varias={t.ajustes_por_indice.legajo_alarma_varias}
          revisar={t.ajustes_por_indice.legajo_revisar}
          {...props}
        />
      </StaticRouter>,
    );

  it('dice cuántos valores esperan revisión y lleva a revisarlos', () => {
    const html = dibujar({ estado: 'listo', cantidad: 2 });
    expect(html).toContain('Hay 2 valores del Legajo ajustados por índice para revisar.');
    expect(html).toContain('href="/revisar-precios"');
    expect(html).toContain('Revisar valores');
  });

  it('sin nada que revisar, no hay franja', () => {
    expect(dibujar({ estado: 'vacio', cantidad: 0 })).toBe('');
  });
});
