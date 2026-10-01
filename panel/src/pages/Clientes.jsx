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
import { Cabecera } from '../components/ui/Cabecera';
import { NuevaClienteModal } from './clientes/NuevaClienteModal';
import { mensajeDeError } from '../lib/errores';

export function Clientes() {
  const { t, locale } = useLocale();
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
      <Cabecera titulo={t.clientes.titulo}>
        {puedeAltaManual && <Button onClick={() => setMostrarNueva(true)}>{t.clientes.nueva.titulo}</Button>}
      </Cabecera>

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
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.clientes.col_nombre}</th>
              <th>{t.clientes.col_localidad}</th>
              <th>{t.clientes.col_pacientes}</th>
              <th>{t.clientes.col_telefono}</th>
              <th>{t.clientes.col_email}</th>
              <th>{t.clientes.col_fecha_alta}</th>
              <th>{t.comun.detalle}</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((fam) => (
              <tr key={fam.id}>
                <td><strong>{fam.solicitudes?.nombre || '—'}</strong></td>
                {/* Lo que se muestra son las localidades de sus Pacientes. Mientras no haya
                    ninguna elegida queda lo que dijo quien llamó, que es lo único que se sabe
                    de esa Cliente hasta que alguien señale el lugar en la lista. */}
                <td>{fam.nombresDeLugares.join(', ') || fam.solicitudes?.localidad || '—'}</td>
                <td>{fam.cuantosPacientes}</td>
                <td>{fam.solicitudes?.telefono || '—'}</td>
                <td>{fam.solicitudes?.email || '—'}</td>
                <td>{new Date(fam.created_at).toLocaleDateString(locale)}</td>
                <td>
                  <Button variant="secondary" onClick={() => navigate(`/clientes/${fam.id}`)}>{t.comun.ver_detalle}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </div>
  );
}
