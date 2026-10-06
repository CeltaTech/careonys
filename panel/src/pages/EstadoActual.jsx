import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { Cabecera } from '../components/ui/Cabecera';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useUmbrales } from '../context/UmbralesContext';
import { useModalidades } from '../context/ModalidadesContext';
import { supabase } from '../lib/supabaseClient';
import { con } from '../lib/textos';
import { claseBadge, claseBadgeTono, TONO } from '../lib/tonos';
import { excepcionPorId, resumenDeExcepciones } from '../lib/excepciones';
import { estaSinCubrir } from '../lib/cobertura';
import { cargarPacientesDeGuardias, conPacientes, textoDePacientes } from '../lib/pacientesDeGuardia';
import { hoyISO, sumarDias } from '../lib/horarios';
import { COLUMNAS_ESTADO_MATRICULA } from '../lib/matricula';
import {
  ESTADO_VENCIMIENTO,
  URGENCIA,
  diasParaVencer,
  estadoDeVencimiento,
  fechaLimiteDeAviso,
  urgenciaDeVencimiento,
} from '../lib/reglaVencimientos';
import { diasDePreavisoDeLaPrestadora } from '../lib/plazoDeAviso';
import { EN_PIE, lasQueCorrenElDia } from '../lib/vigenciaPrestacion';
import { ESTADO_ACTIVO } from '../lib/candidatos';
import { soloSinResolver } from '../lib/alertaSinResolver';
import { MODALIDAD, MODALIDADES, contarPorModalidad } from '../lib/modalidades';
import { clienteDelServicio, contactosDeClientes } from '../lib/clienteDelServicio';
import { mensajeDeError } from '../lib/errores';
import './EstadoActual.css';

/* La Situación operativa: la página de entrada del Panel.
   ==========================================================================

   Arriba cinco números, al medio los Servicios activos y las alertas que piden a alguien, abajo
   dos gráficos y las últimas incidencias. Cada bloque lleva a la sección donde se trabaja: acá
   se mira, no se opera. La grilla de la semana y la cobertura de huecos viven en Guardias.

   Todo lo que se cuenta sale de la base en el momento. Lo que la base no guarda no se muestra
   con un número puesto a mano. */

/* Las excepciones miran dos días hacia atrás —quien no llegó, quien no cerró, el reporte que
   falta— y la semana hacia adelante. Es la misma ventana que usa la grilla de Guardias. */
const DIAS_HACIA_ATRAS = 2;
const DIAS_HACIA_ADELANTE = 6;

/* Cuántos Servicios entran en la tabla y cuántas incidencias en la lista. */
const SERVICIOS_A_LA_VISTA = 5;
const INCIDENCIAS_A_LA_VISTA = 3;

/* El estado guardado de un Servicio en pie, y el de una Guardia que ya no va a ocurrir. */
const SERVICIO_EN_PIE = 'vigente';
const GUARDIA_CANCELADA = 'cancelada';

/* Lo que se le pide a cada Servicio para la tabla y para el gráfico de modalidades. */
const CONSULTA_SERVICIOS =
  'id, etiqueta, estado, created_at, tipo_contratante, contratante_id, prestaciones(paciente_id), guardias(paciente_id, canal_modalidad)';

/* Las excepciones que tienen renglón fijo en «Alertas importantes». Las demás aparecen sólo
   cuando tienen algo. */
const EXCEPCION_SIN_CUBRIR = 'sin_cubrir';
const EXCEPCION_TARDE = 'tarde';
const EXCEPCIONES_CON_RENGLON_PROPIO = new Set([EXCEPCION_SIN_CUBRIR, 'documentacion']);

/* El color de cada modalidad en la dona. */
const COLOR_MODALIDAD = {
  [MODALIDAD.DIRECTA]: 'var(--verde-exito)',
  [MODALIDAD.INTERMEDIACION]: 'var(--violeta)',
};

const NOMBRE_MODALIDAD = {
  [MODALIDAD.DIRECTA]: (t) => t.configuracion.modalidades_directa,
  [MODALIDAD.INTERMEDIACION]: (t) => t.configuracion.modalidades_intermediacion,
};

