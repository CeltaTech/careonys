import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { esAdminOSuperior } from '../lib/roles';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { EstadoLista } from '../components/layout/EstadoLista';
import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

// El plazo de aviso vive en "prestadoras", tabla de RLS exclusiva de superadmin — se pide acá
// por el mismo endpoint que ya usa Configuracion.jsx (backend con service role key), nunca por
// consulta directa del cliente a esa tabla.
async function obtenerDiasAvisoDocumentos() {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/configuracion/documentos-tipo`, {
    headers: { Authorization: `Bearer ${data.session?.access_token}` },
  });
  const resultado = await respuesta.json();
  if (!respuesta.ok) throw new Error(resultado.error);
  return resultado.dias_aviso_vencimiento_documentos;
}

function esHoy(fechaIso) {
  const hoy = new Date();
  const fecha = new Date(fechaIso);
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

function esEstaSemana(fechaIso) {
  const fecha = new Date(fechaIso);
  const ahora = new Date();
  const inicioSemana = new Date(ahora);
  inicioSemana.setDate(ahora.getDate() - ahora.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  return fecha >= inicioSemana;
}

export function Dashboard() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const postulaciones = useSupabaseTable('postulaciones');
  const solicitudes = useSupabaseTable('solicitudes');
  // Coordinador consulta la vista sin vínculo laboral/score de riesgo — ver schema_etapa2i.sql.
  const asistentes = useSupabaseTable(esAdmin ? 'asistentes' : 'asistentes_coordinador', { orderBy: 'created_at' });
  const clientes = useSupabaseTable('clientes', { orderBy: 'created_at' });
  const [ausentesSinRelevo, setAusentesSinRelevo] = useState(null);
  const [documentosPorVencer, setDocumentosPorVencer] = useState(null);
  const [errorAlertas, setErrorAlertas] = useState(null);

  const cargarAlertas = useCallback(async () => {
    if (!usuario?.prestadora_id) return;
    setAusentesSinRelevo(null);
    setDocumentosPorVencer(null);
    setErrorAlertas(null);

    const { count: countAusentes, error: errorAusentes } = await supabase
      .from('incidentes_relevo')
      .select('id', { count: 'exact', head: true })
      .is('resuelto_at', null)
      .is('guardia_saliente_id', null);

    // "prestadoras" es de RLS exclusiva de superadmin — el plazo configurable solo se puede
    // pedir por el endpoint backend (requiere rol admin+). Coordinador no tiene acceso a ese
    // endpoint, así que usa el mismo default del schema (schema_documentos_asistente.sql:82)
    // que ya usa el cron de vencimientos.js cuando no hay valor configurado.
    let diasAviso = 30;
    let errorPlazo = null;
    if (esAdmin) {
      try {
        diasAviso = await obtenerDiasAvisoDocumentos();
      } catch (err) {
        errorPlazo = err;
      }
    }

    let countDocumentos = null;
    let errorDocumentos = null;
    if (!errorPlazo) {
      const limite = new Date();
      limite.setDate(limite.getDate() + (diasAviso ?? 30));
      const limiteISO = limite.toISOString().slice(0, 10);
      const respuesta = await supabase
        .from('documentos_asistente')
        .select('id', { count: 'exact', head: true })
        .not('fecha_vencimiento', 'is', null)
        .lte('fecha_vencimiento', limiteISO);
      countDocumentos = respuesta.count;
      errorDocumentos = respuesta.error;
    }

    if (errorAusentes || errorPlazo || errorDocumentos) {
      setErrorAlertas(t.comun.error_generico);
      return;
    }
    setAusentesSinRelevo(countAusentes ?? 0);
    setDocumentosPorVencer(countDocumentos ?? 0);
  }, [usuario?.prestadora_id, esAdmin, t]);

  useEffect(() => {
    cargarAlertas();
  }, [cargarAlertas]);

  const estados = [postulaciones.estado, solicitudes.estado, asistentes.estado, clientes.estado];
  const estadoGeneral = estados.includes('error')
    ? 'error'
    : estados.includes('cargando')
      ? 'cargando'
      : 'listo';

  const postulacionesHoy = postulaciones.filas.filter((p) => esHoy(p.creado_en)).length;
  const postulacionesSemana = postulaciones.filas.filter((p) => esEstaSemana(p.creado_en)).length;
  const solicitudesPendientes = solicitudes.filas.filter((s) => s.estado === 'nueva').length;
  const asistentesDisponibles = asistentes.filas.filter((a) => a.estado === 'activo').length;
  const clientesActivas = clientes.filas.filter((f) => !f.deleted_at).length;

  return (
    <div>
      <h1>{t.dashboard.titulo}</h1>
      <EstadoLista
        estado={estadoGeneral}
        error={postulaciones.error || solicitudes.error || asistentes.error || clientes.error}
        vacio={false}
        recargar={() => {
          postulaciones.recargar();
          solicitudes.recargar();
          asistentes.recargar();
          clientes.recargar();
        }}
      >
        <div className="dashboard-metricas">
          <div className="metrica-card">
            <span className="metrica-valor">{postulacionesHoy}</span>
            <span className="metrica-label">{t.dashboard.postulaciones_hoy}</span>
          </div>
          <div className="metrica-card">
            <span className="metrica-valor">{postulacionesSemana}</span>
            <span className="metrica-label">{t.dashboard.postulaciones_semana}</span>
          </div>
          <div className="metrica-card">
            <span className="metrica-valor">{solicitudesPendientes}</span>
            <span className="metrica-label">{t.dashboard.solicitudes_pendientes}</span>
          </div>
          <div className="metrica-card">
            <span className="metrica-valor">{asistentesDisponibles}</span>
            <span className="metrica-label">{t.dashboard.asistentes_disponibles}</span>
          </div>
          <div className="metrica-card">
            <span className="metrica-valor">{clientesActivas}</span>
            <span className="metrica-label">{t.dashboard.clientes_activas}</span>
          </div>
        </div>
      </EstadoLista>

      <EstadoLista
        estado={errorAlertas ? 'error' : ausentesSinRelevo === null ? 'cargando' : 'listo'}
        error={errorAlertas}
        vacio={false}
        recargar={cargarAlertas}
      >
        <div className="dashboard-metricas">
          <Link to="/continuidad" className={`metrica-card${ausentesSinRelevo > 0 ? ' metrica-card-alerta' : ''}`}>
            <span className="metrica-valor">{ausentesSinRelevo}</span>
            <span className="metrica-label">{t.dashboard.ausentes_sin_relevo}</span>
          </Link>
          <Link to="/asistentes" className={`metrica-card${documentosPorVencer > 0 ? ' metrica-card-alerta' : ''}`}>
            <span className="metrica-valor">{documentosPorVencer}</span>
            <span className="metrica-label">{t.dashboard.documentacion_por_vencer}</span>
          </Link>
        </div>
      </EstadoLista>
    </div>
  );
}
