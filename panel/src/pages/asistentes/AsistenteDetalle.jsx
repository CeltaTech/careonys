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
import { DatosBancariosTab } from './DatosBancariosTab';
import { GuardiasTab } from './GuardiasTab';
import { EvaluacionesTab } from './EvaluacionesTab';
import { AusenciasCoberturaTab } from './AusenciasCoberturaTab';
import { ComunicacionTab } from './ComunicacionTab';
import { DesactivarAsistenteModal } from './DesactivarAsistenteModal';
import { mensajeDeError } from '../../lib/errores';
import { useDocumentosDelAsistente } from '../../hooks/useDocumentosDelAsistente';
import { documentosPendientes, graciaVigente } from '../../lib/documentos';
import { hoyISO } from '../../lib/horarios';
import { con } from '../../lib/textos';
import { Alert } from '../../components/ui/Alert';
import { Cabecera } from '../../components/ui/Cabecera';
import { Button } from '../../components/ui/Button';
import { CAMPOS_DOMICILIO, CAMPOS_PAGO, CAMPOS_RELACION_LABORAL, CAMPOS_RESERVADOS, conDatosAparte } from '../../lib/datosAparteDelAsistente';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

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
  const [desactivando, setDesactivando] = useState(false);

  const esAdmin = esAdminOSuperior(usuario?.rol);
  const puedeDarDeBaja = esAdmin || puede('gestionar_asistentes');
  const documentosDelAsistente = useDocumentosDelAsistente(id);
  const intermediacion = tieneModalidad(MODALIDAD.INTERMEDIACION);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    // El Coordinador consulta la vista restringida. Los datos delicados viven en sus propias
    // tablas, donde la base exige el permiso correspondiente para contestar: las reglas de acceso
    // filtran filas y no columnas, así que separar la tabla es lo único que impide leer el dato
    // preguntando por fuera del Panel.
    const tabla = esAdmin ? 'asistentes' : 'asistentes_coordinador';
    const columnas = esAdmin
      ? `*, cuenta_desactivada, ${CAMPOS_PAGO}, ${CAMPOS_RESERVADOS}, ${CAMPOS_DOMICILIO}, ${CAMPOS_RELACION_LABORAL}`
      : '*';
    const { data, error: errorConsulta } = await supabase.from(tabla).select(columnas).eq('id', id).single();
    if (errorConsulta) {
      setError(errorConsulta.code === 'PGRST116' ? null : mensajeDeError(errorConsulta, t));
      setEstado(errorConsulta.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }
    // La vista del Coordinador no trae la cuenta. Con el permiso de dar de baja la necesita para
    // saber si hay qué desactivar; si la consulta falla, el botón no aparece.
    let cuenta = {};
    if (!esAdmin && puedeDarDeBaja) {
      const { data: deLaCuenta } = await supabase.from('asistentes').select('usuario_id, cuenta_desactivada').eq('id', id).maybeSingle();
      cuenta = deLaCuenta ?? {};
    }
    // El domicilio y la relación laboral, sólo si la Prestadora le dio el permiso de verlos.
    const aparte = {};
    if (!esAdmin && puede('ver_domicilio_asistente')) {
      const { data: suDomicilio } = await supabase
        .from('domicilio_asistente')
        .select('domicilio, calle, numero, piso, unidad, lugar_id, codigo_postal, lat, lng')
        .eq('asistente_id', id)
        .maybeSingle();
      aparte.domicilio_asistente = suDomicilio;
    }
    if (!esAdmin && puede('ver_relacion_laboral_asistente')) {
      const { data: suRelacion } = await supabase
        .from('relacion_laboral_asistente')
        .select('relacion_laboral_id')
        .eq('asistente_id', id)
        .maybeSingle();
      aparte.relacion_laboral_asistente = suRelacion;
    }
    setAsistente(conDatosAparte({ ...data, ...cuenta, ...aparte }));
    setEstado('listo');
  }, [id, esAdmin, puedeDarDeBaja, puede, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  if (estado === 'cargando') return <p className="estado-cargando">{t.comun.cargando}</p>;
  if (estado === 'no_encontrado') return <p className="estado-vacio">{t.comun.no_encontrado}</p>;
  if (estado === 'error') return <p className="estado-vacio">{error || t.comun.error_generico}</p>;

  const datosDelAsistente = [
    t.asistentes[`estado_${asistente.estado}`],
    asistente.telefono,
    asistente.email,
    asistente.fecha_alta && `${t.asistentes.fecha_alta} ${new Date(asistente.fecha_alta).toLocaleDateString(locale)}`,
  ].filter(Boolean);

  // La franja de documentos la ve todo el que abre el Legajo: quien asigna turnos tiene que saber
  // que este Asistente no puede trabajar. Si la lista no se pudo leer, la franja no se muestra.
  const pendientes = documentosDelAsistente.estado === 'listo' ? documentosPendientes(documentosDelAsistente.documentos) : [];
  const gracia = pendientes.length ? graciaVigente(documentosDelAsistente.documentos, hoyISO()) : null;

  return (
    <div>
      <Cabecera titulo={asistente.nombre}>
        <Button variant="secondary" onClick={() => navigate('/asistentes')}>
          <span aria-hidden="true">←</span> {t.asistentes.volver_al_padron}
        </Button>
        {/* Desactivar es parte de «Alta, baja y modificación de Asistentes», y sólo hay qué desactivar si el Asistente tiene cuenta. */}
        {puedeDarDeBaja && asistente.usuario_id && asistente.cuenta_desactivada === false && (
          <Button variant="secondary" onClick={() => setDesactivando(true)}>
            {t.asistentes.cuenta.desactivar}
          </Button>
        )}
      </Cabecera>
      {desactivando && (
        <DesactivarAsistenteModal
          asistente={asistente}
          onClose={() => setDesactivando(false)}
          onDesactivado={() => navigate('/asistentes', { state: { aviso: t.asistentes.cuenta.desactivado } })}
        />
      )}
      {datosDelAsistente.length > 0 && (
        <div className="panel-mini tarjeta-ficha-datos">{datosDelAsistente.join(' · ')}</div>
      )}
      {pendientes.length > 0 && (
        <Alert variant="warning">
          {con(t.documentos_asistente.pendientes, { documentos: pendientes.join(', ') })}
          {gracia && ` ${con(t.documentos_asistente.en_gracia, { fecha: new Date(`${gracia}T00:00:00`).toLocaleDateString(locale) })}`}
        </Alert>
      )}

      <section className="panel-tarjeta">
        <div className="panel-tabs" role="tablist">
          {pestanasDe({ esAdmin, intermediacion, puede }).map((tabId) => (
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
        {tab === 'perfil' && <PerfilTab asistente={asistente} onActualizado={recargar} documentosDelAsistente={documentosDelAsistente} />}
        {tab === 'verificacion' && <VerificacionTab asistente={asistente} />}
        {tab === 'certificado' && <CertificadoTab asistente={asistente} />}
        {tab === 'datos_bancarios' && (esAdmin || puede('ver_datos_bancarios_asistente')) && (
          <DatosBancariosTab asistente={asistente} />
        )}
        {tab === 'guardias' && <GuardiasTab asistente={asistente} />}
        {tab === 'evaluaciones' && intermediacion && <EvaluacionesTab asistente={asistente} />}
        {tab === 'ausencias' && <AusenciasCoberturaTab asistente={asistente} />}
        {tab === 'comunicacion' && <ComunicacionTab asistente={asistente} />}
      </div>
    </div>
  );
}
