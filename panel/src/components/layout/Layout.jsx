import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useEmpresa } from '../../context/EmpresaContext';
import { usePermisos } from '../../context/PermisosContext';
import { useModalidades } from '../../context/ModalidadesContext';
import { usePedidosDeCodigo } from '../../context/PedidosDeCodigoContext';
import { useTelefonosEsperando } from '../../context/TelefonosEsperandoContext';
import { esAdminOSuperior } from '../../lib/roles';
import { MODALIDAD } from '../../lib/modalidades';
import { supabase } from '../../lib/supabaseClient';
import { SelectoresPreferencias } from './SelectoresPreferencias';
import { FranjaPuestaEnMarcha } from './FranjaPuestaEnMarcha';
import { EquipoNuevo } from './EquipoNuevo';

/* Los dibujos del menú, de trazo, en el color del texto que los rodea. */
const ICONOS = {
  inicio: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  servicios: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  asistentes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7" />
    </>
  ),
  guardias: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3" />
    </>
  ),
  clientes: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
      <path d="M12 17.5s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z" />
    </>
  ),
  facturacion: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  comunicacion: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
  configuracion: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  campana: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

function Icono({ nombre }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

function Contador({ cantidad }) {
  const { t } = useLocale();
  if (!(cantidad > 0)) return null;
  return (
    <span className="panel-nav-contador" aria-label={t.nav.esperando_cantidad.replace('{cantidad}', cantidad)}>
      {cantidad}
    </span>
  );
}

function iniciales(nombre) {
  return (nombre ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

// La ruta pertenece a la sección si es la misma o cuelga de ella (`/asistentes/123`).
function coincide(ruta, enlace) {
  if (enlace.end) return ruta === enlace.a;
  return ruta === enlace.a || ruta.startsWith(`${enlace.a}/`);
}

export function Layout() {
  const { t } = useLocale();
  const { usuario, logout } = useAuth();
  const { empresa } = useEmpresa();
  const { puede } = usePermisos();
  const { tieneModalidad } = useModalidades();
  // Los dos contadores se preguntan solos cada pocos segundos: del otro lado hay alguien
  // esperando, y no puede depender de que a alguien se le ocurra abrir esa sección.
  const { pedidos: pedidosDeCodigo } = usePedidosDeCodigo();
  const { cuentas: telefonosEsperando } = useTelefonosEsperando();
  const ubicacion = useLocation();
  const navegar = useNavigate();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [asistentesEncontrados, setAsistentesEncontrados] = useState([]);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const perfilRef = useRef(null);
  const avisosRef = useRef(null);
  const buscadorRef = useRef(null);

  const esAdmin = esAdminOSuperior(usuario?.rol);
  // El nombre de cada modalidad sale de lib/modalidades.js, el mismo lugar del que lo toma el
  // candado de la dirección (App.jsx).
  const directa = tieneModalidad(MODALIDAD.DIRECTA);
  const match = tieneModalidad(MODALIDAD.MATCH);
  const hayPlantel = directa || match;

  /* El menú, como lista de datos. El candado de cada enlace (`ver`) está escrito una sola vez,
     al lado del enlace, y es el mismo que aplica la dirección en App.jsx. */
  const secciones = [
    {
      clave: 'inicio',
      texto: t.nav.sec_inicio,
      enlaces: [
        { a: '/', texto: t.nav.estado_actual, ver: true, end: true },
        { a: '/resumen-del-mes', texto: t.nav.resumen_del_mes, ver: true },
      ],
    },
    {
      clave: 'servicios',
      texto: t.nav.sec_servicios,
      enlaces: [
        { a: '/servicios', texto: t.nav.servicios, ver: true },
        { a: '/solicitudes', texto: t.nav.solicitudes, ver: hayPlantel },
      ],
    },
    {
      clave: 'asistentes',
      texto: t.nav.sec_asistentes,
      enlaces: [
        { a: '/asistentes', texto: t.nav.asistentes, ver: hayPlantel },
        { a: '/documentacion', texto: t.nav.documentacion, ver: hayPlantel },
        { a: '/postulaciones', texto: t.nav.postulaciones, ver: hayPlantel },
        { a: '/match/calificaciones', texto: t.nav.match_calificaciones, ver: match },
        // Una remuneración es dato sensible: el Admin la ve siempre, el Coordinador sólo si su
        // Prestadora se lo habilitó.
        { a: '/pagos-asistentes', texto: t.nav.pagos_asistentes, ver: hayPlantel && (esAdmin || puede('ver_pagos_asistente')) },
      ],
    },
    {
      clave: 'guardias',
      texto: t.nav.sec_guardias,
      enlaces: [
        { a: '/guardias', texto: t.nav.guardias, ver: directa },
        { a: '/emergencias', texto: t.nav.emergencias, ver: hayPlantel },
        { a: '/pase-de-guardia', texto: t.nav.pase_de_guardia, ver: hayPlantel, contador: pedidosDeCodigo.length },
        { a: '/continuidad', texto: t.nav.continuidad, ver: hayPlantel },
        { a: '/verificacion-guardias', texto: t.nav.verificacion_guardias, ver: hayPlantel },
        { a: '/reportes', texto: t.nav.reportes, ver: directa },
        { a: '/medicacion', texto: t.nav.medicacion, ver: directa },
        { a: '/alertas', texto: t.nav.alertas, ver: directa },
      ],
    },
    {
      clave: 'clientes',
      texto: t.nav.sec_clientes,
      enlaces: [
        { a: '/padron', texto: t.nav.padron, ver: esAdmin || puede('ver_padron') },
        { a: '/clientes', texto: t.nav.clientes, ver: directa },
        { a: '/match/clientes', texto: t.nav.match_clientes, ver: match && esAdmin },
        { a: '/contenidos', texto: t.nav.contenidos, ver: true },
      ],
    },
    {
      clave: 'facturacion',
      texto: t.nav.sec_facturacion,
      enlaces: [
        { a: '/facturacion', texto: t.nav.facturacion, ver: directa },
        { a: '/lista-precios', texto: t.nav.lista_precios, ver: directa },
        { a: '/match/formas-de-cobro', texto: t.nav.match_formas_de_cobro, ver: match && esAdmin },
        { a: '/informes-obra-social', texto: t.nav.informes_obra_social, ver: directa },
      ],
    },
    {
      clave: 'comunicacion',
      texto: t.nav.sec_comunicacion,
      enlaces: [
        { a: '/comunicacion', texto: t.nav.comunicacion, ver: true },
        { a: '/respuestas-preparadas', texto: t.nav.respuestas_preparadas, ver: esAdmin },
      ],
    },
    {
      clave: 'configuracion',
      texto: t.nav.sec_configuracion,
      enlaces: [
        { a: '/configuracion', texto: t.nav.configuracion, ver: esAdmin },
        { a: '/usuarios-panel', texto: t.nav.usuarios_panel, ver: esAdmin },
        { a: '/importacion', texto: t.nav.importacion, ver: esAdmin || puede('importar_datos_masivos') },
        { a: '/habilitar-clave', texto: t.nav.habilitar_clave, ver: esAdmin || puede('habilitar_cambio_de_clave'), contador: telefonosEsperando.length },
        { a: '/auditoria', texto: t.nav.auditoria, ver: esAdmin },
        { a: '/match/auditoria-legal', texto: t.nav.match_auditoria_legal, ver: match },
      ],
    },
  ]
    .map((seccion) => {
      const visibles = seccion.enlaces.filter((enlace) => enlace.ver);
      return {
        ...seccion,
        visibles,
        contador: visibles.reduce((suma, enlace) => suma + (enlace.contador ?? 0), 0),
      };
    })
    .filter((seccion) => seccion.visibles.length > 0);

  const ruta = ubicacion.pathname;
  const seccionActual = secciones.find((seccion) => seccion.visibles.some((enlace) => coincide(ruta, enlace)));

  const avisos = secciones
    .flatMap((seccion) => seccion.visibles)
    .filter((enlace) => enlace.contador > 0);
  const totalAvisos = avisos.reduce((suma, enlace) => suma + enlace.contador, 0);

  // Al cambiar de dirección se cierra todo lo desplegado.
  useEffect(() => {
    setMenuAbierto(false);
    setPerfilAbierto(false);
    setAvisosAbiertos(false);
    setBusquedaAbierta(false);
  }, [ruta]);

  // Un clic afuera cierra el desplegable abierto.
  useEffect(() => {
    function alHacerClic(evento) {
      if (perfilRef.current && !perfilRef.current.contains(evento.target)) setPerfilAbierto(false);
      if (avisosRef.current && !avisosRef.current.contains(evento.target)) setAvisosAbiertos(false);
      if (buscadorRef.current && !buscadorRef.current.contains(evento.target)) setBusquedaAbierta(false);
    }
    document.addEventListener('mousedown', alHacerClic);
    return () => document.removeEventListener('mousedown', alHacerClic);
  }, []);

  // El buscador encuentra Asistentes por nombre. La base sólo devuelve los de la Prestadora.
  const texto = busqueda.trim();
  useEffect(() => {
    if (!hayPlantel || texto.length < 2) {
      setAsistentesEncontrados([]);
      return undefined;
    }
    let vigente = true;
    const espera = setTimeout(async () => {
      const limpio = texto.replace(/[%_,()]/g, '');
      const { data, error } = await supabase
        .from('asistentes')
        .select('id, nombre')
        .ilike('nombre', `%${limpio}%`)
        .order('nombre')
        .limit(6);
      if (!vigente) return;
      if (error) {
        console.error(error);
        setAsistentesEncontrados([]);
        return;
      }
      setAsistentesEncontrados(data ?? []);
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, hayPlantel]);

  const normalizar = (valor) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const paginasEncontradas =
    texto.length < 2
      ? []
      : secciones
          .flatMap((seccion) => seccion.visibles.map((enlace) => ({ ...enlace, seccion: seccion.texto })))
          .filter((enlace) => normalizar(enlace.texto).includes(normalizar(texto)))
          .slice(0, 6);
  const resultados = [
    ...asistentesEncontrados.map((asistente) => ({
      a: `/asistentes/${asistente.id}`,
      texto: asistente.nombre,
      detalle: t.nav.sec_asistentes,
    })),
    ...paginasEncontradas.map((enlace) => ({ a: enlace.a, texto: enlace.texto, detalle: enlace.seccion })),
  ];

  function alBuscar(evento) {
    evento.preventDefault();
    if (resultados.length > 0) navegar(resultados[0].a);
  }

  const rolTexto = usuario?.rol ? t.usuarios_panel[`rol_${usuario.rol}`] : '';

  return (
    <div className={`panel-layout${menuAbierto ? ' menu-abierto' : ''}`}>
      <a className="salto-al-contenido" href="#contenido-principal">
        {t.nav.saltar_al_contenido}
      </a>
      <aside className="panel-sidebar">
        <div className="panel-logo">{empresa?.nombre ?? ''}</div>
        <nav aria-label={t.nav.menu_principal}>
          {secciones.map((seccion) => (
            <NavLink
              key={seccion.clave}
              to={seccion.visibles[0].a}
              end={seccion.visibles[0].end}
              className={seccion === seccionActual ? 'active' : undefined}
              aria-current={seccion === seccionActual ? 'page' : undefined}
            >
              <Icono nombre={seccion.clave} />
              <span className="panel-nav-etiqueta">{seccion.texto}</span>
              <Contador cantidad={seccion.contador} />
            </NavLink>
          ))}
        </nav>
        <div className="panel-perfil" ref={perfilRef}>
          {perfilAbierto && (
            <div className="panel-perfil-menu">
              <NavLink to="/mi-clave">{t.nav.mi_clave}</NavLink>
              <NavLink to="/cuenta-segura">{t.nav.cuenta_segura}</NavLink>
              <SelectoresPreferencias />
              <button type="button" className="panel-salir" onClick={logout}>
                {t.nav.cerrar_sesion}
              </button>
            </div>
          )}
          <button
            type="button"
            className="panel-perfil-boton"
            aria-expanded={perfilAbierto}
            onClick={() => setPerfilAbierto((abierto) => !abierto)}
          >
            <span className="panel-avatar" aria-hidden="true">{iniciales(usuario?.nombre)}</span>
            <span className="panel-perfil-datos">
              <span className="panel-perfil-nombre">{usuario?.nombre}</span>
              <span className="panel-perfil-detalle">{rolTexto}</span>
            </span>
          </button>
        </div>
      </aside>
      <div className="panel-velo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
      <div className="panel-main">
        <EquipoNuevo />
        <FranjaPuestaEnMarcha />
        <header className="panel-header">
          <button
            type="button"
            className="panel-header-icono panel-menu-movil"
            aria-label={t.nav.abrir_menu}
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <Icono nombre="menu" />
          </button>
          <form className="panel-buscador" role="search" ref={buscadorRef} onSubmit={alBuscar}>
            <Icono nombre="buscar" />
            <input
              type="search"
              value={busqueda}
              placeholder={t.nav.buscar}
              aria-label={t.nav.buscar}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setBusquedaAbierta(true);
              }}
              onFocus={() => setBusquedaAbierta(true)}
            />
            {busquedaAbierta && texto.length >= 2 && (
              <ul className="panel-desplegable">
                {resultados.length === 0 ? (
                  <li className="panel-desplegable-nada">{t.nav.sin_resultados}</li>
                ) : (
                  resultados.map((resultado) => (
                    <li key={resultado.a}>
                      <NavLink to={resultado.a} onClick={() => setBusqueda('')}>
                        {resultado.texto}
                        <small>{resultado.detalle}</small>
                      </NavLink>
                    </li>
                  ))
                )}
              </ul>
            )}
          </form>
          <div className="panel-header-acciones">
            <div className="panel-notificaciones" ref={avisosRef}>
              <button
                type="button"
                className="panel-header-icono"
                aria-label={t.nav.notificaciones}
                aria-expanded={avisosAbiertos}
                onClick={() => setAvisosAbiertos((abierto) => !abierto)}
              >
                <Icono nombre="campana" />
                <Contador cantidad={totalAvisos} />
              </button>
              {avisosAbiertos && (
                <ul className="panel-desplegable">
                  {avisos.length === 0 ? (
                    <li className="panel-desplegable-nada">{t.nav.sin_notificaciones}</li>
                  ) : (
                    avisos.map((aviso) => (
                      <li key={aviso.a}>
                        <NavLink to={aviso.a}>
                          {aviso.texto}
                          <Contador cantidad={aviso.contador} />
                        </NavLink>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <NavLink to="/comunicacion" className="panel-header-icono" aria-label={t.nav.mensajes}>
              <Icono nombre="comunicacion" />
            </NavLink>
          </div>
        </header>
        {seccionActual && seccionActual.visibles.length > 1 && (
          <nav className="panel-subnav" aria-label={seccionActual.texto}>
            {seccionActual.visibles.map((enlace) => (
              <NavLink key={enlace.a} to={enlace.a} end={enlace.end}>
                {enlace.texto}
                <Contador cantidad={enlace.contador} />
              </NavLink>
            ))}
          </nav>
        )}
        <main className="panel-content" id="contenido-principal" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
