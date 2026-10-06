import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PerfilProvider, useOfreceMatch, useSeVe } from './context/PerfilContext';
import { PersonasAutorizadasProvider, usePersonasAutorizadas } from './context/PersonasAutorizadasContext';
import { LocaleProvider, useLocale } from './i18n/LocaleContext';
import { pantallaPermitida } from './lib/interruptorDeCadaPantalla';
import Layout from './components/Layout';
import Login from './pages/Login';
import ActivarCuenta from './pages/ActivarCuenta';
import ClaveNueva from './pages/ClaveNueva';
import MisPacientes from './pages/MisPacientes';
import PacienteDetalle from './pages/PacienteDetalle';
import Guardias from './pages/Guardias';
import Reportes from './pages/Reportes';
import ReporteDetalle from './pages/ReporteDetalle';
import Alertas from './pages/Alertas';
import AsistenteAsignado from './pages/AsistenteAsignado';
import EscanearAsistente from './pages/EscanearAsistente';
import AccesoMatch from './pages/AccesoMatch';
import Facturas from './pages/Facturas';
import FacturaDetalle from './pages/FacturaDetalle';
import Medicacion from './pages/Medicacion';
import Contenidos from './pages/Contenidos';
import MiPerfil from './pages/MiPerfil';
import MiClave from './pages/MiClave';
import FirmarInstruccion from './pages/FirmarInstruccion';
import CodigoParaElAsistente from './pages/CodigoParaElAsistente';
import BuscarAsistentes from './pages/BuscarAsistentes';
import PerfilPublicoAsistente from './pages/PerfilPublicoAsistente';
import Mensajes from './pages/Mensajes';
import Conversacion from './pages/Conversacion';

