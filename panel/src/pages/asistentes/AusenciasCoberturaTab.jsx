import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useEmpresa } from '../../context/EmpresaContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { generarConstanciaAusencia, descargarPDF } from '../../lib/generarDocumentoCese';
import { ESTADO_ACTIVO } from '../../lib/candidatos';
import { guardiasAfectadas, guardiasSinCubrir, sumarLasYaCubiertas } from '../../lib/guardiasAfectadas';
import { diasComputados } from '../../lib/diasDeAusencia';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { avisarCambioDeAsistente } from '../../lib/avisarCambioDeAsistente';
import { llamadorDe } from '../../lib/apiPanel';
import { useMotivosSustitucionGuardia } from '../../hooks/useMotivosSustitucionGuardia';
import { nombreMotivoSustitucion, valorGuardado } from '../../lib/motivoDeSustitucion';
import { hoyISO, sumarDias } from '../../lib/horarios';
import '../../styles/molde-paginas.css';
import './fichaAsistente.css';

const TIPOS =['enfermedad_inculpable', 'accidente_inculpable', 'otra_licencia', 'ausencia_no_justificada'];

// El momento de ahora con la forma que pide una caja de fecha y hora (`2026-09-16T14:30`), en hora
// local. `toISOString()` a secas daría la hora en UTC, que en horario argentino se lee tres horas
// corrida. Es lo que viene puesto en «cuándo avisó»: el caso corriente es que la Coordinadora
// cargue la ausencia al enterarse, y el que avisó antes se corrige hacia atrás.
function ahoraLocal() {
  const momento = new Date();
  const corrida = new Date(momento.getTime() - momento.getTimezoneOffset() * 60000);
  return corrida.toISOString().slice(0, 16);
}

// De lo que escribió la Coordinadora al momento exacto que se guarda. Vacío devuelve `null`, y
// entonces la base pone el momento de la carga: una ausencia sin este dato se trata como urgente,
// que es el error barato.
function momentoGuardado(texto) {
  if (!texto) return null;
  const momento = new Date(texto);
  return Number.isNaN(momento.getTime()) ? null : momento.toISOString();
}
const llamarApiAusencias = llamadorDe('/ausencias');

