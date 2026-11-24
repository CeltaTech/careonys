import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { agregarACola, nuevoId, pendientesDeTurnoGuardia } from '../lib/colaOffline';
import { motivoQueSeMuestra } from '../lib/reglasDeLaCola';
import { sincronizarCola, suscribirseASincronizacion } from '../lib/sincronizarCola';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';
import { nombreTipo } from '../lib/tipoDeAsistente';
import { finDeTurnoGuardia } from '../lib/horarios';
import { obtenerUbicacion, esFalloDeUbicacion, seguirUbicacion } from '../lib/ubicacionDelTelefono';
import { useSeVe } from '../context/PerfilContext';
import AntesDeLlegar from '../components/AntesDeLlegar';
import DomicilioTemporal from '../components/DomicilioTemporal';
import EmergenciaEnTurnoGuardia from '../components/EmergenciaEnTurnoGuardia';
import DescansoEnTurnoGuardia from '../components/DescansoEnTurnoGuardia';
import ExtensionDeTurnoGuardia from '../components/ExtensionDeTurnoGuardia';
import RelevoDeEmergencia from '../components/RelevoDeEmergencia';
import EnlaceAlMapa from '../components/EnlaceAlMapa';
import PaseDeTurnoGuardia from '../components/PaseDeTurnoGuardia';
import CodigoDePresencia from '../components/CodigoDePresencia';
import TareasDelTipo from '../components/TareasDelTipo';
import AclaracionesAlPie from '../components/AclaracionesAlPie';
import ReportePresentado from '../components/ReportePresentado';

/**
 * Lo que se puede consultar de UN Paciente durante el turno de guardia: sus órdenes de medicación y sus
 * reportes anteriores.
 *
 * Cada Paciente tiene su propio bloque, con su nombre arriba cuando el turno de guardia cubre a más de
 * uno. Es a propósito: una lista de medicación sin decir de quién es, en una casa donde viven
 * dos personas, es la clase de pantalla que termina en un medicamento dado a quien no era.
 *
 * LA MEDICACIÓN SE VE SIN TOCAR NADA, y los reportes anteriores siguen detrás de un botón. No
 * son la misma clase de dato: qué hay que darle hoy a esta persona es lo que se hace durante el
 * turno de guardia, y un dato que hay que ir a buscar es un dato que alguien va a dejar de mirar el día que
 * esté apurado. Los reportes de turnos de guardia pasados se consultan cuando hace falta, y desplegados le
 * comerían la pantalla a lo de hoy.
 *
 * Las dos consultas se apagan por separado desde el Panel. Si la Prestadora apagó las dos, el
 * bloque entero desaparece: quedaría un nombre solo, sin nada abajo.
 */
