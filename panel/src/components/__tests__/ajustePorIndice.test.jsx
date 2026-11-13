/**
 * Lo que se dibuja del ajuste periódico por índice: los casilleros del Servicio, la franja de la
 * administración y la lista de revisión.
 *
 *   npx vitest run src/components/__tests__/ajustePorIndice.test.jsx
 *
 * Se dibuja con el catálogo real más los textos nuevos de esta tarea, que todavía no están en
 * `translations.js`. Qué daría con el sistema roto: si vuelve el selector de forma o la opción
 * «La de la configuración», si los meses se muestran sin índice, si el botón no se apaga mientras
 * guarda, si la franja aparece sin nada que revisar, si la lista no dice el precio con su moneda o
 * si los botones siguen vivos mientras se revisa otra, alguna de estas falla.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { T } from '../../i18n/translations.js';

const base = T['es-AR'];
const t = {
  ...base,
  actualizacion_de_precios: { ...base.actualizacion_de_precios, sin_indice: 'Ninguno' },
  configuracion: {
    ...base.configuracion,
    condiciones_cliente: {
      ...base.configuracion.condiciones_cliente,
      meses_entre_actualizaciones: 'Meses entre actualizaciones',
      ajuste_por_indice: 'Ajuste',
      valores: {
        ...base.configuracion.condiciones_cliente.valores,
        ajuste_por_indice: { automatico: 'Automático', revision_previa: 'Con revisión previa' },
      },
    },
  },
  ajustes_por_indice: {
    titulo: 'Ajustes por índice',
    alarma_una: 'Hay {cantidad} precio ajustado por índice para revisar.',
    alarma_varias: 'Hay {cantidad} precios ajustados por índice para revisar.',
    revisar: 'Revisar',
    sin_propuestas: 'No hay precios para revisar.',
    col_servicio: 'Servicio',
    aceptar: 'Aceptar',
    rechazar: 'Rechazar',
    confirmar_aceptar: 'x',
    confirmar_rechazar: 'x',
  },
};

vi.mock('../../i18n/LocaleContext', () => ({ useLocale: () => ({ t, locale: 'es-AR' }) }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: null }) }));
vi.mock('../../context/ConfirmacionContext', () => ({ useConfirmarDestructivo: () => async () => false }));

const { AjusteDelServicio } = await import('../ActualizacionDelServicio.jsx');
const { FranjaDeAjustesPorIndice } = await import('../AlarmaDeAjustesPorIndice.jsx');
const { ListaDeAjustesPorIndice } = await import('../../pages/AjustesPorIndice.jsx');

const nada = () => {};
const INDICES = [{ codigo: 'ipc', nombre: 'IPC' }, { codigo: 'cvs', nombre: 'CVS' }];

function ajuste(props = {}) {
  return renderToStaticMarkup(
    <AjusteDelServicio
      t={t}
      estado="listo"
      indices={INDICES}
      casilleros={{ indice_de_actualizacion: 'ipc', meses_entre_actualizaciones: '3', ajuste_por_indice: 'automatico' }}
      conIndice
      cambiar={nada}
      guardar={nada}
      recargar={nada}
      puedeEditar
      guardando={false}
      {...props}
    />
  );
}

/* Las etiquetas se arman con una función: escritas a mano, el verificador de
   texto visible las toma por texto de pantalla. */
const texto = (etiqueta, contenido) => `>${contenido}</${etiqueta}>`;
const opcion = (valor, contenido) => `<option value="${valor}" selected="">${contenido}</option>`;

