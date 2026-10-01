import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { esAdminOSuperior } from '../lib/roles';
import { claseBadge, claseBadgeTono, TONO } from '../lib/tonos';
import { nombreTipo } from '../lib/tiposAsistente';
import { conDatosAparte } from '../lib/fichaAsistente';
import { MODALIDAD, modalidadesDelAsistente } from '../lib/modalidades';
import { coincideConElFiltro, opcionesDelPlantel } from '../lib/resumenDelPlantel';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { useFiltros } from '../hooks/useFiltros';
import { useTiposAsistente } from '../hooks/useTiposAsistente';
import { useLugaresDelPlantel } from '../hooks/useLugaresDelPlantel';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { NuevoAsistenteModal } from './asistentes/NuevoAsistenteModal';
import { PasarAlCatalogoModal } from './asistentes/PasarAlCatalogoModal';
import './listadosMaqueta.css';

const ESTADOS = ['activo', 'inactivo', 'cesado'];

// El cartel de cada modalidad: la directa en verde y la de Match en violeta, como en la maqueta.
const CLASE_MODALIDAD = {
  [MODALIDAD.DIRECTA]: claseBadgeTono(TONO.EXITO),
  [MODALIDAD.MARKETPLACE]: 'badge listado-badge-violeta',
};

