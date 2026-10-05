import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useEmergenciasSinTomar } from '../hooks/useEmergenciasSinTomar';
import { usePedidosDeCodigo } from '../context/PedidosDeCodigoContext';
import { useUmbrales } from '../context/UmbralesContext';
import { useModalidades } from '../context/ModalidadesContext';
import { supabase } from '../lib/supabaseClient';
import { con } from '../lib/textos';
import { claseBadgeTono, TONO } from '../lib/tonos';
import { excepcionPorId } from '../lib/excepciones';
import { cargarPacientesDeGuardias, conPacientes, textoDePacientes } from '../lib/pacientesDeGuardia';
import { hoyISO, horaDelMomento, sumarDias } from '../lib/horarios';
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
import { ESTADO_ACTIVO } from '../lib/candidatos';
import { NIVEL_CRITICO, soloSinResolver } from '../lib/alertaSinResolver';
import { MODALIDAD } from '../lib/modalidades';
import { mensajeDeError } from '../lib/errores';
import './EstadoActual.css';

/* La Situación operativa: la página de entrada del Panel.
   ==========================================================================

   Un tablero de renglones, ordenados de lo más grave a lo de rutina. Cada renglón cuenta los
   casos que piden que alguien haga algo, y al abrirlo muestra cuáles son y lleva a la sección
   donde se resuelven. Lo que no pide hacer nada no está acá: los gráficos viven en el Resumen
   del mes.

   NADA APARECE DOS VECES. Cada caso cae en un solo renglón. El turno del relevo que no llegó
   está en «Asistente ausente» y por eso no se repite en «Ausencias no programadas».

   Todo lo que se cuenta sale de la base en el momento, con las mismas reglas que la grilla de
   Guardias: las excepciones de `lib/excepciones.js` deciden qué turno cae en qué renglón. */

/* Las excepciones miran dos días hacia atrás —quien no llegó, el informe que falta— y la semana
   hacia adelante. Es la misma ventana que usa la grilla de Guardias. La salida sin registrar no
   tiene límite hacia atrás: un turno abierto sigue abierto aunque haya pasado un mes. */
const DIAS_HACIA_ATRAS = 2;
const DIAS_HACIA_ADELANTE = 6;

const ESTADOS_GUARDIA_TERMINADA = '(completada,cancelada)';
const NIVELES_A_LA_VISTA = ['amarilla', NIVEL_CRITICO];
const SOLICITUD_NUEVA = 'nueva';
const ESTADOS_SOLICITUD_ABIERTA = [SOLICITUD_NUEVA, 'en_gestion'];
const ESTADOS_POSTULACION_ABIERTA = ['pendiente', 'en_revision'];

const COLUMNAS_GUARDIA = '*';

const fallo = (...respuestas) => respuestas.find((r) => r?.error)?.error ?? null;

function Renglon({ clave, nombre, casos, tono, a, textoEnlace, abierto, alternar }) {
  const cantidad = casos.length;
  const idDetalle = `renglon-${clave}`;
  return (
    <div className="estado-actual-renglon">
      <button
        type="button"
        className="estado-actual-cabeza"
        onClick={alternar}
        disabled={cantidad === 0}
        aria-expanded={cantidad > 0 ? abierto : undefined}
        aria-controls={cantidad > 0 ? idDetalle : undefined}
      >
        <b>{nombre}</b>
        <span className={claseBadgeTono(cantidad === 0 ? TONO.NEUTRO : tono)}>{cantidad}</span>
      </button>
      {abierto && cantidad > 0 && (
        <div className="estado-actual-detalle" id={idDetalle}>
          {casos.map((c) => (
            <div key={c.id} className="estado-actual-caso">
              <span>{c.titulo}</span>
              {c.detalle && <span className="panel-mini">{c.detalle}</span>}
              {c.turnos && <HorasDeLosTurnos turnos={c.turnos} />}
            </div>
          ))}
          <Link className="panel-enlace" to={a}>
            {textoEnlace}
          </Link>
        </div>
      )}
    </div>
  );
}

