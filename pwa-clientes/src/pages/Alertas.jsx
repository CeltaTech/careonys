import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { mensajeDeError } from '../lib/errores';
import ContactarALaPrestadora from '../components/ContactarALaPrestadora';

export default function Alertas() {
  const { id } = useParams();
  const { t } = useLocale();
  const [alertas, setAlertas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .alertasDelPaciente(id)
      .then(({ alertas: data }) => {
        if (activo) setAlertas(data);
      })
      .catch((e) => {
        if (activo) setError(mensajeDeError(e, t, 'alertas del Paciente'));
      });
    return () => {
      activo = false;
    };
  }, [id]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (alertas === null) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  if (alertas.length === 0) return <div className="pwa-card estado-vacio" role="status">{t.alertas.sin_alertas}</div>;

  return (
    <>
      <Link to={`/pacientes/${id}`} className="btn btn-volver">
        <span aria-hidden="true">←</span> {t.comun.volver}
      </Link>
      <h1>{t.alertas.titulo}</h1>
      {alertas.map((a) => (
        <section key={a.id} className="pwa-card">
          <div>
            <span className={`badge badge-${a.nivel}`}>{traducirValor(t.alertas, `nivel_${a.nivel}`)}</span>{' '}
            <span className="badge">{a.resuelta_at ? t.alertas.resuelta : t.alertas.activa}</span>
          </div>
          <div className="pwa-card-dato">{a.descripcion}</div>
          {a.reportes_relacionados?.length > 0 && (
            <div className="lista-enlaces">
              {a.reportes_relacionados.map((reporteId) => (
                <Link key={reporteId} to={`/pacientes/${id}/reportes/${reporteId}`}>
                  {t.alertas.ver_reportes_relacionados}
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
      {/* Al pie de la lista y no arriba: primero se lee qué pasó, y recién después se
          pregunta. Aparece solamente con esta pantalla cargada y con alguna alerta a la
          vista, que es el momento en que hace falta hablar con alguien. */}
      <ContactarALaPrestadora t={t} />
    </>
  );
}
