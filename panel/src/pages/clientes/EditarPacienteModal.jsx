import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { avisarSiQuedoPendiente } from '../../lib/cargasPendientes';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';

export function EditarPacienteModal({ paciente, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [nivelComplejidad, setNivelComplejidad] = useState(paciente.nivel_complejidad || '');
  const [patologias, setPatologias] = useState((paciente.patologias || []).join(', '));
  const [obraSocialPersonaId, setObraSocialPersonaId] = useState(paciente.obra_social_persona_id || null);
  const [numeroAfiliado, setNumeroAfiliado] = useState(paciente.numero_afiliado || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const { error: errorUpdate } = await supabase
      .from('pacientes')
      .update({
        obra_social_persona_id: obraSocialPersonaId || null,
        numero_afiliado: numeroAfiliado || null,
      })
      .eq('id', paciente.id);
    // Patologías y nivel de complejidad son información de salud y viven en su propia tabla.
    // Si ya existe se modifica, no se vuelve a dar de alta: un alta encima de lo vigente no dice
    // qué columnas se dejaron como estaban, y lo que carga otro Coordinador queda pendiente.
    let errorSalud = null;
    if (!errorUpdate) {
      const salud = {
        nivel_complejidad: nivelComplejidad || null,
        patologias: patologias.split(',').map((p) => p.trim()).filter(Boolean),
      };
      const { data: vigente, error: errorVigente } = await supabase
        .from('informacion_de_salud_del_paciente')
        .select('paciente_id')
        .eq('paciente_id', paciente.id)
        .maybeSingle();
      errorSalud = errorVigente;
      if (!errorSalud) {
        ({ error: errorSalud } = vigente
          ? await supabase.from('informacion_de_salud_del_paciente').update(salud).eq('paciente_id', paciente.id)
          : await supabase.from('informacion_de_salud_del_paciente')
            .insert({ prestadora_id: paciente.prestadora_id, paciente_id: paciente.id, ...salud }));
      }
    }
    if (!errorUpdate && !errorSalud) await avisarSiQuedoPendiente(paciente.id, t);
    setGuardando(false);
    if (errorUpdate || errorSalud) {
      setError(mensajeDeError(errorUpdate || errorSalud, t, 'editar paciente'));
      return;
    }
    onGuardado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.clientes.editar_paciente.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          {/* Quién es el Paciente —nombre, fecha de nacimiento, domicilio— está en su Ficha de
              Persona y se corrige en el Directorio de Personas. Acá queda lo que es propio de
              recibir el cuidado. */}
          <FormField label={t.clientes.nivel_complejidad} name="nivel_complejidad" type="select" value={nivelComplejidad} onChange={(e) => setNivelComplejidad(e.target.value)}>
            <option value="">{t.comun.todos}</option>
            <option value="I">I</option>
            <option value="II">II</option>
            <option value="III">III</option>
          </FormField>
          <FormField label={t.clientes.editar_paciente.patologias} name="patologias" value={patologias} onChange={(e) => setPatologias(e.target.value)} />
          {/* La obra social se elige del Directorio de Personas, donde es una Persona jurídica.
              Escrita a mano, la misma obra social en la Ficha de cien Pacientes serían cien
              Pagadores distintos. */}
          <SelectorDePersona
            name="obra_social_persona_id"
            label={t.clientes.editar_paciente.obra_social}
            valor={obraSocialPersonaId}
            alElegir={setObraSocialPersonaId}
            clase="juridica"
            deshabilitado={guardando}
          />
          <FormField label={t.clientes.editar_paciente.numero_afiliado} name="numero_afiliado" value={numeroAfiliado} onChange={(e) => setNumeroAfiliado(e.target.value)} />

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
