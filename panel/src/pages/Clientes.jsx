import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { useFiltros } from '../hooks/useFiltros';
import { useCatalogoDeLugares } from '../hooks/useCatalogoDeLugares';
import { clientesConSuLocalidad, filtrarClientes, localidadesConClientes } from '../lib/clientesPorLocalidad';
import { textoDePacientes } from '../lib/pacientesDeGuardia';
import { claseBadge } from '../lib/tonos';
import { formatearImporte } from '../lib/dinero';
import { porCliente, estadoDelCliente } from '../lib/loQueTieneCadaCliente';
import { llamarApiIntermediacion } from '../lib/apiIntermediacion';
import { MODALIDAD } from '../lib/modalidades';
import { esAdminOSuperior } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { useModalidades } from '../context/ModalidadesContext';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Cabecera } from '../components/ui/Cabecera';
import { mensajeDeError } from '../lib/errores';
import './listadosMaqueta.css';
import { conSusFichas, fichaCon } from '../lib/fichaDelPaciente';

/* La sección Clientes es una sola para las dos modalidades: en la base el Cliente ya es uno solo
   (`clientes`), y cada uno se muestra con lo que tiene. Los Servicios de prestación directa se
   leen de la base; el acceso de Match sale de la ruta de Match `/accesos`, que es de la
   administración —es plata, igual que el candado de `intermediacion/clientes` en App.jsx— y
   existe sólo si la Prestadora tiene Match encendida. A quien no lo puede ver no se le pregunta, y
   las columnas no aparecen. */
export function Clientes() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { tieneModalidad } = useModalidades();
  const verServicios = tieneModalidad(MODALIDAD.DIRECTA);
  const verMatch = tieneModalidad(MODALIDAD.INTERMEDIACION) && esAdminOSuperior(usuario?.rol);
  const [filas, setFilas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [accesos, setAccesos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const { f, set, limpiar, hayFiltros } = useFiltros({ busqueda: '', lugar: '' });
  // Los nombres de las localidades salen del catálogo y no del Paciente: lo guardado es cuál
  // lugar, y corregir una vez cómo se llama lo corrige en cada Paciente que lo nombra.
  const catalogo = useCatalogoDeLugares();

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    let respuestas;
    try {
      respuestas = await Promise.all([
        supabase
          .from('clientes')
          .select(
            `id, created_at, pacientes(id, deleted_at, ${fichaCon(['nombre_visible', 'lugar_id'])}), ` +
              'personas!clientes_contratante_de_la_misma_prestadora(nombre_visible, email, ' +
              'telefonos_de_la_persona!el_telefono_es_de_una_persona_de_esta_prestadora(telefono))',
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase.from('servicios').select('id, estado, cliente_id'),
        verMatch ? llamarApiIntermediacion('/accesos') : Promise.resolve({ accesos: [] }),
      ]);
    } catch (errorAccesos) {
      setError(mensajeDeError(errorAccesos, t));
      setEstado('error');
      return;
    }
    const [{ data, error: errorConsulta }, { data: serviciosData, error: errorServicios }, { accesos: accesosData }] =
      respuestas;

    const falla = errorConsulta || errorServicios;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    setFilas((data ?? []).map((cliente) => ({ ...cliente, pacientes: conSusFichas(cliente.pacientes) })));
    setServicios(serviciosData ?? []);
    setAccesos(accesosData ?? []);
    setEstado('listo');
  }, [t, verMatch]);

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

  // Qué tiene cada Cliente y en qué estado queda sale de `lib/loQueTieneCadaCliente.js`.
  const serviciosPorCliente = useMemo(() => porCliente(servicios), [servicios]);
  const accesosPorCliente = useMemo(() => porCliente(accesos), [accesos]);

  const tl = t.clientes.listado;
  const ti = t.intermediacion;
  const abrirFichaDelCliente = (fam) => navigate(`/clientes/${fam.id}`);
  const fecha = (dia) => (dia ? new Date(`${dia}T00:00:00`).toLocaleDateString(locale) : '—');

  const ESTADOS = {
    activo: { clase: claseBadge('vigente'), texto: tl.estado_activa },
    de_baja: { clase: claseBadge('inactivo'), texto: t.servicios.estado_de_baja },
  };

  // Un Cliente tiene un acceso de Match por cada Paciente: cada celda lleva un renglón por acceso.
  const renglones = (lista, dibujar) =>
    lista.length === 0 ? '—' : lista.map((acceso) => <div key={acceso.id}>{dibujar(acceso)}</div>);

  return (
    <div className="listado-maqueta">
      <Cabecera titulo={t.clientes.titulo} />

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
        >
          <div className="listado-maqueta-tabla">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{tl.col_cliente}</th>
                  <th>{tl.col_paciente}</th>
                  {verServicios && <th>{tl.col_servicios}</th>}
                  {verMatch && <th>{t.configuracion.modalidades_intermediacion}</th>}
                  {verMatch && <th>{ti.col_monto}</th>}
                  {verMatch && <th>{ti.col_proximo_cobro}</th>}
                  <th>{tl.col_estado}</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((fam) => {
                  const nombres = (fam.pacientes ?? []).filter((p) => !p.deleted_at).map((p) => p.nombre);
                  const propios = serviciosPorCliente.get(fam.id) ?? [];
                  const deMatch = accesosPorCliente.get(fam.id) ?? [];
                  const estadoFam = ESTADOS[estadoDelCliente(propios, deMatch)];
                  return (
                    <tr
                      key={fam.id}
                      className="listado-fila-abre"
                      tabIndex={0}
                      onClick={() => abrirFichaDelCliente(fam)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') abrirFichaDelCliente(fam);
                      }}
                    >
                      <td><strong>{fam.personas?.nombre_visible || '—'}</strong></td>
                      <td>{textoDePacientes(nombres, t.guardias.pacientes_y_mas)}</td>
                      {verServicios && <td>{propios.length}</td>}
                      {verMatch && (
                        <td>
                          {renglones(deMatch, (acceso) => (
                            <span className={claseBadge(acceso.estado)}>{ti[`estado_${acceso.estado}`] || acceso.estado}</span>
                          ))}
                        </td>
                      )}
                      {verMatch && (
                        <td>{renglones(deMatch, (acceso) => formatearImporte(acceso.importe, acceso.moneda, locale))}</td>
                      )}
                      {verMatch && <td>{renglones(deMatch, (acceso) => fecha(acceso.proximo_cobro))}</td>}
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
