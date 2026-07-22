import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
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

export function ClienteDetalle() {
  const { t } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
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

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, plan, solicitud_id, created_at, solicitudes!clientes_solicitud_id_fkey(nombre, telefono, email, localidad), pacientes(*)')
      .eq('id', id)
      .single();

    if (errorConsulta) {
      setError(errorConsulta.code === 'PGRST116' ? null : errorConsulta.message);
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
  }, [id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

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
          </Button>
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
    </div>
  );
}
