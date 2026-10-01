import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { esAdminOSuperior } from '../lib/roles';
import { claseBadge } from '../lib/tonos';
import { nombreTipo } from '../lib/tiposAsistente';
import { CAMPOS_RESERVADOS, conDatosAparte } from '../lib/fichaAsistente';
import { con } from '../lib/textos';
import {
  DIAS_DE_HORIZONTE,
  coincideConElFiltro,
  opcionesDelPlantel,
} from '../lib/resumenDelPlantel';
import { resolverEscalasVigentes } from '../lib/escalasLegales';
import { calcularScoreRiesgo } from '../lib/scoreRiesgo';
import { deducirIndicadores, indicadoresParaElPuntaje } from '../lib/indicadoresDeducidos';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { useEscalasLegales } from '../hooks/useEscalasLegales';
import { useFiltros } from '../hooks/useFiltros';
import { useTiposAsistente } from '../hooks/useTiposAsistente';
import { usePanoramaDelPlantel } from '../hooks/usePanoramaDelPlantel';
import { useLugaresDelPlantel } from '../hooks/useLugaresDelPlantel';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { NuevoAsistenteModal } from './asistentes/NuevoAsistenteModal';
import { PasarAlCatalogoModal } from './asistentes/PasarAlCatalogoModal';

const ESTADOS = ['activo', 'inactivo', 'cesado'];

