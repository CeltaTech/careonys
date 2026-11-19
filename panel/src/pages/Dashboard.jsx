import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { useAuth } from '../context/AuthContext';
import { useModalidades } from '../context/ModalidadesContext';
import { esAdminOSuperior } from '../lib/roles';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { EstadoLista } from '../components/layout/EstadoLista';
import { supabase } from '../lib/supabaseClient';
import { fechaLimiteDeAviso } from '../lib/reglaVencimientos';
import { documentosQueVencen } from '../lib/documentosQueVencen';
import { diasDePreavisoDeLaPrestadora } from '../lib/plazoDeAviso';
import { ESTADO_EN_CURSO } from '../lib/turnoGuardiaSinCerrar';
import { hoyISO } from '../lib/horarios';
import { soloSinResolver } from '../lib/alertaSinResolver';
import { contarPorModalidad, MODALIDADES, modalidadesDelAsistente } from '../lib/modalidades';
import { ESTADO_ACTIVO, estaEnElPadron } from '../lib/candidatos';
import { claseBadgeTono, TONO } from '../lib/tonos';
import { informacionDeSalud } from '../lib/informacionDeSalud';
import './tarjetas.css';

// Los nombres de las modalidades salen de un solo lado: los mismos textos que usa la
// solapa donde se activan y se desactivan, en Configuración → La Prestadora (Regla 12).
// Antes se tomaban prestados dos títulos del menú, que solo servían mientras el menú
// estuvo agrupado por modalidad; desde que se agrupa por lo que uno viene a hacer, ese
// préstamo dejó de tener sentido.
const NOMBRE_MODALIDAD = {
  directa: (t) => t.configuracion.modalidades_directa,
  intermediacion: (t) => t.configuracion.modalidades_intermediacion,
};

// El tono de cada modalidad en las donas, sacado de los tonos del producto.
const COLOR_MODALIDAD = {
  directa: 'var(--verde-exito)',
  intermediacion: 'var(--violeta)',
};