export function Asistentes() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeAltaManual = esAdmin || puede('alta_manual_asistente');
  // Coordinador consulta la vista sin vínculo laboral — ver schema_etapa2i.sql. Esa vista no trae
  // las modalidades del Asistente, así que para él la columna queda sin dato.
  const { filas, estado, error, recargar } = useSupabaseTable(
    esAdmin ? 'asistentes' : 'asistentes_coordinador',
    { orderBy: 'created_at', select: '*' },
  );
  const { f, set, limpiar, hayFiltros } = useFiltros({
    busqueda: '',
    estado: '',
    tipo: '',
    zona: '',
    especialidad: '',
  });
  const { paraElegir: tiposAsistente, porId: tiposPorId } = useTiposAsistente();
  // Dónde acepta trabajar cada una. Vive en su propia tabla y llega aparte; sólo alimenta el filtro.
  const lugaresDelPlantel = useLugaresDelPlantel(filas.map((a) => a.id));

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [mostrarPasarAlCatalogo, setMostrarPasarAlCatalogo] = useState(false);

  const conLugares = useCallback(
    (a) => ({ ...conDatosAparte(a), lugares: lugaresDelPlantel.lugaresDe(a.id) }),
    [lugaresDelPlantel],
  );

  const filasFiltradas = useMemo(() => {
    const b = f.busqueda.toLowerCase();
    return filas.map(conLugares).filter((a) => {
      const coincideBusqueda =
        !b || a.nombre?.toLowerCase().includes(b) || a.email?.toLowerCase().includes(b);
      return (
        coincideBusqueda &&
        (!f.estado || a.estado === f.estado) &&
        (!f.tipo || a.tipo_asistente_id === f.tipo) &&
        (!f.zona || a.lugares.includes(f.zona)) &&
        coincideConElFiltro(a, 'especialidades', f.especialidad)
      );
    });
  }, [filas, f, conLugares]);

  // El filtro de lugar ofrece los lugares que el plantel tiene cargados, no el catálogo entero.
  const lugares = useMemo(() => {
    const puestos = new Set(filas.flatMap((a) => lugaresDelPlantel.lugaresDe(a.id)));
    return lugaresDelPlantel.catalogo
      .filter((lugar) => puestos.has(lugar.id))
      .map((lugar) => ({ id: lugar.id, nombre: lugar.nombre }));
  }, [filas, lugaresDelPlantel]);
  const especialidades = useMemo(() => opcionesDelPlantel(filas, 'especialidades'), [filas]);

  // Los que todavía no tienen tipo del catálogo. Mientras haya uno se ofrece pasarlos.
  const sinTipo = useMemo(() => filas.filter((a) => !a.tipo_asistente_id), [filas]);

  const tl = t.asistentes.listado;
  const abrirAlta = () => setMostrarNuevo(true);

  return (
    <div className="listado-maqueta">
      <Cabecera titulo={t.asistentes.titulo}>
        <Button variant="secondary" onClick={() => navigate('/documentacion')}>
          {tl.documentacion_pendiente}
        </Button>
        {puedeAltaManual && <Button onClick={abrirAlta}>{tl.incorporar}</Button>}
      </Cabecera>

      {puedeAltaManual && sinTipo.length > 0 && (
        <Alert variant="info">
          {t.asistentes.pasar_al_catalogo.aviso.replace('{{cantidad}}', sinTipo.length)}{' '}
          <Button variant="secondary" onClick={() => setMostrarPasarAlCatalogo(true)}>
            {t.asistentes.pasar_al_catalogo.abrir}
          </Button>
        </Alert>
      )}

      {mostrarPasarAlCatalogo && (
        <PasarAlCatalogoModal
          asistentes={sinTipo}
          onClose={() => setMostrarPasarAlCatalogo(false)}
          onGuardado={() => {
            setMostrarPasarAlCatalogo(false);
            recargar();
          }}
        />
      )}

      {mostrarNuevo && (
        <NuevoAsistenteModal
          onClose={() => setMostrarNuevo(false)}
          onCreado={() => {
            setMostrarNuevo(false);
            recargar();
          }}
        />
      )}

      <section className="panel-tarjeta">
        <div className="panel-filtros">
          <input
            type="text"
            placeholder={t.asistentes.buscar}
            aria-label={t.asistentes.buscar}
            value={f.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
          <select value={f.estado} onChange={(e) => set('estado', e.target.value)} aria-label={t.comun.filtro_estado}>
            <option value="">{t.comun.todos}</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {t.asistentes[`estado_${e}`]}
              </option>
            ))}
          </select>
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} aria-label={t.comun.filtro_tipo}>
            <option value="">{t.asistentes.filtro_tipo_todos}</option>
            {tiposAsistente.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
            ))}
          </select>
          {/* Aparecen sólo si hay algo que filtrar: una sola opción no es una pregunta. */}
          {lugares.length > 1 && (
            <select value={f.zona} onChange={(e) => set('zona', e.target.value)} aria-label={t.asistentes.col_zonas}>
              <option value="">{t.asistentes.filtro_zona_todas}</option>
              {lugares.map((lugar) => (
                <option key={lugar.id} value={lugar.id}>{lugar.nombre}</option>
              ))}
            </select>
          )}
          {especialidades.length > 1 && (
            <select
              value={f.especialidad}
              onChange={(e) => set('especialidad', e.target.value)}
              aria-label={t.asistentes.col_especialidades}
            >
              <option value="">{t.asistentes.filtro_especialidad_todas}</option>
              {especialidades.map((especialidad) => (
                <option key={especialidad} value={especialidad}>{especialidad}</option>
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
          mensajeVacio={filas.length === 0 ? t.asistentes.vacio_texto : undefined}
          accionVacio={
            filas.length === 0 && puedeAltaManual ? <Button onClick={abrirAlta}>{tl.incorporar}</Button> : undefined
          }
        >
          <div className="listado-maqueta-tabla">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{tl.col_asistente}</th>
                  <th>{tl.col_especialidad}</th>
                  <th>{t.asistentes.col_estado}</th>
                  <th>{tl.col_modalidad_utilizada}</th>
                  <th><span className="solo-lectores-pantalla">{t.comun.detalle}</span></th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((a) => {
                  const modalidades = esAdmin ? modalidadesDelAsistente(a) : [];
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.nombre}</strong>
                        <span className="panel-mini">
                          {a.tipo_asistente_id
                            ? nombreTipo(tiposPorId.get(a.tipo_asistente_id), t)
                            : t.asistentes.tipo_sin_asignar}
                        </span>
                      </td>
                      <td>{(a.especialidades || []).join(', ') || '—'}</td>
                      <td>
                        <span className={claseBadge(a.estado)}>{t.asistentes[`estado_${a.estado}`]}</span>
                      </td>
                      <td>
                        {modalidades.length ? (
                          <span className="listado-badges">
                            {modalidades.map((m) => (
                              <span key={m} className={CLASE_MODALIDAD[m] ?? claseBadgeTono(TONO.NEUTRO)}>
                                {t.modalidades[m] ?? m}
                              </span>
                            ))}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Button variant="secondary" onClick={() => navigate(`/asistentes/${a.id}`)}>
                          {tl.ver_ficha}
                        </Button>
                      </td>
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
