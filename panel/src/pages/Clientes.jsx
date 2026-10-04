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
import { textoDePacientes } from '../lib/pacientesDeGuardia';
import { claseBadge } from '../lib/tonos';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { NuevaClienteModal } from './clientes/NuevaClienteModal';
import { mensajeDeError } from '../lib/errores';
import './listadosMaqueta.css';

export function Clientes() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeAltaManual = esAdmin || puede('alta_manual_cliente');
  const [filas, setFilas] = useState([]);
  const [servicios, setServicios] = useState([]);
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
    const [{ data, error: errorConsulta }, { data: serviciosData, error: errorServicios }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(id, nombre, lugar_id, deleted_at)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('servicios').select('id, estado, contratante_id').eq('tipo_contratante', 'cliente'),
    ]);

    const falla = errorConsulta || errorServicios;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setServicios(serviciosData ?? []);
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

  const serviciosPorCliente = useMemo(() => {
    const mapa = new Map();
    for (const s of servicios) {
      if (!mapa.has(s.contratante_id)) mapa.set(s.contratante_id, []);
      mapa.get(s.contratante_id).push(s);
    }
    return mapa;
  }, [servicios]);

  const tl = t.clientes.listado;
  const abrirAlta = () => setMostrarNueva(true);
  const abrirFicha = (fam) => navigate(`/clientes/${fam.id}`);

  // Activa mientras tenga algún Servicio vigente; con Servicios y ninguno vigente, cerrada.
  function estadoDeCliente(propios) {
    if (propios.length === 0) return null;
    if (propios.some((s) => s.estado === 'vigente')) {
      return { clase: claseBadge('vigente'), texto: tl.estado_activa };
    }
    return { clase: claseBadge('inactivo'), texto: t.servicios.estado_de_baja };
  }

  return (
    <div className="listado-maqueta">
      <Cabecera titulo={t.clientes.titulo}>
        {puedeAltaManual && <Button onClick={abrirAlta}>{tl.nueva}</Button>}
      </Cabecera>

      {mostrarNueva && (
        <NuevaClienteModal
          onClose={() => setMostrarNueva(false)}
          onCreada={() => {
            setMostrarNueva(false);
            recargar();
          }}
        />
      )}

      <section className="panel-tarjeta">
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

        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && filasFiltradas.length === 0}
          recargar={recargar}
          filtrado={hayFiltros}
          onLimpiarFiltros={limpiar}
          mensajeVacio={filas.length === 0 ? t.clientes.vacio_texto : undefined}
          accionVacio={filas.length === 0 && puedeAltaManual ? <Button onClick={abrirAlta}>{tl.nueva}</Button> : undefined}
        >
          <div className="listado-maqueta-tabla">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{tl.col_cliente}</th>
                  <th>{tl.col_paciente}</th>
                  <th>{tl.col_servicios}</th>
                  <th>{tl.col_estado}</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((fam) => {
                  const nombres = (fam.pacientes ?? []).filter((p) => !p.deleted_at).map((p) => p.nombre);
                  const propios = serviciosPorCliente.get(fam.id) ?? [];
                  const estadoFam = estadoDeCliente(propios);
                  return (
                    <tr
                      key={fam.id}
                      className="listado-fila-abre"
                      tabIndex={0}
                      onClick={() => abrirFicha(fam)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') abrirFicha(fam);
                      }}
                    >
                      <td><strong>{fam.solicitudes?.nombre || '—'}</strong></td>
                      <td>{textoDePacientes(nombres, t.guardias.pacientes_y_mas)}</td>
                      <td>{propios.length}</td>
                      <td>{estadoFam ? <span className={estadoFam.clase}>{estadoFam.texto}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </EstadoLista>
      </section>
    </div>
  );
}