function RutaPrivada({ children }) {
  const { session, estado } = useAuth();
  const { t } = useLocale();
  if (estado === 'cargando') return <div className="pantalla-cargando estado-cargando">{t.comun.cargando}</div>;
  // No se pudo averiguar quién entró. Se lo dice, en vez de dejarla pasar sin ficha y mostrarle
  // una aplicación vacía como si no tuviera nada.
  if (estado === 'error') {
    return (
      <div className="pantalla-cargando">
        <div className="alert alert-error" role="alert">{t.comun.error_generico}</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

// Una pantalla apagada no alcanza con sacarla del menú: quien escriba la dirección a mano
// tiene que terminar en el mismo lugar que quien no encuentra el botón.
//
// Son dos decisiones distintas y las dos tienen que decir que sí: qué ofrece la Prestadora en
// toda su aplicación, y qué instruyó el titular de la cuenta para cada una de sus personas autorizadas.
// Una pantalla puede no tener ninguna de las dos, o tener una sola; lo que no está declarado no
// restringe nada, y las dos claves salen del mismo archivo.
//
// Mientras la respuesta del perfil no llegó, las dos preguntas contestan que sí a todo, así que
// nadie queda expulsado de una pantalla por un dato que todavía está viajando.
function PantallaPermitida({ pantalla, children }) {
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();

  if (!pantallaPermitida(pantalla, seVe, puedeVer)) return <Navigate to="/pacientes" replace />;
  return children;
}

// La vidriera no cuelga de un interruptor de los que la Prestadora enciende y apaga: cuelga de
// la modalidad en la que trabaja, que es otra cosa y ya está decidida en otro lado. El candado
// de verdad está en el backend, que contesta que no ofrece esa modalidad; esto es para que no
// quede una dirección que lleve a una pantalla de error.
function SoloConMatch({ children }) {
  if (!useOfreceMatch()) return <Navigate to="/pacientes" replace />;
  return children;
}

function Rutas() {
  const { session, cargando } = useAuth();
  const { t } = useLocale();

  return (
    <Routes>
      <Route
        path="/login"
        element={cargando ? <div className="estado-cargando" role="status">{t.comun.cargando}</div> : session ? <Navigate to="/pacientes" replace /> : <Login />}
      />
      <Route path="/activar-cuenta" element={<ActivarCuenta />} />
      {/* Adonde apunta el enlace del correo de recuperación. Va afuera del guardián de sesión
          porque quien llega acá perdió justamente la forma de tener una. */}
      <Route path="/clave-nueva" element={<ClaveNueva />} />
      <Route
        path="/"
        element={
          <RutaPrivada>
            <Layout />
          </RutaPrivada>
        }
      >
        <Route index element={<Navigate to="/pacientes" replace />} />
        <Route path="pacientes" element={<MisPacientes />} />
        <Route path="pacientes/:id" element={<PacienteDetalle />} />
        {/* La semana de guardias no va detrás de un interruptor de la Prestadora: saber quién
            viene y cuándo es para qué existe la aplicación del Cliente, no una función que una
            Prestadora elija ofrecer o no. El titular sí le puede negar la agenda a una de sus
            personas autorizadas, que es otra decisión y de otro. */}
        <Route
          path="pacientes/:id/guardias"
          element={
            <PantallaPermitida pantalla="guardias">
              <Guardias />
            </PantallaPermitida>
          }
        />
        <Route
          path="pacientes/:id/reportes"
          element={
            <PantallaPermitida pantalla="reportes">
              <Reportes />
            </PantallaPermitida>
          }
        />
        {/* El detalle va detrás del mismo acceso que la lista: sin esto, quien no tiene los
            reportes no ve la lista pero abre uno escribiendo la dirección. */}
        <Route
          path="pacientes/:id/reportes/:reporteId"
          element={
            <PantallaPermitida pantalla="reportes">
              <ReporteDetalle />
            </PantallaPermitida>
          }
        />
        <Route
          path="pacientes/:id/alertas"
          element={
            <PantallaPermitida pantalla="alertas">
              <Alertas />
            </PantallaPermitida>
          }
        />
        <Route path="pacientes/:id/asistente" element={<AsistenteAsignado />} />
        <Route
          path="pacientes/:id/escanear-asistente"
          element={
            <PantallaPermitida pantalla="escanearAsistente">
              <EscanearAsistente />
            </PantallaPermitida>
          }
        />
        <Route
          path="pacientes/:id/acceso"
          element={
            <PantallaPermitida pantalla="acceso">
              <AccesoMatch />
            </PantallaPermitida>
          }
        />
        <Route
          path="pacientes/:id/medicacion"
          element={
            <PantallaPermitida pantalla="medicacion">
              <Medicacion />
            </PantallaPermitida>
          }
        />
        {/* El código que se le muestra al Asistente que llega (pendiente #113). No va colgado de
            un Paciente porque el código es del Cliente entero, y no lleva guardián
            porque cualquiera de sus personas autorizadas puede ser quien esté en la casa cuando toquen el
            timbre. El backend pide lo mismo: tener sesión de Cliente y nada más. */}
        {/* Las facturas no cuelgan de un Paciente: se le factura al Cliente entero, y
            una misma factura puede tener renglones de más de una persona cuidada. El detalle va
            detrás del mismo par de decisiones que la lista, o quien no tiene el dinero no ve la
            lista pero abre una factura escribiendo la dirección. */}
        <Route
          path="facturas"
          element={
            <PantallaPermitida pantalla="facturas">
              <Facturas />
            </PantallaPermitida>
          }
        />
        <Route
          path="facturas/:facturaId"
          element={
            <PantallaPermitida pantalla="facturas">
              <FacturaDetalle />
            </PantallaPermitida>
          }
        />
        {/* La vidriera de Match. No cuelga de un Paciente: se busca un Asistente antes
            de decidir para quién, y la misma búsqueda sirve para todas las personas autorizadas. */}
        <Route
          path="buscar"
          element={
            <SoloConMatch>
              <BuscarAsistentes />
            </SoloConMatch>
          }
        />
        <Route
          path="buscar/:id"
          element={
            <SoloConMatch>
              <PerfilPublicoAsistente />
            </SoloConMatch>
          }
        />
        {/* El chat con la gente de la vidriera. Cuelga de la misma modalidad que la vidriera:
            donde la Prestadora no ofrece Match no hay con quién hablar. */}
        <Route
          path="mensajes"
          element={
            <SoloConMatch>
              <Mensajes />
            </SoloConMatch>
          }
        />
        <Route
          path="mensajes/:id"
          element={
            <SoloConMatch>
              <Conversacion />
            </SoloConMatch>
          }
        />
        {/* Lo que la Prestadora escribió para quien cuida en su casa. No lleva guardián: no
            cuelga de un Paciente ni de una modalidad, y no muestra nada de nadie. Lo que no
            está publicado no sale del backend, así que acá no hay nada que adivinar. */}
        <Route path="contenidos" element={<Contenidos />} />
        <Route path="codigo" element={<CodigoParaElAsistente />} />
        <Route path="perfil" element={<MiPerfil />} />
        {/* Cambiar la propia clave estando adentro. No lleva guardián más allá de la sesión:
            cualquiera que entró puede cambiar la suya, y la pantalla pide la actual antes. */}
        <Route path="mi-clave" element={<MiClave />} />
        {/* No lleva guardián: quién tiene una instrucción para firmar lo contesta el backend, y
            quien no tiene ninguna ve que no hay ninguna. Adivinarlo acá dejaría al titular
            afuera de su propia pantalla mientras el perfil todavía viaja. */}
        <Route path="instruccion" element={<FirmarInstruccion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <PerfilProvider>
          <PersonasAutorizadasProvider>
            <BrowserRouter>
              <Rutas />
            </BrowserRouter>
          </PersonasAutorizadasProvider>
        </PerfilProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
