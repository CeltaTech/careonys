import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';

export function NuevoPacienteModal({ clienteId, onClose, onCreado }) {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const [nombre, setNombre] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [nivelComplejidad, setNivelComplejidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const { error: errorInsert } = await supabase.from('pacientes').insert({
      cliente_id: clienteId,
      nombre,
      fecha_nacimiento: fechaNacimiento || null,
      domicilio: domicilio || null,
      nivel_complejidad: nivelComplejidad || null,
      prestadora_id: usuario.prestadora_id,
    });
    setGuardando(false);
    if (errorInsert) {
      setError(t.comun.error_generico);
      return;
    }
    onCreado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.clientes.agregar_paciente}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <FormField label={t.clientes.col_nombre} name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <FormField label={t.clientes.fecha_nacimiento} name="fecha_nacimiento" type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
          <FormField label={t.clientes.domicilio} name="domicilio" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
          <FormField label={t.clientes.nivel_complejidad} name="nivel_complejidad" type="select" value={nivelComplejidad} onChange={(e) => setNivelComplejidad(e.target.value)}>
            <option value="">{t.comun.todos}</option>
            <option value="I">I</option>
            <option value="II">II</option>
            <option value="III">III</option>
          </FormField>

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
