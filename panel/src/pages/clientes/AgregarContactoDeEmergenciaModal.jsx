import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { faltantesDeLaPersonaNueva, yaEstaEnLaLista, CAMPOS_DE_LA_PERSONA_NUEVA } from '../../lib/contactosDeEmergencia';

/* Suma un contacto de emergencia a la lista de la Ficha del Cliente.

   Se elige una persona de Contactos —ahí están todas las del Cliente— o se escribe una persona
   nueva con nombre, apellido y teléfono. Nada se guarda acá: la persona entra a la lista de la
   pestaña, y la lista entera se guarda desde ahí. */

const ORIGEN_CONTACTOS = 'contactos';
const ORIGEN_NUEVA = 'nueva';

export function AgregarContactoDeEmergenciaModal({ lista, textosDeLaBase, onAgregar, onClose }) {
  const { t } = useLocale();
  const textos = t.clientes.contactos_de_emergencia;
  const modal = useModalAccesible(onClose);
  const [origen, setOrigen] = useState(ORIGEN_CONTACTOS);
  const [elegida, setElegida] = useState(null);
  const [nueva, setNueva] = useState({ nombre: '', apellido: '', telefono: '' });
  const [avisos, setAvisos] = useState({});

  function enfocar(campo) {
    document.getElementById(`field-contacto-${campo}`)?.focus();
  }

  function cambiarNueva(campo) {
    return (e) => {
      const valor = e.target.value;
      setNueva((n) => ({ ...n, [campo]: valor }));
      // El aviso se va en cuanto el dato se completa, sin esperar a que se vuelva a apretar.
      if (avisos[campo] && valor.trim()) setAvisos(({ [campo]: _, ...resto }) => resto);
    };
  }

  function elegir(personaId, fila) {
    setElegida(personaId && fila ? { personaId, nombre: fila.nombre_visible } : null);
    if (personaId) setAvisos({});
  }

  function agregar(e) {
    e.preventDefault();
    if (origen === ORIGEN_CONTACTOS) {
      if (!elegida) {
        setAvisos({ persona: t.formularios.falta_un_dato_obligatorio });
        enfocar('persona');
        return;
      }
      if (yaEstaEnLaLista(lista, elegida.personaId)) {
        setAvisos({ persona: textosDeLaBase?.error?.repetido });
        enfocar('persona');
        return;
      }
      onAgregar({ personaId: elegida.personaId, nombre: elegida.nombre });
      return;
    }

    const faltan = faltantesDeLaPersonaNueva(nueva);
    setAvisos(Object.fromEntries(faltan.map((campo) => [campo, t.formularios.falta_un_dato_obligatorio])));
    const primero = CAMPOS_DE_LA_PERSONA_NUEVA.find((campo) => faltan.includes(campo));
    if (primero) {
      enfocar(primero);
      return;
    }
    onAgregar({ nueva });
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{textos.agregar_titulo}</h2>

        <form onSubmit={agregar} noValidate>
          <FormField
            label={textos.origen}
            name="contacto-origen"
            type="select"
            value={origen}
            onChange={(e) => {
              setOrigen(e.target.value);
              setAvisos({});
            }}
          >
            <option value={ORIGEN_CONTACTOS}>{textos.origen_contactos}</option>
            <option value={ORIGEN_NUEVA}>{textos.origen_nueva}</option>
          </FormField>

          {origen === ORIGEN_CONTACTOS && (
            <SelectorDePersona
              label={textos.persona}
              name="contacto-persona"
              clase="fisica"
              required
              valor={elegida?.personaId ?? null}
              alElegir={elegir}
              error={avisos.persona}
            />
          )}

          {origen === ORIGEN_NUEVA && (
            <>
              <FormField label={textos.nombre} name="contacto-nombre" required value={nueva.nombre} onChange={cambiarNueva('nombre')} error={avisos.nombre} />
              <FormField label={textos.apellido} name="contacto-apellido" required value={nueva.apellido} onChange={cambiarNueva('apellido')} error={avisos.apellido} />
              <FormField label={textos.telefono} name="contacto-telefono" type="tel" required value={nueva.telefono} onChange={cambiarNueva('telefono')} error={avisos.telefono} />
            </>
          )}

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit">{textos.agregar_confirmar}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
