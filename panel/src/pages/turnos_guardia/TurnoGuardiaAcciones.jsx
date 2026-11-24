import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { llamarApiPanel } from '../../lib/apiPanel';
import { obtenerUbicacion } from '../../lib/ubicacion';
import { useAuth } from '../../context/AuthContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { useMotivosAvisoPrevio } from '../../hooks/useMotivosAvisoPrevio';
import { useMotivosDeResolucion } from '../../hooks/useMotivosDeResolucion';
import { resolver } from '../../lib/resoluciones';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { COBERTURA, claveTextoCobertura, coberturaDeTurnoGuardia } from '../../lib/cobertura';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { DescansosDelTurnoGuardia } from './DescansosDelTurnoGuardia';
import { yaEmpezo } from '../../lib/moverTurnoGuardia';
import { esAdminOSuperior } from '../../lib/roles';
import { CoberturaModal } from '../servicios/CoberturaModal';
import { ElegirAsistente } from '../../components/turnos_guardia/ElegirAsistente';
import { CerrarTurnoGuardiaModal } from '../../components/turnos_guardia/CerrarTurnoGuardiaModal';
import { textoDelDia, textoDelHorario } from '../../lib/horarioDeTurnoGuardia';
import { EditarRecurrenteModal } from '../servicios/EditarRecurrenteModal';
import { fechaYHoraDelMomento } from '../../lib/horarios';

// Qué se resuelve en esta pantalla y en qué estado queda. Es el nombre guardado de la tabla, y con
// él salen los motivos del catálogo de la Prestadora y se escribe la resolución. El estado se nombra
// acá porque una Guardia también se cierra a mano desde otra pantalla: sin acotarlo, el desplegable
// de cancelar ofrecería los motivos de cerrar.
const TABLA = 'turnos_guardia';
const ESTADO_CANCELADA = 'cancelada';

// El valor del desplegable que deja el turno sin nadie. Viaja como `null`.
const SIN_ASIGNAR = 'sin-asignar';

