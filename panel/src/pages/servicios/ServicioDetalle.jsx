import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { traducirValor } from '../../i18n/valores';
import { supabase } from '../../lib/supabaseClient';
import { formatearImporte } from '../../lib/dinero';
import { claseBadge } from '../../lib/tonos';
import { con } from '../../lib/textos';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { armarBuscadorDeRangos, tieneSignoFueraDeRango } from '../../lib/signosVitales';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Cabecera } from '../../components/ui/Cabecera';
import { FormField } from '../../components/ui/FormField';
import { mensajeDeError } from '../../lib/errores';
import { clienteDelServicio, contactosDeClientes } from '../../lib/clienteDelServicio';
import { coordinadoresSugeridos } from '../../lib/coordinadoresSugeridos';
import { claseDeResponsable, modalidadesDeTurnosGuardia, nombreDeModalidad } from './modalidadesDelServicio';
import { TareasDelServicio } from './TareasDelServicio';
import { PagosDelServicio } from './PagosDelServicio';
import { BajaDelServicioModal } from './BajaDelServicioModal';
import { ReactivarElServicioModal } from './ReactivarElServicioModal';
import { EquipoDelServicio } from './EquipoDelServicio';
import { CoberturaDelServicio } from './CoberturaDelServicio';
import { CoberturaModal } from './CoberturaModal';
import { TurnosGuardiaDelServicio } from './TurnosGuardiaDelServicio';
import './servicios.css';

import { FICHA_NOMBRE, conSuFicha, conSusFichas } from '../../lib/fichaDelPaciente';
import { informacionDeSalud } from '../../lib/informacionDeSalud';

// Cuántos turnos de guardia se listan en la pestaña. Un Servicio de meses puede tener cientos, y esta
// pantalla no es la grilla de guardias: quien quiera verlas todas va a Guardias. Las modalidades y
// las incidencias sí se calculan sobre todas.
const TURNOS_GUARDIA_A_MOSTRAR = 20;

// Tope de reportes en Seguimiento, por la misma razón.
const REPORTES_A_MOSTRAR = 50;

const ESTADO_ACTIVO = 'vigente';
const ESTADO_DE_BAJA = 'de_baja';

// Cómo se lee un Coordinador en la lista de asignar: su nombre, cuántos Servicios vigentes coordina
// y, si cubre el lugar del Servicio, que lo cubre. Las dos cosas que ordenan la sugerencia quedan a la
// vista, porque el orden solo no dice por qué uno está antes que otro.
function opcionDeCoordinador(c, d) {
  const partes = [c.nombre, con(c.servicios === 1 ? d.coordina_un_servicio : d.coordina_servicios, { n: c.servicios })];
  if (c.cubreElLugar === true) partes.push(d.cubre_el_lugar);
  return partes.join(' · ');
}

function fecha(valor, locale) {
  return valor ? new Date(valor).toLocaleDateString(locale) : '—';
}