export function AusenciasCoberturaTab({ asistente }) {
  const { t, locale } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { empresa } = useEmpresa();
  const [ausencias, setAusencias] = useState([]);
  const [coberturas, setCoberturas] = useState({});
  const [otrosAsistentes, setOtrosAsistentes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState({ tipo: 'enfermedad_inculpable', fecha_inicio: '', fecha_fin: '', observaciones: '', avisada_en: ahoraLocal() });
  const [coberturaForm, setCoberturaForm] = useState({});
  const [fechaForm, setFechaForm] = useState({});
  const [cambiosDeFecha, setCambiosDeFecha] = useState({});
  const [turnosCubiertos, setTurnosCubiertos] = useState({});
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [subiendoCertificado, setSubiendoCertificado] = useState(null);
  const [errorCertificado, setErrorCertificado] = useState(null);
  const {
    filas: motivosSustitucion,
    estado: estadoMotivos,
    error: errorMotivos,
  } = useMotivosSustitucionGuardia(prestadoraId);

  // La fila del catálogo que está elegida en el formulario de una ausencia. Se busca por lo que se
  // guarda —la clave o el nombre—, que es lo mismo que viaja al backend, y sirve para saber si esa
  // causa obliga a explicar.
  function motivoElegido(ausenciaId) {
    const valor = coberturaForm[ausenciaId]?.motivo;
    if (!valor) return null;
    return motivosSustitucion.find((m) => valorGuardado(m) === valor) ?? null;
  }

  async function recargar() {
    setEstado('cargando');
    const [
      { data: dataAusencias, error: errorAusencias },
      { data: dataAsistentes },
      { data: dataSeries, error: errorSeries },
    ] = await Promise.all([
      supabase.from('ausencias').select('*').eq('asistente_id', asistente.id).order('fecha_inicio', { ascending: false }),
      // Quién puede cubrir esta ausencia. Es repartir trabajo, así que solo entra quien sigue en
      // el plantel; y se filtra en la consulta porque esta lista no muestra a nadie, solo llena
      // el desplegable del sustituto. El valor sale de `ESTADO_ACTIVO`, la misma constante que
      // contesta `estaEnElPlantel`, para que la regla quede escrita en un solo lugar
      // (regla 12 de CLAUDE.md §7).
      supabase.from('asistentes').select('id, nombre').eq('estado', ESTADO_ACTIVO).neq('id', asistente.id),
      // Los turnos fijos de esta persona, para elegir cuál se cubre.
      supabase.from('series_guardias').select('id, dias_semana, hora_inicio, hora_fin').eq('asistente_id', asistente.id),
    ]);
    if (errorAusencias || errorSeries) {
      setError(mensajeDeError(errorAusencias ?? errorSeries, t));
      setEstado('error');
      return;
    }
    // Qué turnos de esas ausencias ya tienen sustituto. Se trae junto con las ausencias y no al
    // apretar el botón: la tarjeta tiene que poder decir cuántas faltan antes de que nadie toque
    // nada. Si esta consulta falla, la pestaña entra en error en vez de dibujar cero cubiertas,
    // que invitaría a asignar de nuevo lo que ya está asignado.
    const lista = dataAusencias ?? [];
    const porAusencia = {};
    const cambiosPorAusencia = {};
    const turnosPorAusencia = {};
    if (lista.length > 0) {
      const ids = lista.map((a) => a.id);
      const [
        { data: dataCobertura, error: errorCobertura },
        { data: dataCambios, error: errorCambios },
        { data: dataTurnos, error: errorTurnos },
      ] = await Promise.all([
        supabase.from('guardias_cobertura').select('id, ausencia_id, guardia_original_id').in('ausencia_id', ids),
        supabase.from('ausencias_cambios_de_fecha').select('id, ausencia_id, fecha_anterior, fecha_nueva, cambiado_at')
          .in('ausencia_id', ids).order('cambiado_at'),
        supabase.from('coberturas_de_ausencia')
          .select('id, ausencia_id, objetada_at, asistentes(nombre), series_guardias(dias_semana, hora_inicio, hora_fin)')
          .in('ausencia_id', ids).order('created_at'),
      ]);
      const errorLectura = errorCobertura ?? errorCambios ?? errorTurnos;
      if (errorLectura) {
        setError(mensajeDeError(errorLectura, t));
        setEstado('error');
        return;
      }
      for (const cobertura of dataCobertura ?? []) {
        (porAusencia[cobertura.ausencia_id] ??= []).push(cobertura);
      }
      for (const cambio of dataCambios ?? []) {
        (cambiosPorAusencia[cambio.ausencia_id] ??= []).push(cambio);
      }
      for (const turno of dataTurnos ?? []) {
        (turnosPorAusencia[turno.ausencia_id] ??= []).push(turno);
      }
    }

    setAusencias(lista);
    setCoberturas(porAusencia);
    setCambiosDeFecha(cambiosPorAusencia);
    setTurnosCubiertos(turnosPorAusencia);
    setTurnosFijos(dataSeries ?? []);
    setOtrosAsistentes(dataAsistentes ?? []);
    setEstado('listo');
  }

  useEffect(() => { recargar(); }, [asistente.id]);

  // Qué guardias deja sin Asistente esta ausencia. Se pregunta al guardarla y queda escrito en la
  // ausencia: lo que hay que cubrir son turnos, no un rango de fechas, y sin esta lista la
  // cobertura quedaba colgada de la ausencia sin decir de qué día. Cuál cuenta lo decide
  // `guardiasAfectadas`, y acá sólo se traen las de esta persona desde el primer día.
  //
  // La fecha de fin es siempre la prevista, y se vuelve a calcular cada vez que se la cambia o se
  // registra la vuelta.
  //
  // Y lo ya cubierto se suma aparte, porque la consulta no lo encuentra: un turno cubierto pasó a
  // nombre de quien lo hace, así que dejó de ser de esta persona. Por qué eso importa lo explica
  // `sumarLasYaCubiertas`, que es donde vive la regla.
  async function guardiasDeLaAusencia(ausencia) {
    const { data, error: errorGuardias } = await supabase
      .from('guardias')
      .select('id, fecha, estado')
      .eq('asistente_id', asistente.id)
      .gte('fecha', ausencia.fecha_inicio)
      .lte('fecha', ausencia.fecha_fin);
    if (errorGuardias) throw errorGuardias;

    return sumarLasYaCubiertas(guardiasAfectadas(data ?? [], ausencia), coberturas[ausencia.id]);
  }

  // Las guardias que esta ausencia dejó descubiertas. Las cargadas antes de que esto se escribiera
  // tienen la columna vacía, y ahí se averigua ahora y se guarda: son ausencias reales, con turnos
  // reales sin cubrir, y dejarlas sin poder asignar un sustituto sería castigarlas por haber sido
  // cargadas primero.
  async function afectadasDe(ausencia) {
    if (Array.isArray(ausencia.guardias_afectadas)) return ausencia.guardias_afectadas;
    const afectadas = await guardiasDeLaAusencia(ausencia);
    const { error: errorUpdate } = await supabase
      .from('ausencias')
      .update({ guardias_afectadas: afectadas })
      .eq('id', ausencia.id);
    if (errorUpdate) throw errorUpdate;
    return afectadas;
  }

  async function registrarAusencia() {
    if (!nueva.fecha_inicio || !nueva.fecha_fin) return;
    setGuardando(true);
    setError(null);

    let afectadas;
    try {
      afectadas = await guardiasDeLaAusencia(nueva);
    } catch {
      // Sin saber qué turnos quedan descubiertos la ausencia no se guarda. Guardarla igual la
      // dejaría con la lista vacía, que se lee como «no afectó a ninguno» y no como «no se pudo
      // averiguar»: nadie iría a buscar una cobertura que la pantalla dice que no hace falta.
      setGuardando(false);
      setError(t.comun.error_generico);
      return;
    }

    const { error: errorInsert } = await supabase.from('ausencias').insert({
      prestadora_id: prestadoraId,
      asistente_id: asistente.id,
      tipo: nueva.tipo,
      fecha_inicio: nueva.fecha_inicio,
      fecha_fin: nueva.fecha_fin,
      observaciones: nueva.observaciones || null,
      avisada_en: momentoGuardado(nueva.avisada_en),
      guardias_afectadas: afectadas,
      dias_computados: diasComputados(nueva),
    });
    setGuardando(false);
    if (errorInsert) {
      setError(t.comun.error_generico);
      return;
    }
    setNueva({ tipo: 'enfermedad_inculpable', fecha_inicio: '', fecha_fin: '', observaciones: '', avisada_en: ahoraLocal() });
    recargar();
  }

  // Mover el fin de la ausencia: una fecha prevista nueva, o la vuelta. La vuelta deja el último
  // día de ausencia en el anterior. Cada cambio de la fecha prevista lo anota la base en el
  // historial; acá se rehacen los dos números que dependen de ella —los días computados, que
  // imprime la constancia, y los turnos que quedaron sin Asistente— y se guardan junto con la
  // fecha, de una sola vez. La cobertura por turno fijo la corre sola el backend.
  async function moverElFin(ausencia, { fechaFin, fechaVuelta = null }) {
    if (!fechaFin || fechaFin < ausencia.fecha_inicio) return;
    setGuardando(true);
    setError(null);

    const movida = { ...ausencia, fecha_fin: fechaFin };
    let afectadas;
    try {
      afectadas = await guardiasDeLaAusencia(movida);
    } catch {
      setGuardando(false);
      setError(t.comun.error_generico);
      return;
    }

    const cambios = { fecha_fin: fechaFin, guardias_afectadas: afectadas, dias_computados: diasComputados(movida) };
    if (fechaVuelta) cambios.fecha_vuelta_real = fechaVuelta;
    const { error: errorUpdate } = await supabase.from('ausencias').update(cambios).eq('id', ausencia.id);
    setGuardando(false);
    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      return;
    }
    setFechaForm((prev) => ({ ...prev, [ausencia.id]: {} }));
    recargar();
  }

  function cambiarFechaPrevista(ausencia) {
    return moverElFin(ausencia, { fechaFin: fechaForm[ausencia.id]?.prevista });
  }

  function registrarVuelta(ausencia) {
    const vuelta = fechaForm[ausencia.id]?.vuelta;
    if (!vuelta || vuelta <= ausencia.fecha_inicio) return;
    return moverElFin(ausencia, { fechaFin: sumarDias(vuelta, -1), fechaVuelta: vuelta });
  }

  // Un turno fijo se describe por sus días y su horario: «Lunes, Miércoles 08:00–20:00».
  function nombreDelTurno(serie) {
    if (!serie) return '';
    const dias = (serie.dias_semana ?? []).map((d) => t.guardias.nueva_guardia.dias[d] ?? d).join(', ');
    return `${dias} ${serie.hora_inicio?.slice(0, 5) ?? ''}–${serie.hora_fin?.slice(0, 5) ?? ''}`;
  }

  function fechaVisible(fecha) {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale);
  }

  function descargarConstancia(ausencia) {
    const doc = generarConstanciaAusencia({
      asistente, ausencia, tipoLabel: t.asistentes.ausencias[`tipo_${ausencia.tipo}`], nombreEmpresa: empresa?.nombre ?? '',
    });
    descargarPDF(doc, `constancia-ausencia-${asistente.nombre}-${ausencia.fecha_inicio}.pdf`);
  }

  async function subirCertificado(ausenciaId, archivo) {
    if (!archivo) return;
    setSubiendoCertificado(ausenciaId);
    setErrorCertificado(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      await llamarApiAusencias(`/${ausenciaId}/certificado`, { method: 'POST', body: formData });
      await recargar();
    } catch {
      setErrorCertificado(t.asistentes.ausencias.certificado_invalido);
    } finally {
      setSubiendoCertificado(null);
    }
  }

  async function verCertificado(ausenciaId) {
    try {
      const { url } = await llamarApiAusencias(`/${ausenciaId}/certificado-url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setErrorCertificado(mensajeDeError(err, t));
    }
  }

  // La cobertura se pide al backend por turno fijo, para toda la ausencia: el sustituto hace ese
  // turno hasta la vuelta, y si la fecha prevista se corre la cobertura la sigue sola
  // (`backend/src/utils/coberturaDeAusencia.js`). Sin turno elegido van todos los turnos fijos del
  // ausente, y las guardias sueltas se cubren una por una. Un turno que ya tiene sustituto no se
  // vuelve a cubrir: apretar dos veces no duplica nada.
  //
  // Una guardia sola, fuera de esto, se sigue cubriendo desde la guardia misma.
  async function asignarCobertura(ausencia) {
    const formulario = coberturaForm[ausencia.id] ?? {};
    const sustitutoId = formulario.asistente_sustituto_id;
    if (!sustitutoId) return;
    setGuardando(true);
    setError(null);

    let cubiertas;
    try {
      // Las ausencias cargadas antes de que existiera la lista de turnos afectados la calculan
      // ahora, para que la tarjeta pueda decir cuántos faltan.
      await afectadasDe(ausencia);
      const respuesta = await llamarApiAusencias(`/${ausencia.id}/cobertura`, {
        method: 'POST',
        body: JSON.stringify({
          asistente_sustituto_id: sustitutoId,
          serie_id: formulario.serie_id || null,
          motivo: formulario.motivo || null,
          motivo_detalle: formulario.motivo_detalle || null,
          costo_adicional: formulario.costo_adicional || null,
        }),
      });
      cubiertas = respuesta.guardia_ids ?? [];
    } catch (err) {
      setGuardando(false);
      setError(mensajeDeError(err, t));
      return;
    }
    setGuardando(false);

    // Quien va a la casa del Paciente ya no es el de siempre, así que se avisa. Quién es viaja
    // explícito, porque el mensaje nunca lo deduce de la guardia. Un mensaje para todos los turnos y no
    // uno por turno.
    if (cubiertas.length > 0) await avisarCambioDeAsistente({
      guardiaIds: cubiertas,
      asistenteNuevoId: sustitutoId,
      asistenteAnteriorId: asistente?.id ?? null,
    });

    setCoberturaForm((prev) => ({ ...prev, [ausencia.id]: {} }));
    recargar();
  }

  return (
    <div className="molde-pila">
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.asistentes.ausencias.titulo}</h2>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        {errorCertificado && <Alert variant="error">{errorCertificado}</Alert>}

        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && ausencias.length === 0} recargar={recargar}>
          <div>
          {ausencias.map((a) => {
            // Cuántos turnos faltan cubrir. Con la lista todavía sin calcular —las ausencias
            // cargadas antes de que esto existiera— no se sabe, y entonces el sustituto se ofrece
            // igual: la cuenta se hace al asignarlo.
            const afectadas = Array.isArray(a.guardias_afectadas) ? a.guardias_afectadas : null;
            const sinCubrir = afectadas === null ? null : guardiasSinCubrir(afectadas, coberturas[a.id]);
            return (
            <div key={a.id} className="panel-fila-alerta">
              <div className="ficha-asistente-renglon">
                <b>
                  {t.asistentes.ausencias[`tipo_${a.tipo}`]} — {fechaVisible(a.fecha_inicio)}
                  {a.fecha_vuelta_real
                    ? ` · ${con(t.asistentes.ausencias.volvio_el, { fecha: fechaVisible(a.fecha_vuelta_real) })}`
                    : ` → ${fechaVisible(a.fecha_fin)} (${t.asistentes.ausencias.prevista})`}
                </b>
                {a.dias_computados !== null && a.dias_computados !== undefined && (
                  <span className="panel-mini">{con(t.asistentes.ausencias.dias_computados, { n: a.dias_computados })}</span>
                )}
                {a.observaciones && <span className="panel-mini">{a.observaciones}</span>}

                {/* Cuántos turnos dejó descubiertos. Las ausencias cargadas antes de que esto se
                    escribiera tienen la columna vacía, y ahí no se dice nada: cero y «no se sabe» no
                    son lo mismo, y escribir cero haría creer que no hay nada que cubrir. */}
                {afectadas !== null && (
                  <span className="panel-mini">
                    {afectadas.length === 0
                      ? t.asistentes.ausencias.sin_guardias_afectadas
                      : con(t.asistentes.ausencias.guardias_afectadas, { n: afectadas.length })}
                    {afectadas.length > 0 && (
                      <>
                        {' — '}
                        {sinCubrir.length === 0
                          ? t.asistentes.ausencias.todas_cubiertas
                          : con(t.asistentes.ausencias.guardias_sin_cubrir, { n: sinCubrir.length })}
                      </>
                    )}
                  </span>
                )}

                {/* Pasada la fecha prevista sin vuelta registrada, la cobertura sigue y el sistema
                    pregunta hasta que alguien la anote. */}
                {!a.fecha_vuelta_real && a.fecha_fin < hoyISO() && (
                  <Alert variant="warning">{t.asistentes.ausencias.vuelta_sin_confirmar}</Alert>
                )}

                {/* Mientras no volvió, se puede correr la fecha prevista o anotar la vuelta. */}
                {!a.fecha_vuelta_real && (
                  <div className="molde-formgrid">
                    <div>
                      <FormField
                        label={t.asistentes.ausencias.nueva_fecha_prevista}
                        name={`prevista-${a.id}`}
                        type="date"
                        value={fechaForm[a.id]?.prevista || ''}
                        onChange={(e) => setFechaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], prevista: e.target.value } }))}
                      />
                      <Button variant="secondary" onClick={() => cambiarFechaPrevista(a)} disabled={guardando || !fechaForm[a.id]?.prevista}>
                        {t.asistentes.ausencias.cambiar_fecha_prevista}
                      </Button>
                    </div>
                    <div>
                      <FormField
                        label={t.asistentes.ausencias.fecha_vuelta}
                        name={`vuelta-${a.id}`}
                        type="date"
                        value={fechaForm[a.id]?.vuelta || ''}
                        onChange={(e) => setFechaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], vuelta: e.target.value } }))}
                      />
                      <Button variant="secondary" onClick={() => registrarVuelta(a)} disabled={guardando || !fechaForm[a.id]?.vuelta}>
                        {t.asistentes.ausencias.registrar_vuelta}
                      </Button>
                    </div>
                  </div>
                )}

                {cambiosDeFecha[a.id]?.length > 0 && (
                  <div className="panel-historial-fechas">
                    <b>{t.asistentes.ausencias.historial_fechas}</b>
                    {cambiosDeFecha[a.id].map((c) => (
                      <span key={c.id} className="panel-mini">
                        {con(t.asistentes.ausencias.cambio_de_fecha, {
                          antes: fechaVisible(c.fecha_anterior),
                          despues: fechaVisible(c.fecha_nueva),
                          cuando: new Date(c.cambiado_at).toLocaleDateString(locale),
                        })}
                      </span>
                    ))}
                  </div>
                )}

                {turnosCubiertos[a.id]?.length > 0 && (
                  <div className="panel-turnos-cubiertos">
                    {turnosCubiertos[a.id].map((c) => (
                      <span key={c.id} className="panel-mini">
                        {con(c.objetada_at ? t.asistentes.ausencias.turno_objetado : t.asistentes.ausencias.turno_cubierto_por, {
                          turno: nombreDelTurno(c.series_guardias),
                          nombre: c.asistentes?.nombre ?? '',
                        })}
                      </span>
                    ))}
                  </div>
                )}

                <div className="molde-formgrid">
                  <div className="molde-campo">
                    <b>{t.asistentes.ausencias.certificado_medico}</b>
                    <span className="panel-mini">
                      {a.certificado_url ? t.asistentes.ausencias.certificado_cargado : t.asistentes.ausencias.sin_certificado}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      aria-label={t.asistentes.ausencias.certificado_medico}
                      disabled={subiendoCertificado === a.id}
                      onChange={(e) => subirCertificado(a.id, e.target.files?.[0])}
                    />
                    {subiendoCertificado === a.id && <span className="panel-mini">{t.asistentes.ausencias.subiendo_certificado}</span>}
                  </div>
                </div>
                <div className="molde-acciones">
                  <Button variant="secondary" onClick={() => descargarConstancia(a)}>
                    {t.asistentes.ausencias.descargar_constancia}
                  </Button>
                  {a.certificado_url && (
                    <Button variant="secondary" onClick={() => verCertificado(a.id)}>
                      {t.asistentes.ausencias.ver_certificado}
                    </Button>
                  )}
                </div>

                {/* Sin turnos que cubrir no se pide ningún sustituto: no habría dónde ponerlo. */}
                {(sinCubrir === null || sinCubrir.length > 0) && (
                  <>
                    {/* Por qué la hace otro. La lista sale del catálogo de la Prestadora: si se quedó
                        sin ninguna encendida no hay nada que elegir, y se lo dice, porque un
                        desplegable vacío no explica nada. */}
                    {estadoMotivos === 'vacio' && (
                      <Alert variant="info">{t.asistentes.ausencias.sustitucion_sin_motivos}</Alert>
                    )}
                    {errorMotivos && <Alert variant="error">{errorMotivos}</Alert>}
                    <div className="molde-formgrid">
                      <FormField
                        label={t.asistentes.ausencias.asignar_sustituto}
                        name={`sustituto-${a.id}`}
                        type="select"
                        value={coberturaForm[a.id]?.asistente_sustituto_id || ''}
                        onChange={(e) => setCoberturaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], asistente_sustituto_id: e.target.value } }))}
                      >
                        <option value="">{t.guardias.nueva_guardia.elegir}</option>
                        {otrosAsistentes.map((o) => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                      </FormField>
                      {turnosFijos.length > 0 && (
                        <FormField
                          label={t.asistentes.ausencias.turno_fijo}
                          name={`turno-${a.id}`}
                          type="select"
                          value={coberturaForm[a.id]?.serie_id || ''}
                          onChange={(e) => setCoberturaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], serie_id: e.target.value } }))}
                        >
                          <option value="">{t.asistentes.ausencias.todos_los_turnos}</option>
                          {turnosFijos.map((s) => (
                            <option key={s.id} value={s.id}>{nombreDelTurno(s)}</option>
                          ))}
                        </FormField>
                      )}
                      <FormField
                        label={t.asistentes.ausencias.sustitucion_motivo}
                        name={`motivo-sustitucion-${a.id}`}
                        type="select"
                        value={coberturaForm[a.id]?.motivo || ''}
                        onChange={(e) => setCoberturaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], motivo: e.target.value } }))}
                        disabled={estadoMotivos !== 'listo'}
                      >
                        <option value="">{t.guardias.nueva_guardia.elegir}</option>
                        {motivosSustitucion.map((m) => (
                          <option key={m.id} value={valorGuardado(m)}>
                            {nombreMotivoSustitucion(m, t)}
                          </option>
                        ))}
                      </FormField>
                      <FormField
                        label={t.asistentes.ausencias.costo_adicional}
                        name={`costo-${a.id}`}
                        type="number"
                        value={coberturaForm[a.id]?.costo_adicional || ''}
                        onChange={(e) => setCoberturaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], costo_adicional: e.target.value } }))}
                      />
                      {motivoElegido(a.id)?.pide_detalle && (
                        <div className="molde-ancho">
                          <FormField
                            label={t.asistentes.ausencias.sustitucion_motivo_detalle}
                            name={`motivo-detalle-${a.id}`}
                            type="textarea"
                            value={coberturaForm[a.id]?.motivo_detalle || ''}
                            onChange={(e) => setCoberturaForm((prev) => ({ ...prev, [a.id]: { ...prev[a.id], motivo_detalle: e.target.value } }))}
                          />
                        </div>
                      )}
                    </div>
                    <div className="molde-acciones">
                      <Button variant="secondary" onClick={() => asignarCobertura(a)} disabled={guardando}>
                        {t.asistentes.ausencias.guardar_cobertura}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
            );
          })}
          </div>
        </EstadoLista>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.asistentes.ausencias.registrar_nueva}</h2>
        </div>
        <div className="molde-formgrid">
          <FormField label={t.asistentes.ausencias.tipo} name="tipo" type="select" value={nueva.tipo} onChange={(e) => setNueva((f) => ({ ...f, tipo: e.target.value }))}>
            {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{t.asistentes.ausencias[`tipo_${tipo}`]}</option>)}
          </FormField>
          <FormField
            label={t.asistentes.ausencias.avisada_en}
            name="avisada_en"
            type="datetime-local"
            value={nueva.avisada_en}
            onChange={(e) => setNueva((f) => ({ ...f, avisada_en: e.target.value }))}
          />
          <FormField label={t.asistentes.ausencias.fecha_inicio} name="fecha_inicio" type="date" value={nueva.fecha_inicio} onChange={(e) => setNueva((f) => ({ ...f, fecha_inicio: e.target.value }))} required />
          <FormField label={t.asistentes.ausencias.fecha_fin} name="fecha_fin" type="date" value={nueva.fecha_fin} onChange={(e) => setNueva((f) => ({ ...f, fecha_fin: e.target.value }))} required />
          <div className="molde-ancho">
            <FormField label={t.comun.nota_interna} name="observaciones" type="textarea" value={nueva.observaciones} onChange={(e) => setNueva((f) => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </div>
        <div className="molde-acciones">
          <Button onClick={registrarAusencia} disabled={guardando || !nueva.fecha_inicio || !nueva.fecha_fin}>
            {guardando ? t.comun.guardando : t.asistentes.ausencias.registrar_nueva}
          </Button>
        </div>
      </section>
    </div>
  );
}