export function Asistentes() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeAltaManual = esAdmin || puede('alta_manual_asistente');
  // Coordinador consulta la vista sin vínculo laboral — ver schema_etapa2i.sql. El puntaje de
  // riesgo vive aparte, en `datos_reservados_asistente`, donde la base exige el permiso
  // `ver_datos_reservados_asistente` para contestar; por eso se pide solo en la consulta de
  // administración y llega adjunto a cada ficha.
  const { filas, estado, error, recargar } = useSupabaseTable(
    esAdmin ? 'asistentes' : 'asistentes_coordinador',
    { orderBy: 'created_at', select: esAdmin ? `*, ${CAMPOS_RESERVADOS}` : '*' },
  );
  const { f, set, limpiar, hayFiltros } = useFiltros({
    busqueda: '',
    estado: '',
    tipo: '',
    zona: '',
    especialidad: '',
  });
  const { paraElegir: tiposAsistente, porId: tiposPorId } = useTiposAsistente();
  // Los dos datos que había que entrar a la ficha para ver. Llegan aparte de la lista y no la
  // demoran: mientras no estén, la tabla se muestra sin ellos.
  const panorama = usePanoramaDelPlantel();
  // Dónde acepta trabajar cada una. Vive en su propia tabla y no en un renglón de la ficha, así
  // que llega aparte, como el panorama.
  const lugaresDelPlantel = useLugaresDelPlantel(filas.map((a) => a.id));
  // El puntaje de riesgo se muestra recalculado, no como quedó guardado la última vez que
  // alguien entró a la ficha: tres de sus siete indicadores salen de datos del Asistente que
  // cambian solos —cuándo entró, cuántas horas hace, en cuántas zonas trabaja—. Las escalas se
  // piden una vez para toda la lista, y sólo cuando la columna se muestra.
  const { filas: escalasCrudas, estado: estadoEscalas } = useEscalasLegales(esAdmin ? usuario?.prestadora_id : null);
  const hoy = new Date().toISOString().slice(0, 10);
  const escalasResueltas = useMemo(
    () => (estadoEscalas === 'listo' ? resolverEscalasVigentes(escalasCrudas, hoy) : null),
    [escalasCrudas, estadoEscalas, hoy],
  );
  // Mientras las escalas no estén —o cuando quien mira no tiene una Prestadora propia, como el
  // Superadmin fuera de un permiso de acceso— el renglón no muestra número: un cero se leería
  // como «sin riesgo», y lo que pasa es que todavía no se pudo calcular.
  function puntajeDeRiesgo(asistente) {
    if (!escalasResueltas) return null;
    const { valores } = deducirIndicadores(asistente, escalasResueltas, hoy);
    const indicadores = indicadoresParaElPuntaje(asistente.indicadores_riesgo, valores);
    return calcularScoreRiesgo(indicadores, escalasResueltas).score;
  }

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [mostrarPasarAlCatalogo, setMostrarPasarAlCatalogo] = useState(false);

  // La ficha con lo que llega aparte: el panorama, y los lugares donde acepta trabajar. Lo
  // guardado en la ficha es cuál lugar; el nombre se busca en el catálogo al mostrarlo.
  const conLugares = useCallback(
    (a) => ({
      ...conDatosAparte(a),
      lugares: lugaresDelPlantel.lugaresDe(a.id),
      zonas: lugaresDelPlantel.nombresDe(a.id),
    }),
    [lugaresDelPlantel],
  );

  const filasFiltradas = useMemo(() => {
    return filas.map(conLugares).filter((a) => {
      const coincideBusqueda =
        !f.busqueda ||
        a.nombre?.toLowerCase().includes(f.busqueda.toLowerCase()) ||
        a.email?.toLowerCase().includes(f.busqueda.toLowerCase());
      const coincideEstado = !f.estado || a.estado === f.estado;
      const coincideTipo = !f.tipo || a.tipo_asistente_id === f.tipo;
      return (
        coincideBusqueda &&
        coincideEstado &&
        coincideTipo &&
        (!f.zona || a.lugares.includes(f.zona)) &&
        coincideConElFiltro(a, 'especialidades', f.especialidad)
      );
    });
  }, [filas, f, conLugares]);

  // El filtro de lugar ofrece los lugares que el plantel tiene cargados, no el catálogo entero:
  // uno donde no trabaja nadie es una opción que siempre contesta vacío. Se elige cuál lugar y no
  // cómo se llama, porque dos localidades de provincias distintas pueden llamarse igual.
  const lugares = useMemo(() => {
    const puestos = new Set(filas.flatMap((a) => lugaresDelPlantel.lugaresDe(a.id)));
    return lugaresDelPlantel.catalogo
      .filter((lugar) => puestos.has(lugar.id))
      .map((lugar) => ({ id: lugar.id, nombre: lugar.nombre }));
  }, [filas, lugaresDelPlantel]);
  const especialidades = useMemo(() => opcionesDelPlantel(filas, 'especialidades'), [filas]);

  // Todos los que todavía no tienen tipo del catálogo. Son de dos orígenes: los que
  // quedaron de la época de la casilla de texto libre —esos traen algo escrito a
  // mano— y los que entraron por importación de una planilla donde no se pudo
  // reconocer el tipo, que no traen nada. Los dos casos se arreglan en la misma
  // pantalla. Mientras haya aunque sea uno se ofrece pasarlos; cuando no quede
  // ninguno, la alerta desaparece sola.
  const sinTipo = useMemo(
    () => filas.filter((a) => !a.tipo_asistente_id),
    [filas],
  );

  return (
    <div>
      <Cabecera titulo={t.asistentes.titulo}>
        {puedeAltaManual && <Button onClick={() => setMostrarNuevo(true)}>{t.asistentes.nuevo.titulo}</Button>}
      </Cabecera>

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
        {/* Los dos filtros aparecen sólo si hay algo que filtrar: una lista desplegable con una
            sola opción, o con ninguna, es una pregunta que no se puede contestar. */}
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

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filasFiltradas.length === 0}
        recargar={recargar}
        filtrado={hayFiltros}
        onLimpiarFiltros={limpiar}
        mensajeVacio={filas.length === 0 ? t.asistentes.vacio_texto : undefined}
        accionVacio={
          filas.length === 0 && puedeAltaManual ? (
            <Button onClick={() => setMostrarNuevo(true)}>{t.asistentes.nuevo.titulo}</Button>
          ) : undefined
        }
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.asistentes.col_nombre}</th>
              <th>{t.asistentes.col_tipo}</th>
              <th>{t.asistentes.col_estado}</th>
              <th>{t.asistentes.col_zonas}</th>
              <th>{t.asistentes.col_especialidades}</th>
              {/* Las dos cuentas del panorama. Cuando la consulta no volvió, la columna no
                  aparece: un cero diría que esa persona no tiene ninguna guardia, y lo que
                  pasó es que no se pudo preguntar. */}
              {panorama.guardias && <th>{con(t.asistentes.col_guardias_activas, { dias: DIAS_DE_HORIZONTE })}</th>}
              {panorama.documentacion && <th>{t.asistentes.col_documentacion}</th>}
              {esAdmin && <th>{t.asistentes.col_vinculo}</th>}
              {esAdmin && <th>{t.asistentes.col_score_riesgo}</th>}
              <th>{t.comun.detalle}</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.nombre}</strong></td>
                <td>
                  {a.tipo_asistente_id ? nombreTipo(tiposPorId.get(a.tipo_asistente_id), t) : t.asistentes.tipo_sin_asignar}
                </td>
                <td>
                  <span className={claseBadge(a.estado)}>
                    {t.asistentes[`estado_${a.estado}`]}
                  </span>
                </td>
                <td>{a.zonas.join(', ') || '—'}</td>
                <td>{(a.especialidades || []).join(', ') || '—'}</td>
                {panorama.guardias && <td>{panorama.guardias.get(a.id) ?? 0}</td>}
                {panorama.documentacion && (
                  <td>
                    {panorama.documentacion.has(a.id) ? (
                      <span className={claseBadge(panorama.documentacion.get(a.id))}>
                        {t.asistentes[`documentacion_${panorama.documentacion.get(a.id)}`]}
                      </span>
                    ) : (
                      t.asistentes.documentacion_sin_papeles
                    )}
                  </td>
                )}
                {esAdmin && <td>{t.asistentes[`vinculo_${a.tipo_vinculo}`]}</td>}
                {esAdmin && <td>{puntajeDeRiesgo(a) ?? '—'}</td>}
                <td>
                  <Button variant="secondary" onClick={() => navigate(`/asistentes/${a.id}`)}>{t.comun.ver_detalle}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </div>
  );
}
