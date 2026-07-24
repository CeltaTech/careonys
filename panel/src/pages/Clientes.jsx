import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
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
  const { puede } = usePermisos();
  const puedeAltaManual = esAdmin || puede('alta_manual_cliente');
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
        {puedeAltaManual && <Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>}
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

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filasFiltradas.length === 0}
        recargar={recargar}
        mensajeVacio={filas.length === 0 ? t.clientes.vacio_texto : undefined}
        accionVacio={
          filas.length === 0 && puedeAltaManual ? (
            <Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>
          ) : undefined
        }
      >
        <div className="lista-tarjetas">
          {filasFiltradas.map((f) => (
            <div className="lista-tarjeta" key={f.id}>
              <div className="lista-tarjeta-header">
                <div>
                  <p className="lista-tarjeta-titulo">{f.solicitudes?.nombre || '—'}</p>
                  <p className="lista-tarjeta-subtitulo">{f.solicitudes?.localidad || '—'}</p>
                </div>
                <span className="badge">{t.clientes.col_pacientes}: {f.pacientes?.length ?? 0}</span>
              </div>
              <div className="lista-tarjeta-meta">
                <span><strong>{t.clientes.col_telefono}:</strong> {f.solicitudes?.telefono || '—'}</span>
                <span><strong>{t.clientes.col_email}:</strong> {f.solicitudes?.email || '—'}</span>
                <span><strong>{t.clientes.col_fecha_alta}:</strong> {new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              <div className="lista-tarjeta-acciones">
                <Button variant="secondary" onClick={() => navigate(`/clientes/${f.id}`)}>{t.comun.ver_detalle}</Button>
              </div>
            </div>
          ))}
        </div>
      </EstadoLista>
    </div>
  );
}
