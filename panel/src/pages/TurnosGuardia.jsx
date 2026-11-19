import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { supabase } from '../lib/supabaseClient';
import { useFiltros } from '../hooks/useFiltros';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { NuevoTurnoGuardiaModal } from './turnos_guardia/NuevoTurnoGuardiaModal';
import { TurnoGuardiaAcciones } from './turnos_guardia/TurnoGuardiaAcciones';
import { GrillaTurnosGuardia } from './turnos_guardia/GrillaTurnosGuardia';
import { TurnosGuardiaSinCerrar } from './turnos_guardia/TurnosGuardiaSinCerrar';
import { COBERTURA, FILA_SIN_CUBRIR, coberturaDeTurnoGuardia, filaDeTurnoGuardia } from '../lib/cobertura';
import { cargarPacientesDeTurnosGuardia, conPacientes, textoDePacientes } from '../lib/pacientesDeTurnoGuardia';
import { SITUACION, situacionDeTurnoGuardia } from '../lib/semaforoTurnoGuardia';
import { claseBadgeTono, TONO } from '../lib/tonos';
import { reasignarTurnoGuardia } from '../lib/reasignarTurnoGuardia';
import {
  cargarAsignacionesPendientes,
  pedidoDeConfirmacion,
  pedidoDeConfirmacionDelMovimiento,
  quienTieneElTurnoGuardia,
} from '../lib/asignarTurnoGuardia';
import { useConfirmacion } from '../context/ConfirmacionContext';
import { moverTurnoGuardia } from '../lib/moverTurnoGuardia';
import { mensajeDeError } from '../lib/errores';
import { excepcionPorId } from '../lib/excepciones';
import { con } from '../lib/textos';
import { useUmbrales } from '../context/UmbralesContext';
import { usePedidosDeAutorizacion } from '../context/PedidosDeAutorizacionContext';
import { SolicitudDeIngresoModal } from './turnos_guardia/SolicitudDeIngresoModal';
import { AsignarConDocumentosModal } from './turnos_guardia/AsignarConDocumentosModal';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { esAdminOSuperior } from '../lib/roles';
// Las dos vienen del punto único de verdad de las fechas. Esta pantalla tenía su propia copia de
// `hoyISO`, escrita con `toISOString()` a secas, que devuelve el día en huso cero: quien mira
// desde Buenos Aires después de las nueve de la noche abría la lista en el día siguiente, y las
// guardias que estaba buscando ya no estaban. La de `lib/horarios.js` corre el huso antes de
// cortar, y es la que usa todo el resto del Panel.
import { hoyISO, sumarDias } from '../lib/horarios';
import './listadosMaqueta.css';
import { FICHA_NOMBRE, conSusFichas } from '../lib/fichaDelPaciente';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';

const ESTADOS = ['programada', 'activa', 'completada', 'cancelada', 'ausente', 'pausada'];

/*
 * Cómo se lee cada situación del semáforo (`lib/semaforoTurnoGuardia.js`) en las tres palabras de la
 * maqueta, y qué botón le toca. Los tres botones abren el mismo panel de acciones del turno de guardia:
 * ahí están asignarla, reasignarla, cancelarla y marcar llegada, salida o ausencia.
 */
const SIN_COBERTURA = { estado: 'sin_cobertura', tono: TONO.CRITICO };
const EN_RIESGO = { estado: 'en_riesgo', tono: TONO.ATENCION };
const CUBIERTA = { estado: 'cubierta', tono: TONO.EXITO };

const LECTURA_DE_SITUACION = {
  [SITUACION.HUECO_URGENTE]: { ...SIN_COBERTURA, accion: 'resolver' },
  [SITUACION.AUSENTE]: { ...SIN_COBERTURA, accion: 'resolver' },
  [SITUACION.TARDE]: { ...EN_RIESGO, accion: 'resolver' },
  [SITUACION.SIN_CERRAR]: { ...EN_RIESGO, accion: 'resolver' },
  [SITUACION.HUECO]: { ...EN_RIESGO, accion: 'solicitar_cobertura' },
  [SITUACION.CANCELADA]: { estado: 'cancelada', tono: TONO.NEUTRO, accion: 'ver' },
};