function esHoy(fechaIso) {
  const hoy = new Date();
  const fecha = new Date(fechaIso);
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

function esEstaSemana(fechaIso) {
  const fecha = new Date(fechaIso);
  const ahora = new Date();
  const inicioSemana = new Date(ahora);
  inicioSemana.setDate(ahora.getDate() - ahora.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  return fecha >= inicioSemana;
}

export function Dashboard() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const { modalidades } = useModalidades();
  const desgloseModalidadHabilitado = modalidades.length > 1;
  const esAdmin = esAdminOSuperior(usuario?.rol);
  // La guía de primeros pasos vivía acá hasta el 2026-09-09, con cuatro pasos propios, y en el
  // Estado actual había otra con cinco: dos listas distintas de «primeros pasos» para la misma
  // Prestadora según en qué pantalla estuviera. Quedó una sola, en la pantalla de entrada —
  // `components/estado-actual/GuiaPrimerosPasos.jsx` (pendiente #139).
  const postulaciones = useSupabaseTable('postulaciones', {
    filtros: { prestadora_id: prestadoraId },
    requiere: [prestadoraId],
  });
  // Coordinador consulta la vista sin vínculo laboral/score de riesgo — ver schema_etapa2i.sql.
  const asistentes = useSupabaseTable(esAdmin ? 'asistentes' : 'asistentes_coordinador', {
    orderBy: 'created_at',
    select: esAdmin ? '*, cuenta_desactivada' : '*',
    filtros: esAdmin ? { prestadora_id: prestadoraId } : null,
    requiere: [prestadoraId],
  });
  const clientes = useSupabaseTable('clientes', {
    orderBy: 'created_at',
    filtros: { prestadora_id: prestadoraId },
    requiere: [prestadoraId],
  });
  const [turnosGuardiaEnCurso, setTurnosGuardiaEnCurso] = useState(null);
  const [turnosGuardiaPorModalidad, setTurnosGuardiaPorModalidad] = useState(null);
  const [errorTurnosGuardia, setErrorTurnosGuardia] = useState(null);
  const [vinculosPorModalidad, setVinculosPorModalidad] = useState(null);
  const [errorVinculos, setErrorVinculos] = useState(null);
  const [ausentesSinRelevo, setAusentesSinRelevo] = useState(null);
  const [ausentesPorModalidad, setAusentesPorModalidad] = useState(null);
  const [documentosPorVencer, setDocumentosPorVencer] = useState(null);
  const [alertasIaSinResolver, setAlertasIaSinResolver] = useState(null);
  const [errorAlertas, setErrorAlertas] = useState(null);

  // Cuántos turnos de guardia están pasando ahora mismo, y de qué modalidad es cada una. De cada turno de guardia
  // viaja una sola columna —la modalidad—: de este número no se muestra ningún turno de guardia, así que
  // traerlas enteras sería pasear por el navegador el domicilio y el Paciente de cada una para
  // descartarlos. Con esa columna sola salen el total y el desglose de una sola consulta, que es
  // lo mismo que hace el conteo de ausentes más abajo.
  //
  // El día es el de quien mira, igual que en la lista de Guardias, y el estado sale del punto
  // único de verdad que ya usan las dos aplicaciones (`lib/turnoGuardiaSinCerrar.js`). Van las dos
  // condiciones juntas a propósito: un turno de guardia de ayer que sigue en curso no está pasando, es
  // una que nadie cerró, y eso se mira en otro lado —contarla acá diría que hay gente
  // trabajando donde no hay nadie.
  const cargarTurnosGuardiaEnCurso = useCallback(async () => {
    if (!prestadoraId) return;
    setTurnosGuardiaEnCurso(null);
    setTurnosGuardiaPorModalidad(null);
    setErrorTurnosGuardia(null);

    // `canal_modalidad` es un nombre guardado de antes y no se renombra (regla 13); de
    // `lib/modalidades.js` para afuera la cosa se llama modalidad.
    const { data, error } = await supabase
      .from('turnos_guardia')
      .select('canal_modalidad')
      .eq('prestadora_id', prestadoraId)
      .eq('estado', ESTADO_EN_CURSO)
      .eq('fecha', hoyISO());

    if (error) {
      setErrorTurnosGuardia(t.comun.error_generico);
      return;
    }
    setTurnosGuardiaEnCurso(data?.length ?? 0);
    setTurnosGuardiaPorModalidad(contarPorModalidad(data, (g) => g.canal_modalidad));
  }, [prestadoraId, t]);

  // Cuántas personas tienen hoy vínculo activo con la Prestadora, y en qué modalidad trabaja cada
  // una. Se pide una sola columna, la modalidad, y ni siquiera el nombre: de acá no sale ningún
  // Legajo del Asistente, sale un número por renglón.
  //
  // Quien trabaja en las dos modalidades cuenta en las dos, así que los renglones suman más que
  // el Padrón —lo dice la etiqueta: son vínculos, no personas—.
  //
  // La consulta sale sola de esta pantalla, en vez de reusar el Padrón que ya se carga arriba,
  // porque ese Padrón le llega al Coordinador por una vista que no trae la modalidad. Es la
  // misma tabla y la misma columna que ya consulta el Estado actual para armar sus candidatos.
  const cargarVinculosPorModalidad = useCallback(async () => {
    if (!desgloseModalidadHabilitado || !prestadoraId) return;
    setVinculosPorModalidad(null);
    setErrorVinculos(null);

    const { data, error } = await supabase
      .from('asistentes')
      .select('canales')
      .eq('prestadora_id', prestadoraId)
      .eq('estado', ESTADO_ACTIVO)
      .eq('cuenta_desactivada', false);

    if (error) {
      setErrorVinculos(t.comun.error_generico);
      return;
    }
    setVinculosPorModalidad(contarPorModalidad(data, modalidadesDelAsistente));
  }, [desgloseModalidadHabilitado, prestadoraId, t]);

  useEffect(() => {
    cargarTurnosGuardiaEnCurso();
    cargarVinculosPorModalidad();
  }, [cargarTurnosGuardiaEnCurso, cargarVinculosPorModalidad]);

  const cargarAlertas = useCallback(async () => {
    if (!prestadoraId) return;
    setAusentesSinRelevo(null);
    setAusentesPorModalidad(null);
    setDocumentosPorVencer(null);
    setAlertasIaSinResolver(null);
    setErrorAlertas(null);

    // Trae la modalidad de trabajo de cada incidente —columna `turnos_guardia.canal_modalidad`, un
    // nombre viejo que no se renombra (regla 13)— para poder desglosar por
    // modalidad cuando la Prestadora tiene más de una activa (pendiente #85 ítem 3) sin
    // repetir la consulta — un solo punto de verdad para el conteo total y el desglose.
    const { data: filasAusentes, error: errorAusentes } = await supabase
      .from('incidentes_relevo')
      .select('turnos_guardia!incidentes_relevo_entrante_tenant_fk(canal_modalidad)')
      .eq('prestadora_id', prestadoraId)
      .is('resuelto_at', null)
      .is('turno_guardia_saliente_id', null);

    // El plazo de preaviso y hasta qué día hay que mirar salen del mismo lugar que en el Estado
    // actual y en Documentación, así que los tres contadores dicen lo mismo (regla 12).
    const diasDePreaviso = await diasDePreavisoDeLaPrestadora(prestadoraId);
    // Qué documento cuenta lo decide `lib/documentosQueVencen.js`, el mismo que arma la lista.
    const { documentos: documentosQueVencenYa, error: errorDocumentos } = await documentosQueVencen({
      prestadoraId,
      hasta: fechaLimiteDeAviso(diasDePreaviso),
    });

    // Las que la IA dejó escritas y todavía no miró nadie. Qué significa «sin resolver» no se
    // escribe acá: lo dice `lib/alertaSinResolver.js`, el mismo archivo que consultan la lista de
    // Alertas y la Ficha del cliente. Se cuentan sin traer las filas porque de este número no se
    // muestra ninguna alerta, y cada una nombra a un Paciente y describe lo que le está pasando.
    // Van todos los niveles juntos: separar lo que urge de lo que no es trabajo de la pantalla de
    // Alertas, que las tiene delante; acá el número dice cuánto quedó sin mirar.
    const { count: countAlertasIa, error: errorAlertasIa } = await soloSinResolver(
      informacionDeSalud.from('alertas').select('id', { count: 'exact', head: true }),
    );

    if (errorAusentes || errorDocumentos || errorAlertasIa) {
      setErrorAlertas(t.comun.error_generico);
      return;
    }
    setAusentesSinRelevo(filasAusentes?.length ?? 0);
    setAusentesPorModalidad(contarPorModalidad(filasAusentes, (fila) => fila.turnos_guardia?.canal_modalidad));
    setDocumentosPorVencer(documentosQueVencenYa.length);
    setAlertasIaSinResolver(countAlertasIa ?? 0);
  }, [prestadoraId, t]);

  useEffect(() => {
    cargarAlertas();
  }, [cargarAlertas]);

  const estados = [postulaciones.estado, asistentes.estado, clientes.estado];
  // El desglose de vínculos no entra en la espera si la Prestadora tiene una sola modalidad: en
  // ese caso ni se consulta, y quedaría esperando algo que nunca va a llegar.
  const faltaElDesgloseDeVinculos = desgloseModalidadHabilitado && vinculosPorModalidad === null;
  const estadoGeneral = estados.includes('error') || errorTurnosGuardia || errorVinculos
    ? 'error'
    : estados.includes('cargando') || turnosGuardiaEnCurso === null || faltaElDesgloseDeVinculos
      ? 'cargando'
      : 'listo';

  const postulacionesHoy = postulaciones.filas.filter((p) => esHoy(p.creado_en)).length;
  const postulacionesSemana = postulaciones.filas.filter((p) => esEstaSemana(p.creado_en)).length;
  const asistentesDisponibles = asistentes.filas.filter(estaEnElPadron).length;
  const clientesActivos = clientes.filas.filter((f) => !f.deleted_at).length;

  const nombreDeModalidad = (modalidad) => NOMBRE_MODALIDAD[modalidad]?.(t) ?? modalidad;
  const modalidadesDeAsistente = modalidades.filter((modalidad) => MODALIDADES.includes(modalidad));

  return (
    <div>
      <Cabecera titulo={t.dashboard.titulo} />

      <EstadoLista
        estado={estadoGeneral}
        error={
          postulaciones.error ||
          asistentes.error ||
          clientes.error ||
          errorTurnosGuardia ||
          errorVinculos
        }
        vacio={false}
        recargar={() => {
          postulaciones.recargar();
          asistentes.recargar();
          clientes.recargar();
          cargarTurnosGuardiaEnCurso();
          cargarVinculosPorModalidad();
        }}
      >
        <div className="panel-grilla panel-kpis">
          {/* Va primero porque es lo único que está pasando ahora mismo, y lleva enlace porque la
              lista de Guardias abre en hoy. */}
          <Link to="/turnos-guardia" className="panel-tarjeta panel-kpi">
            <div className="panel-kpi-etiqueta">{t.dashboard.turnos_guardia_en_curso}</div>
            <div className="panel-kpi-numero">{turnosGuardiaEnCurso}</div>
          </Link>
          <div className="panel-tarjeta panel-kpi">
            <div className="panel-kpi-etiqueta">{t.dashboard.postulaciones_hoy}</div>
            <div className="panel-kpi-numero">{postulacionesHoy}</div>
          </div>
          <div className="panel-tarjeta panel-kpi">
            <div className="panel-kpi-etiqueta">{t.dashboard.postulaciones_semana}</div>
            <div className="panel-kpi-numero">{postulacionesSemana}</div>
          </div>
          <div className="panel-tarjeta panel-kpi">
            <div className="panel-kpi-etiqueta">{t.dashboard.asistentes_disponibles}</div>
            <div className="panel-kpi-numero">{asistentesDisponibles}</div>
          </div>
          <div className="panel-tarjeta panel-kpi">
            <div className="panel-kpi-etiqueta">{t.dashboard.clientes_activos}</div>
            <div className="panel-kpi-numero">{clientesActivos}</div>
          </div>
        </div>
      </EstadoLista>

      <div className="panel-grilla panel-columnas-2">
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.dashboard.seccion_alertas_titulo}</h2>
          </div>
          <EstadoLista
            estado={errorAlertas ? 'error' : ausentesSinRelevo === null ? 'cargando' : 'listo'}
            error={errorAlertas}
            vacio={false}
            recargar={cargarAlertas}
          >
            <>
              <Link to="/continuidad" className="panel-fila-alerta">
                <div><b>{t.dashboard.ausentes_sin_relevo}</b></div>
                <span className={claseBadgeTono(ausentesSinRelevo > 0 ? TONO.CRITICO : TONO.NEUTRO)}>
                  {ausentesSinRelevo}
                </span>
              </Link>
              <Link to="/documentacion" className="panel-fila-alerta">
                <div><b>{t.dashboard.documentacion_por_vencer}</b></div>
                <span className={claseBadgeTono(documentosPorVencer > 0 ? TONO.ATENCION : TONO.NEUTRO)}>
                  {documentosPorVencer}
                </span>
              </Link>
              {/* El enlace lleva a la lista de Alertas, que abre filtrada en las pendientes. */}
              <Link to="/alertas" className="panel-fila-alerta">
                <div><b>{t.dashboard.alertas_ia_sin_resolver}</b></div>
                <span className={claseBadgeTono(alertasIaSinResolver > 0 ? TONO.ATENCION : TONO.NEUTRO)}>
                  {alertasIaSinResolver}
                </span>
              </Link>
            </>
          </EstadoLista>
        </section>
      </div>

      {/* El desglose aparece solamente cuando la Prestadora trabaja de más de una manera: con
          una sola, cada dona repetiría el número de arriba. */}
      {desgloseModalidadHabilitado && (
        <div className="panel-grilla panel-columnas-3">
          {turnosGuardiaPorModalidad && (
            <DonaPorModalidad
              titulo={t.dashboard.turnos_guardia_en_curso}
              cuentas={turnosGuardiaPorModalidad}
              modalidades={modalidades}
              nombreDeModalidad={nombreDeModalidad}
            />
          )}
          {vinculosPorModalidad && (
            <DonaPorModalidad
              titulo={t.dashboard.vinculos_activos}
              cuentas={vinculosPorModalidad}
              modalidades={modalidadesDeAsistente}
              nombreDeModalidad={nombreDeModalidad}
            />
          )}
          {ausentesPorModalidad && (
            <DonaPorModalidad
              titulo={t.dashboard.ausentes_sin_relevo}
              cuentas={ausentesPorModalidad}
              modalidades={modalidades}
              nombreDeModalidad={nombreDeModalidad}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* Una dona con lo que cuenta cada modalidad: el total al medio y, al lado, cuánto es de cada
   una. Sale sólo de los números que la pantalla ya trajo. */
function DonaPorModalidad({ titulo, cuentas, modalidades, nombreDeModalidad }) {
  const filas = modalidades.map((modalidad) => ({ modalidad, cantidad: cuentas[modalidad] ?? 0 }));
  const total = filas.reduce((suma, fila) => suma + fila.cantidad, 0);
  let acumulado = 0;
  const tramos = filas.map((fila) => {
    const desde = total > 0 ? (acumulado / total) * 100 : 0;
    acumulado += fila.cantidad;
    const hasta = total > 0 ? (acumulado / total) * 100 : 0;
    return `${colorDeModalidad(fila.modalidad)} ${desde}% ${hasta}%`;
  });
  const fondo = total > 0 ? `conic-gradient(${tramos.join(', ')})` : 'var(--borde-card)';

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
      </div>
      <div className="panel-grafico">
        <div className="panel-dona" style={{ background: fondo }}>
          <b>{total}</b>
        </div>
        <div className="panel-leyenda">
          {filas.map((fila) => (
            <div key={fila.modalidad}>
              <i className="panel-punto" style={{ background: colorDeModalidad(fila.modalidad) }} />
              {nombreDeModalidad(fila.modalidad)} {fila.cantidad}
              {total > 0 && ` (${Math.round((fila.cantidad / total) * 100)}%)`}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function colorDeModalidad(modalidad) {
  return COLOR_MODALIDAD[modalidad] ?? 'var(--texto-secundario)';
}
