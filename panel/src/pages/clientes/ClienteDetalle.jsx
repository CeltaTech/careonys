import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { esAdminOSuperior } from '../../lib/roles';
import { linkWhatsapp } from '../../lib/telefono';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { Cabecera } from '../../components/ui/Cabecera';
import { PrestacionesPaciente } from './PrestacionesPaciente';
import { EditarPacienteModal } from './EditarPacienteModal';
import { NuevoPacienteModal } from './NuevoPacienteModal';
import { MonitoreoVitalesPaciente } from './MonitoreoVitalesPaciente';
import { DomiciliosTemporalesPaciente } from './DomiciliosTemporalesPaciente';
import { EquipoDelPaciente } from './EquipoDelPaciente';
import { InvitarPersonaAutorizadaModal } from './InvitarPersonaAutorizadaModal';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { EstadoDelPagador } from './EstadoDelPagador';
import {
  AlertasDelCliente,
  GuardiasActivasDelCliente,
  ReportesDelCliente,
} from './GuardiasReportesYAlertas';
import {
  AccesosDePersonasAutorizadasModal,
  DocumentoDeLaInstruccion,
  RegistrarPapelFirmadoModal,
} from './AccesosDePersonasAutorizadasModal';
import { mensajeDeError, errorDeLaRespuesta } from '../../lib/errores';
import { llamarApiPanel } from '../../lib/apiPanel';
import {
  FINANCIADORES,
  FINANCIADORES_POSIBLES,
  PLAZO_MAXIMO_EN_DIAS,
  plazoQueSePuedeGuardar,
} from '../../lib/facturacionDeClientes';
import { traducirValor } from '../../i18n/valores';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

const API_URL = import.meta.env.VITE_API_URL;

/* Qué ve, en una línea, cada Persona autorizada.
   ==========================================================================

   La tabla no tiene lugar para once casillas por renglón, y tampoco hace falta: lo que la
   Prestadora necesita de un vistazo es si esa persona ve todo, no ve nada, o ve una parte. El
   detalle está a un clic, en la ventana de accesos.

   Se cuenta sobre lo que manda el backend y no sobre una lista escrita acá, así que una casilla
   nueva del catálogo cambia sola el «7 de 11» sin tocar esta pantalla. */
function resumenDeAccesos(accesos, t) {
  const total = accesos?.length ?? 0;
  // Todavía no llegó el detalle: mejor un guion que un «0 de 0», que se leería como «no ve
  // nada» justo cuando lo que pasa es que no se sabe.
  if (!total) return '—';

  const permitidos = accesos.filter((acceso) => acceso.permitido).length;
  if (permitidos === total) return t.clientes.personas_autorizadas.accesos_todo;
  if (permitidos === 0) return t.clientes.personas_autorizadas.accesos_ninguno;
  return con(t.clientes.personas_autorizadas.accesos_parcial, { n: permitidos, total });
}