function DatosDelPaciente({ paciente, mostrarNombre, t, locale }) {
  const [reportes, setReportes] = useState(null);
  const [mostrandoReportes, setMostrandoReportes] = useState(false);
  const [ordenesMedicacion, setOrdenesMedicacion] = useState(null);
  const [abriendoReceta, setAbriendoReceta] = useState(null);
  const [errorReceta, setErrorReceta] = useState('');
  const seVe = useSeVe();

  async function verReceta(indicacionId) {
    setErrorReceta('');
    setAbriendoReceta(indicacionId);
    try {
      const { url } = await api.recetaDeLaOrden(paciente.id, indicacionId);
      window.open(url, '_blank', 'noopener');
    } catch (fallo) {
      setErrorReceta(mensajeDeError(fallo, t, 'receta'));
    } finally {
      setAbriendoReceta(null);
    }
  }

  async function verReportesAnteriores() {
    if (mostrandoReportes) {
      setMostrandoReportes(false);
      return;
    }
    setMostrandoReportes(true);
    if (reportes === null) {
      try {
        const { reportes: data } = await api.reportesDelPaciente(paciente.id);
        setReportes(data);
      } catch {
        setReportes([]);
      }
    }
  }

  const veReportes = seVe('asistente_reportes_anteriores');
  const veMedicacion = seVe('asistente_medicacion_del_paciente');

  // La medicación se pide sola al abrir el turno de guardia. Si la consulta falla se muestra la lista
  // vacía y no un error: el bloque dice entonces que no hay órdenes vigentes, que es lo mismo
  // que decía antes cuando el botón fallaba. El turno de guardia no se traba por esto.
  useEffect(() => {
    if (!veMedicacion) return;
    let activo = true;
    api
      .medicacionDelPaciente(paciente.id)
      .then(({ ordenes }) => {
        if (activo) setOrdenesMedicacion(ordenes);
      })
      .catch(() => {
        if (activo) setOrdenesMedicacion([]);
      });
    return () => {
      activo = false;
    };
  }, [paciente.id, veMedicacion]);

  if (!veReportes && !veMedicacion) return null;

  // El botón de los reportes abre y cierra el bloque que tiene debajo. Un lector de pantalla no
  // ve que el bloque se desplegó, así que hay que decírselo: `aria-expanded` dice si está
  // abierto o cerrado, y `aria-controls` dice qué bloque es el que abre. El bloque se dibuja
  // siempre, vacío mientras está cerrado, para que el botón nunca apunte a algo que no existe.
  const idReportes = `reportes-anteriores-${paciente.id}`;

  return (
    <section className="pwa-card">
      {mostrarNombre && <h2>{paciente.nombre}</h2>}

      {veMedicacion && (
        <div>
          <h3>{t.medicacion.titulo}</h3>
          {errorReceta && <div className="alert alert-error" role="alert">{errorReceta}</div>}
          {ordenesMedicacion === null && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
          {ordenesMedicacion?.length === 0 && (
            <div className="estado-vacio" role="status">{t.medicacion.sin_ordenes}</div>
          )}
          {ordenesMedicacion?.map((o) => (
            <div key={o.id} className="tarjeta">
              <div className="tarjeta-detalle">
                <strong>{o.medicamento}</strong> · {o.dosis} · {o.frecuencia}
                {o.via_clave ? ` (${t.medicacion.vias[o.via_clave]})` : ''}
              </div>
              <div className="tarjeta-detalle">
                {t.medicacion.desde}: {o.fecha_desde} {o.fecha_hasta ? `— ${t.medicacion.hasta}: ${o.fecha_hasta}` : ''}
              </div>
              {o.tiene_receta && (
                <button type="button" className="btn" onClick={() => verReceta(o.id)} disabled={abriendoReceta === o.id}>
                  {t.medicacion.ver_receta}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {veReportes && (
        <>
          {/* Con varios Pacientes hay un botón igual por cada uno. En la pantalla se
              distinguen por el nombre que tienen arriba; para quien escucha, todos dirían lo
              mismo, así que ahí el nombre va adentro del botón. */}
          <button
            className="btn btn-secondary btn-full pwa-card-pie"
            onClick={verReportesAnteriores}
            aria-expanded={mostrandoReportes}
            aria-controls={idReportes}
            aria-label={
              mostrarNombre
                ? con(t.turno_guardia_activo.ver_reportes_anteriores_de, { nombre: paciente.nombre })
                : undefined
            }
          >
            {t.turno_guardia_activo.ver_reportes_anteriores}
          </button>
          <div id={idReportes} className={mostrandoReportes ? 'pwa-card-pie' : undefined}>
            {mostrandoReportes && (
              <>
                {reportes === null && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
                {reportes?.length === 0 && <div className="estado-vacio" role="status">{t.comun.vacio}</div>}
                {reportes?.map((r) => (
                  <div key={r.id} className="tarjeta">
                    <div className="tarjeta-detalle">{r.turnos_guardia?.fecha}</div>
                    {r.observaciones && <p>{r.observaciones}</p>}
                    <AclaracionesAlPie
                      reporteId={r.id}
                      aclaraciones={r.aclaraciones}
                      puedeAclarar={r.propio === true}
                      t={t}
                      locale={locale}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

    </section>
  );
}

function esErrorDeRed(error) {
  return error instanceof TypeError;
}

// Los motivos con los que el backend rechaza un código del pase de guardia (pendiente #113, y el
// tope de pedidos por minuto en el #177). Son los únicos que no cierran el pase: el Asistente
// sigue parado en la puerta, y una pantalla que se cierra sola después de un código mal tipeado
// lo deja sin nada que apretar. El resto de los motivos —falta el Reporte Diario, el turno de guardia no
// se puede cerrar todavía— hablan de otra cosa y sí cierran, porque no se arreglan tipeando de
// nuevo.
const MOTIVOS_DEL_CODIGO = ['codigo_incorrecto', 'codigo_vencido', 'demasiados_pedidos'];

// Cada cuánto, como mucho, se manda un punto del viaje. Para seguir a alguien que va en colectivo
// o caminando, veinte segundos alcanzan, y no le gasta la batería ni los datos.
const ESPACIO_ENTRE_PUNTOS_MS = 20000;

function tiempoTranscurrido(desde) {
  const ms = Date.now() - new Date(desde).getTime();
  const minutos = Math.floor(ms / 60000);
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutosRestantes).padStart(2, '0')}`;
}

export default function TurnoGuardiaActivo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const seVe = useSeVe();
  const [turno_guardia, setTurnoGuardia] = useState(null);
  const [error, setError] = useState('');
  const [advertencia, setAdvertencia] = useState('');
  const [haciendoCheckin, setHaciendoCheckin] = useState(false);
  // El latido que vuelve a dibujar la pantalla cada medio minuto mientras el turno de guardia está
  // abierta: lo que se ve arriba es cuánto lleva adentro, y eso cambia solo con el reloj. El
  // valor no se lee en ninguna parte —por eso no tiene nombre—: lo único que hace falta es que
  // cambie.
  const [, redibujar] = useState(0);
  const [checkinPendiente, setCheckinPendiente] = useState(null); // { desde } o null
  // Por qué el backend rechazó lo que espera en este teléfono. Es una de las ocho situaciones del
  // catálogo, nunca el texto crudo del backend, y vacío mientras no haya ningún rechazo.
  const [motivoDeLaCola, setMotivoDeLaCola] = useState('');
  // Los dos actos de antes de llegar (pendiente #101) esperando señal. Se miran igual que el
  // check-in pendiente: quien avisó sin conexión tiene que ver que su aviso quedó guardado, o
  // vuelve a apretar el botón pensando que no salió.
  const [salidaPendiente, setSalidaPendiente] = useState(false);
  const [avisoPendiente, setAvisoPendiente] = useState(false);
  // Quiénes del turno de guardia ya tienen su reporte. Es una lista y no un sí/no porque cada Paciente
  // lleva el suyo: si el Asistente atendió a dos personas y escribió un solo reporte, el turno de guardia
  // todavía no está terminado.
  const [conReporte, setConReporte] = useState([]);
  // Qué es esta persona y qué le toca hacer en el turno de guardia. Viene del catálogo en cada
  // consulta, nunca guardado con el turno de guardia: si la Prestadora corrige la lista, la
  // corrección tiene que llegar al próximo turno de guardia.
  const [tipo, setTipo] = useState(null);
  const [tareas, setTareas] = useState(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [cerradoPendiente, setCerradoPendiente] = useState(false);
  // El pase de guardia (pendiente #113): mientras estos dos están en true se muestra el pase en
  // vez del botón. Uno por acto porque la llegada y el cierre son actos independientes — igual
  // que el resto del ciclo de vida del turno de guardia, que esta función no toca.
  const [pasandoCheckin, setPasandoCheckin] = useState(false);
  const [pasandoCheckout, setPasandoCheckout] = useState(false);
  // Y el otro lado del mismo pase: cuando el que se va es este Asistente, es él quien tiene que
  // mostrarle el código al relevo que llega.
  const [mostrandoMiCodigo, setMostrandoMiCodigo] = useState(false);
  // El descanso que quedó abierto, si hay uno. Es lo que hace que la pantalla ofrezca terminarlo
  // en vez de empezar otro cuando esta persona vuelve a abrir la aplicación al otro día.
  const [descansoAbierto, setDescansoAbierto] = useState(null);
  // El rato que esta persona quedó de más porque el relevo no llegó. Es `null` en la enorme
  // mayoría de los turnos de guardia, y cuando viene algo es lo único que le contesta la pregunta de en qué
  // anda la búsqueda de quien la reemplace.
  const [extension, setExtension] = useState(null);

  function cargar() {
    api
      .turno_guardia(id)
      .then(({ turno_guardia: data, pacientesConReporte, tipo: elTipo, tareas: lasTareas, descansoAbierto: elDescanso, extension: laExtension }) => {
        setTurnoGuardia(data);
        setDescansoAbierto(elDescanso ?? null);
        setExtension(laExtension ?? null);
        setConReporte(pacientesConReporte ?? []);
        setTipo(elTipo ?? null);
        setTareas(lasTareas ?? null);
      })
      .catch((e) => {
        // El turno de guardia ya no es suyo —lo cubrió otro o cae en su licencia—: vuelve al inicio, que
        // ya no la muestra, en vez de quedarse mirando un cartel.
        if (e?.status === 404) navigate('/', { replace: true });
        else setError(mensajeDeError(e, t, 'cargar el turno de guardia'));
      });
  }

  async function revisarPendientes() {
    // Leer la cola del teléfono es una zona aparte del turno de guardia: si la base local del aparato no
    // abre, la pantalla del turno de guardia sigue funcionando. Lo que no se pudo leer no se inventa —los
    // avisos quedan como estaban— y no se le grita nada a nadie por algo que no hizo.
    let pendientes;
    try {
      pendientes = await pendientesDeTurnoGuardia(id);
    } catch {
      return;
    }
    // El motivo del primero que quedó rechazado. Es uno solo porque lo que viene detrás depende
    // de él: cuando se destraba el primero, los siguientes salen.
    setMotivoDeLaCola(motivoQueSeMuestra(pendientes.find((p) => motivoQueSeMuestra(p))));
    const checkin = pendientes.find((p) => p.tipo === 'checkin');
    setCheckinPendiente(checkin ? { desde: checkin.creadoEn } : null);
    // Un reporte esperando señal cuenta como cargado: ya lo escribió el Asistente, y si no
    // contara, la pantalla le pediría escribirlo de nuevo por estar sin conexión.
    const esperando = pendientes
      .filter((p) => p.tipo === 'reporte' && p.payload?.pacienteId)
      .map((p) => p.payload.pacienteId);
    if (esperando.length > 0) {
      setConReporte((previos) => [...new Set([...previos, ...esperando])]);
    }
    setCerradoPendiente(pendientes.some((p) => p.tipo === 'checkout'));
    setSalidaPendiente(pendientes.some((p) => p.tipo === 'salida'));
    setAvisoPendiente(pendientes.some((p) => p.tipo === 'aviso_demora'));
  }

  useEffect(() => {
    cargar();
    revisarPendientes();
  }, [id]);

  useEffect(() => {
    const desuscribir = suscribirseASincronizacion(() => {
      cargar();
      revisarPendientes();
    });
    return desuscribir;
  }, [id]);

  useEffect(() => {
    if ((!turno_guardia?.checkin_at && !checkinPendiente) || turno_guardia?.checkout_at || cerradoPendiente) return;
    const intervalo = setInterval(() => redibujar((v) => v + 1), 30000);
    return () => clearInterval(intervalo);
  }, [turno_guardia, checkinPendiente, cerradoPendiente]);

  // El viaje al domicilio: desde «Salgo ahora» hasta escanear la entrada, el teléfono manda por
  // dónde va para el mapa del Cliente. Espaciado, porque el GPS avisa varias veces por segundo y
  // el mapa no necesita tanto. Si el backend contesta que no lo registra —sin consentimiento
  // vigente—, deja de mandar. Una aplicación web sólo manda mientras está abierta en pantalla.
  const enViaje = Boolean(turno_guardia?.salida_checkin_at && !turno_guardia?.checkin_at && !checkinPendiente);
  useEffect(() => {
    if (!enViaje) return;
    let ultimoEnvio = 0;
    let cortar = () => {};
    cortar = seguirUbicacion((punto) => {
      if (Date.now() - ultimoEnvio < ESPACIO_ENTRE_PUNTOS_MS) return;
      ultimoEnvio = Date.now();
      api.ubicacionDelViaje(id, punto)
        .then((r) => { if (r?.ubicacion_registrada === false) cortar(); })
        .catch(() => {});
    });
    return () => cortar();
  }, [enViaje, id]);

  // Pasó la hora de fin y esta persona sigue adentro. Recién ahí la pantalla vuelve a preguntar,
  // porque es el único rato en que lo que muestra cambia sin que ella toque nada: primero para
  // enterarse de que quedó de más, y después para ver avanzar la búsqueda del relevo. Mientras el
  // turno de guardia corre normal no pregunta nada: sería consultar cada dos minutos, en todos los turnos de guardia,
  // para no mostrar ninguna novedad.
  useEffect(() => {
    if (!turno_guardia?.checkin_at || turno_guardia?.checkout_at) return;
    const intervalo = setInterval(() => {
      if (finDeTurnoGuardia(turno_guardia) <= new Date()) cargar();
    }, 120000);
    return () => clearInterval(intervalo);
  }, [turno_guardia]);

  // `comprobacion` es { codigo } o { motivoSinComprobar, detalle }, resuelto por
  // <PaseDeTurnoGuardia/>. Comprobación y ubicación van siempre juntas (decisión del Desarrollador):
  // nunca se marca un check-in con una y no la otra, y ninguna de las dos traba el turno de guardia —
  // lo que no se pudo comprobar queda anotado como tal y el check-in se marca igual.
  async function alHacerCheckin(comprobacion) {
    setError('');
    setAdvertencia('');
    setHaciendoCheckin(true);
    try {
      const { lat, lng } = await obtenerUbicacion();
      const clienteUuid = nuevoId();
      try {
        const resultado = await api.checkin(id, { lat, lng, clienteUuid, comprobacion });
        const advertencias = [];
        if (!resultado.dentroDeRango) advertencias.push(t.turno_guardia_activo.fuera_de_rango);
        if (resultado.comprobacion === 'sin_comprobar') advertencias.push(t.turno_guardia_activo.quedo_sin_comprobar);
        if (advertencias.length > 0) setAdvertencia(advertencias.join(' '));
        setPasandoCheckin(false);
        cargar();
      } catch (e) {
        if (!esErrorDeRed(e)) throw e;
        // Sin señal: se guarda local y se reintenta solo al volver la conexión. Y el código que
        // se haya leído no se guarda con el pedido: para cuando la cola llegue al backend va a
        // estar vencido hace rato, y un código vencido rebota. Se guarda el motivo que existe
        // justamente para esto, así la llegada entra igual y queda para que el Coordinador la
        // mire. Esa es la diferencia entre un turno de guardia que se traba y uno que no.
        const sinRed = { motivoSinComprobar: 'sin_conexion' };
        await agregarACola({ id: clienteUuid, tipo: 'checkin', turnoGuardiaId: id, payload: { lat, lng, clienteUuid, comprobacion: sinRed } });
        setCheckinPendiente({ desde: Date.now() });
        setAdvertencia(t.turno_guardia_activo.sin_conexion_sin_comprobar);
        setPasandoCheckin(false);
        sincronizarCola();
      }
    } catch (e) {
      // Un código que el backend rechaza no cierra el pase: el Asistente sigue parado en la
      // puerta y tiene que poder intentar otra cosa ahí mismo, sin volver a empezar.
      if (MOTIVOS_DEL_CODIGO.includes(e.motivo)) return { ok: false, mensaje: mensajeDeError(e, t) };
      setPasandoCheckin(false);
      if (e?.status === 404) {
        navigate('/', { replace: true });
        return { ok: true };
      }
      // Los dos fallos de ubicación se cuentan distinto: el que se arregla desde la configuración
      // del teléfono y el que no se arregla desde ningún lado. La clave del error es la clave de
      // la frase, así que un fallo nuevo se explica agregando su texto y nada más.
      setError(esFalloDeUbicacion(e) ? t.turno_guardia_activo[e.message] : mensajeDeError(e, t));
    } finally {
      setHaciendoCheckin(false);
    }
    return { ok: true };
  }

  // La comprobación llega resuelta por <PaseDeTurnoGuardia/> y viaja junto con la ubicación en el
  // mismo pedido, igual que en la llegada. La diferencia es que la salida queda siempre comprobada:
  // `comprobacion` es { codigo } o { autorizada: true }, nunca «sin comprobar».
  async function alCerrarTurnoGuardia(comprobacion) {
    setError('');
    setAdvertencia('');
    setCerrando(true);
    try {
      const { lat, lng } = await obtenerUbicacion();
      const clienteUuid = nuevoId();
      try {
        await api.checkout(id, { lat, lng, clienteUuid, comprobacion });
        setPasandoCheckout(false);
        setConfirmandoCierre(false);
        cargar();
      } catch (e) {
        if (!esErrorDeRed(e)) throw e;
        // Sin señal, el código leído no se guarda: para cuando la cola llegue al backend va a estar
        // vencido, y la salida no se puede registrar sin comprobar. El pase se queda abierto con
        // el aviso de que no hay conexión, para volver a escanear o pedir autorización.
        // La autorización sí viaja en la cola: ya quedó anotada en la base antes de que se cortara
        // la señal, y el backend la vuelve a encontrar ahí.
        if (!comprobacion?.autorizada) return { ok: false, mensaje: mensajeDeError(e, t) };
        await agregarACola({ id: clienteUuid, tipo: 'checkout', turnoGuardiaId: id, payload: { lat, lng, clienteUuid, comprobacion: { autorizada: true } } });
        setCerradoPendiente(true);
        setPasandoCheckout(false);
        setConfirmandoCierre(false);
        sincronizarCola();
      }
    } catch (e) {
      // Una salida que el backend no da por comprobada tampoco cierra el pase: queda abierto para
      // escanear el código QR o pedir autorización.
      if (MOTIVOS_DEL_CODIGO.includes(e.motivo) || e.motivo === 'salida_sin_comprobar') {
        return { ok: false, mensaje: mensajeDeError(e, t) };
      }
      setPasandoCheckout(false);
      if (esFalloDeUbicacion(e)) setError(t.turno_guardia_activo[e.message]);
      // `falta_reporte` es el único motivo que se sigue mirando acá, y es a propósito: su
      // frase lleva adentro los nombres de los Pacientes cuyo reporte falta, y eso una
      // búsqueda por motivo no lo hace. Si el turno de guardia cubrió a dos personas y se escribió una
      // sola reporte, hay que decir cuál falta, no que "falta el reporte".
      else if (e.motivo === 'falta_reporte')
        setError(
          e.pacientesSinReporte?.length
            ? con(t.turno_guardia_activo.cerrar_faltan_reportes, {
                nombres: e.pacientesSinReporte.map((p) => p.nombre).join(', '),
              })
            : t.turno_guardia_activo.cerrar_falta_reporte,
        );
      // El resto de los motivos los explica lib/errores.js con las traducciones: el motivo
      // que se agregue mañana en el backend va a salir explicado acá sin tocar esta pantalla.
      else setError(mensajeDeError(e, t, 'cerrar el turno de guardia'));
    } finally {
      setCerrando(false);
    }
    return { ok: true };
  }

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!turno_guardia) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  // Un turno de guardia puede cubrir a más de un Paciente: una casa donde viven dos, o un grupo
  // entero en una residencia. Por eso acá siempre hay una lista, aunque casi siempre tenga
  // un solo nombre — y por eso el check-in de más abajo es uno solo para todos.
  const pacientes = turno_guardia.pacientes ?? [];
  const sonVarios = pacientes.length > 1;
  // La dirección exacta y las patologías se apagan por separado: hay Prestadoras que dan la
  // dirección recién por teléfono al confirmar, y hay otras que no mandan datos clínicos a
  // ningún teléfono. Lo apagado ni siquiera viaja, así que acá solo se deja de dibujar el
  // renglón que quedaría con el título y nada al lado.
  const veDomicilio = seVe('asistente_domicilio_del_paciente');
  const vePatologias = seVe('asistente_patologias_del_paciente');
  const faltanReporte = pacientes.filter((p) => !conReporte.includes(p.id));
  const reportesCompletos = pacientes.length > 0 && faltanReporte.length === 0;

  return (
    <div>
      <Link to="/turnos-guardia" className="btn btn-volver">
        <span aria-hidden="true">←</span> {t.comun.volver}
      </Link>

      <section className="pwa-card">
      <h1>{sonVarios ? t.turno_guardia_activo.pacientes : `${t.turno_guardia_activo.paciente}: ${pacientes[0]?.nombre ?? ''}`}</h1>

      {pacientes.length === 0 && <div className="estado-vacio" role="status">{t.turnos_guardia.sin_paciente}</div>}

      {pacientes.map((p) => {
        // Con las dos cosas apagadas la tarjeta se saltea entera, salvo que el turno de guardia cubra a
        // varias personas: ahí el nombre sigue haciendo falta para saber a quiénes se atiende.
        const hayDatos = veDomicilio || (vePatologias && p.patologias);
        if (!hayDatos && !sonVarios) return null;
        return (
          <div key={p.id} className={sonVarios ? 'tarjeta' : undefined}>
            {sonVarios && <div className="tarjeta-paciente">{p.nombre}</div>}
            {veDomicilio && (
              <p className="tarjeta-detalle">
                {t.turno_guardia_activo.domicilio}: <EnlaceAlMapa lugar={p} t={t} />
              </p>
            )}
            {/* Y si esa dirección no es la de siempre, se dice acá mismo, pegado a la
                dirección. Con el interruptor de arriba apagado el domicilio no viaja, y este
                renglón no se dibuja solo: no queda ningún cartel vacío. */}
            <DomicilioTemporal paciente={p} t={t} />
            {vePatologias && p.patologias && (
              <p className="tarjeta-detalle">
                {t.turno_guardia_activo.patologias}: {p.patologias}
              </p>
            )}
          </div>
        );
      })}

      {sonVarios && (
        <div className="alert alert-info" role="status">{con(t.turno_guardia_activo.varios_pacientes, { n: pacientes.length })}</div>
      )}

      {advertencia && <div className="alert alert-alerta" role="status">{advertencia}</div>}
      </section>

      {/* Lo que espera señal en este teléfono, y el motivo cuando el backend lo rechazó. El motivo
          se guardaba desde siempre y no se mostraba nunca: la persona veía «pendiente de enviar»
          para algo que ya no se iba a mandar más. La frase sale del catálogo de situaciones, así
          que nunca llega el texto crudo del backend. */}
      {(checkinPendiente || motivoDeLaCola) && (
        <div className={motivoDeLaCola ? 'alert alert-alerta' : 'alert alert-info'} role="status">
          {motivoDeLaCola ? (
            `${t.comun.no_se_pudo_enviar}: ${t.errores[motivoDeLaCola] ?? t.errores.falla_del_sistema}`
          ) : (
            <>
              <span aria-hidden="true">⏳</span> {t.comun.pendiente_de_enviar}
            </>
          )}
        </div>
      )}

      {/* Los dos actos de antes de llegar (pendiente #101). Se muestran mientras la llegada no
          esté marcada y no se esté haciendo el pase, que es exactamente el rato en que sirven:
          después de llegar, avisar que se sale no describe nada. */}
      {!turno_guardia.checkin_at && !checkinPendiente && !pasandoCheckin && (
        <AntesDeLlegar
          t={t}
          locale={locale}
          turnoGuardiaId={id}
          turno_guardia={turno_guardia}
          salidaPendiente={salidaPendiente}
          avisoPendiente={avisoPendiente}
          alRegistrar={() => {
            cargar();
            revisarPendientes();
          }}
        />
      )}

      {!turno_guardia.checkin_at && !checkinPendiente && !pasandoCheckin && (
        <button
          className="btn btn-primary btn-full"
          onClick={() => setPasandoCheckin(true)}
          disabled={haciendoCheckin}
        >
          {haciendoCheckin ? t.turno_guardia_activo.haciendo_checkin : t.turno_guardia_activo.hacer_checkin}
        </button>
      )}

      {/* El pase de guardia (pendiente #113): antes de marcar la llegada se lee el código que
          muestra en su pantalla quien está en la casa. Si no se puede leer el código QR,
          <PaseDeTurnoGuardia/> ofrece pedir autorización a quien coordina, y si tampoco así, entrar igual
          eligiendo un motivo — el pase nunca traba el turno de guardia.
          Se queda dibujado mientras el pedido viaja: si el backend rechaza el código, la advertencia
          aparece adentro del mismo pase y se puede intentar de nuevo sin volver a empezar. */}
      {!turno_guardia.checkin_at && !checkinPendiente && pasandoCheckin && (
        <PaseDeTurnoGuardia
          t={t}
          turnoGuardiaId={id}
          momento="checkin"
          onListo={alHacerCheckin}
          onCancelar={() => setPasandoCheckin(false)}
        />
      )}

      {(turno_guardia.checkin_at || checkinPendiente) && !turno_guardia.checkout_at && (
        <section className="pwa-card">
          <div className="turno-guardia-timer">{tiempoTranscurrido(turno_guardia.checkin_at || checkinPendiente.desde)}</div>
          <div className="mini turno-guardia-timer-pie">
            {t.turno_guardia_activo.tiempo_transcurrido}
          </div>

          {/* Un botón por cada persona que todavía no tiene su reporte. Con un solo Paciente se ve
              igual que siempre; con dos, el nombre está en el botón para que no haya que
              acordarse de cuál ya se cargó. */}
          {faltanReporte.length > 0 && (
            <>
              {faltanReporte.map((p) => (
                <Link
                  key={p.id}
                  to={`/turnos-guardia/${id}/reporte/${p.id}`}
                  className="btn btn-exito btn-full pwa-card-pie"
                >
                  {sonVarios ? con(t.turno_guardia_activo.cargar_reporte_de, { nombre: p.nombre }) : t.turno_guardia_activo.cargar_reporte}
                </Link>
              ))}
              {/* Cada botón dice qué reporte falta, y el de cerrar aparece solo cuando están todos:
                  no hace falta ninguna frase debajo. */}
            </>
          )}

          {/* El cierre es un acto propio, no un efecto secundario de mandar el reporte
              (tarea 66a). El pase por QR (pendiente #113) quedó enchufado más abajo, entre
              la pregunta de cierre y el cierre en sí. */}
          {reportesCompletos && cerradoPendiente && (
            <div className="alert alert-info pwa-card-pie" role="status">
              <span aria-hidden="true">⏳</span> {t.comun.pendiente_de_enviar}
            </div>
          )}

          {reportesCompletos && !cerradoPendiente && !confirmandoCierre && (
            <button className="btn btn-primary btn-full pwa-card-pie" onClick={() => setConfirmandoCierre(true)}>
              {t.turno_guardia_activo.hacer_checkout}
            </button>
          )}

          {reportesCompletos && !cerradoPendiente && confirmandoCierre && (
            <div className="pwa-card-pie">
              <p className="tarjeta-detalle">{t.turno_guardia_activo.cerrar_pregunta}</p>

              {!pasandoCheckout && (
                <>
                  <button className="btn btn-primary btn-full" onClick={() => setPasandoCheckout(true)} disabled={cerrando}>
                    {cerrando ? t.turno_guardia_activo.haciendo_checkout : t.turno_guardia_activo.cerrar_si}
                  </button>
                  <button
                    className="btn btn-secondary btn-full pwa-card-pie"
                    onClick={() => setConfirmandoCierre(false)}
                    disabled={cerrando}
                  >
                    {t.comun.cancelar}
                  </button>
                </>
              )}

              {/* El pase de guardia (pendiente #113): antes de cerrar se comprueba lo mismo que
                  al llegar, con el código QR o la autorización del Coordinador. A diferencia de
                  la llegada, la salida no se registra sin comprobar. */}
              {pasandoCheckout && (
                <PaseDeTurnoGuardia
                  t={t}
                  turnoGuardiaId={id}
                  momento="checkout"
                  onListo={alCerrarTurnoGuardia}
                  onCancelar={() => setPasandoCheckout(false)}
                />
              )}
            </div>
          )}

          {/* El otro lado del mismo pase (pendiente #113). Cuando hay relevo, el que está
              adentro es quien tiene que mostrarle el código al que llega: acá está el suyo.
              Se muestra a pedido y no siempre abierto, porque un código de estos se renueva
              solo cada pocos segundos y no tiene sentido tenerlo girando todo el turno de guardia. */}
          {!pasandoCheckout && (
            <div className="pwa-card-pie">
              <button
                className="btn btn-secondary btn-full"
                onClick={() => setMostrandoMiCodigo((abierto) => !abierto)}
                aria-expanded={mostrandoMiCodigo}
                aria-controls="mi-codigo-de-presencia"
              >
                {mostrandoMiCodigo ? t.turno_guardia_activo.ocultar_mi_codigo : t.turno_guardia_activo.mostrar_mi_codigo}
              </button>
              <div id="mi-codigo-de-presencia">
                {mostrandoMiCodigo && (
                  <>
                    <CodigoDePresencia t={t} pedirCodigo={api.codigoDePresencia} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* El rato de más, cuando terminó el turno de guardia y el relevo no llegó. Va antes que el resto
              porque en ese momento es lo único que esta persona está esperando ver, y se dibuja
              solo si hay una extensión abierta: en un turno de guardia que termina normal no aparece nada. */}
          <ExtensionDeTurnoGuardia t={t} locale={locale} extension={extension} />

          {/* Lo que no admite esperar al cierre. Queda al final del bloque del turno de guardia en curso
              y no arriba de todo: el lugar de arriba es para lo que se hace siempre, y esto se usa
              casi nunca. Se muestra mientras el turno de guardia está en curso, que es cuando esta persona
              está adentro de la casa. */}
          <EmergenciaEnTurnoGuardia
            t={t}
            locale={locale}
            turnoGuardiaId={id}
            alRegistrar={() => revisarPendientes()}
          />

          {/* El descanso adentro del turno de guardia. Se muestra sólo cuando el turno de guardia dura más de un día,
              que es cuando el descanso adentro existe: en un turno de guardia de seis horas este botón sería
              un renglón más para leer y nadie lo va a apretar nunca. */}
          {Number(turno_guardia.dias_hasta_el_fin) > 0 && (
            <DescansoEnTurnoGuardia
              t={t}
              locale={locale}
              turnoGuardiaId={id}
              descansoAbierto={descansoAbierto}
              alCambiar={() => revisarPendientes()}
            />
          )}

          {/* El Relevo de emergencia, último y apartado de los botones de todos los días: es el
              único que deja a esta persona irse a mitad del turno de guardia, y no se tiene que poder apretar
              al pasar. Está mientras dura el turno de guardia, y se puede pedir más de una vez. */}
          <RelevoDeEmergencia
            t={t}
            locale={locale}
            turnoGuardiaId={id}
            alPedir={() => revisarPendientes()}
          />
        </section>
      )}

      {/* Salió al llegar el relevo sin haber presentado el Reporte Diario: la salida está hecha
          y el reporte se presenta desde acá. Cuando llega el último, el turno pasa a completado. */}
      {turno_guardia.checkout_at && turno_guardia.estado === 'salida_sin_reporte' && (
        <section className="pwa-card">
          <div className="alert alert-alerta" role="status">{t.turno_guardia_activo.reporte_pendiente}</div>
          {faltanReporte.map((p) => (
            <Link
              key={p.id}
              to={`/turnos-guardia/${id}/reporte/${p.id}`}
              className="btn btn-exito btn-full pwa-card-pie"
            >
              {sonVarios ? con(t.turno_guardia_activo.cargar_reporte_de, { nombre: p.nombre }) : t.turno_guardia_activo.cargar_reporte}
            </Link>
          ))}
        </section>
      )}

      {turno_guardia.checkout_at && turno_guardia.estado !== 'salida_sin_reporte' && (
        <div className="alert alert-info" role="status">{t.turno_guardia_activo.cerrar_ok}</div>
      )}

      {/* Qué le toca hacer en este turno de guardia y qué no. Sale del mismo catálogo que ve el Cliente
          en su pantalla, así que las dos partes leen exactamente lo mismo: es lo que corta la
          discusión en la puerta cuando le piden algo que no es de su trabajo.
          Si esta persona no tiene tipo cargado no hay lista que mostrar, y no se dibuja nada. */}
      {tipo && (
        <section className="pwa-card">
          <div className="mini">
            {t.turno_guardia_activo.tipo}: {nombreTipo(tipo, t)}
          </div>
          <TareasDelTipo tareas={tareas} vacio={t.turno_guardia_activo.tareas_vacio} t={t} />
        </section>
      )}

      {pacientes.map((p) => (
        <DatosDelPaciente key={p.id} paciente={p} mostrarNombre={sonVarios} t={t} locale={locale} />
      ))}

      {/* El Reporte que ya presentó de cada Paciente, para corregirlo con una aclaración al pie. */}
      {pacientes
        .filter((p) => conReporte.includes(p.id))
        .map((p) => (
          <ReportePresentado
            key={`presentado-${p.id}`}
            turnoGuardiaId={id}
            paciente={p}
            mostrarNombre={sonVarios}
            t={t}
            locale={locale}
          />
        ))}
    </div>
  );
}
