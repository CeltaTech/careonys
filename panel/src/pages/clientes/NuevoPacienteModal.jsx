import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';

export function NuevoPacienteModal({ clienteId, onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [personaId, setPersonaId] = useState(null);
  const [faltaLaPersona, setFaltaLaPersona] = useState(false);
  const [nivelComplejidad, setNivelComplejidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!personaId) {
      setFaltaLaPersona(true);
      return;
    }
    setGuardando(true);
    const { data: paciente, error: errorInsert } = await supabase
      .from('pacientes')
      .insert({ cliente_id: clienteId, persona_id: personaId, prestadora_id: prestadoraId })
      .select('id')
      .single();
    // El nivel de complejidad es información de salud y vive en su propia tabla.
    let errorSalud = null;
    if (!errorInsert && nivelComplejidad) {
      ({ error: errorSalud } = await supabase.from('informacion_de_salud_del_paciente').insert({
        prestadora_id: prestadoraId,
        paciente_id: paciente.id,
        nivel_complejidad: nivelComplejidad,
      }));
    }
    setGuardando(false);
    if (errorInsert || errorSalud) {
      setError(t.comun.error_generico);
      return;
    }
    onCreado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.clientes.agregar_paciente}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <SelectorDePersona
            name="persona_id"
            label={t.clientes.listado.col_paciente}
            valor={personaId}
            alElegir={(id) => { setPersonaId(id); if (id) setFaltaLaPersona(false); }}
            clase="fisica"
            required
            error={faltaLaPersona ? t.formularios.falta_un_dato_obligatorio : null}
            deshabilitado={guardando}
          />
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
