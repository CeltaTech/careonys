import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { hoyISO } from '../lib/horarios';
import { pacientesDeLosTurnosGuardia } from '../lib/proximaTurnoGuardia';
import { cuandoEsElTurnoGuardia } from '../lib/nombresDelTurnoGuardia';

// Los Pacientes que atiende, una tarjeta por cada uno, con el turno de guardia que le sigue con él. Sale
// de los mismos turnos de guardia que la pantalla de Turnos de guardia: no hay consulta propia.
export default function Servicio() {
  const { t } = useLocale();
  const [turnos_guardia, setTurnosGuardia] = useState(null);
  const [error, setError] = useState('');
  const [pidiendo, setPidiendo] = useState(false);

  const pedir = useCallback(() => {
    setError('');
    setPidiendo(true);
    return api
      .misTurnosGuardia()
      .then(({ turnos_guardia: data }) => setTurnosGuardia(data ?? []))
      .catch((e) => setError(mensajeDeError(e, t, 'cargar mis turnos de guardia')))
      .finally(() => setPidiendo(false));
  }, [t]);

  useEffect(() => {
    pedir();
  }, [pedir]);

  const pacientes = turnos_guardia ? pacientesDeLosTurnosGuardia(turnos_guardia) : [];
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

      {turnos_guardia === null && !error && (
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      )}

      {turnos_guardia !== null && pacientes.length === 0 && (
        <div className="estado-vacio" role="status">{t.servicio.sin_pacientes}</div>
      )}

      {pacientes.map(({ paciente, turno_guardia }) => (
        <section key={paciente.id} className="pwa-card">
          <h2>{paciente.nombre || t.turnos_guardia.sin_paciente}</h2>
          <div className="mini">{turno_guardia ? cuandoEsElTurnoGuardia(turno_guardia, t, hoy) : t.servicio.sin_proxima}</div>
          {turno_guardia && (
            <Link to={`/turnos-guardia/${turno_guardia.id}`} className="btn btn-full pwa-card-pie">
              {t.servicio.ver_turno_guardia}
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