export function TurnoGuardiaAcciones({ turno_guardia, onReasignar, onClose, onActualizada }) {
  const modal = useModalAccesible(onClose);
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const { filas: motivosAvisoPrevio } = useMotivosAvisoPrevio(prestadoraId);
  const [medioTransporte, setMedioTransporte] = useState('');
  const [cancelacionOrigen, setCancelacionOrigen] = useState('');
  // Los motivos de esta Prestadora para cancelar una Guardia. En qué estado queda la Guardia lo dice
  // el motivo elegido, así que acá no hay ninguna lista de estados escrita.
  const {
    filas: motivosCancelacion,
    estado: estadoMotivosCancelacion,
    error: errorMotivosCancelacion,
    recargar: recargarMotivosCancelacion,
  } = useMotivosDeResolucion(prestadoraId, TABLA, ESTADO_CANCELADA);
  const [cancelacionMotivoId, setCancelacionMotivoId] = useState('');
  const [cancelacionDetalle, setCancelacionDetalle] = useState('');
  const motivoCancelacion = useMemo(
    () => motivosCancelacion.find((motivo) => motivo.id === cancelacionMotivoId) ?? null,
    [motivosCancelacion, cancelacionMotivoId],
  );
  const [avisoPrevioMotivo, setAvisoPrevioMotivo] = useState('');
  const [avisoPrevioTexto, setAvisoPrevioTexto] = useState('');
  const [sugiriendoMotivo, setSugiriendoMotivo] = useState(false);
  // Qué contestó la sugerencia la última vez: '' mientras no se pidió ninguna, 'sugerido' cuando
  // el motivo de abajo lo puso el backend, 'sin_sugerencia' cuando ninguno de los motivos de la
  // Prestadora correspondía. La advertencia de que fue una sugerencia tiene que quedar a la vista
  // mientras la persona mira el desplegable: si desapareciera al aplicarla, el motivo elegido por
  // el backend se vería igual que uno elegido a mano.
  const [sugerencia, setSugerencia] = useState('');
  const [horasExtra, setHorasExtra] = useState(String(turno_guardia.horas_extra ?? 0));
  const [horasExtraMotivo, setHorasExtraMotivo] = useState(turno_guardia.horas_extra_motivo ?? '');
  const [nuevoAsistenteId, setNuevoAsistenteId] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState(turno_guardia.fecha);
  const [motivoEmergencia, setMotivoEmergencia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  // La pausa, la suspensión o la cancelación de este turno de guardia o de su recurrente, y el
  // cambio de días y horario del recurrente. Mientras una de esas ventanas está abierta, ésta no se
  // dibuja: nunca dos ventanas una encima de la otra.
  const [accionCobertura, setAccionCobertura] = useState(null);
  // La salida registrada desde acá es un cierre a mano: se hace en la ventana compartida, con
  // motivo y hora de salida, por el único camino del cierre.
  const [cerrandoTurno, setCerrandoTurno] = useState(false);
  // La cobertura la gestiona la administración o el Coordinador que coordina el Servicio. La base
  // aplica el mismo corte; esto sólo decide si se muestran los botones.
  const esAdministracion = esAdminOSuperior(usuario?.rol);
  const [coordinaElServicio, setCoordinaElServicio] = useState(false);
  useEffect(() => {
    if (esAdministracion || usuario?.rol !== 'coordinador' || !turno_guardia.servicio_id) return undefined;
    let vigente = true;
    supabase.rpc('servicios_que_coordino').then(({ data, error: errorCoordinados }) => {
      if (vigente && !errorCoordinados) setCoordinaElServicio((data ?? []).includes(turno_guardia.servicio_id));
    });
    return () => {
      vigente = false;
    };
  }, [esAdministracion, usuario?.rol, turno_guardia.servicio_id]);
  const gestionaCobertura = Boolean(turno_guardia.servicio_id) && (esAdministracion || coordinaElServicio);
  // Un solo turno de guardia se pausa o se suspende mientras no empezó.
  const interrumpeEsteTurnoGuardia = gestionaCobertura && turno_guardia.estado === 'programada' && !yaEmpezo(turno_guardia);
  const gestionaElRecurrente = gestionaCobertura && Boolean(turno_guardia.serie_id);


  // Alternativa por teclado/botón a la reasignación por arrastre de GrillaTurnosGuardia.jsx
  // (WCAG 2.5.7 — el drag-and-drop nunca puede ser la única forma de reasignar).
  async function handleReasignarDesdeModal() {
    setError(null);
    setProcesando(true);
    try {
      await onReasignar(
        turno_guardia.id,
        nuevoAsistenteId === SIN_ASIGNAR ? null : nuevoAsistenteId,
        nuevaFecha,
        cubrePorEmergencia ? motivoEmergencia.trim() : '',
      );
    } finally {
      setProcesando(false);
    }
    onClose();
  }

  async function actualizar(cambios) {
    setError(null);
    setProcesando(true);
    const { error: errorUpdate } = await supabase.from('turnos_guardia').update(cambios).eq('id', turno_guardia.id);
    if (errorUpdate) {
      setProcesando(false);
      setError(mensajeDeError(errorUpdate, t));
      return;
    }
    // Se espera a que termine la recarga del listado antes de cerrar el modal,
    // para que la card ya muestre el estado nuevo en el momento en que
    // desaparece el detalle — sin esto quedaba una ventana donde el listado
    // todavía tenía los datos viejos hasta el próximo recargar manual.
    await onActualizada();
    setProcesando(false);
    onClose();
  }

  /* La salida registrada desde el Panel guarda la hora y el medio, y NINGÚN punto.
     Hasta el pendiente #101 esta función pedía la ubicación del navegador y la guardaba en
     `salida_lat` / `salida_lng`, que es el lugar del que salió el Asistente. Pero acá quien
     aprieta es el Coordinador, desde la oficina: lo que quedaba guardado era la oficina, con el
     nombre de otra cosa.
     Mientras nadie lo leyera daba lo mismo. Desde que la hora estimada de llegada se calcula con
     ese punto y se le muestra al Cliente, un punto falso no es un dato de más: es una hora
     inventada dicha a quien está esperando. Sin punto no hay estimación, y no mostrar ninguna es
     mejor que mostrar una que no puede ser cierta.
     La llegada y el cierre siguen tomando la ubicación: ahí lo que se comprueba es dónde estaba
     quien registró, y el Panel lo usa cuando el teléfono del Asistente no pudo hacerlo. */
  async function handleRegistrarSalida() {
    actualizar({ salida_checkin_at: new Date().toISOString(), medio_transporte: medioTransporte });
  }

  /* Las horas de más se anotan cuando pasan, y no se deducen de la diferencia entre lo marcado y
     lo planificado: llegar tarde o irse tarde no es una hora extra autorizada. Por eso hay un
     motivo obligatorio en cuanto el número deja de ser cero — es lo que después sostiene el
     importe en la liquidación. */
  async function handleGuardarHorasExtra() {
    const cantidad = Number(horasExtra);
    actualizar({
      horas_extra: cantidad,
      horas_extra_motivo: cantidad === 0 ? null : horasExtraMotivo.trim(),
    });
  }

  async function handleRegistrarLlegada() {
    const { lat, lng } = await obtenerUbicacion();
    actualizar({ checkin_at: new Date().toISOString(), checkin_lat: lat, checkin_lng: lng, estado: 'activa' });
  }


  /* Cancelar una Guardia no es pisar su estado: es dejar escrito por qué se canceló y quién lo
     decidió. La resolución se escribe primero, y el estado en el que queda la Guardia sale del
     motivo elegido, nunca de esta pantalla. Quién pidió la cancelación y hasta dónde llega son dos
     datos de la Guardia y se guardan aparte, como la nota interna en las otras pantallas. */
  async function handleCancelar() {
    if (!(await confirmarDestructivo(t.turnos_guardia.detalle.confirmar_cancelar))) return;
    if (!motivoCancelacion) return;

    setError(null);
    setProcesando(true);

    const { error: errorResolucion } = await resolver({
      tabla: TABLA,
      filaId: turno_guardia.id,
      motivoId: motivoCancelacion.id,
      detalle: motivoCancelacion.pide_detalle ? cancelacionDetalle.trim() : null,
    });

    if (errorResolucion) {
      setProcesando(false);
      setError(mensajeDeError(errorResolucion, t));
      return;
    }

    await actualizar({
      cancelacion_origen: cancelacionOrigen,
      // Desde esta pantalla se cancela este turno de guardia y nada más.
      cancelacion_alcance: 'turno_guardia',
    });
  }

  /* Marcar la ausencia se lo pide al backend, y no se hace acá.
     La decisión completa —dejar el turno de guardia en `ausente` y abrir el incidente diciendo quién se
     quedó esperando el relevo— vive en `backend/src/utils/marcarAusente.js`, que es la misma que
     usa la detección automática. Hasta el 2026-09-05 esta pantalla tenía su propia versión, y las
     dos daban distinto: acá se buscaba por un solo Paciente —así que un turno que cubría a un
     matrimonio perdía el turno de guardia anterior del otro y se anotaba como «Ausente sin relevo previo»,
     la alerta más grave del sistema— y las dos leían `hora_fin <= hora_inicio` como si las dos
     horas fueran del mismo día, que es falso en el turno de guardia de noche. El detalle está en el
     comentario de aquel archivo. */
  async function handleMarcarAusente() {
    if (!(await confirmarDestructivo(t.turnos_guardia.detalle.confirmar_ausente))) return;
    setError(null);
    setProcesando(true);

    try {
      await llamarApiPanel(`/turnos-guardia/${turno_guardia.id}/ausente`, { method: 'POST' });
    } catch (e) {
      setProcesando(false);
      setError(mensajeDeError(e, t));
      return;
    }

    await onActualizada();
    setProcesando(false);
    onClose();
  }

  /* Lo que contó quien llamó, leído por el backend, para que el desplegable venga preelegido.
     Quien atiende el teléfono sostiene la conversación y elige un motivo al mismo tiempo, y lo
     que se elige mal ahí no se nota nunca más: la Prestadora termina contando mal sus ausencias.

     Es una sugerencia y nada más. Se aplica sobre el mismo desplegable de siempre, que se puede
     cambiar con un clic, y si el backend no encuentra ninguno que corresponda, el desplegable queda
     como estaba. La pantalla sin IA es exactamente la que era antes.

     LO QUE SE CONTÓ NO SE GUARDA. Este texto sube al backend para esta pregunta y no se manda en el
     alta: lo que se escribe en `alertas_tempranas_turno_guardia` es el motivo elegido, como siempre.
     Puede traer el diagnóstico de quien llama o el de un familiar suyo, que es dato de salud de
     una persona que no es Paciente de nadie (`celtatech/CLAUDE.md` §6). */
  async function handleSugerirMotivo() {
    setError(null);
    setSugerencia('');
    setSugiriendoMotivo(true);
    try {
      const { motivo } = await llamarApiPanel('/turnos-guardia/motivo-del-aviso', {
        method: 'POST',
        body: JSON.stringify({ texto: avisoPrevioTexto }),
      });
      if (motivo) {
        setAvisoPrevioMotivo(motivo);
        setSugerencia('sugerido');
      } else {
        setSugerencia('sin_sugerencia');
      }
    } catch (e) {
      setError(mensajeDeError(e, t));
    } finally {
      setSugiriendoMotivo(false);
    }
  }

  async function handleRegistrarAvisoPrevio() {
    if (!(await confirmarDestructivo(t.turnos_guardia.detalle.confirmar_aviso_previo))) return;
    setError(null);
    setProcesando(true);

    const { error: errorAlerta } = await supabase.from('alertas_tempranas_turno_guardia').insert({
      prestadora_id: prestadoraId,
      turno_guardia_id: turno_guardia.id,
      fuente: 'aviso_telefonico',
      motivo: avisoPrevioMotivo,
      reportado_por: usuario.id,
    });
    if (errorAlerta) {
      setProcesando(false);
      setError(mensajeDeError(errorAlerta, t));
      return;
    }

    await onActualizada();
    setProcesando(false);
    onClose();
  }

  // La cobertura es una pregunta aparte del estado del turno de guardia: "¿hay alguien que la
  // haga?", no "¿en qué momento de su vida está?". Sale del punto único de verdad
  // (lib/cobertura.js) para que ninguna pantalla la vuelva a deducir por su cuenta.
  const cobertura = coberturaDeTurnoGuardia(turno_guardia);
  const tieneAsistente = cobertura === COBERTURA.CUBIERTA;

  // Sin Asistente asignado no hay nada que registrar: nadie sale de su casa, nadie llega,
  // nadie se retira y nadie faltó. La base también lo impide, pero mostrar botones que van a
  // fallar es peor que no mostrarlos.
  const puedeRegistrarSalida = tieneAsistente && turno_guardia.estado === 'programada' && !turno_guardia.salida_checkin_at;
  const puedeRegistrarLlegada = tieneAsistente && turno_guardia.estado === 'programada' && !turno_guardia.checkin_at;
  const muestraCheckout = tieneAsistente && turno_guardia.estado === 'activa' && !turno_guardia.checkout_at;
  const puedeCancelar = turno_guardia.estado === 'programada' || turno_guardia.estado === 'activa';
  const puedeMarcarAusente = tieneAsistente && turno_guardia.estado === 'programada';
  // Un turno de guardia empezado no cambia de Asistente ni de fecha. La única excepción es la ausente: el
  // turno empezó, nadie lo está haciendo y otro lo cubre. Eso pide el motivo, no deja tocar la
  // fecha y queda registrado en la base (`reasignar_turno_guardia_por_emergencia`).
  const cubrePorEmergencia = turno_guardia.estado === 'ausente' && !turno_guardia.checkin_at;
  const puedeReasignar = (turno_guardia.estado === 'programada' && !yaEmpezo(turno_guardia)) || cubrePorEmergencia;
  // Se anotan mientras el turno de guardia está en pie o ya terminó, y nunca en una cancelada: ahí no
  // hubo trabajo que pagar. Mientras la liquidación del mes no esté hecha se pueden corregir.
  const puedeAnotarHorasExtra = tieneAsistente && turno_guardia.estado !== 'cancelada' && turno_guardia.estado !== 'ausente';
  // Horas de más sin decir por qué deja a quien liquide el mes siguiente sin poder explicar el
  // importe. Volver a cero es sacarlas, y para eso no hace falta ningún motivo.
  const horasExtraListas = Number(horasExtra) === 0 || horasExtraMotivo.trim() !== '';

  // El descanso adentro del turno sólo tiene sentido en un turno de guardia que pasa la medianoche: en un
  // turno de ocho horas nadie duerme en el domicilio, y el bloque sería un formulario de más.
  const esTurnoGuardiaLargo = Number(turno_guardia.dias_hasta_el_fin) > 0;

  // Los tres momentos del turno de guardia, con su hora o diciendo que no quedó registrado.
  //
  // Primero desaparecía el bloque entero cuando el momento ya estaba marcado, y la pantalla no
  // distinguía «se registró» de «nunca se hizo». Después se listaron los que tenían hora, y el
  // problema quedó dado vuelta: el que no la tenía volvía a desaparecer, así que un turno de guardia sin
  // ninguna marca no mostraba nada, igual que una que todavía no había empezado.
  //
  // LA AUSENCIA DE UN REGISTRO TAMBIÉN ES UN REGISTRO (pendiente #101), y por eso los tres se
  // listan siempre. Se dice como hecho: «no quedó registrada». Nunca «no avisó» ni nada que
  // suene a conclusión — la conclusión la saca quien mira la pantalla, no el programa.
  // Los nombres de los tres son neutros —«Salida», y no «Salida registrada»— porque el mismo
  // renglón se usa para decir que no quedó registrada, y «Salida registrada · No quedó
  // registrada» no se entiende.
  const momentosDelTurnoGuardia = [
    { clave: 'momento_salida', at: turno_guardia.salida_checkin_at },
    { clave: 'momento_llegada', at: turno_guardia.checkin_at },
    { clave: 'momento_checkout', at: turno_guardia.checkout_at },
  ];

  const opcionesDelHorario = {
    locale,
    textos: { hoy: t.turnos_guardia.dia_hoy, manana: t.turnos_guardia.listado.dia_manana, duracion: t.turnos_guardia.duracion_horas },
  };

  async function coberturaHecha() {
    setAccionCobertura(null);
    await onActualizada?.();
  }

  if (cerrandoTurno) {
    return (
      <CerrarTurnoGuardiaModal
        turno_guardia={turno_guardia}
        onClose={() => setCerrandoTurno(false)}
        onCerrada={async () => {
          await onActualizada?.();
          onClose();
        }}
      />
    );
  }
  if (accionCobertura?.tipo === 'editar_recurrente') {
    return <EditarRecurrenteModal serieId={turno_guardia.serie_id} onClose={() => setAccionCobertura(null)} onHecho={coberturaHecha} />;
  }
  if (accionCobertura) {
    const esDelRecurrente = accionCobertura.alcance === 'turno_guardia_recurrente';
    return (
      <CoberturaModal
        tipo={accionCobertura.tipo}
        alcance={accionCobertura.alcance}
        servicioId={turno_guardia.servicio_id}
        serieId={esDelRecurrente ? turno_guardia.serie_id : null}
        turnoGuardiaId={esDelRecurrente ? null : turno_guardia.id}
        titulo={esDelRecurrente ? t.servicios.cobertura.el_recurrente : t.servicios.cobertura.este_turno_guardia}
        onClose={() => setAccionCobertura(null)}
        onHecho={coberturaHecha}
      />
    );
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.turnos_guardia.detalle.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <dl className="panel-detalle-lista">
          <dt>{t.turnos_guardia.detalle.fecha}</dt>
          <dd>{textoDelDia(turno_guardia.fecha, opcionesDelHorario)}</dd>
          <dt>{t.turnos_guardia.detalle.horario}</dt>
          {/* El día de inicio ya está en el renglón de arriba. El de fin se escribe cuando es otro. */}
          <dd>{textoDelHorario(turno_guardia, { ...opcionesDelHorario, conDia: false })}</dd>
          <dt>{t.turnos_guardia.detalle.asistente}</dt>
          <dd>{tieneAsistente ? turno_guardia.asistente_nombre : t.turnos_guardia[claveTextoCobertura(turno_guardia)]}</dd>
          <dt>{t.turnos_guardia.detalle.paciente}</dt>
          {/* Un turno de guardia sin nadie asignado todavía existe —es un turno que hay que llenar—, y
              acá el renglón tiene que decir algo: un `<dd>` vacío se lee como si el dato no
              hubiera cargado. En el chip de la grilla, en cambio, ese guión sobra y por eso las
              dos pantallas mandan `null`. */}
          <dd>{turno_guardia.paciente_nombre || '—'}</dd>
          <dt>{t.turnos_guardia.detalle.modalidad}</dt>
          <dd>{turno_guardia.modalidad}</dd>
          <dt>{t.turnos_guardia.detalle.estado}</dt>
          <dd>{t.turnos_guardia[`estado_${turno_guardia.estado}`]}</dd>
        </dl>

        <ul className="panel-momentos-registrados">
          {momentosDelTurnoGuardia.map(({ clave, at }) => (
            <li key={clave}>
              {t.turnos_guardia.detalle[clave]} · {at ? fechaYHoraDelMomento(at, locale) : t.turnos_guardia.detalle.momento_sin_registro}
            </li>
          ))}
        </ul>

        {puedeRegistrarSalida && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.checkpoint_salida}</h3>
            <FormField
              label={t.turnos_guardia.detalle.medio_transporte}
              name="medio_transporte"
              placeholder={t.turnos_guardia.detalle.medio_transporte_placeholder}
              value={medioTransporte}
              onChange={(e) => setMedioTransporte(e.target.value)}
            />
            <Button variant="secondary" onClick={handleRegistrarSalida} disabled={procesando}>
              {t.turnos_guardia.detalle.registrar_salida}
            </Button>
          </div>
        )}

        {puedeRegistrarLlegada && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.checkin_llegada}</h3>
            <Button variant="secondary" onClick={handleRegistrarLlegada} disabled={procesando}>
              {t.turnos_guardia.detalle.registrar_llegada}
            </Button>
          </div>
        )}

        {muestraCheckout && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.checkout}</h3>
            <Button variant="secondary" onClick={() => setCerrandoTurno(true)} disabled={procesando}>
              {t.turnos_guardia.detalle.registrar_checkout}
            </Button>
          </div>
        )}

        {/* Las horas de más se anotan acá, cuando pasaron, y no salen de restarle a la marca de
            salida la hora de fin planificada: irse media hora tarde porque el relevo se demoró
            no es una hora extra autorizada, y calcularlas así convertiría cualquier demora en
            plata sin que nadie lo haya decidido. Quien las autoriza es quien coordina. */}
        {puedeAnotarHorasExtra && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.horas_extra_titulo}</h3>
            <FormField
              label={t.turnos_guardia.detalle.horas_extra_cantidad}
              name="horas_extra"
              type="number"
              min="0"
              step="0.25"
              value={horasExtra}
              onChange={(e) => setHorasExtra(e.target.value)}
            />
            <FormField
              label={t.turnos_guardia.detalle.horas_extra_motivo}
              name="horas_extra_motivo"
              type="textarea"
              value={horasExtraMotivo}
              onChange={(e) => setHorasExtraMotivo(e.target.value)}
            />
            <Button variant="secondary" onClick={handleGuardarHorasExtra} disabled={procesando || !horasExtraListas}>
              {t.turnos_guardia.detalle.horas_extra_guardar}
            </Button>
          </div>
        )}

        {puedeCancelar && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.cancelar_turno_guardia}</h3>

            {/* Los cuatro estados de lo que carga datos: mientras la lista de motivos viene, se
                avisa; si falló, se ofrece volver a pedirla; si la Prestadora se quedó sin ninguno
                encendido, no hay nada que elegir. */}
            {estadoMotivosCancelacion === 'cargando' && <p>{t.comun.cargando}</p>}
            {estadoMotivosCancelacion === 'error' && (
              <Alert variant="error">
                {errorMotivosCancelacion}{' '}
                <Button variant="secondary" onClick={recargarMotivosCancelacion}>
                  {t.comun.reintentar}
                </Button>
              </Alert>
            )}
            {estadoMotivosCancelacion === 'vacio' && <Alert variant="info">{t.comun.vacio}</Alert>}

            <FormField
              label={t.comun.motivo}
              name="cancelacion_motivo"
              type="select"
              value={cancelacionMotivoId}
              onChange={(e) => {
                setCancelacionMotivoId(e.target.value);
                setCancelacionDetalle('');
              }}
              disabled={procesando || estadoMotivosCancelacion !== 'listo'}
            >
              <option value="">{t.comun.motivo_elegir}</option>
              {motivosCancelacion.map((motivo) => (
                <option key={motivo.id} value={motivo.id}>{motivo.nombre}</option>
              ))}
            </FormField>

            {motivoCancelacion?.pide_detalle && (
              <FormField
                label={t.comun.detalle}
                name="cancelacion_detalle"
                type="textarea"
                value={cancelacionDetalle}
                onChange={(e) => setCancelacionDetalle(e.target.value)}
                disabled={procesando}
                required
              />
            )}

            <FormField
              label={t.turnos_guardia.detalle.cancelacion_origen}
              name="cancelacion_origen"
              type="select"
              value={cancelacionOrigen}
              onChange={(e) => setCancelacionOrigen(e.target.value)}
            >
              <option value="">{t.turnos_guardia.nuevo_turno_guardia.elegir}</option>
              <option value="cliente">{t.turnos_guardia.detalle.cancelacion_origen_cliente}</option>
              <option value="prestadora">{t.turnos_guardia.detalle.cancelacion_origen_prestadora}</option>
            </FormField>
            <Button
              variant="secondary"
              onClick={handleCancelar}
              disabled={
                procesando
                || !motivoCancelacion
                || (motivoCancelacion.pide_detalle && !cancelacionDetalle.trim())
                || !cancelacionOrigen
              }
            >
              {t.turnos_guardia.detalle.cancelar_turno_guardia}
            </Button>
          </div>
        )}

        {puedeMarcarAusente && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.aviso_previo_titulo}</h3>
            <FormField
              label={t.turnos_guardia.detalle.aviso_previo_texto}
              name="aviso_previo_texto"
              type="textarea"
              rows={3}
              value={avisoPrevioTexto}
              onChange={(e) => setAvisoPrevioTexto(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={handleSugerirMotivo}
              disabled={procesando || sugiriendoMotivo || !avisoPrevioTexto.trim()}
            >
              {sugiriendoMotivo ? t.turnos_guardia.detalle.sugiriendo_motivo : t.turnos_guardia.detalle.sugerir_motivo}
            </Button>
            {sugerencia === 'sugerido' && (
              <p className="panel-explicacion">{t.turnos_guardia.detalle.motivo_sugerido}</p>
            )}
            {sugerencia === 'sin_sugerencia' && (
              <p className="panel-explicacion">{t.turnos_guardia.detalle.motivo_sin_sugerencia}</p>
            )}
            <FormField
              label={t.turnos_guardia.detalle.aviso_previo_motivo}
              name="aviso_previo_motivo"
              type="select"
              value={avisoPrevioMotivo}
              onChange={(e) => { setAvisoPrevioMotivo(e.target.value); setSugerencia(''); }}
            >
              <option value="">{t.turnos_guardia.nuevo_turno_guardia.elegir}</option>
              {motivosAvisoPrevio.filter((m) => m.activo).map((m) => (
                <option key={m.id} value={m.nombre}>{m.nombre}</option>
              ))}
            </FormField>
            <Button
              variant="secondary"
              onClick={handleRegistrarAvisoPrevio}
              disabled={procesando || !avisoPrevioMotivo}
            >
              {t.turnos_guardia.detalle.registrar_aviso_previo}
            </Button>
          </div>
        )}

        {puedeMarcarAusente && (
          <div className="panel-resultado-calculo">
            <Button variant="secondary" onClick={handleMarcarAusente} disabled={procesando}>
              {t.turnos_guardia.detalle.marcar_ausente}
            </Button>
          </div>
        )}

        {interrumpeEsteTurnoGuardia && (
          <div className="panel-resultado-calculo">
            <h3>{t.servicios.cobertura.este_turno_guardia}</h3>
            <div className="panel-filtros">
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'pausa', alcance: 'turno_guardia' })} disabled={procesando}>
                {t.servicios.cobertura.pausar}
              </Button>
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'suspension', alcance: 'turno_guardia' })} disabled={procesando}>
                {t.servicios.cobertura.suspender}
              </Button>
            </div>
          </div>
        )}

        {gestionaElRecurrente && (
          <div className="panel-resultado-calculo">
            <h3>{t.servicios.cobertura.el_recurrente}</h3>
            <div className="panel-filtros">
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'editar_recurrente' })} disabled={procesando}>
                {t.servicios.cobertura.editar_recurrente}
              </Button>
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'pausa', alcance: 'turno_guardia_recurrente' })} disabled={procesando}>
                {t.servicios.cobertura.pausar}
              </Button>
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'suspension', alcance: 'turno_guardia_recurrente' })} disabled={procesando}>
                {t.servicios.cobertura.suspender}
              </Button>
              <Button variant="secondary" onClick={() => setAccionCobertura({ tipo: 'cancelacion', alcance: 'turno_guardia_recurrente' })} disabled={procesando}>
                {t.servicios.cobertura.cancelar}
              </Button>
            </div>
          </div>
        )}

        {esTurnoGuardiaLargo && <DescansosDelTurnoGuardia turnoGuardiaId={turno_guardia.id} />}

        {puedeReasignar && (
          <div className="panel-resultado-calculo">
            <h3>{t.turnos_guardia.detalle.reasignar_titulo}</h3>
            {/* Primero quien está libre. No se ofrece el Asistente actual: reasignárselo no
                cambia nada. Un turno ausente ya está sin nadie: dejarlo sin asignar no cambia nada. */}
            <ElegirAsistente
              idsHuecos={[turno_guardia.id]}
              servicioId={turno_guardia.servicio_id ?? null}
              turnoGuardiaId={turno_guardia.id}
              excluir={[turno_guardia.asistente_id]}
              label={t.turnos_guardia.detalle.reasignar_asistente}
              name="reasignar_asistente"
              value={nuevoAsistenteId}
              onChange={(id) => setNuevoAsistenteId(id)}
              disabled={procesando}
              opcionSinAsignar={turno_guardia.estado !== 'ausente' ? t.turnos_guardia.listado.sin_asignar : null}
              valorSinAsignar={SIN_ASIGNAR}
            />
            {cubrePorEmergencia ? (
              <FormField
                label={t.comun.motivo}
                name="reasignar_motivo"
                type="textarea"
                required
                maxLength={500}
                value={motivoEmergencia}
                onChange={(e) => setMotivoEmergencia(e.target.value)}
              />
            ) : (
              <FormField
                label={t.turnos_guardia.detalle.reasignar_fecha}
                name="reasignar_fecha"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
              />
            )}
            <Button
              variant="secondary"
              onClick={handleReasignarDesdeModal}
              disabled={
                procesando
                || !nuevoAsistenteId
                || (cubrePorEmergencia ? !motivoEmergencia.trim() : !nuevaFecha)
              }
            >
              {t.turnos_guardia.detalle.reasignar_confirmar}
            </Button>
          </div>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={procesando}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>
    </div>
  );
}
