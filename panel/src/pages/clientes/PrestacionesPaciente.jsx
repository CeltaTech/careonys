import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { TONO, claseBadge, claseBadgeTono } from '../../lib/tonos';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { hoyISO } from '../../lib/horarios';
import { situacion } from '../../lib/vigenciaPrestacion';
import { servicioSirveParaCliente } from '../../lib/serviciosDelPaciente';
import { FORMAS_DE_PRECIO_POSIBLES, condicionDe } from '../../lib/condicionesDelCliente';
import {
  SENTIDOS_DEL_AJUSTE_POSIBLES,
  TIPOS_DE_AJUSTE_POSIBLES,
  calcularPrecioFinal,
  columnasDelPrecio,
  faltantesDelPrecio,
  cambioDePrecioValido,
  idsReemplazados,
} from '../../lib/precioDeLaPrestacion';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

// Las situaciones en las que una Prestación todavía puede cambiar de precio desde una fecha.
const SE_PUEDE_CAMBIAR_EL_PRECIO = ['corriendo', 'por_empezar'];

// Un importe escrito que no sirve: negativo o que no es número. Vacío es «falta», no «mal».
const importeMalEscrito = (valor) => valor !== '' && !(Number(valor) >= 0);

// El orden de los casilleros en el formulario, para saltar al primero que falte.
const ORDEN_DE_LOS_CASILLEROS = [
  'servicio_id',
  'forma_de_precio',
  'precio_lista_id',
  'tipo_servicio',
  'precio_escrito',
  'tipo_de_ajuste',
  'valor_del_ajuste',
  'vigente_desde',
  'vigente_hasta',
];