export function ServicioDetalle() {
  const { t, locale } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const prestadoraId = usePrestadoraActual();
  const { usuario } = useAuth();
  // Al Coordinador lo asigna la administración; el Coordinador asignado sólo lo ve. La base dice
  // lo mismo: esto sólo decide si se muestra la lista o el nombre.
  const asignaCoordinador = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const esAdmin = asignaCoordinador;
  // Lo comercial del Servicio lo corrige quien tiene ese permiso; lo que firma el Responsable de
  // pagos tiene el suyo. Con cualquiera de los dos se ve la solapa. La base aplica el mismo corte.
  const puedeEditarPagos = esAdmin || puede('editar_condiciones_comerciales_servicio');
  const puedeRegistrarConsentimiento = esAdmin || puede('registrar_consentimiento_pagador');
  const veLosPagos = puedeEditarPagos || puedeRegistrarConsentimiento;
  const gestionaServicios = esAdmin || puede('gestionar_servicios');
  const modificaAsistentes = esAdmin || puede('modificar_asistentes_del_servicio');
  // La pausa, la suspensión o la cancelación de una Prestación, mientras su ventana está abierta.
  const [accionPrestacion, setAccionPrestacion] = useState(null);
  const [viendoEquipo, setViendoEquipo] = useState(false);
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [servicio, setServicio] = useState(null);
  const [coordinadores, setCoordinadores] = useState([]);
  // Si al Servicio le falta la firma del Responsable de pagos para programar guardias. Lo
  // contesta la misma función de la base que rechaza programarlas, así que el aviso y el rechazo
  // dicen siempre lo mismo.
  const [faltaLaFirma, setFaltaLaFirma] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [errorAsignacion, setErrorAsignacion] = useState(null);
  const [contactos, setContactos] = useState(new Map());
  // Cómo se llama quien firmó la contratación. `null` es que el Servicio viene de antes del Padrón
  // y no lo dice.
  const [prestaciones, setPrestaciones] = useState([]);
  const [turnos_guardia, setTurnosGuardia] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [nombresPaciente, setNombresPaciente] = useState({});
  const [nombresAsistente, setNombresAsistente] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.solapa ?? 'resumen');

  // `enSilencio` vuelve a leer sin tapar la ficha con «Cargando»: lo usa una pestaña que acaba de
  // cambiar algo y tiene a la vista un aviso que no se tiene que perder.
  const recargar = useCallback(async (opciones) => {
    if (!opciones?.enSilencio) setEstado('cargando');
    setError(null);

    const { data: s, error: fallaServicio } = await supabase
      .from('servicios')
      // De qué Cliente es sale de `cliente_id`; sus datos de contacto los trae `contactosDeClientes`.
      .select('id, prestadora_id, etiqueta, estado, created_at, cliente_id, coordinador_id, vigente_desde, vigente_hasta')
      .eq('id', id)
      .single();

    if (fallaServicio) {
      // PGRST116 es "la consulta no devolvió ninguna fila": ese Servicio no existe.
      setError(fallaServicio.code === 'PGRST116' ? null : mensajeDeError(fallaServicio, t));
      setEstado(fallaServicio.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }

    // La modalidad la lleva cada turno de guardia, así que se traen todas las del Servicio: de ahí salen
    // las modalidades, y por sus ids se buscan las incidencias.
    // Quiénes pueden coordinarlo. A la administración, que asigna, la base le contesta la lista
    // ordenada con la sugerencia. Quien no asigna sólo necesita el nombre, y la base le deja ver
    // únicamente su propia cuenta, que es la del Servicio que está mirando.
    const [pr, gu, rep, rangos, coord, firma] = await Promise.all([
      supabase
        .from('prestaciones')
        .select('id, tipo_servicio, precio_final, moneda, estado, nota, paciente_id, created_at')
        .eq('servicio_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('turnos_guardia')
        .select('id, fecha, hora_inicio, hora_fin, estado, paciente_id, asistente_id, canal_modalidad')
        .eq('servicio_id', id)
        .order('fecha', { ascending: false }),
      informacionDeSalud
        .from('reportes')
        .select(
          `id, created_at, estado_animo, incidentes, signos_vitales, confirmado_asistente, pacientes!inner(id, ${FICHA_NOMBRE}), turnos_guardia!inner(fecha, servicio_id, asistentes(nombre))`,
        )
        .eq('turnos_guardia.servicio_id', id)
        .order('created_at', { ascending: false })
        .limit(REPORTES_A_MOSTRAR),
      informacionDeSalud
        .from('rangos_referencia_vitales')
        .select('signo, paciente_id, valor_min, valor_max, unidad')
        .eq('prestadora_id', prestadoraId),
      asignaCoordinador
        ? coordinadoresSugeridos(supabase, id)
        : supabase
            .from('usuarios')
            .select('id, nombre')
            .eq('prestadora_id', prestadoraId)
            .eq('rol', 'coordinador')
            .is('desactivada_en', null)
            .order('nombre')
            .then(({ data, error: fallaUsuarios }) => ({
              coordinadores: (data ?? []).map((u) => ({ id: u.id, nombre: (u.nombre ?? '').trim() || '—' })),
              error: fallaUsuarios,
            })),
      supabase.rpc('falta_la_firma_del_pagador', { p_servicio: id }),
    ]);

    const falla = pr.error ?? gu.error ?? rep.error ?? coord.error ?? firma.error;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    const listaTurnosGuardia = gu.data ?? [];
    const idsTurnoGuardia = listaTurnosGuardia.map((g) => g.id);
    const idsPaciente = [...new Set([...(pr.data ?? []), ...listaTurnosGuardia].map((r) => r.paciente_id).filter(Boolean))];
    const idsAsistente = [...new Set(listaTurnosGuardia.map((r) => r.asistente_id).filter(Boolean))];
    const vacio = Promise.resolve({ data: [], error: null });
    const listaIds = idsTurnoGuardia.join(',');

    const [pacientes, asistentes, { contactos: mapaContactos, error: fallaContactos }, relevos, sinCubrir] =
      await Promise.all([
        idsPaciente.length ? supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', idsPaciente) : vacio,
        idsAsistente.length ? supabase.from('asistentes').select('id, nombre').in('id', idsAsistente) : vacio,
        contactosDeClientes(supabase, [s]),
        idsTurnoGuardia.length
          ? supabase
              .from('incidentes_relevo')
              .select('id, turno_guardia_saliente_id, turno_guardia_entrante_id, iniciado_at, resuelto_at')
              .or(`turno_guardia_entrante_id.in.(${listaIds}),turno_guardia_saliente_id.in.(${listaIds})`)
          : vacio,
        idsTurnoGuardia.length
          ? supabase
              .from('incidentes_turno_guardia_sin_cubrir')
              .select('id, turno_guardia_id, abierto_at, resuelto_at')
              .in('turno_guardia_id', idsTurnoGuardia)
          : vacio,
      ]);

    const fallaSegunda = pacientes.error ?? asistentes.error ?? fallaContactos ?? relevos.error ?? sinCubrir.error;
    if (fallaSegunda) {
      setError(mensajeDeError(fallaSegunda, t));
      setEstado('error');
      return;
    }

    const turnoGuardiaPorId = Object.fromEntries(listaTurnosGuardia.map((g) => [g.id, g]));
    const buscador = armarBuscadorDeRangos(rangos.data);

    setServicio(s);
    setCoordinadores(coord.coordinadores);
    setContactos(mapaContactos);
    setPrestaciones(pr.data ?? []);
    setTurnosGuardia(listaTurnosGuardia);
    setReportes(
      (rep.data ?? []).map((r) => ({
        ...r,
        fuera_de_rango: tieneSignoFueraDeRango(r.signos_vitales, r.pacientes?.id ?? null, buscador),
      })),
    );
    setIncidencias(
      [
        ...(relevos.data ?? []).map((i) => ({
          id: `relevo-${i.id}`,
          tipo: 'relevo',
          inicio: i.iniciado_at,
          resuelta: Boolean(i.resuelto_at),
          turno_guardia: turnoGuardiaPorId[i.turno_guardia_entrante_id] ?? turnoGuardiaPorId[i.turno_guardia_saliente_id] ?? null,
        })),
        ...(sinCubrir.data ?? []).map((i) => ({
          id: `sin-cubrir-${i.id}`,
          tipo: 'sin_cubrir',
          inicio: i.abierto_at,
          resuelta: Boolean(i.resuelto_at),
          turno_guardia: turnoGuardiaPorId[i.turno_guardia_id] ?? null,
        })),
      ].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio))),
    );
    setNombresPaciente(Object.fromEntries(conSusFichas(pacientes.data).map((p) => [p.id, p.nombre])));
    setNombresAsistente(Object.fromEntries((asistentes.data ?? []).map((a) => [a.id, a.nombre])));
    setFaltaLaFirma(firma.data === true);
    setEstado('listo');
  }, [id, prestadoraId, asignaCoordinador, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Los Pacientes del Servicio salen de sus prestaciones y sus turnos de guardia, que dicen de qué
  // Servicio son.
  const idsPacienteDelServicio = useMemo(
    () => [...new Set([...prestaciones, ...turnos_guardia].map((r) => r.paciente_id).filter(Boolean))],
    [prestaciones, turnos_guardia],
  );
  const pacientesDelServicio = useMemo(
    () => idsPacienteDelServicio.map((idPaciente) => nombresPaciente[idPaciente] || '—'),
    [idsPacienteDelServicio, nombresPaciente],
  );

  const modalidades = useMemo(() => modalidadesDeTurnosGuardia(turnos_guardia), [turnos_guardia]);

  const asignarCoordinador = async (coordinadorId) => {
    if (!coordinadorId || coordinadorId === servicio.coordinador_id) return;
    setAsignando(true);
    setErrorAsignacion(null);
    const { data, error: falla } = await supabase
      .from('servicios')
      .update({ coordinador_id: coordinadorId })
      .eq('id', servicio.id)
      .select('coordinador_id')
      .single();
    setAsignando(false);
    if (falla) {
      setErrorAsignacion(mensajeDeError(falla, t));
      return;
    }
    setServicio((anterior) => ({ ...anterior, coordinador_id: data.coordinador_id }));
  };

  if (estado === 'cargando') {
    return <p className="estado-cargando">{t.comun.cargando}</p>;
  }

  if (estado === 'no_encontrado' || estado === 'error') {
    return (
      <div>
        <Cabecera titulo={t.servicios.titulo}>
          <Button variant="secondary" onClick={() => navigate('/servicios')}>
            {t.servicios.detalle.volver}
          </Button>
        </Cabecera>
        {estado === 'no_encontrado' ? (
          <Alert variant="error">{t.servicios.detalle.no_encontrado}</Alert>
        ) : (
          <Alert variant="error">
            {error || t.comun.error_generico}{' '}
            <Button variant="secondary" onClick={recargar}>{t.comun.reintentar}</Button>
          </Alert>
        )}
      </div>
    );
  }

  const d = t.servicios.detalle;
  const cliente = clienteDelServicio(servicio, contactos);
  const contacto = cliente.contacto;
  const nombrePacientes = pacientesDelServicio.length ? pacientesDelServicio.join(', ') : '—';
  const nombreCliente = contacto?.nombre || '—';
  const puedeAgregarPrestacion = servicio.estado === ESTADO_ACTIVO && Boolean(cliente.ruta);
  const nombreCoordinador = coordinadores.find((c) => c.id === servicio.coordinador_id)?.nombre || '—';
  // Pausar, suspender y cancelar la cobertura: la administración o el Coordinador que coordina este
  // Servicio. Es el mismo corte que hace la base.
  const gestionaCobertura = esAdmin || (usuario?.rol === 'coordinador' && Boolean(servicio.coordinador_id) && servicio.coordinador_id === usuario?.id);
  const coberturaEditable = gestionaCobertura && servicio.estado === ESTADO_ACTIVO;

  const pestanas = [
    ['resumen', d.tab_resumen],
    ['prestaciones', d.tab_prestaciones],
    ['tareas', d.tab_tareas],
    ['turnos_guardia', d.tab_turnos_guardia],
    ['seguimiento', d.tab_seguimiento],
    ['incidencias', d.tab_incidencias],
    ...(veLosPagos ? [['pagos', d.tab_pagos]] : []),
  ];

  const vacio = (texto) => <p className="estado-vacio">{texto}</p>;

  return (
    <div>
      <Cabecera titulo={servicio.etiqueta || '—'}>
        <Button variant="secondary" onClick={() => navigate('/servicios')}>
          {d.volver}
        </Button>
        <Button variant="secondary" onClick={() => setViendoEquipo(true)}>
          {t.equipo_servicio.titulo}
        </Button>
        {gestionaServicios && servicio.estado === ESTADO_ACTIVO && (
          <Button variant="secondary" onClick={() => setDandoDeBaja(true)}>
            {t.servicios.baja.boton}
          </Button>
        )}
        {gestionaServicios && servicio.estado === ESTADO_DE_BAJA && (
          <Button variant="secondary" onClick={() => setReactivando(true)}>
            {t.servicios.reactivacion.boton}
          </Button>
        )}
      </Cabecera>

      {viendoEquipo && (
        <EquipoDelServicio
          servicio={servicio}
          puedeEditar={modificaAsistentes}
          onClose={() => setViendoEquipo(false)}
        />
      )}

      {dandoDeBaja && (
        <BajaDelServicioModal
          servicioId={servicio.id}
          onClose={() => setDandoDeBaja(false)}
          onDadoDeBaja={() => {
            setDandoDeBaja(false);
            recargar();
          }}
        />
      )}
      {reactivando && (
        <ReactivarElServicioModal
          servicioId={servicio.id}
          onClose={() => setReactivando(false)}
          onReactivado={() => {
            setReactivando(false);
            recargar();
          }}
        />
      )}
      <span className="panel-mini servicios-subtitulo">
        {[servicio.etiqueta, nombrePacientes, nombreCliente].filter(Boolean).join(' · ')}
      </span>

      {!servicio.coordinador_id && <Alert variant="warning">{d.no_habilitado}</Alert>}
      {faltaLaFirma && <Alert variant="warning">{d.sin_firma_del_pagador}</Alert>}
      {errorAsignacion && <Alert variant="error">{errorAsignacion}</Alert>}

      <section className="panel-tarjeta servicios-tarjeta">
        <div className="panel-tabs" role="tablist">
          {pestanas.map(([tabId, titulo]) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={tab === tabId}
              className={`panel-tab ${tab === tabId ? 'panel-tab-activo' : ''}`}
              onClick={() => setTab(tabId)}
            >
              {titulo}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="panel-grilla panel-columnas-3">
            <div className="servicios-dato">
              <span className="panel-mini">{d.col_estado}</span>
              <span className={claseBadge(servicio.estado)}>
                {traducirValor(t.servicios, `estado_${servicio.estado}`)}
              </span>
            </div>
            <div className="servicios-dato">
              <span className="panel-mini">{t.servicios.col_paciente}</span>
              <b>{nombrePacientes}</b>
            </div>
            <div className="servicios-dato">
              <span className="panel-mini">{t.servicios.col_cliente}</span>
              <b>{nombreCliente}</b>
              {contacto && (
                <span className="panel-mini">
                  {[contacto.telefono, contacto.email, contacto.localidad].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <div className="servicios-dato">
              {asignaCoordinador ? (
                <FormField
                  label={d.coordinador}
                  name="coordinador_id"
                  type="select"
                  value={servicio.coordinador_id ?? ''}
                  disabled={asignando}
                  onChange={(e) => asignarCoordinador(e.target.value)}
                >
                  {!servicio.coordinador_id && <option value="" disabled>{d.elegir_coordinador}</option>}
                  {coordinadores.map((c) => (
                    <option key={c.id} value={c.id}>{opcionDeCoordinador(c, d)}</option>
                  ))}
                </FormField>
              ) : (
                <>
                  <span className="panel-mini">{d.coordinador}</span>
                  <b>{nombreCoordinador}</b>
                </>
              )}
            </div>
            <CoberturaDelServicio
              servicio={servicio}
              prestaciones={prestaciones}
              cambiaElPeriodo={gestionaServicios}
              gestionaCobertura={gestionaCobertura}
              onCambio={recargar}
            />
          </div>
        )}

        {tab === 'prestaciones' &&
          (prestaciones.length === 0 ? (
            vacio(d.sin_prestaciones)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{d.col_que}</th>
                    <th>{d.col_para_quien}</th>
                    <th>{d.col_precio}</th>
                    <th>{d.col_estado}</th>
                    <th>{d.col_nota}</th>
                    {coberturaEditable && <th>{t.servicios.cobertura.col_cobertura}</th>}
                  </tr>
                </thead>
                <tbody>
                  {prestaciones.map((p) => (
                    <tr key={p.id}>
                      <td>{p.tipo_servicio}</td>
                      <td>{nombresPaciente[p.paciente_id] || '—'}</td>
                      <td>{formatearImporte(p.precio_final, p.moneda, locale)}</td>
                      <td>
                        <span className={claseBadge(p.estado)}>{traducirValor(t.servicios, `estado_${p.estado}`)}</span>
                      </td>
                      <td>{p.nota || '—'}</td>
                      {coberturaEditable && (
                        <td>
                          {p.estado === 'vigente' && (
                            <div className="panel-filtros">
                              {['pausa', 'suspension', 'cancelacion'].map((tipo) => (
                                <Button key={tipo} variant="secondary" onClick={() => setAccionPrestacion({ tipo, prestacion: p })}>
                                  {t.servicios.cobertura[tipo === 'pausa' ? 'pausar' : tipo === 'suspension' ? 'suspender' : 'cancelar']}
                                </Button>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {accionPrestacion && (
          <CoberturaModal
            tipo={accionPrestacion.tipo}
            alcance="prestacion"
            servicioId={servicio.id}
            prestacionId={accionPrestacion.prestacion.id}
            titulo={`${t.servicios.cobertura.alcance_prestacion} · ${accionPrestacion.prestacion.tipo_servicio}`}
            onClose={() => setAccionPrestacion(null)}
            onHecho={() => {
              setAccionPrestacion(null);
              recargar();
            }}
          />
        )}

        {tab === 'tareas' && (
          <TareasDelServicio
            servicioId={servicio.id}
            prestadoraId={prestadoraId}
            editable={servicio.estado === ESTADO_ACTIVO}
          />
        )}

        {tab === 'turnos_guardia' && (
          <TurnosGuardiaDelServicio
            servicio={servicio}
            turnos_guardia={turnos_guardia}
            cuantosMostrar={TURNOS_GUARDIA_A_MOSTRAR}
            nombresPaciente={nombresPaciente}
            nombresAsistente={nombresAsistente}
            onCambio={() => recargar({ enSilencio: true })}
            t={t}
          />
        )}

        {tab === 'seguimiento' &&
          (reportes.length === 0 ? (
            vacio(d.sin_reportes)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.reportes.col_fecha}</th>
                    <th>{t.reportes.col_paciente}</th>
                    <th>{t.reportes.col_asistente}</th>
                    <th>{t.reportes.col_animo}</th>
                    <th>{t.reportes.col_senales}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.turnos_guardia?.fecha ?? fecha(r.created_at, locale)}</td>
                      <td>{conSuFicha(r.pacientes)?.nombre || '—'}</td>
                      <td>{r.turnos_guardia?.asistentes?.nombre || '—'}</td>
                      <td>{r.estado_animo ? t.reportes[`animo_${r.estado_animo}`] ?? r.estado_animo : '—'}</td>
                      <td>
                        <div className="servicios-badges">
                          {r.incidentes && <span className="badge badge-critico">{t.reportes.senal_incidente}</span>}
                          {r.fuera_de_rango && <span className="badge badge-atencion">{t.reportes.senal_fuera_rango}</span>}
                          {!r.confirmado_asistente && <span className="badge badge-neutro">{t.reportes.senal_sin_confirmar}</span>}
                          {!r.incidentes && !r.fuera_de_rango && r.confirmado_asistente && (
                            <span className="panel-mini">{t.reportes.sin_novedades}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'incidencias' &&
          (incidencias.length === 0 ? (
            vacio(d.sin_incidencias)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{d.col_fecha}</th>
                    <th>{d.col_horario}</th>
                    <th>{d.col_para_quien}</th>
                    <th>{d.col_que_paso}</th>
                    <th>{d.col_estado}</th>
                  </tr>
                </thead>
                <tbody>
                  {incidencias.map((i) => (
                    <tr key={i.id}>
                      <td>{i.turno_guardia?.fecha ?? fecha(i.inicio, locale)}</td>
                      <td>{i.turno_guardia ? `${i.turno_guardia.hora_inicio?.slice(0, 5)} – ${i.turno_guardia.hora_fin?.slice(0, 5)}` : '—'}</td>
                      <td>{nombresPaciente[i.turno_guardia?.paciente_id] || '—'}</td>
                      <td>{i.tipo === 'relevo' ? t.continuidad.incidentes_titulo : t.continuidad.turnos_guardia_vacios_titulo}</td>
                      <td>
                        <span className={i.resuelta ? 'badge badge-exito' : 'badge badge-critico'}>
                          {i.resuelta ? t.alertas.estado_resuelta : t.alertas.estado_pendiente}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === 'pagos' && veLosPagos && (
          <PagosDelServicio
            servicio={servicio}
            puedeEditar={puedeEditarPagos}
            puedeRegistrar={puedeRegistrarConsentimiento}
            esAdmin={esAdmin}
            onGuardado={recargar}
          />
        )}
      </section>

      {tab === 'resumen' && (
        <div className="panel-grilla panel-columnas-2 servicios-resumen">
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.servicios.col_prestaciones}</h2>
              {puedeAgregarPrestacion && (
                <Button variant="primary" onClick={() => navigate(cliente.ruta)}>
                  {d.agregar_prestacion}
                </Button>
              )}
            </div>
            {prestaciones.length === 0
              ? vacio(d.sin_prestaciones)
              : prestaciones.map((p) => (
                  <div key={p.id} className="panel-fila-alerta">
                    <div>
                      <b>{p.tipo_servicio}</b>
                      <span className="panel-mini">{nombresPaciente[p.paciente_id] || '—'}</span>
                    </div>
                    <span className={claseBadge(p.estado)}>{traducirValor(t.servicios, `estado_${p.estado}`)}</span>
                  </div>
                ))}
          </section>

          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{d.responsabilidad}</h2>
            </div>
            {modalidades.length === 0
              ? vacio(d.sin_modalidades)
              : modalidades.map((m) => (
                  <div key={m} className="panel-fila-alerta">
                    <b>{nombreDeModalidad(m, t)}</b>
                    <span className={claseDeResponsable(m)}>{d[`responsable_${m}`] ?? m}</span>
                  </div>
                ))}
          </section>
        </div>
      )}
    </div>
  );
}
