import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { con } from '../../lib/textos';
import { hoyISO } from '../../lib/horarios';
import { conMotivoDeDomicilioTemporal } from '../../lib/domiciliosTemporales';
import { TONO, claseBadgeTono } from '../../lib/tonos';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { avisarSiQuedoPendiente } from '../../lib/cargasPendientes';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { CamposDeDomicilio } from '../../components/domicilio/CamposDeDomicilio';
import { DOMICILIO_VACIO, palabrasDelDomicilio, partesDesdeFila, partesParaGuardar, renglonDelDomicilio } from '../../lib/partesDeDomicilio';
import { domicilioEscrito } from '../../lib/domicilioEscrito';
import { useCatalogoDeLugares } from '../../hooks/useCatalogoDeLugares';
import { coordenadasDeDomicilio } from '../../lib/coordenadasDeDomicilio';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

// Dónde se atiende al Paciente cuando no está en su domicilio de siempre.
//
// Cuál domicilio rige hoy NO se calcula acá: se le pregunta a la base con
// `domicilio_del_paciente_en`, que es el único lugar donde vive ese criterio y el mismo que
// usan el check-in y la aplicación del Asistente (regla 12 de CLAUDE.md §7). Si se resolviera
// otra vez en el navegador, el día que cambie la regla esta pantalla contestaría distinto que
// el resto del sistema.
//
// Un domicilio temporal no se borra: forma parte de la historia clínica. Lo mal cargado se edita,
// y la base guarda cada versión en `versiones_registro_clinico`. Si el Paciente pasa a otro
// domicilio temporal, se agrega uno nuevo.
export function DomiciliosTemporalesPaciente({ paciente, puedeEditar, onClose }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const catalogoDeLugares = useCatalogoDeLugares();

  const [periodos, setPeriodos] = useState([]);
  const [dondeHoy, setDondeHoy] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const [mostrandoForm, setMostrandoForm] = useState(false);
  // El período que se está editando; nulo cuando el formulario carga uno nuevo.
  const [editando, setEditando] = useState(null);
  const editandoId = editando?.id ?? null;
  const [domicilio, setDomicilio] = useState(DOMICILIO_VACIO);
  const [motivo, setMotivo] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoyISO);
  const [fechaFin, setFechaFin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [errorForm, setErrorForm] = useState(null);

  const [terminandoId, setTerminandoId] = useState(null);
  const [fechaTermino, setFechaTermino] = useState(hoyISO);
  const [filaEnCurso, setFilaEnCurso] = useState(null);
  const [errorFila, setErrorFila] = useState(null);

  // La internación vive acá porque decide dónde se atiende al Paciente: o las guardias se pausan,
  // o continúan en la institución, que pasa a ser su domicilio temporal mientras dure.
  const puedeInternar = ['admin_prestadora', 'coordinador'].includes(usuario?.rol);
  const [hospitalizacionActiva, setHospitalizacionActiva] = useState(null);
  const [mostrandoFormHosp, setMostrandoFormHosp] = useState(false);
  const [institucionHosp, setInstitucionHosp] = useState('');
  const [motivoHosp, setMotivoHosp] = useState('');
  const [fechaInicioHosp, setFechaInicioHosp] = useState(hoyISO);
  const [continuanHosp, setContinuanHosp] = useState(false);
  const [domicilioHosp, setDomicilioHosp] = useState(DOMICILIO_VACIO);
  const [guardandoHosp, setGuardandoHosp] = useState(false);
  const [intentadoHosp, setIntentadoHosp] = useState(false);
  const [cerrandoHosp, setCerrandoHosp] = useState(false);
  const [errorHosp, setErrorHosp] = useState(null);

  // Ningún error de la base llega crudo a la pantalla: primero se lo reconoce (¿un período
  // pisado?, ¿las fechas al revés?) y después se busca la frase en las traducciones.
  const explicar = useCallback(
    (e) => mensajeDeError(conMotivoDeDomicilioTemporal(e), t, 'domicilios_temporales'),
    [t]
  );

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setErrorFila(null);

    const [listaResp, hoyResp, hospResp] = await Promise.all([
      supabase
        .from('domicilios_temporales_paciente')
        .select('*')
        .eq('paciente_id', paciente.id)
        .order('fecha_inicio', { ascending: false }),
      supabase.rpc('domicilio_del_paciente_en', { p_paciente_id: paciente.id, p_fecha: hoyISO() }),
      supabase
        .from('hospitalizaciones_paciente')
        .select('id, institucion, fecha_inicio')
        .eq('paciente_id', paciente.id)
        .is('fecha_fin', null)
        .maybeSingle(),
    ]);

    const falla = listaResp.error || hoyResp.error || hospResp.error;
    if (falla) {
      setError(explicar(falla));
      setEstado('error');
      return;
    }

    setPeriodos(listaResp.data ?? []);
    setDondeHoy(hoyResp.data?.[0] ?? null);
    setHospitalizacionActiva(hospResp.data ?? null);
    setEstado(listaResp.data?.length ? 'listo' : 'vacio');
  }, [paciente.id, explicar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function limpiarForm() {
    setDomicilio(DOMICILIO_VACIO);
    setMotivo('');
    setFechaInicio(hoyISO());
    setFechaFin('');
    setIntentado(false);
    setErrorForm(null);
    setEditando(null);
  }

  function abrirEditar(periodo) {
    setErrorFila(null);
    setTerminandoId(null);
    setDomicilio(partesDesdeFila(periodo));
    setMotivo(periodo.motivo ?? '');
    setFechaInicio(periodo.fecha_inicio ?? '');
    setFechaFin(periodo.fecha_fin ?? '');
    setIntentado(false);
    setErrorForm(null);
    setEditando(periodo);
    setMostrandoForm(true);
  }

  const faltas = {
    calle: !domicilio.calle.trim(),
    lugar_id: !domicilio.lugar_id,
    motivo: !motivo.trim(),
    fecha_inicio: !fechaInicio,
  };
  const errorDe = (campo) => (intentado && faltas[campo] ? t.formularios.falta_un_dato_obligatorio : null);

  async function handleGuardar() {
    setIntentado(true);
    if (Object.values(faltas).some(Boolean)) {
      // Espera a que se pinten los avisos para saltar al primero.
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }

    setGuardando(true);
    setErrorForm(null);

    // Las coordenadas se piden de nuevo sólo si cambió la dirección: preguntar por lo mismo gasta
    // el servicio de un tercero para recibir la misma respuesta.
    const partes = partesParaGuardar(domicilio);
    const mismaDireccion =
      editando &&
      ['calle', 'numero', 'lugar_id'].every((parte) => (editando[parte] ?? null) === partes[parte]);
    const ubicacion = mismaDireccion
      ? { lat: editando.lat, lng: editando.lng }
      : await coordenadasDeDomicilio(partes);

    const datos = {
      domicilio: renglonDelDomicilio(domicilio, catalogoDeLugares.lugares),
      ...partes,
      ...ubicacion,
      motivo: motivo.trim(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || null,
    };

    const tabla = supabase.from('domicilios_temporales_paciente');
    const { error: errorGuardar } = editandoId
      ? await tabla.update(datos).eq('id', editandoId)
      : await tabla.insert({
          // De la misma Prestadora que el Paciente, siempre: la base lo exige con una clave
          // foránea sobre las dos columnas juntas.
          prestadora_id: paciente.prestadora_id,
          paciente_id: paciente.id,
          ...datos,
        });

    if (!errorGuardar) await avisarSiQuedoPendiente(paciente.id, t);
    setGuardando(false);
    if (errorGuardar) {
      setErrorForm(explicar(errorGuardar));
      return;
    }

    setMostrandoForm(false);
    limpiarForm();
    recargar();
  }

  function abrirTerminar(periodo) {
    setErrorFila(null);
    setTerminandoId(periodo.id);
    // Un período no puede terminar antes de empezar: si todavía no arrancó, el primer día
    // posible es el de inicio.
    setFechaTermino(hoyISO() > periodo.fecha_inicio ? hoyISO() : periodo.fecha_inicio);
  }

  async function terminarPeriodo(periodo) {
    setFilaEnCurso(periodo.id);
    setErrorFila(null);

    const { error: errorUpdate } = await supabase
      .from('domicilios_temporales_paciente')
      .update({ fecha_fin: fechaTermino })
      .eq('id', periodo.id);

    if (!errorUpdate) await avisarSiQuedoPendiente(paciente.id, t);
    setFilaEnCurso(null);
    if (errorUpdate) {
      setErrorFila(explicar(errorUpdate));
      return;
    }

    setTerminandoId(null);
    recargar();
  }

  function limpiarFormHosp() {
    setInstitucionHosp('');
    setMotivoHosp('');
    setFechaInicioHosp(hoyISO());
    setContinuanHosp(false);
    setDomicilioHosp(DOMICILIO_VACIO);
    setIntentadoHosp(false);
    setErrorHosp(null);
  }

  const faltasHosp = {
    institucion: !institucionHosp.trim(),
    fecha_inicio: !fechaInicioHosp,
    calle: continuanHosp && !domicilioHosp.calle.trim(),
    lugar_id: continuanHosp && !domicilioHosp.lugar_id,
  };
  const errorHospDe = (campo) =>
    intentadoHosp && faltasHosp[campo] ? t.formularios.falta_un_dato_obligatorio : null;

  // Una sola operación en la base: la internación, y con ella o la pausa de las guardias o el
  // domicilio temporal en la institución. Se guarda todo junto o no se guarda nada.
  async function handleRegistrarHospitalizacion() {
    setIntentadoHosp(true);
    if (Object.values(faltasHosp).some(Boolean)) {
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }

    setGuardandoHosp(true);
    setErrorHosp(null);

    const partes = continuanHosp ? partesParaGuardar(domicilioHosp) : null;
    const ubicacion = partes ? await coordenadasDeDomicilio(partes) : null;

    const { error: errorRegistro } = await supabase.rpc('registrar_hospitalizacion', {
      p_paciente: paciente.id,
      p_institucion: institucionHosp.trim(),
      p_motivo: motivoHosp.trim() || null,
      p_fecha_inicio: fechaInicioHosp,
      // El motivo del domicilio temporal es el nombre de la institución: dice dónde está.
      p_domicilio: partes
        ? {
            domicilio: renglonDelDomicilio(domicilioHosp, catalogoDeLugares.lugares),
            ...partes,
            ...ubicacion,
            motivo: institucionHosp.trim(),
          }
        : null,
    });

    setGuardandoHosp(false);
    if (errorRegistro) {
      setErrorHosp(explicar(errorRegistro));
      return;
    }

    setMostrandoFormHosp(false);
    limpiarFormHosp();
    recargar();
  }

  async function handleCerrarHospitalizacion() {
    // Sólo se pregunta cuando hay guardias en pausa, que vuelven a correr al cerrar.
    const continuaban = periodos.some((p) => p.hospitalizacion_id === hospitalizacionActiva.id);
    if (!continuaban && !(await confirmarDestructivo(t.domicilios_temporales.confirmar_cierre_hospitalizacion))) return;

    setCerrandoHosp(true);
    setErrorHosp(null);

    const { error: errorCierre } = await supabase.rpc('cerrar_hospitalizacion', {
      p_hospitalizacion: hospitalizacionActiva.id,
      p_fecha: hoyISO(),
    });

    setCerrandoHosp(false);
    if (errorCierre) {
      setErrorHosp(explicar(errorCierre));
      return;
    }

    recargar();
  }

  const hayDatos = estado === 'listo' || estado === 'vacio';

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.domicilios_temporales.titulo} — {paciente.nombre}</h2>
        {estado === 'cargando' && <p className="estado-cargando">{t.comun.cargando}</p>}
        {estado === 'error' && <Alert variant="error">{error || t.comun.error_generico}</Alert>}

        {hayDatos && (
          <div className="molde-pila">
            {dondeHoy && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{t.domicilios_temporales.donde_hoy}</h2>
                  <span className="panel-mini">
                    {dondeHoy.es_temporal ? t.domicilios_temporales.hoy_temporal : t.domicilios_temporales.hoy_habitual}
                  </span>
                </div>
                <div className="panel-grilla panel-columnas-3">
                  <div className="hoja-dato"><div className="panel-mini">{t.domicilios_temporales.col_domicilio}</div><b>{domicilioEscrito(dondeHoy, palabrasDelDomicilio(t)) || '—'}</b></div>
                  <div className="hoja-dato"><div className="panel-mini">{t.domicilios_temporales.col_coordenadas}</div><b>{dondeHoy.lat ?? '—'}, {dondeHoy.lng ?? '—'}</b></div>
                  {dondeHoy.es_temporal && (
                    <>
                      <div className="hoja-dato"><div className="panel-mini">{t.domicilios_temporales.col_motivo}</div><b>{dondeHoy.motivo || '—'}</b></div>
                      <div className="hoja-dato"><div className="panel-mini">{t.domicilios_temporales.col_desde}</div><b>{dondeHoy.desde || '—'}</b></div>
                      <div className="hoja-dato"><div className="panel-mini">{t.domicilios_temporales.col_hasta}</div><b>{dondeHoy.hasta || t.domicilios_temporales.sin_fecha_fin}</b></div>
                    </>
                  )}
                </div>
              </section>
            )}

            {puedeInternar && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{t.domicilios_temporales.hospitalizacion_titulo}</h2>
                  {hospitalizacionActiva ? (
                    <Button variant="secondary" onClick={handleCerrarHospitalizacion} disabled={cerrandoHosp}>
                      {cerrandoHosp ? t.domicilios_temporales.hospitalizacion_cerrando : t.domicilios_temporales.hospitalizacion_cerrar}
                    </Button>
                  ) : (
                    !mostrandoFormHosp && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          limpiarFormHosp();
                          setMostrandoFormHosp(true);
                        }}
                      >
                        {t.domicilios_temporales.hospitalizacion_registrar}
                      </Button>
                    )
                  )}
                </div>
                {errorHosp && <Alert variant="error">{errorHosp}</Alert>}

                {hospitalizacionActiva ? (
                  <div className="panel-fila-alerta">
                    <div className="panel-mini">
                      {con(t.domicilios_temporales.hospitalizacion_activa_desde, {
                        fecha: hospitalizacionActiva.fecha_inicio,
                        institucion: hospitalizacionActiva.institucion,
                      })}
                    </div>
                  </div>
                ) : (
                  mostrandoFormHosp && (
                    <>
                      <div className="molde-formgrid">
                        <FormField
                          label={t.domicilios_temporales.hospitalizacion_institucion}
                          name="institucion_hosp"
                          value={institucionHosp}
                          onChange={(e) => setInstitucionHosp(e.target.value)}
                          required
                          error={errorHospDe('institucion')}
                        />
                        <FormField
                          label={t.domicilios_temporales.hospitalizacion_fecha_inicio}
                          name="fecha_inicio_hosp"
                          type="date"
                          value={fechaInicioHosp}
                          onChange={(e) => setFechaInicioHosp(e.target.value)}
                          required
                          error={errorHospDe('fecha_inicio')}
                        />
                        <div className="molde-ancho">
                          <FormField
                            label={t.domicilios_temporales.hospitalizacion_motivo}
                            name="motivo_hosp"
                            value={motivoHosp}
                            onChange={(e) => setMotivoHosp(e.target.value)}
                          />
                        </div>
                        <div className="molde-ancho">
                          <FormField
                            label={t.domicilios_temporales.hospitalizacion_continuan}
                            name="continuan_hosp"
                            type="checkbox"
                            checked={continuanHosp}
                            onChange={(e) => setContinuanHosp(e.target.checked)}
                          />
                        </div>
                        {continuanHosp && (
                          <>
                            <div className="molde-ancho">
                              <CamposDeDomicilio
                                valor={domicilioHosp}
                                alCambiar={setDomicilioHosp}
                                catalogo={catalogoDeLugares}
                                prefijo="hosp_"
                                deshabilitado={guardandoHosp}
                                requerido
                                errores={{ calle: errorHospDe('calle'), lugar_id: errorHospDe('lugar_id') }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="molde-acciones">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setMostrandoFormHosp(false);
                            limpiarFormHosp();
                          }}
                          disabled={guardandoHosp}
                        >
                          {t.comun.cancelar}
                        </Button>
                        <Button onClick={handleRegistrarHospitalizacion} disabled={guardandoHosp}>
                          {guardandoHosp ? t.domicilios_temporales.hospitalizacion_registrando : t.domicilios_temporales.hospitalizacion_registrar}
                        </Button>
                      </div>
                    </>
                  )
                )}
              </section>
            )}

            <section className="panel-tarjeta hoja-desplazable">
              <div className="panel-tarjeta-titulo">
                <h2>{t.domicilios_temporales.titulo}</h2>
                {puedeEditar && !mostrandoForm && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      limpiarForm();
                      setMostrandoForm(true);
                    }}
                  >
                    {t.domicilios_temporales.agregar}
                  </Button>
                )}
              </div>

              {errorFila && <Alert variant="error">{errorFila}</Alert>}

              {estado === 'vacio' && <p className="molde-vacio">{t.domicilios_temporales.sin_domicilios}</p>}

              {estado === 'listo' && (
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{t.domicilios_temporales.col_desde}</th>
                      <th>{t.domicilios_temporales.col_hasta}</th>
                      <th>{t.domicilios_temporales.col_domicilio}</th>
                      <th>{t.domicilios_temporales.col_motivo}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p) => (
                      <Fragment key={p.id}>
                        <tr>
                          <td>{p.fecha_inicio}</td>
                          <td>{p.fecha_fin || t.domicilios_temporales.sin_fecha_fin}</td>
                          <td>
                            <b>{p.domicilio}</b>
                            {p.id === dondeHoy?.domicilio_temporal_id && (
                              <>
                                {' '}
                                <span className={claseBadgeTono(TONO.EXITO)}>{t.domicilios_temporales.rige_hoy}</span>
                              </>
                            )}
                          </td>
                          <td>{p.motivo}</td>
                          <td>
                            {puedeEditar && (
                              <>
                                <Button
                                  variant="secondary"
                                  onClick={() => abrirEditar(p)}
                                  disabled={filaEnCurso === p.id || guardando || editandoId === p.id}
                                >
                                  {t.comun.editar}
                                </Button>{' '}
                                <Button
                                  variant="secondary"
                                  onClick={() => abrirTerminar(p)}
                                  disabled={filaEnCurso === p.id || terminandoId === p.id}
                                >
                                  {t.domicilios_temporales.terminar}
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                        {terminandoId === p.id && (
                          <tr>
                            <td colSpan={5}>
                              <div className="molde-formgrid">
                                <FormField
                                  label={t.domicilios_temporales.terminar_fecha}
                                  name={`fecha_termino_${p.id}`}
                                  type="date"
                                  value={fechaTermino}
                                  min={p.fecha_inicio}
                                  onChange={(e) => setFechaTermino(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="molde-acciones">
                                <Button
                                  variant="secondary"
                                  onClick={() => setTerminandoId(null)}
                                  disabled={filaEnCurso === p.id}
                                >
                                  {t.comun.cancelar}
                                </Button>
                                <Button onClick={() => terminarPeriodo(p)} disabled={filaEnCurso === p.id || !fechaTermino}>
                                  {filaEnCurso === p.id ? t.comun.guardando : t.comun.guardar}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {puedeEditar && mostrandoForm && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{editandoId ? t.domicilios_temporales.editar_titulo : t.domicilios_temporales.nuevo_titulo}</h2>
                </div>
                {errorForm && <Alert variant="error">{errorForm}</Alert>}
                <div className="molde-formgrid">
                  <div className="molde-ancho">
                    <CamposDeDomicilio
                      valor={domicilio}
                      alCambiar={setDomicilio}
                      catalogo={catalogoDeLugares}
                      prefijo="temporal_"
                      deshabilitado={guardando}
                      requerido
                      errores={{ calle: errorDe('calle'), lugar_id: errorDe('lugar_id') }}
                    />
                  </div>
                  <div className="molde-ancho">
                    <FormField
                      label={t.domicilios_temporales.col_motivo}
                      name="motivo_temporal"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      required
                      error={errorDe('motivo')}
                    />
                  </div>
                  <FormField
                    label={t.domicilios_temporales.col_desde}
                    name="fecha_inicio_temporal"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    required
                    error={errorDe('fecha_inicio')}
                  />
                  <FormField
                    label={t.domicilios_temporales.col_hasta}
                    name="fecha_fin_temporal"
                    type="date"
                    value={fechaFin}
                    min={fechaInicio}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
                <div className="molde-acciones">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMostrandoForm(false);
                      limpiarForm();
                    }}
                    disabled={guardando}
                  >
                    {t.comun.cancelar}
                  </Button>
                  <Button onClick={handleGuardar} disabled={guardando}>
                    {guardando ? t.comun.guardando : t.comun.guardar}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>
    </div>
  );
}