/** El fondo de una dona a partir de tramos `{color, cantidad}`. */
function fondoDeDona(tramos) {
  const total = tramos.reduce((s, x) => s + x.cantidad, 0);
  if (total === 0) return 'var(--tono-neutro-fondo)';
  let acumulado = 0;
  const partes = tramos
    .filter((x) => x.cantidad > 0)
    .map((x) => {
      const desde = (acumulado / total) * 100;
      acumulado += x.cantidad;
      const hasta = (acumulado / total) * 100;
      return `${x.color} ${desde}% ${hasta}%`;
    });
  return `conic-gradient(${partes.join(', ')})`;
}

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/* ---------- Íconos de trazo de los recuadros de arriba ---------- */

function IconoServicios() {
  return (
    <svg viewBox="0 0 24 24" className="estado-actual-trazo-verde" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6" />
      <path d="M14 15c2.8-.3 4.9 1.3 5.4 5" />
    </svg>
  );
}

function IconoPrestaciones() {
  return (
    <svg viewBox="0 0 24 24" className="estado-actual-trazo-azul" aria-hidden="true">
      <rect x="4" y="3" width="15" height="17" rx="2" />
      <path d="M8 7h7M8 11h5M8 15h4" />
      <circle cx="17" cy="17" r="4" className="estado-actual-icono-relleno" />
      <path d="M17 15v2l1 1" />
    </svg>
  );
}

function IconoAsistentes() {
  return (
    <svg viewBox="0 0 24 24" className="estado-actual-trazo-violeta" aria-hidden="true">
      <circle cx="10" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M4 20c.5-4 2.4-6 6-6s5.5 2 6 6" />
      <path d="M15 15c2.7-.1 4.5 1.5 5 5" />
    </svg>
  );
}

function IconoGuardias() {
  return (
    <svg viewBox="0 0 24 24" className="estado-actual-trazo-naranja" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h3M8 17h6" />
    </svg>
  );
}

