import { useLocale } from '../i18n/LocaleContext';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { EstadoLista } from '../components/layout/EstadoLista';

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
  const postulaciones = useSupabaseTable('postulaciones');
  const solicitudes = useSupabaseTable('solicitudes');
  const asistentes = useSupabaseTable('asistentes', { orderBy: 'created_at' });
  const clientes = useSupabaseTable('clientes', { orderBy: 'created_at' });

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
    </div>
  );
}