describe('los casilleros del ajuste del Servicio', () => {
  it('índice con «Ninguno», meses y ajuste; sin forma ni «La de la configuración»', () => {
    const html = ajuste();
    expect(html).toContain('Índice de actualización');
    expect(html).toContain(texto('option', 'Ninguno'));
    expect(html).toContain(opcion('ipc', 'IPC'));
    expect(html).toContain('Meses entre actualizaciones');
    expect(html).toContain('value="3"');
    expect(html).toContain(opcion('automatico', 'Automático'));
    expect(html).not.toContain('La de la configuración');
    expect(html).not.toContain('Forma de actualización');
  });

  it('sin índice que rija, no hay meses ni ajuste', () => {
    const html = ajuste({ conIndice: false, casilleros: { indice_de_actualizacion: 'ninguno', meses_entre_actualizaciones: '1', ajuste_por_indice: 'revision_previa' } });
    expect(html).toContain(opcion('ninguno', 'Ninguno'));
    expect(html).not.toContain('Meses entre actualizaciones');
    expect(html).not.toContain('Automático');
  });

  it('mientras guarda, el botón y los casilleros se apagan', () => {
    const html = ajuste({ guardando: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Guardando/);
    expect(html).toMatch(/<select[^>]*name="indice_de_actualizacion"[^>]*disabled=""/);
  });

  it('el dato mal cargado se dice al pie de su casillero', () => {
    expect(ajuste({ claveMal: 'meses_entre_actualizaciones' })).toContain(base.configuracion.condiciones_cliente.meses_fuera_de_borde);
    expect(ajuste({ claveMal: 'ajuste_por_indice' })).toContain(base.formularios.falta_un_dato_obligatorio);
  });

  it('cargando, error y vacío', () => {
    expect(ajuste({ estado: 'cargando' })).toContain(base.comun.cargando);
    expect(ajuste({ estado: 'error', errorDeCarga: 'Falló.' })).toContain(base.comun.reintentar);
    expect(ajuste({ estado: 'vacio' })).toContain(base.actualizacion_de_precios.servicio_sin_condiciones);
  });

  it('quien no puede editar no ve el botón', () => {
    expect(ajuste({ puedeEditar: false })).not.toContain(`>${base.comun.guardar}<`);
  });
});

function franja(props) {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <FranjaDeAjustesPorIndice t={t} recargar={nada} {...props} />
    </StaticRouter>
  );
}

describe('la franja de la administración', () => {
  it('con propuestas pendientes avisa cuántas y lleva a revisarlas', () => {
    const html = franja({ estado: 'listo', cantidad: 3 });
    expect(html).toContain('Hay 3 precios ajustados por índice para revisar.');
    expect(html).toContain('href="/ajustes-por-indice"');
    expect(franja({ estado: 'listo', cantidad: 1 })).toContain('Hay 1 precio ajustado');
  });

  it('cargando o sin nada que revisar, no hay franja', () => {
    expect(franja({ estado: 'cargando', cantidad: 0 })).toBe('');
    expect(franja({ estado: 'vacio', cantidad: 0 })).toBe('');
  });

  it('si no pudo contar, lo dice y deja reintentar', () => {
    const html = franja({ estado: 'error', error: 'Falló.' });
    expect(html).toContain('Falló.');
    expect(html).toContain(base.comun.reintentar);
  });
});

const PROPUESTA = {
  id: 'p1',
  indice: 'ipc',
  precio_actual: 1000,
  precio_propuesto: 1100,
  moneda: 'ARS',
  rige_desde: '2026-03-01',
  servicio: { etiqueta: 'Servicio de prueba' },
  prestacion: { tipo_servicio: 'Acompañamiento' },
};

function lista(props = {}) {
  return renderToStaticMarkup(
    <ListaDeAjustesPorIndice
      t={t}
      locale="es-AR"
      estado="listo"
      recargar={nada}
      propuestas={[PROPUESTA]}
      indices={{ ipc: 'IPC' }}
      revisando={null}
      revisar={nada}
      {...props}
    />
  );
}

describe('la lista de revisión', () => {
  it('muestra el Servicio, el índice, los dos precios con su moneda y el mes desde el que rige', () => {
    const html = lista();
    expect(html).toContain('Servicio de prueba — Acompañamiento');
    expect(html).toContain(texto('td', 'IPC'));
    expect(html).toMatch(/1\.000/);
    expect(html).toMatch(/1\.100/);
    expect(html).toContain('03/2026');
    expect(html).toContain(texto('button', 'Aceptar'));
    expect(html).toContain(texto('button', 'Rechazar'));
  });

  it('mientras se revisa una, los botones se apagan', () => {
    const html = lista({ revisando: 'p1' });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aceptar/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Rechazar/);
  });

  it('sin propuestas, lo dice', () => {
    expect(lista({ propuestas: [] })).toContain('No hay precios para revisar.');
  });
});
