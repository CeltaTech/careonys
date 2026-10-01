import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { iniciarSincronizacionAutomatica } from '../lib/sincronizarCola';
import { useMarca, useOfreceMatch } from '../context/PerfilContext';
import { con } from '../lib/textos';
import { api } from '../lib/api';

const claseDeLaPestana = ({ isActive }) => (isActive ? 'active' : '');

// La pestaña Guardias queda encendida también en las guardias ofrecidas, que cuelgan de ella.
const ES_GUARDIAS = /^\/(guardias|ofertas)(\/|$)/;

export default function Layout() {
  const { pathname } = useLocation();
  const { t } = useLocale();
  const marca = useMarca();
  const ofreceMatch = useOfreceMatch();

  // Cuántas guardias le ofrecieron y todavía no contestó. El número va en la pestaña de abajo
  // porque una oferta con fecha límite que nadie mira es una oferta perdida: si hubiera que
  // entrar a la pantalla para enterarse de que hay algo, la pantalla no serviría de nada.
  //
  // Se pregunta una sola vez, cuando la aplicación arranca. Después lo mantiene al día la
  // propia pantalla de ofertas, que es la única que lo puede cambiar.
  const [ofertasAbiertas, setOfertasAbiertas] = useState(0);

  // Reintento de check-in/reporte guardados sin señal — solo con sesión activa (Fase 9).
  useEffect(() => {
    iniciarSincronizacionAutomatica();
  }, []);

  useEffect(() => {
    let activo = true;
    api
      .ofertas()
      .then(({ ofertas }) => {
        if (activo) setOfertasAbiertas((ofertas ?? []).length);
      })
      .catch(() => {
        // Sin señal o con el backend caído no se muestra ningún número. Un cero inventado sería
        // peor que no decir nada: haría creer que no hay nada esperando.
      });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="pwa-shell">
      {/* Arriba va la Prestadora, que es para quien el Asistente trabaja. Si cargó su logo
          se muestra el logo; si no, su nombre escrito. Mientras el nombre viaja queda el
          espacio vacío: es preferible a mostrar un nombre que después cambia.
          El nombre no es un encabezado: el único título de la pantalla es el de la pantalla
          que se está mirando. */}
      <header className="pwa-top">
        {marca.logoUrl ? (
          <img className="logo-prestadora" src={marca.logoUrl} alt={marca.nombre || ''} />
        ) : (
          <p className="nombre-prestadora">{marca.nombre || ''}</p>
        )}
        <div className="mini mini-arriba">{t.barra.rol}</div>
      </header>
      <main className="pwa-body">
        <Outlet context={{ avisarOfertas: setOfertasAbiertas, ofertasAbiertas }} />
        {/* La única mención del producto en toda la aplicación, y al pie. Va siempre: es el
            crédito de quién hizo el software, no una función que se venda. */}
        <p className="marca-del-producto">{t.marca.con_tecnologia_de}</p>
      </main>
      {/* La barra de abajo lleva nombre: sin él, un lector de pantalla anuncia enlaces sueltos
          en vez de una zona por la que se puede saltar de una vez. */}
      <nav className="pwa-nav" aria-label={t.nav.menu_principal}>
        <NavLink to="/inicio" className={claseDeLaPestana}>
          {t.nav.inicio}
        </NavLink>
        {/* Las guardias ofrecidas cuelgan de Guardias, así que el número de las que esperan
            respuesta va en esta pestaña. Dibujado se entiende por dónde está; dicho en voz alta,
            un "3" suelto no dice de qué es, así que al lado va la frase entera, que no se ve. */}
        <NavLink to="/guardias" className={() => (ES_GUARDIAS.test(pathname) ? 'active' : '')}>
          {t.nav.guardias}
          {ofertasAbiertas > 0 && (
            <>
              <span className="nav-cuenta" aria-hidden="true">{ofertasAbiertas}</span>
              <span className="solo-lectores-pantalla">
                {ofertasAbiertas === 1
                  ? t.nav.ofertas_sin_contestar_una
                  : con(t.nav.ofertas_sin_contestar, { n: ofertasAbiertas })}
              </span>
            </>
          )}
        </NavLink>
        <NavLink to="/servicio" className={claseDeLaPestana}>
          {t.nav.servicio}
        </NavLink>
        {/* El chat con los Clientes de la vidriera. Sólo aparece donde la Prestadora trabaja
            de esa manera: en una que asigna ella a su gente no hay ninguna conversación. */}
        {ofreceMatch && (
          <NavLink to="/mensajes" className={claseDeLaPestana}>
            {t.nav.mensajes}
          </NavLink>
        )}
      </nav>
    </div>
  );
}
