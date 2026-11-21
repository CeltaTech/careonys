import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { CasillerosDeHorario } from '../../components/turnos_guardia/CasillerosDeHorario';
import { ElegirAsistente } from '../../components/turnos_guardia/ElegirAsistente';
import { mensajeDeError } from '../../lib/errores';
import { asignarSerie, asignarTurnoGuardia } from '../../lib/asignarTurnoGuardia';
import { hoyISO } from '../../lib/horarios';
import {
  DIAS_SEMANA,
  alternarGuardia,
  cabeEnTodas,
  diasEnComun,
  duraAlgo,
  duracionVisible,
  faltantesDeLaGuardia,
  guardiasParaElRecurrente,
  guardiasParaLaFecha,
  horaCorta,
  horasDelHorario,
  pacientesDeLasGuardias,
  textoDelFaltante,
  tramosDeLaGuardia,
  tramoVisible,
} from '../../lib/cronogramaDeGuardias';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { FICHA_DOMICILIO, conSusFichas } from '../../lib/fichaDelPaciente';
import { palabrasDelDomicilio } from '../../lib/partesDeDomicilio';

// El orden de los casilleros en el formulario, para saltar al primero que falte.
const ORDEN_DE_LOS_CASILLEROS = [
  'servicio_id',
  'fecha',
  'vigente_desde',
  'guardias',
  'modalidad',
  'dias_semana',
  'hora_inicio',
  'dias_hasta_el_fin',
  'fecha_fin',
  'hora_fin',
];

/**
 * El alta de un turno de guardia. Todo turno de guardia nace adentro de una guardia del
 * cronograma de una Prestación: primero se elige el Servicio, después una o más de sus guardias
 * —una por Prestación—, y de ellas salen los Pacientes, el horario y los días. El horario se
 * puede achicar, no agrandar. La base vuelve a controlarlo todo al guardar.
 */
