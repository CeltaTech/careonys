import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { esAdminOSuperior } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { useFiltros } from '../hooks/useFiltros';
import { useCatalogoDeLugares } from '../hooks/useCatalogoDeLugares';
import { familiasConSuLocalidad, filtrarFamilias, localidadesConFamilias } from '../lib/familiasPorLocalidad';
import { cargarGuardiasDePacientes, cargarPacientesDeGuardias, textoDePacientes } from '../lib/pacientesDeGuardia';
import { claseBadge } from '../lib/tonos';
import { hoyISO } from '../lib/horarios';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { NuevaFamiliaModal } from './familias/NuevaFamiliaModal';
import { mensajeDeError } from '../lib/errores';
import './listadosMaqueta.css';

/**
 * Las modalidades en que se atiende a cada Familia: las de las guardias que vienen —de hoy en
 * adelante y sin las canceladas— de cualquiera de sus Pacientes. La Familia no guarda una
 * modalidad propia; lo que la tiene es cada guardia.
 */
async function cargarModalidadesPorFamilia(familias) {
  const familiaDelPaciente = new Map();
  for (const fam of familias) {
    for (const paciente of fam.pacientes ?? []) {
      if (!paciente.deleted_at) familiaDelPaciente.set(paciente.id, fam.id);
    }
  }
  const guardias = await cargarGuardiasDePacientes(
    [...familiaDelPaciente.keys()],
    'id, paciente_id, canal_modalidad',
    (consulta) => consulta.gte('fecha', hoyISO()).neq('estado', 'cancelada'),
  );
  const pacientesPorGuardia = await cargarPacientesDeGuardias(guardias.map((g) => g.id));

  const porFamilia = new Map();
  for (const g of guardias) {
    if (!g.canal_modalidad) continue;
    const pacientes = [...(pacientesPorGuardia.get(g.id) ?? []), g.paciente_id];
    for (const pacienteId of pacientes) {
      const familiaId = familiaDelPaciente.get(pacienteId);
      if (!familiaId) continue;
      if (!porFamilia.has(familiaId)) porFamilia.set(familiaId, new Set());
      porFamilia.get(familiaId).add(g.canal_modalidad);
    }
  }
  return porFamilia;
}

export function Familias() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeAltaManual = esAdmin || puede('alta_manual_familia');
  const [filas, setFilas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [modalidades, setModalidades] = useState(new Map());
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
        .from('familias')
        .select('id, created_at, solicitudes!familias_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(id, nombre, lugar_id, deleted_at)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('servicios').select('id, estado, contratante_id').eq('tipo_contratante', 'familia'),
    ]);

    const falla = errorConsulta || errorServicios;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    let porFamilia;
    try {
      porFamilia = await cargarModalidadesPorFamilia(data ?? []);
    } catch (errorGuardias) {
      setError(mensajeDeError(errorGuardias, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setServicios(serviciosData ?? []);
    setModalidades(porFamilia);
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const nombreDeLugar = useMemo(() => {
    const porId = new Map((catalogo.lugares ?? []).map((lugar) => [lugar.id, lugar.nombre]));
    return (id) => porId.get(id) ?? '';
  }, [catalogo.lugares]);

  // Qué Familia está dónde, qué queda después de los filtros y qué localidades vale la pena
  // ofrecer sale de `lib/familiasPorLocalidad.js`, que es el punto único de verdad. Acá sólo se
  // dibuja.
  const familias = useMemo(() => familiasConSuLocalidad(filas, nombreDeLugar), [filas, nombreDeLugar]);
  const filasFiltradas = useMemo(() => filtrarFamilias(familias, f), [familias, f]);
  const lugaresConFamilias = useMemo(
    () => localidadesConFamilias(familias, catalogo.lugares),
    [familias, catalogo.lugares],
  );

  const serviciosPorFamilia = useMemo(() => {
    const mapa = new Map();
    for (const s of servicios) {
      if (!mapa.has(s.contratante_id)) mapa.set(s.contratante_id, []);
      mapa.get(s.contratante_id).push(s);
    }
    return mapa;
  }, [servicios]);

  const tl = t.familias.listado;
  const abrirAlta = () => setMostrarNueva(true);
  const abrirFicha = (fam) => navigate(`/familias/${fam.id}`);

  // Activa mientras tenga algún Servicio vigente; con Servicios y ninguno vigente, cerrada.
  function estadoDeFamilia(propios) {
    if (propios.length === 0) return null;
    if (propios.some((s) => s.estado === 'vigente')) {
      return { clase: claseBadge('vigente'), texto: tl.estado_activa };
    }
    return { clase: claseBadge('inactivo'), texto: t.servicios.estado_de_baja };
  }

  return (
    <div className="listado-maqueta">
      <Cabecera titulo={t.familias.titulo}>
        {puedeAltaManual && <Button onClick={abrirAlta}>{tl.nueva}</Button>}
      </Cabecera>

      {mostrarNueva && (
        <NuevaFamiliaModal
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
            placeholder={t.familias.buscar}
            aria-label={t.familias.buscar}
            value={f.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
          {lugaresConFamilias.length > 1 && (
            <select value={f.lugar} onChange={(e) => set('lugar', e.target.value)} aria-label={t.familias.col_localidad}>
              <option value="">{t.familias.filtro_localidad_todas}</option>
              {lugaresConFamilias.map((lugar) => (
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
          mensajeVacio={filas.length === 0 ? t.familias.vacio_texto : undefined}
          accionVacio={filas.length === 0 && puedeAltaManual ? <Button onClick={abrirAlta}>{tl.nueva}</Button> : undefined}
        >
          <div className="listado-maqueta-tabla">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{tl.col_familia}</th>
                  <th>{tl.col_paciente}</th>
                  <th>{tl.col_servicios}</th>
                  <th>{tl.col_modalidad}</th>
                  <th>{tl.col_estado}</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((fam) => {
                  const nombres = (fam.pacientes ?? []).filter((p) => !p.deleted_at).map((p) => p.nombre);
                  const propios = serviciosPorFamilia.get(fam.id) ?? [];
                  const estadoFam = estadoDeFamilia(propios);
                  const deLaFamilia = [...(modalidades.get(fam.id) ?? [])];
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
                      <td>{deLaFamilia.map((m) => t.modalidades[m] ?? m).join(' · ') || '—'}</td>
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
