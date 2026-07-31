import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LocaleProvider } from './i18n/LocaleContext';
import { PreferenciasVistaProvider } from './context/PreferenciasVistaContext';
import { AuthProvider } from './context/AuthContext';
import { EmpresaProvider } from './context/EmpresaContext';
import { PermisosProvider } from './context/PermisosContext';
import { ModalidadesProvider } from './context/ModalidadesContext';
import { TenantSessionProvider } from './context/TenantSessionContext';
import { AdvertenciaLegalProvider } from './context/AdvertenciaLegalContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Mfa } from './pages/Mfa';
import { Dashboard } from './pages/Dashboard';
import { Postulaciones } from './pages/Postulaciones';
import { Solicitudes } from './pages/Solicitudes';
import { Asistentes } from './pages/Asistentes';
import { AsistenteDetalle } from './pages/asistentes/AsistenteDetalle';
import { Clientes } from './pages/Clientes';
import { ClienteDetalle } from './pages/clientes/ClienteDetalle';
import { Guardias } from './pages/Guardias';
import { Reportes } from './pages/Reportes';
import { Alertas } from './pages/Alertas';
import { Comunicacion } from './pages/Comunicacion';
import { Evv } from './pages/Evv';
import { Facturacion } from './pages/Facturacion';
import { Documentacion } from './pages/Documentacion';
import { Continuidad } from './pages/Continuidad';
import { ListaPrecios } from './pages/ListaPrecios';
import { UsuariosPanel } from './pages/UsuariosPanel';
import { Prestadoras } from './pages/Prestadoras';
import { CostosIA } from './pages/CostosIA';
import { Configuracion } from './pages/Configuracion';
import { Medicacion } from './pages/Medicacion';
import { Importacion } from './pages/Importacion';
import { InformesObraSocial } from './pages/InformesObraSocial';
import { Auditoria } from './pages/Auditoria';
import { MatchClientes } from './pages/match/Clientes';
import { MatchCalificaciones } from './pages/match/Calificaciones';
import { MatchAuditoriaLegal } from './pages/match/AuditoriaLegal';

function App() {
  return (
    <LocaleProvider>
      {/* El tema y la densidad van bien afuera, envolviendo todo: valen también para la
          pantalla de ingreso, que está fuera del Layout. */}
      <PreferenciasVistaProvider>
      <EmpresaProvider>
        <AuthProvider>
          <PermisosProvider>
          <ModalidadesProvider>
          <TenantSessionProvider>
            <AdvertenciaLegalProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/mfa" element={<Mfa />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="postulaciones" element={<Postulaciones />} />
                    <Route path="solicitudes" element={<Solicitudes />} />
                    <Route path="asistentes" element={<Asistentes />} />
                    <Route path="asistentes/:id" element={<AsistenteDetalle />} />
                    <Route path="clientes" element={<Clientes />} />
                    <Route path="clientes/:id" element={<ClienteDetalle />} />
                    <Route path="medicacion" element={<Medicacion />} />
                    <Route path="guardias" element={<Guardias />} />
                    <Route path="reportes" element={<Reportes />} />
                    <Route path="alertas" element={<Alertas />} />
                    <Route path="comunicacion" element={<Comunicacion />} />
                    <Route path="verificacion-guardias" element={<Evv />} />
                    <Route path="facturacion" element={<Facturacion />} />
                    <Route path="documentacion" element={<Documentacion />} />
                    <Route path="continuidad" element={<Continuidad />} />
                    <Route path="lista-precios" element={<ListaPrecios />} />
                    <Route path="importacion" element={<Importacion />} />
                    <Route path="informes-obra-social" element={<InformesObraSocial />} />
                    <Route path="usuarios-panel" element={<ProtectedRoute soloAdmin><UsuariosPanel /></ProtectedRoute>} />
                    <Route path="prestadoras" element={<ProtectedRoute roles={['superadmin']}><Prestadoras /></ProtectedRoute>} />
                    <Route path="costos-ia" element={<ProtectedRoute roles={['superadmin']}><CostosIA /></ProtectedRoute>} />
                    <Route path="configuracion" element={<ProtectedRoute soloAdmin><Configuracion /></ProtectedRoute>} />
                    <Route path="auditoria" element={<ProtectedRoute roles={['admin_prestadora', 'superadmin']}><Auditoria /></ProtectedRoute>} />
                    <Route
                      path="match/clientes"
                      element={
                        <ProtectedRoute roles={['admin_prestadora', 'coordinador', 'superadmin']}>
                          <MatchClientes />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="match/calificaciones"
                      element={
                        <ProtectedRoute roles={['admin_prestadora', 'coordinador', 'superadmin']}>
                          <MatchCalificaciones />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="match/auditoria-legal"
                      element={
                        <ProtectedRoute roles={['admin_prestadora', 'coordinador', 'superadmin']}>
                          <MatchAuditoriaLegal />
                        </ProtectedRoute>
                      }
                    />
                  </Route>
                </Routes>
              </BrowserRouter>
            </AdvertenciaLegalProvider>
          </TenantSessionProvider>
          </ModalidadesProvider>
          </PermisosProvider>
        </AuthProvider>
      </EmpresaProvider>
      </PreferenciasVistaProvider>
    </LocaleProvider>
  );
}

export default App;