// `servicioId` llega ya elegido cuando la ventana se abre desde la ficha de un Servicio.
export function NuevoTurnoGuardiaModal({ onClose, onCreada, servicioId: servicioInicial = '' }) {
  const modal = useModalAccesible(onClose);
  const { t, locale } = useLocale();
  const textos = t.turnos_guardia.nuevo_turno_guardia;
  const prestadoraId = usePrestadoraActual();
  const [esSerie, setEsSerie] = useState(false);
  const [pacientes, setPacientes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [estadoListas, setEstadoListas] = useState('cargando');
  const [errorListas, setErrorListas] = useState(null);
  const [asistenteId, setAsistenteId] = useState('');
  // De qué Servicio es el turno. Es lo que hace que después se pueda facturar y que la pantalla
  // del Servicio muestre sus turnos de guardia.
  const [servicioId, setServicioId] = useState(servicioInicial);
  // Las guardias del cronograma de las Prestaciones de ese Servicio, cada una con su Prestación.
  const [guardias, setGuardias] = useState([]);
  const [estadoGuardias, setEstadoGuardias] = useState('listo');
  const [errorGuardias, setErrorGuardias] = useState(null);
  const [elegidas, setElegidas] = useState([]);
  const [modalidad, setModalidad] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [diasHastaElFin, setDiasHastaElFin] = useState('0');
  const [fecha, setFecha] = useState('');
  const [diasSemana, setDiasSemana] = useState([]);
  const [vigenteDesde, setVigenteDesde] = useState('');
  const [vigenteHasta, setVigenteHasta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  // Los avisos al pie de cada casillero aparecen recién al apretar Crear.
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const cargarListas = useCallback(async () => {
    if (!prestadoraId) return;
    setEstadoListas('cargando');
    setErrorListas(null);
    const [pacientesResp, serviciosResp] = await Promise.all([
      // Sólo para nombrar a los Pacientes de las guardias elegidas, con su domicilio al lado.
      supabase
        .from('pacientes')
        .select(`id, ${FICHA_DOMICILIO}`)
        .eq('prestadora_id', prestadoraId)
        .is('deleted_at', null),
      supabase
        .from('servicios')
        .select('id, etiqueta')
        .eq('prestadora_id', prestadoraId)
        .eq('estado', 'vigente')
        // Sin Coordinador el Servicio no está habilitado y la base rechaza sus turnos de guardia.
        .not('coordinador_id', 'is', null)
        .order('etiqueta'),
    ]);
    const falla = pacientesResp.error || serviciosResp.error;
    if (falla) {
      setErrorListas(mensajeDeError(falla, t));
      setEstadoListas('error');
      return;
    }
    setPacientes(conSusFichas(pacientesResp.data, palabrasDelDomicilio(t)));
    setServicios(serviciosResp.data ?? []);
    setEstadoListas('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);

  const cargarGuardias = useCallback(async () => {
    if (!servicioId) {
      setGuardias([]);
      setEstadoGuardias('listo');
      return;
    }
    setEstadoGuardias('cargando');
    setErrorGuardias(null);
    const { data, error: errorCarga } = await supabase
      .from('cronograma_de_guardias')
      .select(
        'id, prestacion_id, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, prestaciones!inner(id, servicio_id, paciente_id, tipo_servicio, estado, vigente_desde, vigente_hasta)',
      )
      .eq('prestaciones.servicio_id', servicioId)
      .order('created_at');
    if (errorCarga) {
      setErrorGuardias(mensajeDeError(errorCarga, t));
      setEstadoGuardias('error');
      return;
    }
    setGuardias(data ?? []);
    setEstadoGuardias('listo');
  }, [servicioId, t]);

  useEffect(() => {
    setElegidas([]);
    cargarGuardias();
  }, [cargarGuardias]);

  // Las guardias que le sirven a este turno: las del día elegido, o las que se repiten por día de
  // la semana desde el arranque del recurrente. En los dos casos, de una Prestación vigente ese día.
  const disponibles = useMemo(
    () => (esSerie ? guardiasParaElRecurrente(guardias, vigenteDesde || hoyISO()) : guardiasParaLaFecha(guardias, fecha)),
    [esSerie, guardias, vigenteDesde, fecha],
  );

  // Cambiar la fecha o pasar a recurrente puede dejar elegida una guardia que ya no corresponde.
  useEffect(() => {
    setElegidas((prev) => {
      const quedan = prev.filter((g) => disponibles.some((d) => d.id === g.id));
      return quedan.length === prev.length ? prev : quedan;
    });
  }, [disponibles]);

  const pacienteIds = useMemo(() => pacientesDeLasGuardias(elegidas), [elegidas]);

  // El turno de guardia que se está creando, para proponer a quien está libre. No tiene id
  // porque todavía no existe. En un turno fijo se usa el primer día desde el que rige.
  const huecoQueSeCrea = useMemo(() => {
    const dia = esSerie ? vigenteDesde : fecha;
    if (!dia || !horaInicio || !horaFin) return [];
    return [{
      fecha: dia,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      dias_hasta_el_fin: Number(diasHastaElFin) || 0,
      paciente_ids: pacienteIds,
    }];
  }, [esSerie, vigenteDesde, fecha, horaInicio, horaFin, diasHastaElFin, pacienteIds]);
  const pacientePorId = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const diasDeLasGuardias = useMemo(() => diasEnComun(elegidas), [elegidas]);

  function elegirGuardia(guardia) {
    const nuevas = alternarGuardia(elegidas, guardia);
    setElegidas(nuevas);
    // El horario y los días se completan con los de la guardia recién elegida; después se pueden
    // achicar.
    if (nuevas.some((g) => g.id === guardia.id)) {
      setHoraInicio(horaCorta(guardia.hora_inicio));
      setHoraFin(horaCorta(guardia.hora_fin));
      setDiasHastaElFin(String(guardia.dias_hasta_el_fin ?? 0));
    }
  }

  // Los días del recurrente se completan con los que tienen todas las guardias elegidas; después
  // se pueden desmarcar.
  useEffect(() => {
    if (esSerie) setDiasSemana(diasDeLasGuardias);
  }, [esSerie, diasDeLasGuardias]);

  function alternarDia(dia) {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  // El aviso de cada casillero. Se calcula siempre y se muestra sólo después de apretar Crear: así
  // desaparece en cuanto el dato se completa. Lo del comienzo y el fin lo dice la misma cuenta que
  // usa el cronograma de guardias.
  const falta = t.formularios.falta_un_dato_obligatorio;
  const avisos = {};
  const faltantesDelHorario = faltantesDeLaGuardia({
    repite: esSerie,
    dias_semana: diasSemana,
    fecha,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    dias_hasta_el_fin: diasHastaElFin,
  });
  for (const [campo, motivo] of Object.entries(faltantesDelHorario)) avisos[campo] = textoDelFaltante(motivo, t);
  if (!servicioId) avisos.servicio_id = textos.error_sin_servicio;
  if (esSerie && !vigenteDesde) avisos.vigente_desde = falta;
  if (servicioId && elegidas.length === 0) avisos.guardias = textos.error_sin_guardias;
  if (!modalidad.trim()) avisos.modalidad = falta;
  if (!avisos.dias_semana && esSerie && diasSemana.some((d) => !diasDeLasGuardias.includes(d))) {
    avisos.dias_semana = textos.error_dia_fuera_de_la_guardia;
  }
  const horarioDelTurno = { hora_inicio: horaInicio, hora_fin: horaFin, dias_hasta_el_fin: Number(diasHastaElFin) };
  if (!avisos.hora_fin && !avisos.dias_hasta_el_fin && !avisos.fecha_fin && duraAlgo(horarioDelTurno) && elegidas.length > 0 && !cabeEnTodas(horarioDelTurno, elegidas)) {
    avisos.hora_fin = textos.error_horario_fuera_de_la_guardia;
  }
  const avisoDe = (campo) => (intentoGuardar ? avisos[campo] : undefined);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIntentoGuardar(true);
    const primero = ORDEN_DE_LOS_CASILLEROS.find((campo) => avisos[campo]);
    if (primero) {
      document.getElementById(`field-${primero}`)?.focus();
      return;
    }

    setGuardando(true);
    // El primero de la lista es el Paciente principal del turno de guardia.
    const [principal, ...resto] = pacienteIds;

    if (esSerie) {
      // La serie, sus Pacientes y sus turnos de guardia los arma la base, todo junto o nada.
      const { data: serieId, error: errorSerie } = await supabase.rpc('crear_turno_guardia_recurrente', {
        p_servicio: servicioId,
        p_pacientes: pacienteIds,
        p_dias_semana: DIAS_SEMANA.filter((d) => diasSemana.includes(d)),
        p_hora_inicio: horaInicio,
        p_hora_fin: horaFin,
        p_dias_hasta_el_fin: Number(diasHastaElFin),
        p_modalidad: modalidad,
        p_vigente_desde: vigenteDesde,
        p_vigente_hasta: vigenteHasta || null,
      });
      if (errorSerie) {
        setGuardando(false);
        setError(mensajeDeError(errorSerie, t));
        return;
      }
      // El turno recurrente ya existe, sin nadie. Se le asigna igual que un turno: queda
      // esperando que el Asistente lo acepte, una sola vez para todos sus días.
      const { error: errorAsignarSerie } = asistenteId ? await asignarSerie(serieId, asistenteId, t) : { error: null };
      setGuardando(false);
      onCreada(errorAsignarSerie);
      return;
    }

    const { data: turnoGuardia, error: errorInsert } = await supabase
      .from('turnos_guardia')
      .insert({
        prestadora_id: prestadoraId,
        // Nace sin nadie y se asigna después: queda esperando que el Asistente lo acepte.
        asistente_id: null,
        paciente_id: principal,
        servicio_id: servicioId,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        dias_hasta_el_fin: Number(diasHastaElFin),
        modalidad,
      })
      .select('id')
      .single();

    if (errorInsert) {
      setGuardando(false);
      setError(mensajeDeError(errorInsert, t));
      return;
    }

    if (resto.length > 0) {
      const { error: errorPacientes } = await supabase.from('turno_guardia_pacientes').insert(
        resto.map((id) => ({
          turno_guardia_id: turnoGuardia.id,
          paciente_id: id,
          prestadora_id: prestadoraId,
        })),
      );
      if (errorPacientes) {
        setGuardando(false);
        setError(mensajeDeError(errorPacientes, t));
        return;
      }
    }

    // El turno ya existe. Si la asignación no pasa, queda sin asignar y se dice por qué: volver a
    // guardar crearía otro igual. Si la frenaron los documentos, se devuelve cómo repetirla.
    const { error: errorAsignar, documentosPendientes } = asistenteId
      ? await asignarTurnoGuardia(turnoGuardia.id, asistenteId, t)
      : { error: null, documentosPendientes: null };

    setGuardando(false);
    onCreada(
      errorAsignar,
      documentosPendientes
        ? { documentos: documentosPendientes, reintentar: (motivo) => asignarTurnoGuardia(turnoGuardia.id, asistenteId, t, motivo) }
        : null,
    );
  }

  const nombreDelPaciente = (id) => pacientePorId.get(id)?.nombre ?? '—';
  // Cada guardia con su comienzo y su fin —uno por día marcado— y cuánto dura.
  const renglonDeGuardia = (g) =>
    textos.renglon_de_guardia
      .replace('{paciente}', nombreDelPaciente(g.prestaciones?.paciente_id))
      .replace('{prestacion}', g.prestaciones?.tipo_servicio ?? '—')
      .replace('{tramos}', tramosDeLaGuardia(g).map((tr) => tramoVisible(tr, t, locale)).join(', '))
      .replace('{duracion}', duracionVisible(horasDelHorario(g), t));

  // Sin el día elegido todavía no hay qué mostrar: la lista de guardias depende de él.
  const faltaElDia = esSerie ? false : !fecha;
  const mensajeSinGuardias =
    guardias.length === 0 ? textos.sin_guardias : esSerie ? textos.sin_guardias_recurrentes : textos.sin_guardias_en_la_fecha;

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{textos.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <EstadoLista estado={estadoListas} error={errorListas} recargar={cargarListas}>
          <form onSubmit={handleSubmit} noValidate>
            <FormField
              label={textos.es_serie}
              name="es_serie"
              type="checkbox"
              checked={esSerie}
              onChange={(e) => setEsSerie(e.target.checked)}
              disabled={guardando}
            />

            {/* El Asistente no es obligatorio: se sabe que el martes hay que cubrir a este
                Paciente antes de saber quién lo va a hacer. */}
            <ElegirAsistente
              huecos={huecoQueSeCrea}
              label={textos.asistente}
              name="asistente_id"
              value={asistenteId}
              onChange={(id) => setAsistenteId(id)}
              disabled={guardando}
              opcionSinAsignar={textos.sin_asistente}
            />

            <FormField
              label={textos.servicio}
              name="servicio_id"
              type="select"
              required
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              error={avisoDe('servicio_id')}
              disabled={guardando}
            >
              <option value="">—</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>{s.etiqueta || s.id}</option>
              ))}
            </FormField>

            {!esSerie && (
              <FormField
                label={textos.fecha_inicio}
                name="fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                error={avisoDe('fecha')}
                disabled={guardando}
              />
            )}

            {esSerie && (
              <>
                <FormField
                  label={textos.vigente_desde}
                  name="vigente_desde"
                  type="date"
                  required
                  value={vigenteDesde}
                  onChange={(e) => setVigenteDesde(e.target.value)}
                  error={avisoDe('vigente_desde')}
                  disabled={guardando}
                />
                <FormField
                  label={textos.vigente_hasta}
                  name="vigente_hasta"
                  type="date"
                  value={vigenteHasta}
                  onChange={(e) => setVigenteHasta(e.target.value)}
                  disabled={guardando}
                />
              </>
            )}

            {servicioId && !faltaElDia && (
              <div className="form-field">
                <label id="field-guardias-etiqueta">
                  {textos.guardias}
                  <span className="required">*</span>
                </label>
                <EstadoLista
                  estado={estadoGuardias}
                  error={errorGuardias}
                  recargar={cargarGuardias}
                  vacio={disponibles.length === 0}
                  mensajeVacio={mensajeSinGuardias}
                >
                  <div
                    className="panel-lista-pacientes"
                    role="group"
                    aria-labelledby="field-guardias-etiqueta"
                    aria-describedby={avisoDe('guardias') ? 'field-guardias-error' : undefined}
                  >
                    {disponibles.map((g, i) => (
                      <label key={g.id}>
                        <input
                          id={i === 0 ? 'field-guardias' : undefined}
                          type="checkbox"
                          checked={elegidas.some((e) => e.id === g.id)}
                          onChange={() => elegirGuardia(g)}
                          disabled={guardando}
                        />
                        <span>{renglonDeGuardia(g)}</span>
                      </label>
                    ))}
                  </div>
                </EstadoLista>
                {avisoDe('guardias') && <span className="form-error" id="field-guardias-error">{avisoDe('guardias')}</span>}
              </div>
            )}

            {pacienteIds.length > 0 && (
              <div className="form-field">
                <label>{textos.pacientes}</label>
                <div className="panel-lista-pacientes">
                  {pacienteIds.map((id) => (
                    <span key={id}>
                      {nombreDelPaciente(id)}
                      {pacientePorId.get(id)?.domicilio && <small>{pacientePorId.get(id).domicilio}</small>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <FormField
              label={textos.modalidad}
              name="modalidad"
              required
              placeholder={textos.modalidad_placeholder}
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value)}
              error={avisoDe('modalidad')}
              disabled={guardando}
            />

            <CasillerosDeHorario
              diasSemana={esSerie ? diasSemana : undefined}
              onAlternarDia={esSerie ? alternarDia : undefined}
              fecha={esSerie ? undefined : fecha}
              horaInicio={horaInicio}
              onHoraInicio={setHoraInicio}
              horaFin={horaFin}
              onHoraFin={setHoraFin}
              diasHastaElFin={diasHastaElFin}
              onDiasHastaElFin={setDiasHastaElFin}
              errores={{
                dias_semana: avisoDe('dias_semana'),
                hora_inicio: avisoDe('hora_inicio'),
                dias_hasta_el_fin: avisoDe('dias_hasta_el_fin'),
                fecha_fin: avisoDe('fecha_fin'),
                hora_fin: avisoDe('hora_fin'),
              }}
              disabled={guardando}
            />

            <div className="panel-modal-acciones">
              <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
                {t.comun.cancelar}
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? textos.creando : textos.crear}
              </Button>
            </div>
          </form>
        </EstadoLista>
      </div>
    </div>
  );
}
