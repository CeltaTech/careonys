import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { esAdminOSuperior } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { NuevaClienteModal } from './clientes/NuevaClienteModal';

export function Clientes() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarNueva, setMostrarNueva] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(id)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError(errorConsulta.message);
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setEstado('listo');
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (!busqueda) return true;
      const b = busqueda.toLowerCase();
      return (
        f.solicitudes?.nombre?.toLowerCase().includes(b) ||
        f.solicitudes?.email?.toLowerCase().includes(b) ||
        f.solicitudes?.telefono?.toLowerCase().includes(b)
      );
    });
  }, [filas, busqueda]);

  return (
    <div>
      <h1>{t.clientes.titulo}</h1>

      <div className="panel-filtros">
        <input
          type="text"
          placeholder={t.clientes.buscar}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {esAdmin && <Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>}
      </div>

      {mostrarNueva && (
        <NuevaClienteModal
          onClose={() => setMostrarNueva(false)}
          onCreada={() => {
            setMostrarNueva(false);
            recargar();
          }}
        />
      )}

      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && filasFiltradas.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.clientes.col_nombre}</th>
              <th>{t.clientes.col_telefono}</th>
              <th>{t.clientes.col_email}</th>
              <th>{t.clientes.col_localidad}</th>
              <th>{t.clientes.col_pacientes}</th>
              <th>{t.clientes.col_fecha_alta}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((f) => (
              <tr key={f.id}>
                <td>{f.solicitudes?.nombre || '—'}</td>
                <td>{f.solicitudes?.telefono || '—'}</td>
                <td>{f.solicitudes?.email || '—'}</td>
                <td>{f.solicitudes?.localidad || '—'}</td>
                <td>{f.pacientes?.length ?? 0}</td>
                <td>{new Date(f.created_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => navigate(`/clientes/${f.id}`)}>{t.comun.ver_detalle}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </div>
  );
}
