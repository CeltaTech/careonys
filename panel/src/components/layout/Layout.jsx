import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useEmpresa } from '../../context/EmpresaContext';
import { usePermisos } from '../../context/PermisosContext';
import { useModalidades } from '../../context/ModalidadesContext';
import { usePedidosDeCodigo } from '../../context/PedidosDeCodigoContext';
import { useTelefonosEsperando } from '../../context/TelefonosEsperandoContext';
import { useEmergenciasSinTomar } from '../../hooks/useEmergenciasSinTomar';
import { esAdminOSuperior } from '../../lib/roles';
import { MODALIDAD } from '../../lib/modalidades';
import { supabase } from '../../lib/supabaseClient';
import { SelectoresPreferencias } from './SelectoresPreferencias';
import { EquipoNuevo } from './EquipoNuevo';

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
  // Los contadores se preguntan solos cada tanto: del otro lado hay alguien esperando, y no puede
  // depender de que a alguien se le ocurra abrir esa sección.
  const { pedidos: pedidosDeCodigo } = usePedidosDeCodigo();
  const { cuentas: telefonosEsperando } = useTelefonosEsperando();
  const ubicacion = useLocation();
  const navegar = useNavigate();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [asistentesEncontrados, setAsistentesEncontrados] = useState([]);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const perfilRef = useRef(null);
  const buscadorRef = useRef(null);

  const esAdmin = esAdminOSuperior(usuario?.rol);
  // El nombre de cada modalidad sale de lib/modalidades.js, el mismo lugar del que lo toma el
  // candado de la dirección (App.jsx).
  const directa = tieneModalidad(MODALIDAD.DIRECTA);
  const match = tieneModalidad(MODALIDAD.MATCH);
  const hayPlantel = directa || match;
  const emergencias = useEmergenciasSinTomar(hayPlantel);

  /* El menú, como lista de datos. El candado de cada enlace (`ver`) está escrito una sola vez,
     al lado del enlace, y es el mismo que aplica la dirección en App.jsx. */
  const secciones = [
    {
      clave: 'panel',
      texto: t.nav.sec_panel,
      enlaces: [{ a: '/', texto: t.nav.sec_panel, ver: true, end: true }],
    },
    {
      clave: 'comunicaciones',
      texto: t.nav.sec_comunicaciones,
      enlaces: [
        { a: '/comunicacion', texto: t.nav.comunicacion, ver: true },
        { a: '/emergencias', texto: t.nav.emergencias, ver: hayPlantel, contador: emergencias.length },
        { a: '/alertas', texto: t.nav.alertas, ver: directa },
      ],
    },
    {
      clave: 'servicios',
      texto: t.nav.servicios,
      enlaces: [{ a: '/servicios', texto: t.nav.servicios, ver: true }],
    },
    {
      clave: 'guardias',
      texto: t.nav.sec_guardias,
      enlaces: [
        { a: '/guardias', texto: t.nav.guardias, ver: directa },
        { a: '/pase-de-guardia', texto: t.nav.pase_de_guardia, ver: hayPlantel, contador: pedidosDeCodigo.length },
        { a: '/continuidad', texto: t.nav.continuidad, ver: hayPlantel },
      ],
    },
    {
      clave: 'asistentes',
      texto: t.nav.sec_asistentes,
      enlaces: [
        { a: '/asistentes', texto: t.nav.asistentes, ver: hayPlantel },
        { a: '/documentacion', texto: t.nav.documentacion, ver: hayPlantel },
        { a: '/calificaciones', texto: t.nav.calificaciones, ver: hayPlantel },
      ],
    },
    {
      clave: 'capacitacion',
      texto: t.nav.sec_capacitacion,
      enlaces: [{ a: '/contenidos', texto: t.nav.sec_capacitacion, ver: true }],
    },
    {
      clave: 'clientes',
      texto: t.nav.sec_clientes,
      enlaces: [
        { a: '/solicitudes', texto: t.nav.solicitudes, ver: hayPlantel },
        { a: '/padron', texto: t.nav.padron, ver: esAdmin || puede('ver_padron') },
        { a: '/clientes', texto: t.nav.contratacion_directa, ver: directa },
      ],
    },
    {
      clave: 'tareas',
      grupo: 'gestion',
      texto: t.nav.sec_tareas,
      enlaces: [{ a: '/medicacion', texto: t.nav.medicacion, ver: directa }],
    },
    {
      clave: 'reclutamiento',
      grupo: 'gestion',
      texto: t.nav.sec_reclutamiento,
      enlaces: [{ a: '/postulaciones', texto: t.nav.postulaciones, ver: hayPlantel }],
    },
    {
      clave: 'facturacion',
      grupo: 'gestion',
      texto: t.nav.sec_facturacion,
      enlaces: [
        { a: '/facturacion', texto: t.nav.facturacion, ver: directa },
        { a: '/lista-precios', texto: t.nav.lista_precios, ver: directa },
        // Una remuneración es dato sensible: el Admin la ve siempre, el Coordinador sólo si su
        // Prestadora se lo habilitó.
        { a: '/pagos-asistentes', texto: t.nav.pagos_asistentes, ver: hayPlantel && (esAdmin || puede('ver_pagos_asistente')) },
      ],
    },
    {
      clave: 'reportes',
      grupo: 'gestion',
      texto: t.nav.sec_reportes,
      enlaces: [
        { a: '/reportes', texto: t.nav.reportes, ver: directa },
        { a: '/resumen-del-mes', texto: t.nav.resumen_del_mes, ver: true },
        { a: '/verificacion-guardias', texto: t.nav.verificacion_guardias, ver: hayPlantel },
        { a: '/informes-obra-social', texto: t.nav.informes_obra_social, ver: directa },
        { a: '/auditoria', texto: t.nav.auditoria, ver: esAdmin },
      ],
    },
    {
      clave: 'configuracion',
      grupo: 'gestion',
      texto: t.nav.sec_configuracion,
      enlaces: [
        { a: '/configuracion', texto: t.nav.configuracion, ver: esAdmin },
        { a: '/respuestas-preparadas', texto: t.nav.plantillas, ver: esAdmin },
        { a: '/usuarios-panel', texto: t.nav.usuarios_panel, ver: esAdmin },
        { a: '/importacion', texto: t.nav.importacion, ver: esAdmin || puede('importar_datos_masivos') },
        { a: '/habilitar-clave', texto: t.nav.habilitar_clave, ver: esAdmin || puede('habilitar_cambio_de_clave'), contador: telefonosEsperando.length },
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

  // Al cambiar de dirección se cierra todo lo desplegado.
  useEffect(() => {
    setMenuAbierto(false);
    setPerfilAbierto(false);
    setBusquedaAbierta(false);
  }, [ruta]);

  // Un clic afuera cierra el desplegable abierto.
  useEffect(() => {
    function alHacerClic(evento) {
      if (perfilRef.current && !perfilRef.current.contains(evento.target)) setPerfilAbierto(false);
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

  // El rótulo del grupo va una sola vez, antes de la primera sección visible que pertenece a él.
  const gruposVistos = new Set();
  const primeraDeGrupo = new Set();
  for (const seccion of secciones) {
    if (seccion.grupo && !gruposVistos.has(seccion.grupo)) {
      gruposVistos.add(seccion.grupo);
      primeraDeGrupo.add(seccion.clave);
    }
  }
  const rotuloDeGrupo = { gestion: t.nav.grupo_gestion };

  return (
    <div className={`panel-layout${menuAbierto ? ' menu-abierto' : ''}`}>
      <a className="salto-al-contenido" href="#contenido-principal">
        {t.nav.saltar_al_contenido}
      </a>
      <aside className="panel-sidebar">
        <div className="panel-logo">
          <div className="panel-logo-nombre">{empresa?.nombre ?? ''}</div>
          <div className="panel-logo-producto">{t.auth.con_tecnologia_de}</div>
        </div>
        <form className="panel-buscador" role="search" ref={buscadorRef} onSubmit={alBuscar}>
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
        <nav aria-label={t.nav.menu_principal}>
          {secciones.map((seccion) => (
            <Fragment key={seccion.clave}>
              {primeraDeGrupo.has(seccion.clave) && (
                <div className="panel-nav-grupo">{rotuloDeGrupo[seccion.grupo]}</div>
              )}
              <NavLink
                to={seccion.visibles[0].a}
                end={seccion.visibles[0].end}
                className={seccion === seccionActual ? 'active' : undefined}
                aria-current={seccion === seccionActual ? 'page' : undefined}
              >
                <span className="panel-nav-etiqueta">{seccion.texto}</span>
                <Contador cantidad={seccion.contador} />
              </NavLink>
            </Fragment>
          ))}
        </nav>
        <div className="panel-perfil" ref={perfilRef}>
          {perfilAbierto && (
            <div className="panel-perfil-menu">
              <NavLink to="/mi-cuenta">{t.nav.mi_cuenta}</NavLink>
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
        {/* Sólo en el teléfono: ahí la barra de la izquierda no entra y se abre encima. */}
        <div className="panel-telefono">
          <button
            type="button"
            className="panel-hamburguesa"
            aria-label={t.nav.abrir_menu}
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span className="panel-telefono-nombre">{empresa?.nombre ?? ''}</span>
        </div>
        {/* Mientras haya una emergencia que nadie tomó, la franja queda arriba en todas las páginas.
            Cuando alguien la toma sale de acá y sigue en Comunicaciones. */}
        {emergencias.length > 0 && (
          <div className="panel-franja-emergencia" role="alert">
            <span>{t.nav.emergencias}</span>
            <span className="panel-franja-cantidad">{emergencias.length}</span>
            <NavLink to="/emergencias" className="panel-franja-enlace">
              {t.comun.ver_detalle}
            </NavLink>
          </div>
        )}
        <main className="panel-content" id="contenido-principal" tabIndex={-1}>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
