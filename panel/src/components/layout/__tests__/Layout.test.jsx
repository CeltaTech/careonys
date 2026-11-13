// El menú del Panel: quién ve qué enlace.
//
// Lo de la plata de Match —«Clientes (Match)» y «Paquetes de Match»— es de la administración,
// igual que el candado de su dirección (App.jsx, `ROLES_ADMINISTRACION`). Hubo un defecto: el rol
// se había escrito en una propiedad que el menú no lee (`modalidad: … && esAdmin`), así que el
// Coordinador veía los dos enlaces y la dirección lo rechazaba. Y la sección «Clientes» es una sola
// para las dos modalidades: con Match sola también tiene que verse.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: con el defecto de vuelta, el Coordinador recibe
// los enlaces de la plata y la primera prueba falla; si «Clientes» vuelve a depender de la
// prestación directa, falla la tercera; y si el candado se pasa de largo y le saca los enlaces
// también a la administración, falla la segunda. Se dibuja el menú real con el catálogo real.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { T } from '../../../i18n/translations.js';

let rol;
let activas;

vi.mock('../../../i18n/LocaleContext', () => ({
  useLocale: () => ({ t: T['es-AR'], locale: 'es-AR' }),
}));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ usuario: { nombre: 'Persona Inventada', rol }, logout: () => {} }),
}));
vi.mock('../../../context/EmpresaContext', () => ({
  useEmpresa: () => ({ empresa: { nombre: 'Prestadora Inventada' } }),
}));
vi.mock('../../../context/PermisosContext', () => ({
  // Con todos los permisos del catálogo: lo que se prueba es el rol, no un permiso suelto.
  usePermisos: () => ({ puede: () => true }),
}));
vi.mock('../../../context/ModalidadesContext', () => ({
  useModalidades: () => ({
    tieneModalidad: (m) => activas.includes(m),
    ambas: activas.length > 1,
    vista: activas[0] ?? null,
    elegirVista: () => {},
    enVista: (m) => activas.length < 2 || activas[0] === m,
  }),
}));
vi.mock('../../../context/TelefonosEsperandoContext', () => ({
  useTelefonosEsperando: () => ({ cuentas: [] }),
}));
vi.mock('../../../context/EmergenciasSinAtenderContext', () => ({
  useEmergenciasSinAtender: () => ({ emergencias: [] }),
}));
vi.mock('../../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../lib/apiContenidos', () => ({ llamarApiContenidos: () => Promise.resolve({ hay: false }) }));
vi.mock('../SelectoresPreferencias', () => ({ SelectoresPreferencias: () => null }));
vi.mock('../EquipoNuevo', () => ({ EquipoNuevo: () => null }));
vi.mock('../AvisoDeInactividad', () => ({ AvisoDeInactividad: () => null }));

const { Layout } = await import('../Layout.jsx');

const PLATA_DE_MATCH = ['/intermediacion/clientes', '/intermediacion/formas-de-cobro'];

/* Las direcciones a las que lleva el menú. La barra muestra el primer enlace de cada sección y la
   subnavegación todos los de la sección abierta, así que se dibuja parado en cada sección que
   interesa y se juntan los enlaces de las dos vistas. */
function enlacesDelMenu() {
  const enlaces = new Set();
  for (const ubicacion of ['/personas', '/asistentes', '/facturacion', '/intermediacion/formas-de-cobro', '/lista-precios']) {
    const html = renderToStaticMarkup(
      <StaticRouter location={ubicacion}>
        <Layout />
      </StaticRouter>,
    );
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) enlaces.add(href);
  }
  return enlaces;
}

describe('El menú del Panel', () => {
  beforeEach(() => {
    activas = ['intermediacion'];
  });

  it('al Coordinador no le muestra los enlaces de la plata de Match', () => {
    rol = 'coordinador';
    const enlaces = enlacesDelMenu();
    for (const a of PLATA_DE_MATCH) expect(enlaces.has(a), a).toBe(false);
    // Lo que no es plata lo sigue viendo: el candado no se llevó la modalidad entera.
    expect(enlaces.has('/intermediacion/calificaciones')).toBe(true);
  });

  it('a la administración sí se los muestra', () => {
    for (const r of ['admin_prestadora', 'superadmin']) {
      rol = r;
      const enlaces = enlacesDelMenu();
      for (const a of PLATA_DE_MATCH) expect(enlaces.has(a), `${r} ${a}`).toBe(true);
    }
  });

  it('muestra la sección Clientes con cualquiera de las dos modalidades, y sin ninguna no', () => {
    rol = 'coordinador';
    for (const modalidades of [['intermediacion'], ['directa'], ['directa', 'intermediacion']]) {
      activas = modalidades;
      expect(enlacesDelMenu().has('/clientes'), modalidades.join('+')).toBe(true);
    }
    activas = [];
    expect(enlacesDelMenu().has('/clientes')).toBe(false);
  });
});
