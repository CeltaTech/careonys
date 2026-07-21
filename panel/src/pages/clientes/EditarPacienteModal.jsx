import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';

function medicacionAFilas(medicacion) {
  if (!Array.isArray(medicacion) || medicacion.length === 0) return [{ nombre: '', dosis: '', frecuencia: '' }];
  return medicacion.map((m) => ({ nombre: m.nombre || '', dosis: m.dosis || '', frecuencia: m.frecuencia || '' }));
}

export function EditarPacienteModal({ paciente, onClose, onGuardado }) {
  const { t } = useLocale();
  const [nombre, setNombre] = useState(paciente.nombre || '');
  const [fechaNacimiento, setFechaNacimiento] = useState(paciente.fecha_nacimiento || '');
  const [domicilio, setDomicilio] = useState(paciente.domicilio || '');
  const [nivelComplejidad, setNivelComplejidad] = useState(paciente.nivel_complejidad || '');
  const [patologias, setPatologias] = useState((paciente.patologias || []).join(', '));
  const [obraSocial, setObraSocial] = useState(paciente.obra_social || '');
  const [numeroAfiliado, setNumeroAfiliado] = useState(paciente.numero_afiliado || '');
  const [medicacion, setMedicacion] = useState(medicacionAFilas(paciente.medicacion_habitual));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function setMedicacionFila(i, campo, valor) {
    setMedicacion((filas) => filas.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));
  }

  function agregarFilaMedicacion() {
    setMedicacion((filas) => [...filas, { nombre: '', dosis: '', frecuencia: '' }]);
  }

  function quitarFilaMedicacion(i) {
    setMedicacion((filas) => filas.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const medicacionLimpia = medicacion.filter((m) => m.nombre.trim());
    const { error: errorUpdate } = await supabase
      .from('pacientes')
      .update({
        nombre,
        fecha_nacimiento: fechaNacimiento || null,
        domicilio: domicilio || null,
        nivel_complejidad: nivelComplejidad || null,
        patologias: patologias.split(',').map((p) => p.trim()).filter(Boolean),
        obra_social: obraSocial || null,
        numero_afiliado: numeroAfiliado || null,
        medicacion_habitual: medicacionLimpia.length ? medicacionLimpia : null,
      })
      .eq('id', paciente.id);
    setGuardando(false);
    if (errorUpdate) {
      setError(t.comun.error_generico);
      return;
    }
    onGuardado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.clientes.editar_paciente.titulo}</h2>

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
          <FormField label={t.clientes.editar_paciente.patologias} name="patologias" value={patologias} onChange={(e) => setPatologias(e.target.value)} />
          <FormField label={t.clientes.editar_paciente.obra_social} name="obra_social" value={obraSocial} onChange={(e) => setObraSocial(e.target.value)} />
          <FormField label={t.clientes.editar_paciente.numero_afiliado} name="numero_afiliado" value={numeroAfiliado} onChange={(e) => setNumeroAfiliado(e.target.value)} />

          <label>{t.clientes.editar_paciente.medicacion_habitual}</label>
          {medicacion.map((fila, i) => (
            <div key={i} className="panel-filtros">
              <input
                type="text"
                placeholder={t.clientes.editar_paciente.medicacion_nombre}
                value={fila.nombre}
                onChange={(e) => setMedicacionFila(i, 'nombre', e.target.value)}
              />
              <input
                type="text"
                placeholder={t.clientes.editar_paciente.medicacion_dosis}
                value={fila.dosis}
                onChange={(e) => setMedicacionFila(i, 'dosis', e.target.value)}
              />
              <input
                type="text"
                placeholder={t.clientes.editar_paciente.medicacion_frecuencia}
                value={fila.frecuencia}
                onChange={(e) => setMedicacionFila(i, 'frecuencia', e.target.value)}
              />
              <button type="button" onClick={() => quitarFilaMedicacion(i)}>×</button>
            </div>
          ))}
          <Button variant="secondary" type="button" onClick={agregarFilaMedicacion}>
            {t.clientes.editar_paciente.agregar_medicacion}
          </Button>

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