export function ClienteDetalle() {
  const { t, locale } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const confirmarDestructivo = useConfirmarDestructivo();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const puedeEditarCliente = esAdmin || puede('editar_datos_cliente');
  const puedeEditarPaciente = esAdmin || puede('editar_datos_paciente');
  // Leer no es escribir: el estado del Pagador lo ve quien edita el Cliente, porque saber si firmó
  // hace falta para trabajar. Hacerlo firmar pide su propio permiso, que nace reservado al Admin.
  const puedeRegistrarConsentimiento = esAdmin || puede('registrar_consentimiento_pagador');
  const [cliente, setCliente] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [pacienteParaVitales, setPacienteParaVitales] = useState(null);
  const [pacienteParaDomicilios, setPacienteParaDomicilios] = useState(null);
  const [pacienteParaEquipo, setPacienteParaEquipo] = useState(null);
  const [pacienteAEditar, setPacienteAEditar] = useState(null);
  const [mostrarNuevoPaciente, setMostrarNuevoPaciente] = useState(false);
  const [formContacto, setFormContacto] = useState(null);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [errorContacto, setErrorContacto] = useState(null);
  const [contactoGuardado, setContactoGuardado] = useState(false);
  const [personas_autorizadas, setPersonasAutorizadas] = useState(null);
  const [estadoPersonasAutorizadas, setEstadoPersonasAutorizadas] = useState('cargando');
  const [errorPersonasAutorizadas, setErrorPersonasAutorizadas] = useState(null);
  const [instruccionPendiente, setInstruccionPendiente] = useState(null);
  const [ultimaInstruccion, setUltimaInstruccion] = useState(null);
  const [mostrarInvitarPersonasAutorizadas, setMostrarInvitarPersonasAutorizadas] = useState(false);
  // Guarda a quién se estaba mirando al abrir la ventana de accesos, para que esa persona
  // quede a la vista. `null` es la ventana cerrada.
  const [accesosDe, setAccesosDe] = useState(null);
  const [documentoAVer, setDocumentoAVer] = useState(null);
  const [papelAConfirmar, setPapelAConfirmar] = useState(null);
  const [quitandoUsuarioId, setQuitandoUsuarioId] = useState(null);
  const [reenviandoUsuarioId, setReenviandoUsuarioId] = useState(null);
  const [mensajeReenvio, setMensajeReenvio] = useState(null);
  const [tab, setTab] = useState('contacto');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select(
        'id, plan, dias_hasta_el_vencimiento, financiador_tipo, pagador_persona_id, prestadora_id, created_at, pacientes(*), ' +
          // Quién es el Cliente se lee de la Ficha de Persona de quien contrata, en el Directorio de
          // Personas, y se corrige allá.
          'personas!clientes_contratante_de_la_misma_prestadora(nombre_visible, email, lugares!personas_lugar_fkey(nombre), ' +
          'telefonos_de_la_persona!el_telefono_es_de_una_persona_de_esta_prestadora(telefono))',
      )
      .eq('id', id)
      .single();

    if (errorConsulta) {
      setError(errorConsulta.code === 'PGRST116' ? null : mensajeDeError(errorConsulta, t));
      setEstado(errorConsulta.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }

    setCliente(data);
    setFormContacto({
      plan: data.plan || '',
      dias_hasta_el_vencimiento:
        data.dias_hasta_el_vencimiento === null || data.dias_hasta_el_vencimiento === undefined
          ? ''
          : String(data.dias_hasta_el_vencimiento),
      financiador_tipo: data.financiador_tipo || '',
      pagador_persona_id: data.pagador_persona_id || null,
    });
    setEstado('listo');
  }, [id, t]);

  const recargarPersonasAutorizadas = useCallback(async () => {
    setEstadoPersonasAutorizadas('cargando');
    setErrorPersonasAutorizadas(null);
    try {
      // Por el único camino del Panel hacia el backend: es el que hace viajar el número de la
      // respuesta adentro del error, y sin ese número todo falla igual —una sesión vencida se
      // vería como «ocurrió un error»—.
      const resultado = await llamarApiPanel(`/cuentas/cliente/${id}/personas_autorizadas`);
      const miembros = resultado.miembros ?? [];
      setPersonasAutorizadas(miembros);
      setInstruccionPendiente(resultado.instruccionPendiente ?? null);
      setUltimaInstruccion(resultado.ultimaInstruccion ?? null);
      setEstadoPersonasAutorizadas(miembros.length ? 'listo' : 'vacio');
    } catch (err) {
      setErrorPersonasAutorizadas(mensajeDeError(err, t));
      setEstadoPersonasAutorizadas('error');
    }
  }, [id, t]);

  useEffect(() => {
    recargar();
    recargarPersonasAutorizadas();
  }, [recargar, recargarPersonasAutorizadas]);

  async function quitarPersonaAutorizada(usuarioId) {
    if (!(await confirmarDestructivo(t.clientes.personas_autorizadas.quitar_confirmacion))) {
      return;
    }
    setQuitandoUsuarioId(usuarioId);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/cliente/${id}/personas_autorizadas/${usuarioId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      recargarPersonasAutorizadas();
    } catch (err) {
      setErrorPersonasAutorizadas(mensajeDeError(err, t));
    } finally {
      setQuitandoUsuarioId(null);
    }
  }

  async function reenviarInvitacion(usuarioId) {
    setReenviandoUsuarioId(usuarioId);
    setMensajeReenvio(null);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/${usuarioId}/reenviar-activacion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      setMensajeReenvio({ tipo: 'info', texto: t.comun.invitacion_reenviada });
    } catch {
      setMensajeReenvio({ tipo: 'error', texto: t.comun.reenviar_invitacion_error });
    } finally {
      setReenviandoUsuarioId(null);
    }
  }

  function setCampoContacto(campo, valor) {
    setFormContacto((f) => ({ ...f, [campo]: valor }));
    setContactoGuardado(false);
  }

  async function guardarContacto() {
    setGuardandoContacto(true);
    setErrorContacto(null);
    const {
      plan,
      dias_hasta_el_vencimiento: dias,
      financiador_tipo: financiadorTipo,
      pagador_persona_id: pagadorPersonaId,
    } = formContacto;
    // Vacío es «no se acordó nada distinto», y entonces rige el plazo de la Prestadora. No es
    // cero, que sería «paga el mismo día»: por eso se guarda vacío y no un número.
    const plazo = plazoQueSePuedeGuardar(dias === '' ? '' : Number(dias));
    if (!plazo.ok) {
      setGuardandoContacto(false);
      setErrorContacto(t.clientes.plazo_fuera_de_borde);
      return;
    }
    // El financiador vacío se guarda vacío y no como «cliente»: los dos quieren decir lo mismo,
    // y guardar uno de los dos sería inventar una decisión que nadie tomó.
    //
    // La Ficha de Persona del Pagador se guarda siempre, pague quien pague. Cuando paga el
    // Cliente, el Pagador es alguien del Cliente, y hay que saber cuál: alguien firma la
    // obligación de pagar y esa persona tiene nombre. Borrarla por pagar el Cliente dejaba a esa
    // contratación sin nadie a quien hacerle firmar nada.
    const { error: errorCliente } = await supabase.from('clientes').update({
      plan,
      dias_hasta_el_vencimiento: plazo.valor,
      financiador_tipo: financiadorTipo || null,
      pagador_persona_id: pagadorPersonaId || null,
    }).eq('id', cliente.id);
    setGuardandoContacto(false);
    if (errorCliente) {
      setErrorContacto(t.comun.error_generico);
      return;
    }
    setContactoGuardado(true);
    recargar();
  }

  if (estado === 'cargando') return <p className="estado-cargando">{t.comun.cargando}</p>;
  if (estado === 'no_encontrado') return <p className="estado-vacio">{t.comun.no_encontrado}</p>;
  if (estado === 'error') return <p className="estado-vacio">{error || t.comun.error_generico}</p>;

  // Una pestaña por sección, con el mismo texto que antes llevaba el título de cada una.
  const pestanas = [
    ['contacto', t.clientes.contacto],
    ['pacientes', t.clientes.pacientes],
    ['personas_autorizadas', t.clientes.personas_autorizadas.titulo],
    ['guardias', t.clientes.guardias_activas],
    ['reportes', t.clientes.historial_reportes],
    ['alertas', t.clientes.alertas_activas],
  ];

  // La línea de datos de la Ficha del cliente, con lo que dice la Ficha de Persona de quien contrata.
  const persona = cliente.personas;
  const telefono = persona?.telefonos_de_la_persona?.[0]?.telefono;
  const datosDeLaFichaDelCliente = [
    persona?.lugares?.nombre,
    telefono,
    persona?.email,
    `${t.clientes.col_fecha_alta}: ${new Date(cliente.created_at).toLocaleDateString(locale)}`,
  ].filter(Boolean);

  return (
    <div>
      <Cabecera titulo={persona?.nombre_visible || '—'}>
        <Button variant="secondary" onClick={() => navigate('/clientes')}>
          <span aria-hidden="true">←</span> {t.clientes.volver_a_clientes}
        </Button>
        {puedeEditarCliente && (
          <Button variant="secondary" onClick={() => reenviarInvitacion(cliente.id)} disabled={reenviandoUsuarioId === cliente.id}>
            {reenviandoUsuarioId === cliente.id ? t.comun.reenviando_invitacion : t.comun.reenviar_invitacion}
          </Button>
        )}
      </Cabecera>
      <div className="panel-mini hoja-ficha-datos">{datosDeLaFichaDelCliente.join(' · ')}</div>

      {/* El aviso del reenvío queda afuera de las pestañas: se reenvía desde la cabecera y desde
          las Personas autorizadas, y tiene que verse en las dos. */}
      {mensajeReenvio && <Alert variant={mensajeReenvio.tipo}>{mensajeReenvio.texto}</Alert>}

      <div className="molde-pila">
        <section className="panel-tarjeta">
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
        </section>

        {tab === 'contacto' && (
          <>
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.clientes.contacto}</h2>
              {telefono && (
                <a className="panel-enlace" href={linkWhatsapp(telefono)} target="_blank" rel="noreferrer">
                  {t.clientes.abrir_whatsapp}
                </a>
              )}
            </div>
            {errorContacto && <Alert variant="error">{errorContacto}</Alert>}
            {contactoGuardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
            {formContacto && (
              <>
              <div className="molde-formgrid">
                <FormField label={t.clientes.plan} name="plan_contacto" value={formContacto.plan} onChange={(e) => setCampoContacto('plan', e.target.value)} disabled={!puedeEditarCliente} />
                {/* Lo acordado con este Cliente pisa el plazo general de la Prestadora. Vacío quiere
                    decir que no se acordó nada distinto, no que pague el mismo día. */}
                <FormField
                  label={t.clientes.plazo_de_pago}
                  name="dias_hasta_el_vencimiento"
                  type="number"
                  min="0"
                  max={PLAZO_MAXIMO_EN_DIAS}
                  value={formContacto.dias_hasta_el_vencimiento}
                  onChange={(e) => setCampoContacto('dias_hasta_el_vencimiento', e.target.value)}
                  disabled={!puedeEditarCliente}
                />
                {/* A quién se le reclama lo que se le factura a este Cliente. Vacío es el Cliente, que
                    es lo corriente. Cada factura se lleva este dato copiado el día que se genera, así
                    que cambiarlo acá no toca ninguna factura ya emitida. */}
                <FormField
                  label={t.clientes.financiador}
                  name="financiador_tipo"
                  type="select"
                  value={formContacto.financiador_tipo}
                  onChange={(e) => setCampoContacto('financiador_tipo', e.target.value)}
                  disabled={!puedeEditarCliente}
                >
                  <option value="">{t.clientes.financiador_cliente}</option>
                  {FINANCIADORES_POSIBLES.filter((f) => f !== FINANCIADORES.CLIENTE).map((f) => (
                    <option key={f} value={f}>{traducirValor(t.clientes, `financiador_${f}`)}</option>
                  ))}
                </FormField>
                {/* Quién paga se elige del Directorio de Personas y no se teclea: un nombre escrito a
                    mano crea un ente nuevo que no existe, y la misma obra social terminaría escrita de
                    cien maneras.

                    Se elige siempre, también cuando paga el Cliente: ahí el Pagador es alguien de la
                    Cliente, y cuál es no se adivina. */}
                <div className="molde-ancho">
                  <SelectorDePersona
                    name="pagador_persona_id"
                    label={t.clientes.pagador_legajo}
                    valor={formContacto.pagador_persona_id}
                    alElegir={(personaId) => setCampoContacto('pagador_persona_id', personaId)}
                    deshabilitado={!puedeEditarCliente}
                  />
                </div>
              </div>
              <div className="molde-acciones">
                <Button onClick={guardarContacto} disabled={guardandoContacto || !puedeEditarCliente}>
                  {guardandoContacto ? t.comun.guardando : t.comun.guardar}
                </Button>
              </div>
              </>
            )}
          </section>
          {/* Si el Pagador elegido firmó y qué papeles faltan, siempre a la vista. Avisa, no bloquea. */}
          {formContacto && puedeEditarCliente && (
            <EstadoDelPagador clienteId={cliente.id} puedeRegistrar={puedeRegistrarConsentimiento} />
          )}
          </>
        )}

        {tab === 'pacientes' && (
          <section className="panel-tarjeta hoja-desplazable">
            <div className="panel-tarjeta-titulo">
              <h2>{t.clientes.pacientes}</h2>
              {puedeEditarPaciente && (
                <Button variant="secondary" onClick={() => setMostrarNuevoPaciente(true)}>
                  {t.clientes.agregar_paciente}
                </Button>
              )}
            </div>
            {cliente.pacientes?.length ? (
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.clientes.col_nombre}</th>
                    <th>{t.clientes.fecha_nacimiento}</th>
                    <th>{t.clientes.nivel_complejidad}</th>
                    <th>{t.clientes.domicilio}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.pacientes.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.nombre}</b></td>
                      <td>{p.fecha_nacimiento || '—'}</td>
                      <td>{p.nivel_complejidad || '—'}</td>
                      <td>{p.domicilio || '—'}</td>
                      <td>
                        {puedeEditarPaciente && (
                          <>
                            <Button variant="secondary" onClick={() => setPacienteAEditar(p)}>
                              {t.comun.editar}
                            </Button>{' '}
                          </>
                        )}
                        <Button variant="secondary" onClick={() => setPacienteSeleccionado(p)}>
                          {t.prestaciones.titulo}
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setPacienteParaVitales(p)}>
                          {t.vitales_autorizacion.titulo}
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setPacienteParaDomicilios(p)}>
                          {t.domicilios_temporales.titulo}
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setPacienteParaEquipo(p)}>
                          {t.equipo_paciente.titulo}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="molde-vacio">{t.clientes.sin_pacientes}</p>
            )}
          </section>
        )}

        {tab === 'personas_autorizadas' && (
          <>
            {/* La instrucción cargada y todavía sin firmar es lo primero que hay que ver: mientras
                no esté firmada, lo que hay es un pedido anotado, no una autorización. Los dos
                caminos de cierre están acá al lado —imprimir el papel, o registrar que ya volvió
                firmado—, porque son lo único que queda por hacer. */}
            {instruccionPendiente && (
              <Alert variant="warning">
                {con(t.clientes.personas_autorizadas.instruccion_pendiente, {
                  fecha: new Date(instruccionPendiente.created_at).toLocaleDateString(locale),
                })}{' '}
                <Button variant="secondary" onClick={() => setDocumentoAVer(instruccionPendiente)}>
                  {t.clientes.personas_autorizadas.ver_documento}
                </Button>{' '}
                {puedeEditarCliente && (
                  <Button variant="secondary" onClick={() => setPapelAConfirmar(instruccionPendiente)}>
                    {t.clientes.personas_autorizadas.registrar_papel}
                  </Button>
                )}
              </Alert>
            )}
            <section className="panel-tarjeta hoja-desplazable">
            <div className="panel-tarjeta-titulo">
              <h2>{t.clientes.personas_autorizadas.titulo}</h2>
              {puedeEditarCliente && (
                <Button variant="secondary" onClick={() => setMostrarInvitarPersonasAutorizadas(true)}>
                  {t.clientes.personas_autorizadas.agregar}
                </Button>
              )}
            </div>
            {!instruccionPendiente && ultimaInstruccion && (
              <div className="panel-mini">
                {con(t.clientes.personas_autorizadas.ultima_instruccion, {
                  fecha: new Date(ultimaInstruccion.cerrada_en || ultimaInstruccion.created_at).toLocaleDateString(locale),
                  como: t.clientes.personas_autorizadas[`cerrada_${ultimaInstruccion.cerrada_como}`] || '',
                })}
              </div>
            )}

            {estadoPersonasAutorizadas === 'cargando' && <p className="molde-vacio">{t.comun.cargando}</p>}
            {estadoPersonasAutorizadas === 'error' && <p className="molde-vacio">{errorPersonasAutorizadas || t.comun.error_generico}</p>}
            {estadoPersonasAutorizadas === 'vacio' && <p className="molde-vacio">{t.clientes.personas_autorizadas.sin_miembros}</p>}
            {estadoPersonasAutorizadas === 'listo' && (
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.clientes.personas_autorizadas.col_nombre}</th>
                    <th>{t.clientes.personas_autorizadas.col_email}</th>
                    <th>{t.clientes.personas_autorizadas.col_que_ve}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {personas_autorizadas.map((m) => (
                    <tr key={m.usuarioId}>
                      <td><b>{m.nombre || '—'}</b></td>
                      <td>{m.email || '—'}</td>
                      <td>{resumenDeAccesos(m.accesos, t)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setAccesosDe(m.usuarioId)}
                          aria-label={con(t.comun.campo_de_fila, {
                            campo: t.clientes.personas_autorizadas.accesos_boton,
                            nombre: m.nombre || m.email || '',
                          })}
                        >
                          {t.clientes.personas_autorizadas.accesos_boton}
                        </Button>{' '}
                        {puedeEditarCliente && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => reenviarInvitacion(m.usuarioId)}
                              disabled={reenviandoUsuarioId === m.usuarioId}
                            >
                              {reenviandoUsuarioId === m.usuarioId ? t.comun.reenviando_invitacion : t.comun.reenviar_invitacion}
                            </Button>{' '}
                            <Button
                              variant="secondary"
                              onClick={() => quitarPersonaAutorizada(m.usuarioId)}
                              disabled={quitandoUsuarioId === m.usuarioId}
                            >
                              {t.clientes.personas_autorizadas.quitar}
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {errorPersonasAutorizadas && estadoPersonasAutorizadas === 'listo' && <Alert variant="error">{errorPersonasAutorizadas}</Alert>}
            </section>
          </>
        )}

        {/* Las tres secciones traen sus propios datos y manejan sus propios cuatro estados; viven
            en `GuardiasReportesYAlertas.jsx` y hacen las mismas preguntas que las pantallas de
            Guardias, Reportes y Alertas, acotadas a los Pacientes de este Cliente. */}
        {tab === 'guardias' && <GuardiasActivasDelCliente pacientes={cliente.pacientes} />}
        {tab === 'reportes' && <ReportesDelCliente pacientes={cliente.pacientes} />}
        {tab === 'alertas' && <AlertasDelCliente pacientes={cliente.pacientes} />}
      </div>

      {pacienteSeleccionado && (
        <PrestacionesPaciente paciente={pacienteSeleccionado} onClose={() => setPacienteSeleccionado(null)} />
      )}

      {pacienteParaVitales && (
        <MonitoreoVitalesPaciente paciente={pacienteParaVitales} onClose={() => setPacienteParaVitales(null)} />
      )}

      {pacienteParaDomicilios && (
        <DomiciliosTemporalesPaciente
          paciente={pacienteParaDomicilios}
          puedeEditar={puedeEditarPaciente}
          onClose={() => setPacienteParaDomicilios(null)}
        />
      )}

      {pacienteParaEquipo && (
        <EquipoDelPaciente
          paciente={pacienteParaEquipo}
          puedeEditar={esAdmin || puede('corregir_equipo_del_paciente')}
          onClose={() => setPacienteParaEquipo(null)}
        />
      )}

      {pacienteAEditar && (
        <EditarPacienteModal
          paciente={pacienteAEditar}
          onClose={() => setPacienteAEditar(null)}
          onGuardado={() => {
            setPacienteAEditar(null);
            recargar();
          }}
        />
      )}

      {mostrarNuevoPaciente && (
        <NuevoPacienteModal
          clienteId={cliente.id}
          onClose={() => setMostrarNuevoPaciente(false)}
          onCreado={() => {
            setMostrarNuevoPaciente(false);
            recargar();
          }}
        />
      )}

      {mostrarInvitarPersonasAutorizadas && (
        <InvitarPersonaAutorizadaModal
          clienteId={cliente.id}
          onClose={() => setMostrarInvitarPersonasAutorizadas(false)}
          onInvitado={() => {
            setMostrarInvitarPersonasAutorizadas(false);
            recargarPersonasAutorizadas();
          }}
        />
      )}

      {accesosDe && (
        <AccesosDePersonasAutorizadasModal
          clienteId={cliente.id}
          miembros={personas_autorizadas}
          puedeEditar={puedeEditarCliente}
          usuarioIdInicial={accesosDe}
          onClose={() => setAccesosDe(null)}
          onGuardado={() => {
            setAccesosDe(null);
            recargarPersonasAutorizadas();
          }}
        />
      )}

      {documentoAVer && (
        <DocumentoDeLaInstruccion
          texto={documentoAVer.documento_texto}
          fecha={documentoAVer.created_at}
          onCerrar={() => setDocumentoAVer(null)}
        />
      )}

      {papelAConfirmar && (
        <RegistrarPapelFirmadoModal
          clienteId={cliente.id}
          instruccionId={papelAConfirmar.id}
          onClose={() => setPapelAConfirmar(null)}
          onRegistrado={() => {
            setPapelAConfirmar(null);
            recargarPersonasAutorizadas();
          }}
        />
      )}
    </div>
  );
}