export function PrestacionesPaciente({ paciente, onClose }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const [listaPrecios, setListaPrecios] = useState([]);
  const [prestaciones, setPrestaciones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  // Todos los Servicios vigentes que alcanza esta sesión. Cuáles de ellos le sirven a este
  // Paciente lo decide `servicioSirveParaCliente`, que es la regla de la base y no una escrita
  // acá. La lista entera se guarda igual porque también sirve para nombrar los ya cerrados.
  const [serviciosDelCliente, setServiciosDelCliente] = useState([]);
  const [cierres, setCierres] = useState([]);

  // La forma de precio que ofrece de entrada el formulario: la que eligió la Prestadora, o la de
  // fábrica. Quien carga puede usar la otra en cada Prestación.
  const [reglaDeLaPrestadora, setReglaDeLaPrestadora] = useState(null);
  const formaDeEntrada = condicionDe('forma_de_precio', reglaDeLaPrestadora, null);

  const [mostrandoForm, setMostrandoForm] = useState(false);
  // La Prestación cuyo precio se cambia, o null si se carga una nueva.
  const [reemplazaA, setReemplazaA] = useState(null);
  const [servicioId, setServicioId] = useState('');
  const [forma, setForma] = useState('');
  const [precioListaId, setPrecioListaId] = useState('');
  const [sentidoDelAjuste, setSentidoDelAjuste] = useState('');
  const [tipoServicioEscrito, setTipoServicioEscrito] = useState('');
  const [precioEscrito, setPrecioEscrito] = useState('');
  const [dias, setDias] = useState('');
  const [horario, setHorario] = useState('');
  const [cantidadGuardias, setCantidadGuardias] = useState('');
  const [feriados, setFeriados] = useState(false);
  const [viajes, setViajes] = useState(false);
  const [hospitalizacion, setHospitalizacion] = useState(false);
  const [tipoDescuento, setTipoDescuento] = useState('');
  const [valorDescuento, setValorDescuento] = useState('');
  const [nota, setNota] = useState('');
  // Lo pactado casi siempre arranca el día en que se carga, así que la fecha viene puesta; y
  // casi nunca tiene fecha de fin acordada de antemano, así que ésa viene vacía y quiere decir
  // que sigue hasta que se la dé de baja.
  const [vigenteDesde, setVigenteDesde] = useState(() => hoyISO());
  const [vigenteHasta, setVigenteHasta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);
  // Los avisos al pie de cada casillero aparecen recién al apretar Guardar.
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const [marcandoRevisado, setMarcandoRevisado] = useState(null);
  const [errorRevision, setErrorRevision] = useState(null);

  const [asistentesAviso, setAsistentesAviso] = useState([]);
  const [marcandoAvisoId, setMarcandoAvisoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const [listaResp, prestacionesResp, cierresResp, serviciosResp, reglaResp] = await Promise.all([
      // El precio que rige hoy, uno por tipo: la promoción vigente si la hay, y si no el de siempre.
      supabase.rpc('precios_de_lista_que_rigen', { p_fecha: hoyISO() }).order('tipo_servicio'),
      supabase.from('prestaciones').select('*').eq('paciente_id', paciente.id).order('created_at', { ascending: false }),
      supabase.from('cierres_servicio_paciente').select('id, servicio_id').eq('paciente_id', paciente.id),
      // Los Servicios vigentes que alcanza esta sesión. La protección por fila ya los acota a la
      // Prestadora; cuáles de ellos sirven para este Paciente lo decide abajo la misma regla que
      // aplica la base, y no una consulta escrita a medida acá.
      supabase
        .from('servicios')
        .select('id, etiqueta, cliente_id')
        .eq('estado', 'vigente')
        .order('etiqueta'),
      // Los valores de fábrica de la Prestadora. La protección por fila sólo se los abre a la
      // administración: para la coordinación llega vacío y rige el de fábrica del producto. Por
      // eso un error acá no frena la pantalla: sólo cambia qué forma viene elegida de entrada.
      supabase
        .from('configuracion_facturacion_clientes')
        .select('regla')
        .eq('prestadora_id', prestadoraId)
        .maybeSingle(),
    ]);

    const falla =
      listaResp.error || prestacionesResp.error || cierresResp.error || serviciosResp.error;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    setListaPrecios(listaResp.data ?? []);
    setPrestaciones(prestacionesResp.data ?? []);
    setCierres(cierresResp.data ?? []);
    setServiciosDelCliente(serviciosResp.data ?? []);
    setReglaDeLaPrestadora(reglaResp.error ? null : reglaResp.data?.regla ?? null);

    const idsCierre = (cierresResp.data ?? []).map((c) => c.id);
    if (idsCierre.length > 0) {
      const { data: asistentesAvisoData, error: errorAvisos } = await supabase
        .from('cierre_servicio_asistentes')
        .select('*, asistentes(nombre)')
        .in('cierre_id', idsCierre);
      if (!errorAvisos) setAsistentesAviso(asistentesAvisoData ?? []);
    } else {
      setAsistentesAviso([]);
    }

    setEstado('listo');
  }, [paciente.id, prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const precioSeleccionado = useMemo(
    () => listaPrecios.find((p) => String(p.id) === String(precioListaId)),
    [listaPrecios, precioListaId]
  );

  // Lo cargado, en la forma que piden las funciones del precio.
  const datosDelPrecio = {
    forma,
    renglon: precioSeleccionado,
    sentido: sentidoDelAjuste,
    tipo: tipoDescuento,
    valor: valorDescuento,
    tipoServicio: tipoServicioEscrito,
    precioEscrito,
  };

  const precioFinalCalculado = calcularPrecioFinal({
    forma,
    precioLista: precioSeleccionado?.precio,
    sentido: sentidoDelAjuste,
    tipo: tipoDescuento,
    valor: valorDescuento,
    precioEscrito,
  });

  const reemplazadas = useMemo(() => idsReemplazados(prestaciones), [prestaciones]);

  const sePuedeCambiarElPrecio = (p) =>
    SE_PUEDE_CAMBIAR_EL_PRECIO.includes(situacion(p)) && !reemplazadas.has(p.id) && Boolean(p.servicio_id);

  // El aviso de cada casillero, por nombre. Se calcula siempre y se muestra sólo después de
  // apretar Guardar: así desaparece en cuanto el dato se completa.
  const avisos = {};
  if (!servicioId) avisos.servicio_id = t.formularios.falta_un_dato_obligatorio;
  for (const campo of faltantesDelPrecio(datosDelPrecio)) {
    const escrito = campo === 'precio_escrito' ? precioEscrito : campo === 'valor_del_ajuste' ? valorDescuento : '';
    avisos[campo] = importeMalEscrito(escrito) ? t.prestaciones.precio_invalido : t.formularios.falta_un_dato_obligatorio;
  }
  if (!vigenteDesde) avisos.vigente_desde = t.formularios.falta_un_dato_obligatorio;
  else if (reemplazaA && !cambioDePrecioValido(reemplazaA, vigenteDesde, reemplazadas)) {
    avisos.vigente_desde = t.prestaciones.cambio_fuera_de_vigencia;
  }
  // La base rechaza un período dado vuelta, pero el mensaje que devolvería habla de una
  // restricción y de una columna. Acá se avisa antes y con palabras de quien está cargando.
  if (vigenteHasta && vigenteDesde && vigenteHasta < vigenteDesde) avisos.vigente_hasta = t.prestaciones.vigencia_al_reves;

  const avisoDe = (campo) => (intentoGuardar ? avisos[campo] : undefined);

  // Un mismo Cliente puede tener varios Servicios abiertos a la vez. Se ofrecen los que la base
  // acepta para este Paciente, menos los que ya se cerraron para él: ésos no se ofrecen ni para
  // colgarles una Prestación nueva ni para volver a cerrarlos.
  const serviciosAbiertos = useMemo(() => {
    const cerrados = new Set(cierres.map((c) => c.servicio_id).filter(Boolean));
    return serviciosDelCliente.filter(
      (s) => !cerrados.has(s.id) && servicioSirveParaCliente(s, paciente.cliente_id),
    );
  }, [serviciosDelCliente, cierres, paciente.cliente_id]);

  // Cuando hay uno solo no se hace elegir; cuando hay varios, la elección es de quien carga.
  useEffect(() => {
    if (reemplazaA) return;
    const unico = serviciosAbiertos.length === 1 ? serviciosAbiertos[0].id : '';
    setServicioId((actual) => (serviciosAbiertos.some((s) => s.id === actual) ? actual : unico));
  }, [serviciosAbiertos, reemplazaA]);

  function abrirNueva() {
    limpiarForm();
    setForma(formaDeEntrada);
    setMostrandoForm(true);
  }

  // Cambiar el precio desde una fecha: el formulario viene con lo pactado en la anterior, y lo
  // que se guarda es otra Prestación que la reemplaza. La anterior no se pisa: la base la cierra
  // el día antes del arranque de la nueva.
  function abrirCambioDePrecio(anterior) {
    limpiarForm();
    const c = anterior.configuracion ?? {};
    const formaAnterior = anterior.forma_de_precio || (anterior.precio_lista_id ? 'lista' : 'directo');
    setReemplazaA(anterior);
    setServicioId(anterior.servicio_id);
    setForma(formaAnterior);
    if (formaAnterior === 'lista') {
      // El renglón de antes si sigue rigiendo, o la promoción que hoy rige en su lugar.
      const previo = String(anterior.precio_lista_id);
      const queRige = listaPrecios.find(
        (r) => String(r.id) === previo || String(r.promocion_de) === previo
      );
      setPrecioListaId(queRige ? String(queRige.id) : '');
      setSentidoDelAjuste(anterior.sentido_del_ajuste || '');
      setTipoDescuento(anterior.tipo_descuento || '');
      setValorDescuento(anterior.valor_descuento ?? '');
    } else {
      setTipoServicioEscrito(anterior.tipo_servicio || '');
    }
    setDias(c.dias ?? '');
    setHorario(c.horario ?? '');
    setCantidadGuardias(c.cantidad_guardias ?? '');
    setFeriados(Boolean(c.feriados));
    setViajes(Boolean(c.viajes));
    setHospitalizacion(Boolean(c.hospitalizacion));
    setNota(anterior.nota ?? '');
    const hoy = hoyISO();
    setVigenteDesde(hoy > anterior.vigente_desde ? hoy : '');
    setVigenteHasta(anterior.vigente_hasta ?? '');
    setMostrandoForm(true);
  }

  function cerrarForm() {
    setMostrandoForm(false);
    limpiarForm();
  }

  function limpiarForm() {
    setReemplazaA(null);
    setForma('');
    setPrecioListaId('');
    setSentidoDelAjuste('');
    setTipoServicioEscrito('');
    setPrecioEscrito('');
    setDias('');
    setHorario('');
    setCantidadGuardias('');
    setFeriados(false);
    setViajes(false);
    setHospitalizacion(false);
    setTipoDescuento('');
    setValorDescuento('');
    setNota('');
    setVigenteDesde(hoyISO());
    setVigenteHasta('');
    setErrorForm(null);
    setIntentoGuardar(false);
  }

  async function handleGuardarPrestacion() {
    setIntentoGuardar(true);
    const primero = ORDEN_DE_LOS_CASILLEROS.find((campo) => avisos[campo]);
    if (primero) {
      document.getElementById(`field-${primero}`)?.focus();
      return;
    }

    const columnas = columnasDelPrecio(datosDelPrecio);
    if (!columnas) return;

    setGuardando(true);
    setErrorForm(null);

    const { error: errorInsert } = await supabase.from('prestaciones').insert({
      prestadora_id: prestadoraId,
      // De qué Servicio es lo que se pacta, y a quién se le presta. Las dos cosas: el precio y
      // el calendario son del Servicio, y el Paciente sigue siendo quien lo recibe.
      servicio_id: servicioId,
      paciente_id: paciente.id,
      ...columnas,
      configuracion: {
        dias,
        horario,
        cantidad_guardias: cantidadGuardias,
        feriados,
        viajes,
        hospitalizacion,
      },
      nota,
      estado: 'vigente',
      vigente_desde: vigenteDesde,
      vigente_hasta: vigenteHasta || null,
      // Si es un cambio de precio, a cuál reemplaza. La base cierra esa el día antes, en la misma
      // operación: si no se puede, no se guarda ninguna de las dos.
      prestacion_anterior_id: reemplazaA?.id ?? null,
    });

    if (errorInsert) {
      setErrorForm(mensajeDeError(errorInsert, t));
      setGuardando(false);
      return;
    }

    setGuardando(false);
    cerrarForm();
    recargar();
  }

  async function handleMarcarRevisado(prestacionId) {
    setMarcandoRevisado(prestacionId);
    setErrorRevision(null);
    const { error: errorUpdate } = await supabase.from('prestaciones').update({ requiere_revision: false }).eq('id', prestacionId);
    setMarcandoRevisado(null);
    if (errorUpdate) {
      setErrorRevision(t.comun.error_generico);
      return;
    }
    recargar();
  }

  async function handleMarcarAvisadoVerbalmente(id) {
    setMarcandoAvisoId(id);
    await supabase
      .from('cierre_servicio_asistentes')
      .update({ avisado_verbalmente_at: new Date().toISOString(), avisado_verbalmente_por: usuario.id })
      .eq('id', id);
    setMarcandoAvisoId(null);
    recargar();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.prestaciones.titulo} — {paciente.nombre}</h2>

        {estado === 'cargando' && <p className="estado-cargando">{t.comun.cargando}</p>}
        {estado === 'error' && <Alert variant="error">{error || t.comun.error_generico}</Alert>}

        {estado === 'listo' && (
          <div className="molde-pila">
            <section className="panel-tarjeta tarjeta-desplazable">
              <div className="panel-tarjeta-titulo">
                <h2>{t.prestaciones.vigentes_titulo}</h2>
                <div className="molde-acciones">
                  {!mostrandoForm && (
                    <Button variant="secondary" onClick={abrirNueva}>{t.prestaciones.nueva_prestacion}</Button>
                  )}
                </div>
              </div>
              {errorRevision && <Alert variant="error">{errorRevision}</Alert>}
              {prestaciones.length === 0 ? (
                <p className="molde-vacio">{t.prestaciones.sin_prestaciones}</p>
              ) : (
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{t.prestaciones.col_tipo_servicio}</th>
                      <th>{t.prestaciones.col_precio_final}</th>
                      <th>{t.prestaciones.col_vigencia}</th>
                      <th>{t.prestaciones.col_situacion}</th>
                      <th>{t.prestaciones.col_revision}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestaciones.map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.tipo_servicio}</b></td>
                        <td>{p.precio_final}</td>
                        <td>
                          {p.vigente_desde} →{' '}
                          {p.vigente_hasta || <span className="panel-dato-vacio">{t.prestaciones.vigencia_sin_fin}</span>}
                        </td>
                        <td>
                          <span className={claseBadge(situacion(p))}>
                            {t.prestaciones[`situacion_${situacion(p)}`]}
                          </span>
                        </td>
                        <td>
                          {p.requiere_revision ? (
                            <span className={claseBadgeTono(TONO.ATENCION)}>{t.prestaciones.a_revisar}</span>
                          ) : (
                            <span className={claseBadgeTono(TONO.EXITO)}>{t.prestaciones.al_dia}</span>
                          )}
                        </td>
                        <td>
                          <div className="molde-acciones">
                            {p.requiere_revision && (
                              <Button variant="secondary" onClick={() => handleMarcarRevisado(p.id)} disabled={marcandoRevisado === p.id}>
                                {t.prestaciones.marcar_revisado}
                              </Button>
                            )}
                            {!mostrandoForm && sePuedeCambiarElPrecio(p) && (
                              <Button variant="secondary" onClick={() => abrirCambioDePrecio(p)}>
                                {t.prestaciones.cambiar_precio}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {mostrandoForm && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{reemplazaA ? t.prestaciones.cambio_de_precio_titulo : t.prestaciones.nueva_prestacion}</h2>
                </div>
                {errorForm && <Alert variant="error">{errorForm}</Alert>}
                {!reemplazaA && serviciosAbiertos.length === 0 && <Alert variant="info">{t.prestaciones.sin_servicio_abierto}</Alert>}

                <div className="molde-formgrid">
                  <FormField
                    label={t.prestaciones.servicio}
                    name="servicio_id"
                    type="select"
                    value={servicioId}
                    onChange={(e) => setServicioId(e.target.value)}
                    disabled={Boolean(reemplazaA)}
                    error={avisoDe('servicio_id')}
                    required
                  >
                    <option value="">—</option>
                    {(reemplazaA
                      ? serviciosDelCliente.filter((s) => s.id === reemplazaA.servicio_id)
                      : serviciosAbiertos
                    ).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.etiqueta}
                      </option>
                    ))}
                  </FormField>

                  <FormField
                    label={t.prestaciones.forma_de_precio}
                    name="forma_de_precio"
                    type="select"
                    value={forma}
                    onChange={(e) => setForma(e.target.value)}
                    error={avisoDe('forma_de_precio')}
                    required
                  >
                    {FORMAS_DE_PRECIO_POSIBLES.map((f) => (
                      <option key={f} value={f}>
                        {t.prestaciones[`forma_de_precio_${f}`]}
                      </option>
                    ))}
                  </FormField>

                  {forma === 'lista' && (
                    <>
                      <FormField
                        label={t.prestaciones.col_tipo_servicio}
                        name="precio_lista_id"
                        type="select"
                        value={precioListaId}
                        onChange={(e) => setPrecioListaId(e.target.value)}
                        error={avisoDe('precio_lista_id')}
                        required
                      >
                        <option value="">—</option>
                        {listaPrecios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.tipo_servicio} — {p.modalidad} ({p.precio})
                          </option>
                        ))}
                      </FormField>

                      <FormField
                        label={t.prestaciones.ajuste}
                        name="sentido_del_ajuste"
                        type="select"
                        value={sentidoDelAjuste}
                        onChange={(e) => setSentidoDelAjuste(e.target.value)}
                      >
                        <option value="">{t.prestaciones.sin_ajuste}</option>
                        {SENTIDOS_DEL_AJUSTE_POSIBLES.map((sentido) => (
                          <option key={sentido} value={sentido}>
                            {t.prestaciones[`ajuste_${sentido}`]}
                          </option>
                        ))}
                      </FormField>

                      {sentidoDelAjuste && (
                        <>
                          <FormField
                            label={t.prestaciones.tipo_de_ajuste}
                            name="tipo_de_ajuste"
                            type="select"
                            value={tipoDescuento}
                            onChange={(e) => setTipoDescuento(e.target.value)}
                            error={avisoDe('tipo_de_ajuste')}
                            required
                          >
                            <option value="">—</option>
                            {TIPOS_DE_AJUSTE_POSIBLES.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {t.prestaciones[`descuento_${tipo}`]}
                              </option>
                            ))}
                          </FormField>
                          <FormField
                            label={t.prestaciones.valor_del_ajuste}
                            name="valor_del_ajuste"
                            type="number"
                            min="0"
                            step="0.01"
                            value={valorDescuento}
                            onChange={(e) => setValorDescuento(e.target.value)}
                            error={avisoDe('valor_del_ajuste')}
                            required
                          />
                        </>
                      )}
                    </>
                  )}

                  {forma === 'directo' && (
                    <>
                      <FormField
                        label={t.prestaciones.col_tipo_servicio}
                        name="tipo_servicio"
                        value={tipoServicioEscrito}
                        onChange={(e) => setTipoServicioEscrito(e.target.value)}
                        error={avisoDe('tipo_servicio')}
                        required
                      />
                      <FormField
                        label={t.prestaciones.precio_escrito}
                        name="precio_escrito"
                        type="number"
                        min="0"
                        step="0.01"
                        value={precioEscrito}
                        onChange={(e) => setPrecioEscrito(e.target.value)}
                        error={avisoDe('precio_escrito')}
                        required
                      />
                    </>
                  )}

                  <FormField label={t.prestaciones.dias} name="dias" value={dias} onChange={(e) => setDias(e.target.value)} />
                  <FormField label={t.prestaciones.horario} name="horario" value={horario} onChange={(e) => setHorario(e.target.value)} />
                  <FormField
                    label={t.prestaciones.cantidad_guardias}
                    name="cantidad_guardias"
                    type="number"
                    value={cantidadGuardias}
                    onChange={(e) => setCantidadGuardias(e.target.value)}
                  />
                  <div className="molde-ancho">
                    <FormField label={t.prestaciones.feriados} name="feriados" type="checkbox" checked={feriados} onChange={(e) => setFeriados(e.target.checked)} />
                    <FormField label={t.prestaciones.viajes} name="viajes" type="checkbox" checked={viajes} onChange={(e) => setViajes(e.target.checked)} />
                    <FormField label={t.prestaciones.hospitalizacion} name="hospitalizacion" type="checkbox" checked={hospitalizacion} onChange={(e) => setHospitalizacion(e.target.checked)} />
                  </div>

                  <FormField
                    label={t.prestaciones.vigente_desde}
                    name="vigente_desde"
                    type="date"
                    value={vigenteDesde}
                    onChange={(e) => setVigenteDesde(e.target.value)}
                    error={avisoDe('vigente_desde')}
                    required
                  />
                  <FormField
                    label={t.prestaciones.vigente_hasta}
                    name="vigente_hasta"
                    type="date"
                    value={vigenteHasta}
                    onChange={(e) => setVigenteHasta(e.target.value)}
                    error={avisoDe('vigente_hasta')}
                  />

                  <div className="molde-ancho">
                    <FormField label={t.comun.nota_interna} name="nota" type="textarea" value={nota} onChange={(e) => setNota(e.target.value)} />
                  </div>

                  {precioFinalCalculado !== null && (
                    <div className="tarjeta-dato molde-ancho">
                      <div className="panel-mini">{t.prestaciones.precio_final_calculado}</div>
                      <b>{precioFinalCalculado}</b>
                    </div>
                  )}
                </div>

                <div className="molde-acciones">
                  <Button variant="secondary" onClick={cerrarForm} disabled={guardando}>
                    {t.comun.cancelar}
                  </Button>
                  <Button onClick={handleGuardarPrestacion} disabled={guardando}>
                    {guardando ? t.comun.guardando : t.comun.guardar}
                  </Button>
                </div>
              </section>
            )}

            {['admin_prestadora', 'coordinador'].includes(usuario.rol) && cierres.length > 0 && asistentesAviso.length > 0 && (
              <section className="panel-tarjeta tarjeta-desplazable">
                <div className="panel-tarjeta-titulo">
                  <h2>{t.prestaciones.aviso_asistente_titulo}</h2>
                </div>
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{t.prestaciones.aviso_asistente_col_asistente}</th>
                      <th>{t.prestaciones.aviso_asistente_col_estado}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {asistentesAviso.map((fila) => (
                      <tr key={fila.id}>
                        <td><b>{fila.asistentes?.nombre || '—'}</b></td>
                        <td>
                          {fila.avisado_verbalmente_at ? (
                            <span className={claseBadgeTono(TONO.EXITO)}>{t.prestaciones.aviso_asistente_avisado_verbalmente}</span>
                          ) : fila.aviso_automatico_enviado_at ? (
                            <span className={claseBadgeTono(TONO.INFO)}>{t.prestaciones.aviso_asistente_aviso_automatico_enviado}</span>
                          ) : (
                            <span className={claseBadgeTono(TONO.ATENCION)}>{t.prestaciones.aviso_asistente_pendiente}</span>
                          )}
                        </td>
                        <td>
                          {!fila.avisado_verbalmente_at && (
                            <Button
                              variant="secondary"
                              onClick={() => handleMarcarAvisadoVerbalmente(fila.id)}
                              disabled={marcandoAvisoId === fila.id}
                            >
                              {t.prestaciones.aviso_asistente_marcar_avisado}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