function lecturaDeTurnoGuardia(turno_guardia, ctx) {
  return LECTURA_DE_SITUACION[situacionDeTurnoGuardia(turno_guardia, ctx)] ?? { ...CUBIERTA, accion: 'ver' };
}

export function TurnosGuardia() {
  const { t, locale } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [filas, setFilas] = useState([]);
  const [estadoCarga, setEstadoCarga] = useState('cargando');
  const [error, setError] = useState(null);
  // Por qué no salió lo último que se hizo sobre un turno de guardia. Va aparte del error de carga: la
  // lista sigue a la vista, y el error de carga sólo se ve cuando la lista no se pudo traer.
  const [aviso, setAviso] = useState(null);
  // Si lo último que no salió fue una asignación frenada por documentos pendientes: cuáles son y
  // cómo repetirla con el motivo. Con el permiso, el aviso ofrece «Asignar igual».
  const [excepcion, setExcepcion] = useState(null);
  const [asignandoIgual, setAsignandoIgual] = useState(false);
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const puedeAsignarIgual = esAdminOSuperior(usuario?.rol) || puede('asignar_con_documentos_pendientes');
  // El rango de fechas arranca en hoy, o en el día que pide el enlace que trajo hasta acá —el de un
  // turno que no deja desactivar una cuenta—. Se calcula una sola vez, al abrir la pantalla.
  const [parametros] = useSearchParams();
  const desdeDelEnlace = parametros.get('desde');
  const hastaDelEnlace = parametros.get('hasta');
  const filtrosIniciales = useMemo(() => {
    const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
    const desde = esFecha(desdeDelEnlace) ? desdeDelEnlace : hoyISO();
    const hasta = esFecha(hastaDelEnlace) && hastaDelEnlace >= desde ? hastaDelEnlace : sumarDias(desde, 14);
    return { desde, hasta, estado: '', sinCubrir: false, busqueda: '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { f, set, limpiar, hayFiltros } = useFiltros(filtrosIniciales);
  // Un aviso del Estado actual trae hasta acá los turnos de guardia exactas que contó: la lista muestra
  // ésas y ninguna más, para que el número del aviso y la lista no puedan discrepar.
  const { state } = useLocation();
  const [delAviso, setDelAviso] = useState(() =>
    excepcionPorId(state?.excepcion) && Array.isArray(state?.turnos_guardia)
      ? { excepcion: excepcionPorId(state.excepcion), parametros: state.parametros ?? {}, ids: new Set(state.turnos_guardia) }
      : null,
  );
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  // La grilla sigue a mano porque hace lo que la tabla no: mover un turno de guardia arrastrándola y
  // verlas por Paciente, por semana o en línea de tiempo.
  const [verGrilla, setVerGrilla] = useState(false);
  const [turnoGuardiaSeleccionado, setTurnoGuardiaSeleccionado] = useState(null);
  // Quién está en la puerta esperando que lo dejen entrar. El Asistente que no pudo leer el
  // código QR llama a quien coordina; quien coordina busca su turno de guardia acá, abre «Solicitud de
  // ingreso», lee quién la pide y por qué, verifica como acostumbre y autoriza. Eso vale lo mismo
  // que leer el código QR: la llegada queda comprobada con quién la autorizó, y la salida del
  // Asistente que se va, autorizada.
  const { pedidos: pedidosDeAutorizacion, recargar: recargarPedidos } = usePedidosDeAutorizacion();
  const pedidoPorTurnoGuardia = useMemo(
    () => new Map(pedidosDeAutorizacion.map((p) => [p.turnoGuardiaId, p])),
    [pedidosDeAutorizacion]
  );
  const [solicitudAbierta, setSolicitudAbierta] = useState(null);
  const [asistentes, setAsistentes] = useState([]);
  const [nombreDelPaciente, setNombreDelPaciente] = useState({});
  const { pedirConfirmacion } = useConfirmacion();

  const recargar = useCallback(async () => {
    if (!prestadoraId) return;
    setEstadoCarga('cargando');
    setError(null);

    const [
      { data: turnosGuardiaData, error: errorTurnosGuardia },
      { data: asistentesData },
      { data: pacientesData },
      { data: serviciosData },
    ] = await Promise.all([
      supabase
        .from('turnos_guardia')
        .select('*')
        .eq('prestadora_id', prestadoraId)
        .gte('fecha', f.desde)
        .lte('fecha', f.hasta)
        .order('fecha', { ascending: true })
        .order('hora_inicio', { ascending: true }),
      // Se pide el Padrón entero, sin filtrar por estado, y se pide también el estado. Las dos
      // cosas son a propósito: la lista se usa para ponerle el nombre a cada turno de guardia ya asignada
      // —y un turno de guardia que cubrió alguien que después se fue tiene que seguir mostrando ese
      // nombre, no un guión— y también para llenar el desplegable de reasignación, que sí tiene
      // que dejar afuera a quien ya no trabaja acá. Por eso el estado viaja: el filtro lo aplica
      // la puerta que reparte trabajo (`estaEnElPadron` en TurnoGuardiaAcciones.jsx), no la consulta.
      supabase.from('asistentes').select('id, nombre, estado, cuenta_desactivada, disponibilidad').eq('prestadora_id', prestadoraId),
      supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).eq('prestadora_id', prestadoraId),
      supabase.from('servicios').select('id, etiqueta').eq('prestadora_id', prestadoraId),
    ]);

    if (errorTurnosGuardia) {
      setError(mensajeDeError(errorTurnosGuardia, t));
      setEstadoCarga('error');
      return;
    }

    setAsistentes(asistentesData ?? []);
    const asistentesPorId = Object.fromEntries((asistentesData ?? []).map((a) => [a.id, a.nombre]));
    const pacientesPorId = Object.fromEntries(conSusFichas(pacientesData).map((p) => [p.id, p.nombre]));
    setNombreDelPaciente(pacientesPorId);
    const serviciosPorId = Object.fromEntries((serviciosData ?? []).map((s) => [s.id, s.etiqueta]));

    // A quiénes atiende cada turno de guardia: un turno puede cubrir a más de una persona, y esa lista
    // no vive en el turno de guardia sino en su propia tabla (ver `lib/pacientesDeTurnoGuardia.js`).
    // Y a quién se espera en cada turno asignado que todavía no se aceptó.
    let pacientesPorTurnoGuardia;
    let pendientes;
    try {
      const ids = (turnosGuardiaData ?? []).map((g) => g.id);
      [pacientesPorTurnoGuardia, pendientes] = await Promise.all([
        cargarPacientesDeTurnosGuardia(ids),
        cargarAsignacionesPendientes(turnosGuardiaData ?? []),
      ]);
    } catch (errorPacientes) {
      setError(mensajeDeError(errorPacientes, t));
      setEstadoCarga('error');
      return;
    }

    const filasConNombres = conPacientes(turnosGuardiaData ?? [], pacientesPorTurnoGuardia, pacientesPorId).map((g) => ({
      ...g,
      asistente_nombre: asistentesPorId[g.asistente_id] || '—',
      pendiente_asistente_id: pendientes.get(g.id) ?? null,
      pendiente_nombre: pendientes.has(g.id) ? asistentesPorId[pendientes.get(g.id)] || '—' : null,
      servicio_etiqueta: serviciosPorId[g.servicio_id] || '',
    }));

    setFilas(filasConNombres);
    setEstadoCarga('listo');
    // Solo el rango de fechas se pide al servidor: los demás filtros se aplican acá, en
    // memoria, y no tienen que volver a consultar la base cada vez que cambian.
  }, [f.desde, f.hasta, prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /* El nombre que se muestra se arma acá y no al cargar: el resumen depende del idioma
     ("y 3 más"), y cambiar de idioma no tiene por qué volver a consultar la base. */
  const filasFiltradas = useMemo(() => {
    const b = f.busqueda.toLowerCase();
    return filas
      .map((g) => ({
        ...g,
        paciente_nombre: textoDePacientes(g.pacientes_nombres, t.turnos_guardia.pacientes_y_mas, null),
      }))
      .filter((g) => {
        if (delAviso && !delAviso.ids.has(g.id)) return false;
        const coincideEstado = !f.estado || g.estado === f.estado;
        const coincideCobertura = !f.sinCubrir || coberturaDeTurnoGuardia(g) !== COBERTURA.CUBIERTA;
        // La búsqueda mira TODOS los nombres del turno, no el resumen: en un asilo el resumen
        // muestra dos y esconde dieciocho, y buscar a uno de esos dieciocho no daría nada.
        const coincideBusqueda =
          !b ||
          g.asistente_nombre?.toLowerCase().includes(b) ||
          (g.pacientes_nombres ?? []).some((n) => n?.toLowerCase().includes(b));
        return coincideEstado && coincideCobertura && coincideBusqueda;
      });
  }, [filas, f, t, delAviso]);

  /* El reloj entra una sola vez por carga, igual que en el Estado actual: si cada turno de guardia
     preguntara la hora por su cuenta, dos turnos de guardia de la misma pantalla podrían estar mirando
     momentos distintos. Los umbrales —a partir de cuántas horas un hueco es urgente, con cuántos
     minutos de demora se llega tarde, cuánto puede quedar un turno de guardia sin cerrar— los trae
     `useUmbrales()` de la configuración de esta Prestadora; esta pantalla no los repite ni los
     decide. */
  const umbrales = useUmbrales();
  const ctx = useMemo(() => ({ ahora: new Date(), umbrales }), [filas, umbrales]); // eslint-disable-line react-hooks/exhaustive-deps

  // El turno nuevo puede haberse creado y no haberse podido asignar: queda sin asignar, y se
  // dice por qué.
  function cerrarYRecargar(motivo = null, pendiente = null) {
    setMostrarNueva(false);
    avisarResultado({ error: motivo, documentosPendientes: pendiente?.documentos ?? null }, pendiente?.reintentar);
  }

  // Lo que dejó una operación sobre un turno de guardia: el motivo si no salió y, si la frenaron los
  // documentos, cómo repetirla con el motivo de la excepción.
  function avisarResultado({ error: falla, documentosPendientes }, reintentar) {
    setAviso(falla);
    setExcepcion(falla && documentosPendientes && reintentar ? { documentos: documentosPendientes, reintentar } : null);
    recargar();
  }

  // Si el turno ya tenía a alguien, aceptado o esperando respuesta, se avisa que lo pierde antes de
  // cambiarlo. Qué se dice en cada caso lo decide `pedidoDeConfirmacion`.
  async function confirmaElCambio(turno_guardia, asistenteId) {
    const nombreNuevo = asistentes.find((a) => a.id === asistenteId)?.nombre ?? null;
    const pedido = pedidoDeConfirmacion(turno_guardia, asistenteId, nombreNuevo, t);
    return pedido ? pedirConfirmacion(pedido) : true;
  }

  // Los tres pasos de una reasignación viven en `lib/reasignarTurnoGuardia.js`, no acá: el
  // Estado actual hace exactamente lo mismo y no puede haber dos versiones de esta operación.
  async function handleReasignar(turnoGuardiaId, asistenteId, fecha, motivo = '') {
    const turnoGuardiaActual = filas.find((g) => g.id === turnoGuardiaId);
    if (!turnoGuardiaActual) return;
    if (!(await confirmaElCambio(turnoGuardiaActual, asistenteId))) return;

    const resultado = await reasignarTurnoGuardia(turnoGuardiaActual, asistenteId, fecha, t, motivo);
    avisarResultado(resultado, (motivoExcepcion) =>
      reasignarTurnoGuardia(turnoGuardiaActual, asistenteId, fecha, t, motivo, motivoExcepcion),
    );
  }

  // Y lo mismo con arrastrar un turno de guardia a otra celda de la grilla: lo que eso significa está en
  // `lib/moverTurnoGuardia.js`, que es el mismo que usa el Estado actual con esta misma grilla.
  async function alMoverTurnoGuardia({ turnoGuardiaId, ...movimiento }) {
    const turnoGuardiaActual = filas.find((g) => g.id === turnoGuardiaId);
    if (!turnoGuardiaActual) return;
    const cambiaDeAsistente = movimiento.vista === 'asistente' && movimiento.fila !== filaDeTurnoGuardia(turnoGuardiaActual);
    if (cambiaDeAsistente) {
      const asistenteId = movimiento.fila === FILA_SIN_CUBRIR ? null : movimiento.fila;
      if (!(await confirmaElCambio(turnoGuardiaActual, asistenteId))) return;
    }

    // Llevarlo a otro Paciente se pregunta siempre. Con Asistente el turno entero queda sin
    // cubrir, así que se nombran todos sus Pacientes; sin Asistente pasa sólo el que se arrastró.
    if (movimiento.vista === 'paciente' && movimiento.fila !== movimiento.filaOrigen) {
      const origen = quienTieneElTurnoGuardia(turnoGuardiaActual)
        ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(turnoGuardiaActual.pacientes_nombres ?? [])
        : nombreDelPaciente[movimiento.filaOrigen] ?? '—';
      const destino = nombreDelPaciente[movimiento.fila] ?? '—';
      if (!(await pedirConfirmacion(pedidoDeConfirmacionDelMovimiento(turnoGuardiaActual, origen, destino, t)))) return;
    }

    // La Prestadora con la que se guarda es la de la sesión, nunca la que trae el turno de guardia.
    const conLaSesion = { ...movimiento, prestadoraId: usuario?.prestadora_id ?? null };
    const resultado = await moverTurnoGuardia(turnoGuardiaActual, conLaSesion, t);
    avisarResultado(resultado, (motivoExcepcion) => moverTurnoGuardia(turnoGuardiaActual, conLaSesion, t, motivoExcepcion));
  }

  const tl = t.turnos_guardia.listado;
  const manana = sumarDias(hoyISO(), 1);

  function textoDelDia(fecha) {
    if (fecha === hoyISO()) return t.turnos_guardia.dia_hoy;
    if (fecha === manana) return tl.dia_manana;
    return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function textoDelHorario(g) {
    const desde = (g.hora_inicio ?? '').slice(0, 5);
    const hasta = (g.hora_fin ?? '').slice(0, 5);
    return `${textoDelDia(g.fecha)} ${desde}–${hasta}`;
  }

  function textoDelEstado(estado) {
    return estado === 'cancelada' ? t.turnos_guardia.estado_cancelada : tl[`cobertura_${estado}`];
  }

  return (
    <div className="listado-maqueta">
      <Cabecera titulo={t.turnos_guardia.titulo}>
        <Button variant="secondary" onClick={() => setMostrarFiltros((v) => !v)} aria-expanded={mostrarFiltros}>
          {t.comun.filtrar}
        </Button>
        <Button onClick={() => setMostrarNueva(true)}>{tl.nueva}</Button>
      </Cabecera>

      {/* Va arriba de todo a propósito: es lo que hay que resolver, y no depende del rango de
          fechas de abajo. Trae sus propios datos, mirando hacia atrás sin límite, porque un
          turno de guardia que quedó abierta el mes pasado no cae dentro de ningún rango que alguien
          tenga puesto. */}
      <TurnosGuardiaSinCerrar onCerrada={recargar} />

      <section className="panel-tarjeta">
        {mostrarFiltros && (
          <div className="panel-filtros">
            <FormFieldFecha label={t.turnos_guardia.filtro_desde} value={f.desde} onChange={(v) => set('desde', v)} />
            <FormFieldFecha label={t.turnos_guardia.filtro_hasta} value={f.hasta} onChange={(v) => set('hasta', v)} />
            <select value={f.estado} onChange={(e) => set('estado', e.target.value)} aria-label={t.comun.filtro_estado}>
              <option value="">{t.comun.todos}</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{t.turnos_guardia[`estado_${e}`]}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t.turnos_guardia.buscar}
              aria-label={t.turnos_guardia.buscar}
              value={f.busqueda}
              onChange={(e) => set('busqueda', e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={f.sinCubrir}
                onChange={(e) => set('sinCubrir', e.target.checked)}
              />
              {t.turnos_guardia.cobertura_solo_huecos}
            </label>
            <Button variant="secondary" onClick={() => setVerGrilla((v) => !v)} aria-pressed={verGrilla}>
              {t.turnos_guardia.grilla_titulo}
            </Button>
          </div>
        )}

        {delAviso && (
          <div className="estado-actual-filtro-activo">
            <span>
              {con(t.estado_actual.filtrando_por, {
                excepcion: con(t.estado_actual[delAviso.excepcion.claveEtiqueta], delAviso.parametros),
              })}
            </span>
            <Button variant="secondary" onClick={() => setDelAviso(null)}>
              {t.estado_actual.quitar_filtro}
            </Button>
          </div>
        )}

        {aviso && (
          <Alert variant="error">
            {aviso}
            {excepcion && puedeAsignarIgual && (
              <>
                {' '}
                <Button variant="secondary" onClick={() => setAsignandoIgual(true)}>
                  {t.documentos_asistente.asignar_igual}
                </Button>
              </>
            )}
          </Alert>
        )}

        <EstadoLista
          estado={estadoCarga}
          error={error}
          vacio={estadoCarga === 'listo' && filasFiltradas.length === 0}
          recargar={recargar}
          filtrado={hayFiltros}
          onLimpiarFiltros={limpiar}
          mensajeVacio={t.turnos_guardia.sin_turnos_guardia_rango}
        >
          {verGrilla ? (
            <GrillaTurnosGuardia
              turnos_guardia={filasFiltradas}
              desde={f.desde}
              hasta={f.hasta}
              ctx={ctx}
              onAbrir={setTurnoGuardiaSeleccionado}
              onMover={alMoverTurnoGuardia}
            />
          ) : (
            <div className="listado-maqueta-tabla">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{tl.col_horario}</th>
                    <th>{tl.col_servicio}</th>
                    <th>{tl.col_responsable}</th>
                    <th>{tl.col_asignacion}</th>
                    <th>{tl.col_estado}</th>
                    <th>{tl.col_accion}</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFiltradas.map((g) => {
                    const lectura = lecturaDeTurnoGuardia(g, ctx);
                    const servicio = [g.servicio_etiqueta, g.paciente_nombre].filter(Boolean).join(' · ') || '—';
                    return (
                      <tr key={g.id}>
                        <td>{textoDelHorario(g)}</td>
                        <td>{servicio}</td>
                        <td>{tl[`responsable_${g.canal_modalidad}`] ?? '—'}</td>
                        <td>
                          {g.asistente_id
                            ? g.asistente_nombre
                            : g.pendiente_nombre
                              ? `${g.pendiente_nombre} · ${t.turnos_guardia.pendiente_de_respuesta}`
                              : tl.sin_asignar}
                        </td>
                        <td>
                          <span className={claseBadgeTono(lectura.tono)}>{textoDelEstado(lectura.estado)}</span>
                        </td>
                        <td>
                          {pedidoPorTurnoGuardia.has(g.id) && (
                            <Button onClick={() => setSolicitudAbierta(pedidoPorTurnoGuardia.get(g.id))}>
                              {tl.solicitud_de_ingreso}
                            </Button>
                          )}{' '}
                          <Button variant="secondary" onClick={() => setTurnoGuardiaSeleccionado(g)}>
                            {tl[`accion_${lectura.accion}`]}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </EstadoLista>
      </section>

      {mostrarNueva && <NuevoTurnoGuardiaModal onClose={() => setMostrarNueva(false)} onCreada={cerrarYRecargar} />}

      {asignandoIgual && excepcion && (
        <AsignarConDocumentosModal
          documentos={excepcion.documentos}
          reintentar={excepcion.reintentar}
          onClose={() => setAsignandoIgual(false)}
          onAsignado={() => {
            setAsignandoIgual(false);
            setAviso(null);
            setExcepcion(null);
            recargar();
          }}
        />
      )}

      {solicitudAbierta && (
        <SolicitudDeIngresoModal
          pedido={solicitudAbierta}
          onClose={() => setSolicitudAbierta(null)}
          onAutorizado={() => {
            setSolicitudAbierta(null);
            recargarPedidos();
          }}
        />
      )}

      {turnoGuardiaSeleccionado && (
        <TurnoGuardiaAcciones
          turno_guardia={turnoGuardiaSeleccionado}
          asistentes={asistentes}
          onReasignar={handleReasignar}
          onClose={() => setTurnoGuardiaSeleccionado(null)}
          onActualizada={recargar}
        />
      )}
    </div>
  );
}

function FormFieldFecha({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
