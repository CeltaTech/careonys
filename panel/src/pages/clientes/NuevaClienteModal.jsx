import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';

const API_URL = import.meta.env.VITE_API_URL;

export function NuevaClienteModal({ onClose, onCreada }) {
  const { t } = useLocale();
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [nombrePaciente, setNombrePaciente] = useState('');
  const [domicilioPaciente, setDomicilioPaciente] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/cliente-directa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ nombreContacto, telefono, email, localidad, nombrePaciente, domicilioPaciente }),
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(resultado.error || t.comun.error_generico);
      }
      onCreada();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.clientes.nueva.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <FormField label={t.clientes.col_nombre} name="nombreContacto" required value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} />
          <FormField label={t.clientes.col_telefono} name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <FormField label={t.clientes.col_email} name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormField label={t.clientes.col_localidad} name="localidad" value={localidad} onChange={(e) => setLocalidad(e.target.value)} />
          <FormField label={t.clientes.nueva.nombre_paciente} name="nombrePaciente" required value={nombrePaciente} onChange={(e) => setNombrePaciente(e.target.value)} />
          <FormField label={t.clientes.nueva.domicilio_paciente} name="domicilioPaciente" value={domicilioPaciente} onChange={(e) => setDomicilioPaciente(e.target.value)} />

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? t.clientes.nueva.creando : t.clientes.nueva.crear}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
