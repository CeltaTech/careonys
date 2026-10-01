import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { useMarca, useOfreceMatch, useSeVe } from '../context/PerfilContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { pantallaPermitida } from '../lib/interruptorDeCadaPantalla';

// El Paciente que se está mirando, sacado de la dirección. Las pestañas Guardias y Servicio son
// de un Paciente, así que necesitan saber de cuál.
const PACIENTE_EN_LA_DIRECCION = /^\/pacientes\/([^/]+)/;
// Inicio es la lista y la ficha de un Paciente; las pantallas que cuelgan de él no.
const ES_INICIO = /^\/pacientes(\/[^/]+)?\/?$/;

const claseDeLaPestana = ({ isActive }) => (isActive ? 'active' : '');

export default function Layout() {
  const { usuario } = useAuth();
  const { t } = useLocale();
  const marca = useMarca();
  const ofreceMatch = useOfreceMatch();
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();
  const { pathname } = useLocation();

  // Se recuerda el último Paciente abierto, para que Guardias y Servicio sigan apuntando a él
  // mientras se recorren las pantallas de las personas autorizadas, que no lo llevan en la dirección.
  const [pacienteId, setPacienteId] = useState(null);
  const enLaDireccion = pathname.match(PACIENTE_EN_LA_DIRECCION)?.[1] || null;
  useEffect(() => {
    if (enLaDireccion) setPacienteId(enLaDireccion);
  }, [enLaDireccion]);
  const paciente = enLaDireccion || pacienteId;
  const destino = (tramo) => (paciente ? `/pacientes/${paciente}/${tramo}` : '/pacientes');

  return (
    <div className="pwa-shell">
      {/* Arriba va la Prestadora, que es a quien el Cliente llamó. Si cargó su logo se
          muestra el logo; si no, su nombre escrito. Mientras el nombre viaja queda el
          espacio vacío: es preferible a mostrar un nombre que después cambia.
          El nombre no va como `h1`: el `h1` es el título de la pantalla que se está mirando,
          y hay uno solo por pantalla. */}
      <header className="pwa-top">
        {marca.logoUrl ? (
          <img className="logo-prestadora" src={marca.logoUrl} alt={marca.nombre || ''} />
        ) : (
          <p className="nombre-prestadora">{marca.nombre || ''}</p>
        )}
        {usuario?.nombre && <div className="mini mini-arriba">{usuario.nombre}</div>}
      </header>
      <main className="pwa-body">
        <Outlet />
        {/* La única mención del producto en toda la aplicación, y al pie. Va siempre: es el
            crédito de quién hizo el software, no una función que se venda. */}
        <p className="marca-del-producto">{t.marca.con_tecnologia_de}</p>
      </main>
      {/* La zona de navegación lleva nombre: sin él, un lector de pantalla anuncia "navegación"
          a secas, y si mañana hay dos zonas de navegación en la misma pantalla no hay forma de
          distinguirlas. */}
      <nav className="pwa-nav" aria-label={t.nav.menu_principal}>
        <NavLink to="/pacientes" end className={() => (ES_INICIO.test(pathname) ? 'active' : '')}>
          {t.nav.inicio}
        </NavLink>
        {/* La misma pregunta que hace la ruta: si contestaran distinto quedaría una pestaña que
            rebota. */}
        {pantallaPermitida('guardias', seVe, puedeVer) && (
          <NavLink to={destino('guardias')} className={paciente ? claseDeLaPestana : () => ''}>
            {t.nav.guardias}
          </NavLink>
        )}
        <NavLink to={destino('asistente')} className={paciente ? claseDeLaPestana : () => ''}>
          {t.nav.servicio}
        </NavLink>
        {/* El chat con la gente de la vidriera cuelga de lo mismo que la vidriera: donde la
            Prestadora no ofrece esa modalidad no hay con quién hablar. */}
        {ofreceMatch && (
          <NavLink to="/mensajes" className={claseDeLaPestana}>
            {t.nav.mensajes}
          </NavLink>
        )}
      </nav>
    </div>
  );
}