function HorasDeLosTurnos({ turnos }) {
  const { t } = useLocale();
  return (
    <table className="panel-tabla estado-actual-horas">
      <thead>
        <tr>
          <th>{t.evv.col_asistente}</th>
          <th>{t.evv.col_fecha}</th>
          <th>{t.evv.col_checkin}</th>
          <th>{t.evv.col_checkout}</th>
        </tr>
      </thead>
      <tbody>
        {turnos.map((x) => (
          <tr key={x.id}>
            <td>{x.quien}</td>
            <td>{x.turno}</td>
            <td>{x.llegada}</td>
            <td>{x.salida}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EstadoActual() {
  const { t, locale } = useLocale();
  const tx = t.estado_actual;
  const prestadoraId = usePrestadoraActual();
  const umbrales = useUmbrales();
  const { tieneModalidad } = useModalidades();
  const hayPlantel = tieneModalidad(MODALIDAD.DIRECTA) || tieneModalidad(MODALIDAD.MATCH);
  const emergencias = useEmergenciasSinTomar(hayPlantel);
  const { pedidos } = usePedidosDeCodigo();

  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [abiertos, setAbiertos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const hoy = hoyISO();
    const desde = sumarDias(hoy, -DIAS_HACIA_ATRAS);
    const hasta = sumarDias(hoy, DIAS_HACIA_ADELANTE);
    const diasDePreaviso = await diasDePreavisoDeLaPrestadora(prestadoraId);
    const limitePapeles = fechaLimiteDeAviso(diasDePreaviso);

    const [gs, abiertasViejas, as, ps, ds, em, al, inc, sol, pos] = await Promise.all([
      supabase.from('guardias').select(COLUMNAS_GUARDIA).gte('fecha', desde).lte('fecha', hasta),
      supabase
        .from('guardias')
        .select(COLUMNAS_GUARDIA)
        .lt('fecha', desde)
        .not('checkin_at', 'is', null)
        .is('checkout_at', null)
        .not('estado', 'in', ESTADOS_GUARDIA_TERMINADA),
      supabase.from('asistentes').select('id, nombre, estado'),
      supabase.from('pacientes').select('id, nombre'),
      supabase
        .from('documentos_asistente')
        .select('id, asistente_id, fecha_vencimiento, tipos_documento_asistente(nombre)')
        .not('fecha_vencimiento', 'is', null)
        .lte('fecha_vencimiento', limitePapeles),
      supabase.from('estado_matricula_asistente').select(COLUMNAS_ESTADO_MATRICULA),
      soloSinResolver(
        supabase.from('alertas').select('id, paciente_id, nivel, created_at').in('nivel', NIVELES_A_LA_VISTA),
      ).order('created_at', { ascending: false }),
      supabase
        .from('incidentes_relevo')
        .select('id, guardia_saliente_id, guardia_entrante_id, iniciado_at')
        .is('resuelto_at', null)
        .not('guardia_saliente_id', 'is', null),
      supabase
        .from('solicitudes')
        .select('id, nombre, nombre_paciente, estado, creado_en')
        .or(`estado.is.null,estado.in.(${ESTADOS_SOLICITUD_ABIERTA.join(',')})`)
        .order('creado_en', { ascending: false }),
      supabase
        .from('postulaciones')
        .select('id, nombre, creado_en')
        .in('estado', ESTADOS_POSTULACION_ABIERTA)
        .order('creado_en', { ascending: false }),
    ]);

    // Un número que no se pudo leer no se muestra como cero: la página entera pasa a error.
    const primerFallo = fallo(gs, abiertasViejas, as, ps, ds, em, al, inc, sol, pos);
    if (primerFallo) {
      setError(mensajeDeError(primerFallo, t));
      setEstado('error');
      return;
    }

    const nombresPaciente = Object.fromEntries((ps.data ?? []).map((p) => [p.id, p.nombre]));
    const brutas = [...(gs.data ?? []), ...(abiertasViejas.data ?? [])];

    // Los turnos de los incidentes pueden haber quedado fuera de la ventana: se traen aparte.
    const yaTraidas = new Set(brutas.map((g) => g.id));
    const faltantes = [
      ...new Set(
        (inc.data ?? []).flatMap((i) => [i.guardia_entrante_id, i.guardia_saliente_id]).filter((id) => id && !yaTraidas.has(id)),
      ),
    ];
    if (faltantes.length > 0) {
      const extra = await supabase.from('guardias').select(COLUMNAS_GUARDIA).in('id', faltantes);
      if (extra.error) {
        setError(mensajeDeError(extra.error, t));
        setEstado('error');
        return;
      }
      brutas.push(...(extra.data ?? []));
    }

    const pacientesPorGuardia = await cargarPacientesDeGuardias(brutas.map((g) => g.id));
    const guardias = conPacientes(brutas, pacientesPorGuardia, nombresPaciente);

    // Informes que faltan, sólo sobre turnos terminados.
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

    // Para la salida sin registrar: los turnos siguientes que ya registraron la entrada, desde el
    // más viejo de los abiertos. El detalle muestra sus horas al lado de las del turno abierto.
    const fechaMasVieja = guardias
      .filter((g) => g.checkin_at && !g.checkout_at)
      .reduce((min, g) => (min && min < g.fecha ? min : g.fecha), null);
    let entradas = [];
    if (fechaMasVieja) {
      const r = await supabase
        .from('guardias')
        .select('id, servicio_id, paciente_id, asistente_id, fecha, hora_inicio, hora_fin, checkin_at, checkout_at')
        .gte('fecha', fechaMasVieja)
        .not('checkin_at', 'is', null);
      if (r.error) {
        setError(mensajeDeError(r.error, t));
        setEstado('error');
        return;
      }
      entradas = r.data ?? [];
    }

    const activos = new Set((as.data ?? []).filter((a) => a.estado === ESTADO_ACTIVO).map((a) => a.id));
    const nombresAsistente = Object.fromEntries((as.data ?? []).map((a) => [a.id, a.nombre]));

    // Documentación: un caso por Asistente activo, con la lista de papeles que tienen el problema.
    const papelesPorAsistente = new Map();
    const agregarPapel = (asistenteId, texto, grave) => {
      if (!activos.has(asistenteId)) return;
      const actual = papelesPorAsistente.get(asistenteId) ?? { textos: [], grave: false };
      actual.textos.push(texto);
      actual.grave = actual.grave || grave;
      papelesPorAsistente.set(asistenteId, actual);
    };
    for (const d of ds.data ?? []) {
      const vencido =
        estadoDeVencimiento(diasParaVencer(d.fecha_vencimiento), diasDePreaviso) === ESTADO_VENCIMIENTO.VENCIDO;
      const nombre = d.tipos_documento_asistente?.nombre ?? '—';
      const situacion = vencido ? t.documentacion.estado_vencido : t.documentacion.estado_por_vencer;
      agregarPapel(d.asistente_id, `${nombre}: ${situacion}`, vencido);
    }
    for (const fila of em.data ?? []) {
      if (fila.motivo_bloqueo) {
        agregarPapel(fila.asistente_id, t.matricula[`bloqueo_${fila.motivo_bloqueo}`] ?? t.matricula.bloqueo_titulo, true);
        continue;
      }
      if (fila.requiere_matricula !== true) continue;
      if (urgenciaDeVencimiento(fila.dias_para_vencer, diasDePreaviso) === URGENCIA.NINGUNA) continue;
      const dias = fila.dias_para_vencer;
      const texto =
        dias === 0
          ? t.matricula.vence_hoy
          : dias === 1
            ? t.matricula.vence_manana
            : con(t.matricula.vence_en_dias, { dias });
      agregarPapel(fila.asistente_id, texto, false);
    }

    setDatos({
      guardias,
      entradas,
      nombresPaciente,
      nombresAsistente,
      sinReporte,
      papelesPorAsistente,
      alertas: al.data ?? [],
      incidentes: inc.data ?? [],
      solicitudes: sol.data ?? [],
      postulaciones: pos.data ?? [],
    });
    setEstado('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ctx = useMemo(
    () => (datos ? { ahora: new Date(), umbrales, guardiasSinReporte: datos.sinReporte } : null),
    [datos, umbrales],
  );

  const fecha = useCallback(
    (iso) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '—'),
    [locale],
  );

  const renglones = useMemo(() => {
    if (!datos || !ctx) return [];
    const { guardias, nombresAsistente, nombresPaciente } = datos;
    const porId = new Map(guardias.map((g) => [g.id, g]));
    const asistente = (g) => nombresAsistente[g?.asistente_id] || '—';
    const pacientes = (g) => textoDePacientes(g?.pacientes_nombres ?? [], t.guardias.pacientes_y_mas);
    const turno = (g) => (g ? `${g.fecha} · ${g.hora_inicio?.slice(0, 5)}–${g.hora_fin?.slice(0, 5)}` : '—');
    const de = (id) => guardias.filter((g) => excepcionPorId(id)?.aplica(g, ctx));
    const critica = (id, lista) => Boolean(excepcionPorId(id)?.esCritica(lista, ctx));

    // El turno del relevo que no llegó va en «Asistente ausente», no en «Ausencias no programadas».
    const entrantesDeIncidentes = new Set(datos.incidentes.map((i) => i.guardia_entrante_id).filter(Boolean));

    const ausencias = de('tarde').filter((g) => !entrantesDeIncidentes.has(g.id));
    const sinCubrir = de('sin_cubrir');
    const ofrecidas = de('ofrecidas_sin_respuesta');
    const sinCerrar = de('sin_cerrar');
    const sinInforme = de('reportes');

    // Quién entró después en el mismo Servicio, o con el mismo Paciente si no hay Servicio.
    const entradaSiguiente = (g) => {
      const mismo = (e) => (g.servicio_id ? e.servicio_id === g.servicio_id : e.paciente_id === g.paciente_id);
      const empiezaDespues = (e) => `${e.fecha} ${e.hora_inicio}` > `${g.fecha} ${g.hora_inicio}`;
      const siguientes = datos.entradas.filter((e) => e.id !== g.id && mismo(e) && empiezaDespues(e));
      siguientes.sort((a, b) => a.checkin_at.localeCompare(b.checkin_at));
      return siguientes[0] ?? null;
    };

    const lista = [
      {
        clave: 'emergencia',
        ver: hayPlantel,
        nombre: tx.fila_emergencia,
        a: '/emergencias',
        enlace: t.nav.emergencias,
        tono: TONO.CRITICO,
        casos: emergencias.map((e) => ({
          id: e.id,
          titulo: [e.guardia?.paciente, e.guardia?.asistente].filter(Boolean).join(' — ') || '—',
          detalle: `${e.reportado_at?.slice(0, 10) ?? ''} ${horaDelMomento(e.reportado_at, locale)}`,
        })),
      },
      {
        clave: 'ausencias',
        ver: true,
        nombre: tx.fila_ausencias,
        a: '/guardias',
        enlace: t.nav.guardias,
        tono: TONO.CRITICO,
        casos: ausencias.map((g) => ({ id: g.id, titulo: `${asistente(g)} — ${pacientes(g)}`, detalle: turno(g) })),
      },
      {
        clave: 'ingreso_egreso',
        ver: hayPlantel,
        nombre: tx.fila_ingreso_egreso,
        a: '/pase-de-guardia',
        enlace: t.nav.pase_de_guardia,
        tono: TONO.CRITICO,
        casos: pedidos.map((p) => ({
          id: p.id,
          titulo: `${p.asistente || '—'} — ${t.pase_de_guardia[`momento_${p.momento}`] ?? p.momento}`,
          detalle: fecha(p.pedidoEn),
        })),
      },
      {
        clave: 'sin_asignacion',
        ver: true,
        nombre: tx.fila_sin_asignacion,
        a: '/guardias',
        enlace: t.nav.guardias,
        tono: critica('sin_cubrir', sinCubrir) || critica('ofrecidas_sin_respuesta', ofrecidas) ? TONO.CRITICO : TONO.ATENCION,
        casos: [
          ...sinCubrir.map((g) => ({ id: g.id, titulo: pacientes(g), detalle: turno(g) })),
          ...ofrecidas.map((g) => ({
            id: g.id,
            titulo: pacientes(g),
            detalle: `${turno(g)} · ${tx.exc_ofrecidas_sin_respuesta}`,
          })),
        ],
      },
      {
        clave: 'asistente_ausente',
        ver: hayPlantel,
        nombre: tx.fila_asistente_ausente,
        a: '/continuidad',
        enlace: t.nav.continuidad,
        tono: TONO.CRITICO,
        casos: datos.incidentes.map((i) => {
          const entrante = porId.get(i.guardia_entrante_id);
          const saliente = porId.get(i.guardia_saliente_id);
          return {
            id: i.id,
            titulo: `${entrante ? asistente(entrante) : '—'} — ${pacientes(entrante ?? saliente)}`,
            detalle: entrante ? turno(entrante) : fecha(i.iniciado_at),
          };
        }),
      },
      {
        clave: 'salida_sin_registrar',
        ver: true,
        nombre: tx.fila_salida_sin_registrar,
        a: '/guardias',
        enlace: t.nav.guardias,
        tono: critica('sin_cerrar', sinCerrar) ? TONO.CRITICO : TONO.ATENCION,
        // Se muestran las horas, registradas o no, del turno abierto y del que lo siguió; qué
        // hacer con eso lo decide la coordinación.
        casos: sinCerrar.map((g) => {
          const siguiente = entradaSiguiente(g);
          const horas = (x) => ({
            id: x.id,
            quien: asistente(x),
            turno: turno(x),
            llegada: x.checkin_at ? fecha(x.checkin_at) : t.evv.sin_checkin,
            salida: x.checkout_at ? fecha(x.checkout_at) : t.evv.sin_checkout,
          });
          return {
            id: g.id,
            titulo: pacientes(g),
            turnos: [horas(g), ...(siguiente ? [horas(siguiente)] : [])],
          };
        }),
      },
      {
        clave: 'estado_paciente',
        ver: true,
        nombre: tx.fila_estado_paciente,
        a: '/alertas',
        enlace: t.nav.alertas,
        tono: datos.alertas.some((x) => x.nivel === NIVEL_CRITICO) ? TONO.CRITICO : TONO.ATENCION,
        casos: datos.alertas.map((x) => ({
          id: x.id,
          titulo: `${nombresPaciente[x.paciente_id] || '—'} — ${t.alertas[`nivel_${x.nivel}`] ?? x.nivel}`,
          detalle: fecha(x.created_at),
        })),
      },
      {
        clave: 'documentacion',
        ver: hayPlantel,
        nombre: tx.fila_documentacion,
        a: '/documentacion',
        enlace: t.nav.documentacion,
        tono: [...datos.papelesPorAsistente.values()].some((p) => p.grave) ? TONO.CRITICO : TONO.ATENCION,
        casos: [...datos.papelesPorAsistente.entries()].map(([id, p]) => ({
          id,
          titulo: nombresAsistente[id] || '—',
          detalle: p.textos.join(' · '),
        })),
      },
      {
        clave: 'informes',
        ver: true,
        nombre: tx.fila_informes,
        a: '/guardias',
        enlace: t.nav.guardias,
        tono: TONO.INFO,
        casos: sinInforme.map((g) => ({ id: g.id, titulo: `${asistente(g)} — ${pacientes(g)}`, detalle: turno(g) })),
      },
      {
        clave: 'contacto',
        ver: true,
        nombre: tx.fila_contacto,
        a: '/solicitudes',
        enlace: t.nav.solicitudes,
        tono: TONO.INFO,
        casos: datos.solicitudes.map((s) => ({
          id: s.id,
          titulo: s.nombre || s.nombre_paciente || '—',
          detalle: `${t.solicitudes[`estado_${s.estado ?? SOLICITUD_NUEVA}`] ?? s.estado} · ${fecha(s.creado_en)}`,
        })),
      },
      {
        clave: 'postulante',
        ver: true,
        nombre: tx.fila_postulante,
        a: '/postulaciones',
        enlace: t.nav.postulaciones,
        tono: TONO.INFO,
        casos: datos.postulaciones.map((p) => ({ id: p.id, titulo: p.nombre || '—', detalle: fecha(p.creado_en) })),
      },
    ];
    return lista.filter((r) => r.ver);
  }, [datos, ctx, emergencias, pedidos, hayPlantel, t, tx, locale, fecha]);

  const alternar = (clave) =>
    setAbiertos((previos) => {
      const nuevos = new Set(previos);
      if (nuevos.has(clave)) nuevos.delete(clave);
      else nuevos.add(clave);
      return nuevos;
    });

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

  return (
    <div>
      <Cabecera titulo={tx.titulo} />
      <section className="panel-tarjeta estado-actual-tablero">
        {renglones.map((r) => (
          <Renglon
            key={r.clave}
            clave={r.clave}
            nombre={r.nombre}
            casos={r.casos}
            tono={r.tono}
            a={r.a}
            textoEnlace={r.enlace}
            abierto={abiertos.has(r.clave)}
            alternar={() => alternar(r.clave)}
          />
        ))}
      </section>
    </div>
  );
}
