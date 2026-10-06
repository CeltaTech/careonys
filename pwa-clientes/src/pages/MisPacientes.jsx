import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import DomicilioTemporal from '../components/DomicilioTemporal';
import AvisoInstruccionPendiente from '../components/AvisoInstruccionPendiente';
import TarjetaAcciones from '../components/TarjetaAcciones';

export default function MisPacientes() {
  const { t } = useLocale();
  const [pacientes, setPacientes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .misPacientes()
      .then(({ pacientes: data }) => {
        if (activo) setPacientes(data);
      })
      .catch(() => {
        if (activo) setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (pacientes === null) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  // La advertencia de instrucción pendiente va también acá: sin Pacientes cargados no hay ninguna otra
  // pantalla adonde ir, y el titular igual tiene algo que firmar.
  if (pacientes.length === 0) {
    return (
      <>
        <AvisoInstruccionPendiente />
        <div className="pwa-card estado-vacio" role="status">{t.pacientes.sin_pacientes}</div>
        {/* Sin Paciente no hay ficha, y las acciones del Cliente entero tienen que
            seguir a mano: el código, el perfil, la vidriera. */}
        <TarjetaAcciones />
      </>
    );
  }
  if (pacientes.length === 1) return <Navigate to={`/pacientes/${pacientes[0].id}`} replace />;

  return (
    <>
      <h1>{t.pacientes.titulo}</h1>
      <AvisoInstruccionPendiente />
      {pacientes.map((p) => (
        <Link key={p.id} to={`/pacientes/${p.id}`} className="pwa-card">
          <div className="mini">{t.paciente.rotulo}</div>
          <div className="guardia-card-paciente">{p.nombre}</div>
          <div className="mini mini-abajo">{p.domicilio || '—'}</div>
          {/* Cuando el Paciente está pasando una temporada en otro lado, la dirección de arriba
              es la de ahora y no la habitual. Sin este renglón se leen igual. */}
          <DomicilioTemporal paciente={p} t={t} />
        </Link>
      ))}
      <TarjetaAcciones />
    </>
  );
}
