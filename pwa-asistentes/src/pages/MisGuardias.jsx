import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

const ETIQUETAS_ESTADO = {
  programada: 'estado_programada',
  activa: 'estado_activa',
  completada: 'estado_completada',
  cancelada: 'estado_cancelada',
  ausente: 'estado_ausente',
};

export default function MisGuardias() {
  const { t } = useLocale();
  const [guardias, setGuardias] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .misGuardias()
      .then(({ guardias: data }) => {
        if (activo) setGuardias(data);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (guardias === null) return <div className="estado-cargando">{t.comun.cargando}</div>;
  if (guardias.length === 0) return <div className="estado-vacio">{t.guardias.sin_guardias}</div>;

  return (
    <div>
      <h1>{t.guardias.titulo}</h1>
      {guardias.map((g) => (
        <Link key={g.id} to={`/guardias/${g.id}`} className={`guardia-card guardia-${g.estado}`} style={{ display: 'block', textDecoration: 'none' }}>
          <div className="guardia-card-paciente">{g.pacientes?.nombre}</div>
          <div className="guardia-card-detalle">
            {g.fecha} · {g.hora_inicio?.slice(0, 5)} - {g.hora_fin?.slice(0, 5)}
          </div>
          <span className="badge">{t.guardias[ETIQUETAS_ESTADO[g.estado]] || g.estado}</span>
        </Link>
      ))}
    </div>
  );
}
