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
import { PrestacionesPaciente } from './PrestacionesPaciente';
import { EditarPacienteModal } from './EditarPacienteModal';
import { NuevoPacienteModal } from './NuevoPacienteModal';
import { MonitoreoVitalesPaciente } from './MonitoreoVitalesPaciente';
import { DomiciliosTemporalesPaciente } from './DomiciliosTemporalesPaciente';
import { EquipoDelPaciente } from './EquipoDelPaciente';
import { InvitarPersonasAutorizadasModal } from './InvitarPersonasAutorizadasModal';
import { SelectorDeLegajo } from '../../components/padron/SelectorDeLegajo';
import { EstadoDelPagador } from './EstadoDelPagador';
import {
  AlertasDeLaCliente,
  GuardiasActivasDeLaCliente,
  ReportesDeLaCliente,
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

const API_URL = import.meta.env.VITE_API_URL;

/* Qué ve, en una línea, cada persona de las personas autorizadas.
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
  if (permitidos === total) return t.clientes.personas autorizadas.accesos_todo;
  if (permitidos === 0) return t.clientes.personas autorizadas.accesos_ninguno;
  return con(t.clientes.personas autorizadas.accesos_parcial, { n: permitidos, total });
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
  const [personas autorizadas, setPersonasAutorizadas] = useState(null);
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

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, plan, dias_hasta_el_vencimiento, financiador_tipo, pagador_legajo_id, prestadora_id, solicitud_id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(*)')
      .eq('id', id)
      .single();

    if (errorConsulta) {
      setError(errorConsulta.code === 'PGRST116' ? null : mensajeDeError(errorConsulta, t));
      setEstado(errorConsulta.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }

    setCliente(data);
    setFormContacto({
      nombre: data.solicitudes?.nombre || '',
      telefono: data.solicitudes?.telefono || '',
      email: data.solicitudes?.email || '',
      localidad: data.solicitudes?.localidad || '',
      plan: data.plan || '',
      dias_hasta_el_vencimiento:
        data.dias_hasta_el_vencimiento === null || data.dias_hasta_el_vencimiento === undefined
          ? ''
          : String(data.dias_hasta_el_vencimiento),
      financiador_tipo: data.financiador_tipo || '',
      pagador_legajo_id: data.pagador_legajo_id || null,
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
      const resultado = await llamarApiPanel(`/cuentas/cliente/${id}/personas autorizadas`);
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

  async function quitarMiembroPersonasAutorizadas(usuarioId) {
    if (!(await confirmarDestructivo(t.clientes.personas autorizadas.quitar_confirmacion))) {
      return;
    }
    setQuitandoUsuarioId(usuarioId);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/cliente/${id}/personas autorizadas/${usuarioId}`, {
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
      nombre, telefono, email, localidad, plan,
      dias_hasta_el_vencimiento: dias,
      financiador_tipo: financiadorTipo,
      pagador_legajo_id: pagadorLegajoId,
    } = formContacto;
    // Vacío es «no se acordó nada distinto», y entonces rige el plazo de la Prestadora. No es
    // cero, que sería «paga el mismo día»: por eso se guarda vacío y no un número.
    const plazo = plazoQueSePuedeGuardar(dias === '' ? '' : Number(dias));
    if (!plazo.ok) {
      setGuardandoContacto(false);
      setErrorContacto(t.clientes.plazo_fuera_de_borde);
      return;
    }
    const [{ error: errorSolicitud }, { error: errorCliente }] = await Promise.all([
      cliente.solicitud_id
        ? supabase.from('solicitudes').update({ nombre, telefono, email, localidad }).eq('id', cliente.solicitud_id)
        : Promise.resolve({ error: null }),
      // El financiador vacío se guarda vacío y no como «cliente»: los dos quieren decir lo mismo,
      // y guardar uno de los dos sería inventar una decisión que nadie tomó.
      //
      // El Legajo del Pagador se guarda siempre, pague quien pague. Cuando paga el Cliente, el
      // Pagador es alguien del Cliente, y hay que saber cuál: alguien firma la obligación de
      // pagar y esa persona tiene nombre. Borrarlo por pagar el Cliente dejaba a esa contratación
      // sin nadie a quien hacerle firmar nada.
      supabase.from('clientes').update({
        plan,
        dias_hasta_el_vencimiento: plazo.valor,
        financiador_tipo: financiadorTipo || null,
        pagador_legajo_id: pagadorLegajoId || null,
      }).eq('id', cliente.id),
    ]);
    setGuardandoContacto(false);
    if (errorSolicitud || errorCliente) {
      setErrorContacto(t.comun.error_generico);
      return;
    }
    setContactoGuardado(true);
    recargar();
  }

  if (estado === 'cargando') return <p className="estado-cargando">{t.comun.cargando}</p>;
  if (estado === 'no_encontrado') return <p className="estado-vacio">{t.comun.no_encontrado}</p>;
  if (estado === 'error') return <p className="estado-vacio">{error || t.comun.error_generico}</p>;

  return (
    <div>
      <button className="link-volver" onClick={() => navigate('/clientes')}><span aria-hidden="true">←</span> {t.clientes.volver_a_clientes}</button>
      <h1>{cliente.solicitudes?.nombre || '—'}</h1>

      <h2>{t.clientes.contacto}</h2>
      {errorContacto && <Alert variant="error">{errorContacto}</Alert>}
      {contactoGuardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      {mensajeReenvio && <Alert variant={mensajeReenvio.tipo}>{mensajeReenvio.texto}</Alert>}
      {formContacto && (
        <>
          <FormField label={t.clientes.col_nombre} name="nombre_contacto" value={formContacto.nombre} onChange={(e) => setCampoContacto('nombre', e.target.value)} disabled={!puedeEditarCliente} />
          <FormField label={t.clientes.col_telefono} name="telefono_contacto" value={formContacto.telefono} onChange={(e) => setCampoContacto('telefono', e.target.value)} disabled={!puedeEditarCliente} />
          {formContacto.telefono && (
            <p className="panel-explicacion">
              <a href={linkWhatsapp(formContacto.telefono)} target="_blank" rel="noreferrer">{t.clientes.abrir_whatsapp}</a>
            </p>
          )}
          <FormField label={t.clientes.col_email} name="email_contacto" type="email" value={formContacto.email} onChange={(e) => setCampoContacto('email', e.target.value)} disabled={!puedeEditarCliente} />
          <FormField label={t.clientes.col_localidad} name="localidad_contacto" value={formContacto.localidad} onChange={(e) => setCampoContacto('localidad', e.target.value)} disabled={!puedeEditarCliente} />
          <FormField label={t.clientes.plan} name="plan_contacto" value={formContacto.plan} onChange={(e) => setCampoContacto('plan', e.target.value)} disabled={!puedeEditarCliente} />
          {/* Lo acordado con esta Cliente pisa el plazo general de la Prestadora. Vacío quiere
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
          {/* A quién se le reclama lo que se le factura a esta Cliente. Vacío es el Cliente, que
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
          {/* Quién paga se elige del Padrón y no se teclea: un nombre escrito a mano crea un ente
              nuevo que no existe, y la misma obra social terminaría escrita de cien maneras.

              Se elige siempre, también cuando paga el Cliente: ahí el Pagador es alguien de la
              Cliente, y cuál es no se adivina. */}
          <SelectorDeLegajo
            name="pagador_legajo_id"
            label={t.clientes.pagador_legajo}
            valor={formContacto.pagador_legajo_id}
            alElegir={(legajoId) => setCampoContacto('pagador_legajo_id', legajoId)}
            deshabilitado={!puedeEditarCliente}
          />
          {/* Elegir el Legajo no convierte a nadie en Pagador: lo convierte haber firmado la
              obligación de pagar. Acá abajo se ve si esa firma está y qué papeles faltan, en el
              mismo momento en que se lo elige. Avisa, no bloquea.

              Aparece junto al selector y siempre, pague quien pague: el Pagador firma en todos los
              casos, y quien arma la contratación tiene que ver acá mismo si esa firma está. */}
          {puedeEditarCliente && (
            <EstadoDelPagador clienteId={cliente.id} puedeRegistrar={puedeRegistrarConsentimiento} />
          )}
          <dl className="panel-detalle-lista">
            <dt>{t.clientes.col_fecha_alta}</dt>
            <dd>{new Date(cliente.created_at).toLocaleDateString(locale)}</dd>
          </dl>
          <Button onClick={guardarContacto} disabled={guardandoContacto || !puedeEditarCliente}>
            {guardandoContacto ? t.comun.guardando : t.comun.guardar}
          </Button>{' '}
          {puedeEditarCliente && (
            <Button variant="secondary" onClick={() => reenviarInvitacion(cliente.id)} disabled={reenviandoUsuarioId === cliente.id}>
              {reenviandoUsuarioId === cliente.id ? t.comun.reenviando_invitacion : t.comun.reenviar_invitacion}
            </Button>
          )}
        </>
      )}

      <h2>{t.clientes.pacientes}</h2>
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
                <td>{p.nombre}</td>
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
        <p className="estado-vacio">{t.clientes.sin_pacientes}</p>
      )}
      {puedeEditarPaciente && (
        <Button variant="secondary" onClick={() => setMostrarNuevoPaciente(true)}>
          {t.clientes.agregar_paciente}
        </Button>
      )}

      <h2>{t.clientes.personas autorizadas.titulo}</h2>
      {/* La instrucción cargada y todavía sin firmar es lo primero que hay que ver: mientras
          no esté firmada, lo que hay es un pedido anotado, no una autorización. Los dos
          caminos de cierre están acá al lado —imprimir el papel, o registrar que ya volvió
          firmado—, porque son lo único que queda por hacer. */}
      {instruccionPendiente && (
        <Alert variant="warning">
          {con(t.clientes.personas autorizadas.instruccion_pendiente, {
            fecha: new Date(instruccionPendiente.created_at).toLocaleDateString(locale),
          })}{' '}
          <Button variant="secondary" onClick={() => setDocumentoAVer(instruccionPendiente)}>
            {t.clientes.personas autorizadas.ver_documento}
          </Button>{' '}
          {puedeEditarCliente && (
            <Button variant="secondary" onClick={() => setPapelAConfirmar(instruccionPendiente)}>
              {t.clientes.personas autorizadas.registrar_papel}
            </Button>
          )}
        </Alert>
      )}
      {!instruccionPendiente && ultimaInstruccion && (
        <p className="panel-explicacion">
          {con(t.clientes.personas autorizadas.ultima_instruccion, {
            fecha: new Date(ultimaInstruccion.cerrada_en || ultimaInstruccion.created_at).toLocaleDateString(locale),
            como: t.clientes.personas autorizadas[`cerrada_${ultimaInstruccion.cerrada_como}`] || '',
          })}
        </p>
      )}

      {estadoPersonasAutorizadas === 'cargando' && <p className="estado-cargando">{t.comun.cargando}</p>}
      {estadoPersonasAutorizadas === 'error' && <p className="estado-vacio">{errorPersonasAutorizadas || t.comun.error_generico}</p>}
      {estadoPersonasAutorizadas === 'vacio' && <p className="estado-vacio">{t.clientes.personas autorizadas.sin_miembros}</p>}
      {estadoPersonasAutorizadas === 'listo' && (
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.clientes.personas autorizadas.col_nombre}</th>
              <th>{t.clientes.personas autorizadas.col_email}</th>
              <th>{t.clientes.personas autorizadas.col_que_ve}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personas autorizadas.map((m) => (
              <tr key={m.usuarioId}>
                <td>{m.nombre || '—'}</td>
                <td>{m.email || '—'}</td>
                <td>{resumenDeAccesos(m.accesos, t)}</td>
                <td>
                  <Button
                    variant="secondary"
                    onClick={() => setAccesosDe(m.usuarioId)}
                    aria-label={con(t.comun.campo_de_fila, {
                      campo: t.clientes.personas autorizadas.accesos_boton,
                      nombre: m.nombre || m.email || '',
                    })}
                  >
                    {t.clientes.personas autorizadas.accesos_boton}
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
                        onClick={() => quitarMiembroPersonasAutorizadas(m.usuarioId)}
                        disabled={quitandoUsuarioId === m.usuarioId}
                      >
                        {t.clientes.personas autorizadas.quitar}
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
      {puedeEditarCliente && (
        <Button variant="secondary" onClick={() => setMostrarInvitarPersonasAutorizadas(true)}>
          {t.clientes.personas autorizadas.agregar}
        </Button>
      )}

      {/* Las tres secciones traen sus propios datos y manejan sus propios cuatro estados; viven
          en `GuardiasReportesYAlertas.jsx` y hacen las mismas preguntas que las pantallas de
          Guardias, Reportes y Alertas, acotadas a los Pacientes de esta Cliente. */}
      <h2>{t.clientes.guardias_activas}</h2>
      <GuardiasActivasDeLaCliente pacientes={cliente.pacientes} />

      <h2>{t.clientes.historial_reportes}</h2>
      <ReportesDeLaCliente pacientes={cliente.pacientes} />

      <h2>{t.clientes.alertas_activas}</h2>
      <AlertasDeLaCliente pacientes={cliente.pacientes} />

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
        <InvitarPersonasAutorizadasModal
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
          miembros={personas autorizadas}
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
