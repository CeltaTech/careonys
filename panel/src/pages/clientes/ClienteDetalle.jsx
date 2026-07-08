import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';

export function ClienteDetalle() {
  const { t } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, plan, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(*)')
      .eq('id', id)
      .single();

    if (errorConsulta) {
      setError(errorConsulta.message);
      setEstado('error');
      return;
    }

    setCliente(data);
    setEstado('listo');
  }, [id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  if (estado === 'cargando') return <p className="estado-cargando">{t.comun.cargando}</p>;
  if (estado === 'error') return <p className="estado-vacio">{error || t.comun.error_generico}</p>;

  return (
    <div>
      <button className="link-volver" onClick={() => navigate('/clientes')}>← {t.clientes.volver_a_clientes}</button>
      <h1>{cliente.solicitudes?.nombre || '—'}</h1>

      <h2>{t.clientes.contacto}</h2>
      <dl className="panel-detalle-lista">
        <dt>{t.clientes.col_telefono}</dt>
        <dd>
          {cliente.solicitudes?.telefono ? (
            <a href={`tel:${cliente.solicitudes.telefono}`}>{cliente.solicitudes.telefono}</a>
          ) : (
            '—'
          )}
        </dd>
        <dt>{t.clientes.col_email}</dt>
        <dd>{cliente.solicitudes?.email || '—'}</dd>
        <dt>{t.clientes.col_localidad}</dt>
        <dd>{cliente.solicitudes?.localidad || '—'}</dd>
        <dt>{t.clientes.col_fecha_alta}</dt>
        <dd>{new Date(cliente.created_at).toLocaleDateString()}</dd>
      </dl>

      <h2>{t.clientes.pacientes}</h2>
      {cliente.pacientes?.length ? (
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.clientes.col_nombre}</th>
              <th>{t.clientes.fecha_nacimiento}</th>
              <th>{t.clientes.nivel_complejidad}</th>
              <th>{t.clientes.domicilio}</th>
            </tr>
          </thead>
          <tbody>
            {cliente.pacientes.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.fecha_nacimiento || '—'}</td>
                <td>{p.nivel_complejidad || '—'}</td>
                <td>{p.domicilio || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="estado-vacio">{t.clientes.sin_pacientes}</p>
      )}

      <h2>{t.clientes.guardias_activas}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>

      <h2>{t.clientes.historial_reportes}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>

      <h2>{t.clientes.alertas_activas}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>
    </div>
  );
}
