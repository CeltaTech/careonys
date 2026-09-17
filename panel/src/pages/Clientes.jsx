import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { esAdminOSuperior } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { useFiltros } from '../hooks/useFiltros';
import { useCatalogoDeLugares } from '../hooks/useCatalogoDeLugares';
import { clientesConSuLocalidad, filtrarClientes, localidadesConClientes } from '../lib/clientesPorLocalidad';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { NuevaClienteModal } from './clientes/NuevaClienteModal';
import { mensajeDeError } from '../lib/errores';

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
  const { f, set, limpiar, hayFiltros } = useFiltros({ busqueda: '', lugar: '' });
  const [mostrarNueva, setMostrarNueva] = useState(false);
  // Los nombres de las localidades salen del catálogo y no de la ficha del Paciente: lo guardado
  // es cuál lugar, y corregir una vez cómo se llama lo corrige en todas las fichas que lo nombran.
  const catalogo = useCatalogoDeLugares();

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(id, lugar_id, deleted_at)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const nombreDeLugar = useMemo(() => {
    const porId = new Map((catalogo.lugares ?? []).map((lugar) => [lugar.id, lugar.nombre]));
    return (id) => porId.get(id) ?? '';
  }, [catalogo.lugares]);

  // Qué Cliente está dónde, qué queda después de los filtros y qué localidades vale la pena
  // ofrecer sale de `lib/clientesPorLocalidad.js`, que es el punto único de verdad. Acá sólo se
  // dibuja.
  const clientes = useMemo(() => clientesConSuLocalidad(filas, nombreDeLugar), [filas, nombreDeLugar]);
  const filasFiltradas = useMemo(() => filtrarClientes(clientes, f), [clientes, f]);
  const lugaresConClientes = useMemo(
    () => localidadesConClientes(clientes, catalogo.lugares),
    [clientes, catalogo.lugares],
  );

  return (
    <div>
      <h1>{t.clientes.titulo}</h1>

      <div className="panel-filtros">
        <input
          type="text"
          placeholder={t.clientes.buscar}
          aria-label={t.clientes.buscar}
          value={f.busqueda}
          onChange={(e) => set('busqueda', e.target.value)}
        />
        {lugaresConClientes.length > 1 && (
          <select value={f.lugar} onChange={(e) => set('lugar', e.target.value)} aria-label={t.clientes.col_localidad}>
            <option value="">{t.clientes.filtro_localidad_todas}</option>
            {lugaresConClientes.map((lugar) => (
              <option key={lugar.id} value={lugar.id}>{lugar.nombre}</option>
            ))}
          </select>
        )}
        {puedeAltaManual &&<Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>}
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
        filtrado={hayFiltros}
        onLimpiarFiltros={limpiar}
        mensajeVacio={filas.length === 0 ? t.clientes.vacio_texto : undefined}
        accionVacio={
          filas.length === 0 && puedeAltaManual ? (
            <Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>
          ) : undefined
        }
      >
        <div className="lista-tarjetas">
          {filasFiltradas.map((fam) => (
            <div className="lista-tarjeta" key={fam.id}>
              <div className="lista-tarjeta-header">
                <div>
                  <p className="lista-tarjeta-titulo">{fam.solicitudes?.nombre || '—'}</p>
                  {/* Lo que se muestra son las localidades de sus Pacientes. Mientras no haya
                      ninguna elegida queda lo que dijo quien llamó, que es lo único que se sabe
                      de esa Cliente hasta que alguien señale el lugar en la lista. */}
                  <p className="lista-tarjeta-subtitulo">
                    {fam.nombresDeLugares.join(', ') || fam.solicitudes?.localidad || '—'}
                  </p>
                </div>
                <span className="badge">{t.clientes.col_pacientes}: {fam.cuantosPacientes}</span>
              </div>
              <div className="lista-tarjeta-meta">
                <span><strong>{t.clientes.col_telefono}:</strong> {fam.solicitudes?.telefono || '—'}</span>
                <span><strong>{t.clientes.col_email}:</strong> {fam.solicitudes?.email || '—'}</span>
                <span><strong>{t.clientes.col_fecha_alta}:</strong> {new Date(fam.created_at).toLocaleDateString()}</span>
              </div>
              <div className="lista-tarjeta-acciones">
                <Button variant="secondary" onClick={() => navigate(`/clientes/${fam.id}`)}>{t.comun.ver_detalle}</Button>
              </div>
            </div>
          ))}
        </div>
      </EstadoLista>
    </div>
  );
}
