import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { useConfirmarDestructivo } from '../../context/TenantSessionContext';
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
import { InvitarPersonasAutorizadasModal } from './InvitarPersonasAutorizadasModal';
import { mensajeDeError } from '../../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

export function ClienteDetalle() {
  const { t } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const confirmarDestructivo = useConfirmarDestructivo();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const puedeEditarCliente = esAdmin || puede('editar_datos_cliente');
  const puedeEditarPaciente = esAdmin || puede('editar_datos_paciente');
  const [cliente, setCliente] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [pacienteParaVitales, setPacienteParaVitales] = useState(null);
  const [pacienteAEditar, setPacienteAEditar] = useState(null);
  const [mostrarNuevoPaciente, setMostrarNuevoPaciente] = useState(false);
  const [formContacto, setFormContacto] = useState(null);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [errorContacto, setErrorContacto] = useState(null);
  const [contactoGuardado, setContactoGuardado] = useState(false);
  const [personas autorizadas, setPersonasAutorizadas] = useState(null);
  const [estadoPersonasAutorizadas, setEstadoPersonasAutorizadas] = useState('cargando');
  const [errorPersonasAutorizadas, setErrorPersonasAutorizadas] = useState(null);
  const [mostrarInvitarPersonasAutorizadas, setMostrarInvitarPersonasAutorizadas] = useState(false);
  const [quitandoUsuarioId, setQuitandoUsuarioId] = useState(null);
  const [reenviandoUsuarioId, setReenviandoUsuarioId] = useState(null);
  const [mensajeReenvio, setMensajeReenvio] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, plan, solicitud_id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(*)')
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
    });
    setEstado('listo');
  }, [id, t]);

  const recargarPersonasAutorizadas = useCallback(async () => {
    setEstadoPersonasAutorizadas('cargando');
    setErrorPersonasAutorizadas(null);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/cliente/${id}/personas autorizadas`, {
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(resultado.error);
      }
      setPersonasAutorizadas(resultado.miembros);
      setEstadoPersonasAutorizadas(resultado.miembros.length ? 'listo' : 'vacio');
    } catch {
      setErrorPersonasAutorizadas(t.comun.error_generico);
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
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(resultado.error || t.clientes.personas autorizadas.quitar_error);
      }
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
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(resultado.error);
      }
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
    const { nombre, telefono, email, localidad, plan } = formContacto;
    const [{ error: errorSolicitud }, { error: errorCliente }] = await Promise.all([
      cliente.solicitud_id
        ? supabase.from('solicitudes').update({ nombre, telefono, email, localidad }).eq('id', cliente.solicitud_id)
        : Promise.resolve({ error: null }),
      supabase.from('clientes').update({ plan }).eq('id', cliente.id),
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
          <dl className="panel-detalle-lista">
            <dt>{t.clientes.col_fecha_alta}</dt>
            <dd>{new Date(cliente.created_at).toLocaleDateString()}</dd>
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
      <p className="panel-explicacion">{t.clientes.personas autorizadas.descripcion}</p>
      {estadoPersonasAutorizadas === 'cargando' && <p className="estado-cargando">{t.comun.cargando}</p>}
      {estadoPersonasAutorizadas === 'error' && <p className="estado-vacio">{errorPersonasAutorizadas || t.comun.error_generico}</p>}
      {estadoPersonasAutorizadas === 'vacio' && <p className="estado-vacio">{t.clientes.personas autorizadas.sin_miembros}</p>}
      {estadoPersonasAutorizadas === 'listo' && (
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.clientes.personas autorizadas.col_nombre}</th>
              <th>{t.clientes.personas autorizadas.col_email}</th>
              <th>{t.clientes.personas autorizadas.col_rol}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personas autorizadas.map((m) => (
              <tr key={m.usuario_id}>
                <td>{m.usuarios?.nombre || '—'}</td>
                <td>{m.email || '—'}</td>
                <td>{t.clientes.personas autorizadas.rol_solo_lectura}</td>
                <td>
                  {puedeEditarCliente && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => reenviarInvitacion(m.usuario_id)}
                        disabled={reenviandoUsuarioId === m.usuario_id}
                      >
                        {reenviandoUsuarioId === m.usuario_id ? t.comun.reenviando_invitacion : t.comun.reenviar_invitacion}
                      </Button>{' '}
                      <Button
                        variant="secondary"
                        onClick={() => quitarMiembroPersonasAutorizadas(m.usuario_id)}
                        disabled={quitandoUsuarioId === m.usuario_id}
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

      <h2>{t.clientes.guardias_activas}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>

      <h2>{t.clientes.historial_reportes}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>

      <h2>{t.clientes.alertas_activas}</h2>
      <p className="estado-vacio">{t.clientes.modulo_no_disponible}</p>

      {pacienteSeleccionado && (
        <PrestacionesPaciente paciente={pacienteSeleccionado} onClose={() => setPacienteSeleccionado(null)} />
      )}

      {pacienteParaVitales && (
        <MonitoreoVitalesPaciente paciente={pacienteParaVitales} onClose={() => setPacienteParaVitales(null)} />
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
    </div>
  );
}