function IconoCobertura() {
  return (
    <svg viewBox="0 0 24 24" className="estado-actual-trazo-verde" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/* ---------- Piezas ---------- */

function Tarjeta({ titulo, enlace, children }) {
  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
        {enlace}
      </div>
      {children}
    </section>
  );
}

function Kpi({ icono, etiqueta, numero, a, textoEnlace }) {
  return (
    <div className="panel-tarjeta panel-kpi">
      <div className="panel-kpi-icono">{icono}</div>
      <div className="panel-kpi-etiqueta">{etiqueta}</div>
      <div className="panel-kpi-numero">{numero}</div>
      <Link className="panel-enlace" to={a}>
        {textoEnlace}
      </Link>
    </div>
  );
}

function FilaAlerta({ a, titulo, detalle, cantidad, tono }) {
  return (
    <Link className="panel-fila-alerta" to={a}>
      <div>
        <b>{titulo}</b>
        {detalle && <span className="panel-mini">{detalle}</span>}
      </div>
      <span className={claseBadgeTono(tono)}>{cantidad}</span>
    </Link>
  );
}

function Mensaje({ children }) {
  return (
    <p className="estado-actual-mensaje" role="status">
      {children}
    </p>
  );
}

export function EstadoActual() {
  const { t, locale } = useLocale();
  const tx = t.estado_actual;
  const navigate = useNavigate();
  const prestadoraId = usePrestadoraActual();
  const umbrales = useUmbrales();
  const { modalidades } = useModalidades();

  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const hoy = hoyISO();
    const desde = sumarDias(hoy, -DIAS_HACIA_ATRAS);
    const hasta = sumarDias(hoy, DIAS_HACIA_ADELANTE);
    const diasDePreaviso = await diasDePreavisoDeLaPrestadora(prestadoraId);
    const limitePapeles = fechaLimiteDeAviso(diasDePreaviso);

    const [gs, as, ps, ds, em, sv, pr, al, inc, incAbiertas] = await Promise.all([
      supabase.from('guardias').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('asistentes').select('id, estado'),
      supabase.from('pacientes').select('id, nombre'),
      supabase
        .from('documentos_asistente')
        .select('asistente_id, fecha_vencimiento')
        .not('fecha_vencimiento', 'is', null)
        .lte('fecha_vencimiento', limitePapeles),
      supabase.from('estado_matricula_asistente').select(COLUMNAS_ESTADO_MATRICULA),
      supabase
        .from('servicios')
        .select(CONSULTA_SERVICIOS)
        .eq('estado', SERVICIO_EN_PIE)
        .order('created_at', { ascending: false }),
      supabase.from('prestaciones').select('id, estado, vigente_desde, vigente_hasta').eq('estado', EN_PIE),
      soloSinResolver(supabase.from('alertas').select('id', { count: 'exact', head: true })),
      supabase
        .from('incidentes_relevo')
        .select('id, guardia_saliente_id, iniciado_at, resuelto_at')
        .order('iniciado_at', { ascending: false })
        .limit(INCIDENCIAS_A_LA_VISTA),
      supabase.from('incidentes_relevo').select('id', { count: 'exact', head: true }).is('resuelto_at', null),
    ]);

    // Un número que no se pudo leer no se muestra como cero: la página entera pasa a error.
    const fallida = [gs, as, ps, ds, em, sv, pr, al, inc, incAbiertas].find((r) => r.error);
    if (fallida) {
      setError(mensajeDeError(fallida.error, t));
      setEstado('error');
      return;
    }

    const nombresPaciente = Object.fromEntries((ps.data ?? []).map((p) => [p.id, p.nombre]));
    const pacientesPorGuardia = await cargarPacientesDeGuardias((gs.data ?? []).map((g) => g.id));
    const guardias = conPacientes(gs.data ?? [], pacientesPorGuardia, nombresPaciente);

    // Papeles: vencido es rojo, por vencer es naranja. La regla es la de Documentación.
    const porVencer = new Set();
    const vencidos = new Set();
    let hayPapelVencido = false;
    for (const d of ds.data ?? []) {
      const estadoPapel = estadoDeVencimiento(diasParaVencer(d.fecha_vencimiento), diasDePreaviso);
      if (estadoPapel === ESTADO_VENCIMIENTO.VENCIDO) {
        vencidos.add(d.asistente_id);
        hayPapelVencido = true;
      } else porVencer.add(d.asistente_id);
    }

    // Reportes que faltan, sólo sobre guardias terminadas.
    const completadas = guardias.filter((g) => g.estado === 'completada');
    const sinReporte = new Set();
    if (completadas.length > 0) {
      const { data: reportes, error: errorReportes } = await supabase
        .from('reportes')
        .select('guardia_id, paciente_id')
        .in(
          'guardia_id',
          completadas.map((g) => g.id),
        );
      if (errorReportes) {
        setError(mensajeDeError(errorReportes, t));
        setEstado('error');
        return;
      }
      const hechosPorGuardia = new Map();
      for (const r of reportes ?? []) {
        if (!hechosPorGuardia.has(r.guardia_id)) hechosPorGuardia.set(r.guardia_id, new Set());
        hechosPorGuardia.get(r.guardia_id).add(r.paciente_id);
      }
      for (const g of completadas) {
        const hechos = hechosPorGuardia.get(g.id);
        const esperados = g.paciente_ids?.length ? g.paciente_ids : [];
        if (!hechos || esperados.some((id) => !hechos.has(id))) sinReporte.add(g.id);
      }
    }

    const matriculaTrabada = new Set();
    const matriculaPorVencer = new Set();
    for (const fila of em.data ?? []) {
      if (fila.motivo_bloqueo) {
        matriculaTrabada.add(fila.asistente_id);
        continue;
      }
      if (fila.requiere_matricula !== true) continue;
      if (urgenciaDeVencimiento(fila.dias_para_vencer, diasDePreaviso) !== URGENCIA.NINGUNA) {
        matriculaPorVencer.add(fila.asistente_id);
      }
    }

    const servicios = sv.data ?? [];
    const { contactos, error: errorContactos } = await contactosDeClientes(supabase, servicios);
    if (errorContactos) {
      setError(mensajeDeError(errorContactos, t));
      setEstado('error');
      return;
    }

    setDatos({
      hoy,
      guardias,
      servicios,
      contactos,
      nombresPaciente,
      prestacionesQueCorren: lasQueCorrenElDia(pr.data ?? [], hoy).length,
      asistentesActivos: (as.data ?? []).filter((a) => a.estado === ESTADO_ACTIVO).length,
      papelesPorVencer: (ds.data ?? []).length,
      hayPapelVencido,
      alertasSinResolver: al.count ?? 0,
      incidenciasAbiertas: incAbiertas.count ?? 0,
      incidencias: inc.data ?? [],
      ctxExtra: {
        asistentesConPapelPorVencer: porVencer,
        asistentesConPapelVencido: vencidos,
        guardiasSinReporte: sinReporte,
        diasDePreaviso,
        asistentesConMatriculaTrabada: matriculaTrabada,
        asistentesConMatriculaPorVencer: matriculaPorVencer,
      },
    });
    setEstado('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El reloj y los umbrales entran una sola vez por carga: todos los contadores miran el mismo
  // momento y las mismas reglas que la grilla de Guardias.
  const ctx = useMemo(
    () => (datos ? { ahora: new Date(), umbrales, ...datos.ctxExtra } : null),
    [datos, umbrales],
  );

  const resumen = useMemo(() => (datos && ctx ? resumenDeExcepciones(datos.guardias, ctx) : []), [datos, ctx]);

  // Cobertura de hoy: sin las canceladas, que ya no van a ocurrir.
  const cobertura = useMemo(() => {
    if (!datos || !ctx) return null;
    const tarde = excepcionPorId(EXCEPCION_TARDE);
    const deHoy = datos.guardias.filter((g) => g.fecha === datos.hoy && g.estado !== GUARDIA_CANCELADA);
    let sinCobertura = 0;
    let enRiesgo = 0;
    for (const g of deHoy) {
      if (estaSinCubrir(g)) sinCobertura += 1;
      else if (tarde?.aplica(g, ctx)) enRiesgo += 1;
    }
    const total = deHoy.length;
    return { total, sinCobertura, enRiesgo, cubiertas: total - sinCobertura - enRiesgo };
  }, [datos, ctx]);

  // Modalidad de cada Servicio: la de sus guardias. Un Servicio con guardias en dos modalidades
  // cuenta en las dos.
  const porModalidad = useMemo(() => {
    if (!datos) return [];
    const cuenta = contarPorModalidad(datos.servicios, (s) => [
      ...new Set((s.guardias ?? []).map((g) => g.canal_modalidad).filter(Boolean)),
    ]);
    const habilitadas = new Set(modalidades ?? []);
    return MODALIDADES.filter((m) => habilitadas.has(m) || cuenta[m] > 0).map((m) => ({
      modalidad: m,
      cantidad: cuenta[m],
      color: COLOR_MODALIDAD[m],
    }));
  }, [datos, modalidades]);

  const fecha = (iso) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '—';

  if (estado === 'cargando') {
    return (
      <div>
        <Cabecera titulo={tx.titulo} />
        <p className="estado-cargando" role="status">
          {t.comun.cargando}
        </p>
      </div>
    );
  }

  if (estado === 'error' || !datos) {
    return (
      <div>
        <Cabecera titulo={tx.titulo} />
        <Alert variant="error">
          {error || t.comun.error_generico}{' '}
          <Button variant="secondary" type="button" onClick={cargar}>
            {t.comun.reintentar}
          </Button>
        </Alert>
      </div>
    );
  }

  const cantidadDe = (id) => resumen.find((r) => r.id === id)?.cantidad ?? 0;
  const otrasExcepciones = resumen.filter((r) => !EXCEPCIONES_CON_RENGLON_PROPIO.has(r.id) && r.cantidad > 0);
  const totalModalidad = porModalidad.reduce((s, x) => s + x.cantidad, 0);
  const pctCobertura = porcentaje(cobertura.total - cobertura.sinCobertura, cobertura.total);
  const serviciosVisibles = datos.servicios.slice(0, SERVICIOS_A_LA_VISTA);

  return (
    <div>
      <Cabecera titulo={tx.titulo} />

      <div className="panel-grilla panel-kpis">
        <Kpi
          icono={<IconoServicios />}
          etiqueta={tx.kpi_servicios}
          numero={datos.servicios.length}
          a="/servicios"
          textoEnlace={tx.ver_servicios}
        />
        <Kpi
          icono={<IconoPrestaciones />}
          etiqueta={tx.kpi_prestaciones}
          numero={datos.prestacionesQueCorren}
          a="/servicios"
          textoEnlace={tx.ver_prestaciones}
        />
        <Kpi
          icono={<IconoAsistentes />}
          etiqueta={tx.kpi_asistentes}
          numero={datos.asistentesActivos}
          a="/asistentes"
          textoEnlace={tx.ver_asistentes}
        />
        <Kpi
          icono={<IconoGuardias />}
          etiqueta={tx.kpi_guardias_hoy}
          numero={cobertura.total}
          a="/guardias"
          textoEnlace={tx.ver_guardias}
        />
        <Kpi
          icono={<IconoCobertura />}
          etiqueta={tx.kpi_cobertura}
          numero={cobertura.total > 0 ? `${pctCobertura}%` : '—'}
          a="/guardias"
          textoEnlace={tx.ver_cobertura}
        />
      </div>

      <div className="panel-grilla panel-columnas-2">
        <Tarjeta
          titulo={tx.servicios_activos}
          enlace={
            <Link className="panel-enlace" to="/servicios">
              {tx.ver_todos}
            </Link>
          }
        >
          {serviciosVisibles.length === 0 ? (
            <Mensaje>{tx.sin_servicios}</Mensaje>
          ) : (
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{tx.col_servicio}</th>
                  <th>{tx.col_paciente}</th>
                  <th>{tx.col_contratante}</th>
                  <th>{tx.col_prestaciones}</th>
                  <th>{tx.col_estado}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {serviciosVisibles.map((s) => {
                  const idsPaciente = [
                    ...new Set(
                      [...(s.prestaciones ?? []), ...(s.guardias ?? [])].map((x) => x.paciente_id).filter(Boolean),
                    ),
                  ];
                  const nombres = idsPaciente.map((id) => datos.nombresPaciente[id]).filter(Boolean);
                  const contacto = clienteDelServicio(s, datos.contactos).contacto;
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.etiqueta || '—'}</b>
                      </td>
                      <td>{textoDePacientes(nombres, t.guardias.pacientes_y_mas)}</td>
                      <td>{contacto?.nombre ?? '—'}</td>
                      <td>{(s.prestaciones ?? []).length}</td>
                      <td>
                        <span className={claseBadge(s.estado)}>
                          {traducirValor(t.servicios, `estado_${s.estado}`)}
                        </span>
                      </td>
                      <td>
                        <Button variant="secondary" type="button" onClick={() => navigate(`/servicios/${s.id}`)}>
                          {tx.ver}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Tarjeta>

        <Tarjeta
          titulo={tx.alertas_importantes}
          enlace={
            <Link className="panel-enlace" to="/alertas">
              {tx.ver_todas}
            </Link>
          }
        >
          <FilaAlerta
            a="/guardias"
            titulo={tx.guardias_sin_cobertura}
            detalle={tx.requieren_asignacion}
            cantidad={cantidadDe(EXCEPCION_SIN_CUBRIR)}
            tono={TONO.CRITICO}
          />
          <FilaAlerta
            a="/documentacion"
            titulo={tx.documentacion_por_vencer}
            detalle={con(tx.en_los_proximos_dias, { dias: datos.ctxExtra.diasDePreaviso })}
            cantidad={datos.papelesPorVencer}
            tono={datos.hayPapelVencido ? TONO.CRITICO : TONO.ATENCION}
          />
          <FilaAlerta
            a="/alertas"
            titulo={tx.alertas_sin_resolver}
            detalle={tx.sobre_pacientes}
            cantidad={datos.alertasSinResolver}
            tono={TONO.INFO}
          />
          <FilaAlerta
            a="/continuidad"
            titulo={tx.incidencias_abiertas}
            detalle={tx.requieren_seguimiento}
            cantidad={datos.incidenciasAbiertas}
            tono={TONO.CRITICO}
          />
          {otrasExcepciones.map((exc) => (
            <FilaAlerta
              key={exc.id}
              a="/guardias"
              titulo={con(tx[exc.claveEtiqueta], exc.parametros)}
              cantidad={exc.cantidad}
              tono={exc.critica ? TONO.CRITICO : TONO.ATENCION}
            />
          ))}
        </Tarjeta>
      </div>

      <div className="panel-grilla panel-columnas-3">
        <Tarjeta
          titulo={tx.servicios_por_modalidad}
          enlace={
            <Link className="panel-enlace" to="/servicios">
              {tx.ver_detalle}
            </Link>
          }
        >
          {totalModalidad === 0 ? (
            <Mensaje>{tx.sin_modalidad}</Mensaje>
          ) : (
            <div className="panel-grafico">
              <div className="panel-dona" style={{ background: fondoDeDona(porModalidad) }}>
                <b>{datos.servicios.length}</b>
              </div>
              <div className="panel-leyenda">
                {porModalidad.map((x) => (
                  <div key={x.modalidad}>
                    <i className="panel-punto" style={{ background: x.color }} />
                    {NOMBRE_MODALIDAD[x.modalidad]?.(t) ?? x.modalidad}
                    {'  '}
                    {x.cantidad} ({porcentaje(x.cantidad, totalModalidad)}%)
                  </div>
                ))}
              </div>
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo={tx.cobertura_guardias}
          enlace={
            <Link className="panel-enlace" to="/guardias">
              {tx.ver_analisis}
            </Link>
          }
        >
          {cobertura.total === 0 ? (
            <Mensaje>{tx.sin_guardias_hoy}</Mensaje>
          ) : (
            <div className="panel-grafico">
              <div
                className="panel-dona"
                style={{
                  background: fondoDeDona([
                    { color: 'var(--verde-exito)', cantidad: cobertura.cubiertas },
                    { color: 'var(--naranja-alerta)', cantidad: cobertura.enRiesgo },
                    { color: 'var(--rojo-peligro)', cantidad: cobertura.sinCobertura },
                  ]),
                }}
              >
                <b>{pctCobertura}%</b>
              </div>
              <div className="panel-leyenda">
                <div>{con(tx.cubiertas, { n: cobertura.cubiertas })}</div>
                <div>{con(tx.sin_cobertura, { n: cobertura.sinCobertura })}</div>
                <div>{con(tx.en_riesgo, { n: cobertura.enRiesgo })}</div>
              </div>
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo={tx.incidencias_recientes}
          enlace={
            <Link className="panel-enlace" to="/continuidad">
              {tx.ver_todas}
            </Link>
          }
        >
          {datos.incidencias.length === 0 ? (
            <Mensaje>{tx.sin_incidencias}</Mensaje>
          ) : (
            datos.incidencias.map((i) => {
              const abierta = !i.resuelto_at;
              return (
                <Link key={i.id} className="panel-fila-alerta" to="/continuidad">
                  <div>
                    <b>{i.guardia_saliente_id ? tx.incidencia_relevo : tx.incidencia_ausencia}</b>
                    <span className="panel-mini">{fecha(i.iniciado_at)}</span>
                  </div>
                  <span className={claseBadgeTono(abierta ? TONO.CRITICO : TONO.EXITO)}>
                    {abierta ? tx.abierta : tx.resuelta}
                  </span>
                </Link>
              );
            })
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
