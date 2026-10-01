import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { hoyISO } from '../lib/horarios';
import { pacientesDeLasGuardias } from '../lib/proximaGuardia';
import { cuandoEsLaGuardia } from '../lib/nombresDeLaGuardia';

// Los Pacientes que atiende, una tarjeta por cada uno, con la guardia que le sigue con él. Sale
// de las mismas guardias que la pantalla de Guardias: no hay consulta propia.
export default function Servicio() {
  const { t } = useLocale();
  const [guardias, setGuardias] = useState(null);
  const [error, setError] = useState('');
  const [pidiendo, setPidiendo] = useState(false);

  const pedir = useCallback(() => {
    setError('');
    setPidiendo(true);
    return api
      .misGuardias()
      .then(({ guardias: data }) => setGuardias(data ?? []))
      .catch((e) => setError(mensajeDeError(e, t, 'cargar mis guardias')))
      .finally(() => setPidiendo(false));
  }, [t]);

  useEffect(() => {
    pedir();
  }, [pedir]);

  const pacientes = guardias ? pacientesDeLasGuardias(guardias) : [];
  const hoy = hoyISO();

  return (
    <div>
      <h1>{t.servicio.titulo}</h1>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button type="button" className="btn btn-secondary" onClick={pedir} disabled={pidiendo}>
            {t.comun.reintentar}
          </button>
        </div>
      )}

      {guardias === null && !error && (
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      )}

      {guardias !== null && pacientes.length === 0 && (
        <div className="estado-vacio" role="status">{t.servicio.sin_pacientes}</div>
      )}

      {pacientes.map(({ paciente, guardia }) => (
        <section key={paciente.id} className="pwa-card">
          <h2>{paciente.nombre || t.guardias.sin_paciente}</h2>
          <div className="mini">{guardia ? cuandoEsLaGuardia(guardia, t, hoy) : t.servicio.sin_proxima}</div>
          {guardia && (
            <Link to={`/guardias/${guardia.id}`} className="btn btn-full pwa-card-pie">
              {t.servicio.ver_guardia}
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
