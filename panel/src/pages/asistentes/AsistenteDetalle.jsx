import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useModalidades } from '../../context/ModalidadesContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { MODALIDAD } from '../../lib/modalidades';
import { pestanasDe } from '../../lib/pestanasDelAsistente';
import { supabase } from '../../lib/supabaseClient';
import { PerfilTab } from './PerfilTab';
import { VerificacionTab } from './VerificacionTab';
import { CertificadoTab } from './CertificadoTab';
import { MatriculasTab } from './MatriculasTab';
import { VinculoCeseTab } from './VinculoCeseTab';
import { SimuladorVinculoTab } from './SimuladorVinculoTab';
import { ScoreRiesgoTab } from './ScoreRiesgoTab';
import { DatosBancariosTab } from './DatosBancariosTab';
import { GuardiasTab } from './GuardiasTab';
import { EvaluacionesTab } from './EvaluacionesTab';
import { AusenciasCoberturaTab } from './AusenciasCoberturaTab';
import { ComunicacionTab } from './ComunicacionTab';
import { mensajeDeError } from '../../lib/errores';
import { Cabecera } from '../../components/ui/Cabecera';
import { Button } from '../../components/ui/Button';
import { CAMPOS_PAGO, CAMPOS_RESERVADOS, conDatosAparte } from '../../lib/fichaAsistente';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

export function AsistenteDetalle() {
  const { t, locale } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { tieneModalidad } = useModalidades();
  const { puede } = usePermisos();
  const [asistente, setAsistente] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('perfil');

  const esAdmin = esAdminOSuperior(usuario?.rol);
  const marketplace = tieneModalidad(MODALIDAD.MARKETPLACE);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    // Coordinador consulta la vista restringida (sin vínculo laboral) — ver schema_etapa2i.sql.
    // Los datos delicados son el caso aparte: viven en sus propias tablas y los piden
    // `CAMPOS_PAGO` y `CAMPOS_RESERVADOS`, donde la base exige el permiso correspondiente para
    // contestar. Ahí la restricción no depende de qué consulte la pantalla: las reglas de
    // acceso filtran filas y no columnas, así que separar la tabla es lo único que impide leer
    // el dato preguntando por fuera del Panel.
    const tabla = esAdmin ? 'asistentes' : 'asistentes_coordinador';
    const columnas = esAdmin ? `*, ${CAMPOS_PAGO}, ${CAMPOS_RESERVADOS}` : '*';
    const { data, error: errorConsulta } = await supabase.from(tabla).select(columnas).eq('id', id).single();
    if (errorConsulta) {
      setError(errorConsulta.code === 'PGRST116' ? null : mensajeDeError(errorConsulta, t));
      setEstado(errorConsulta.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }
    setAsistente(conDatosAparte(data));
    setEstado('listo');
  }, [id, esAdmin, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  if (estado === 'cargando') return <p className="estado-cargando">{t.comun.cargando}</p>;
  if (estado === 'no_encontrado') return <p className="estado-vacio">{t.comun.no_encontrado}</p>;
  if (estado === 'error') return <p className="estado-vacio">{error || t.comun.error_generico}</p>;

  const datosDeLaFicha = [
    t.asistentes[`estado_${asistente.estado}`],
    asistente.telefono,
    asistente.email,
    asistente.fecha_alta && `${t.asistentes.fecha_alta} ${new Date(asistente.fecha_alta).toLocaleDateString(locale)}`,
  ].filter(Boolean);

  return (
    <div>
      <Cabecera titulo={asistente.nombre}>
        <Button variant="secondary" onClick={() => navigate('/asistentes')}>
          <span aria-hidden="true">←</span> {t.asistentes.volver_al_plantel}
        </Button>
      </Cabecera>
      {datosDeLaFicha.length > 0 && (
        <div className="panel-mini hoja-ficha-datos">{datosDeLaFicha.join(' · ')}</div>
      )}

      <section className="panel-tarjeta">
        <div className="panel-tabs" role="tablist">
          {pestanasDe({ esAdmin, marketplace, puede }).map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={tab === tabId}
              className={`panel-tab ${tab === tabId ? 'panel-tab-activo' : ''}`}
              onClick={() => setTab(tabId)}
            >
              {t.asistentes.tabs[tabId]}
            </button>
          ))}
        </div>
      </section>

      <div className="panel-tab-contenido molde-pila">
        {tab === 'perfil' && <PerfilTab asistente={asistente} onActualizado={recargar} />}
        {tab === 'verificacion' && <VerificacionTab asistente={asistente} />}
        {tab === 'certificado' && <CertificadoTab asistente={asistente} />}
        {tab === 'matriculas' && esAdmin && <MatriculasTab asistente={asistente} />}
        {tab === 'vinculo_cese' && esAdmin && <VinculoCeseTab asistente={asistente} onActualizado={recargar} />}
        {tab === 'simulador' && esAdmin && <SimuladorVinculoTab asistente={asistente} />}
        {tab === 'score_riesgo' && esAdmin && <ScoreRiesgoTab asistente={asistente} onActualizado={recargar} />}
        {tab === 'datos_bancarios' && (esAdmin || puede('ver_datos_bancarios_asistente')) && (
          <DatosBancariosTab asistente={asistente} />
        )}
        {tab === 'guardias' && <GuardiasTab asistente={asistente} />}
        {tab === 'evaluaciones' && marketplace && <EvaluacionesTab asistente={asistente} />}
        {tab === 'ausencias' && <AusenciasCoberturaTab asistente={asistente} />}
        {tab === 'comunicacion' && <ComunicacionTab asistente={asistente} />}
      </div>
    </div>
  );
}
