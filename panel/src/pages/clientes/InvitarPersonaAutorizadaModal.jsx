import { useCallback, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useGeneros } from '../../hooks/useGeneros';
import { DocumentoDeLaInstruccion } from './AccesosDePersonasAutorizadasModal';

/* La Prestadora anota a una persona autorizada de un Cliente.

   GUARDAR NO DA NINGÚN ACCESO. El backend arma la autorización que la nombra, con lo de fábrica,
   y los accesos rigen recién cuando el titular la firma: en papel, con lo que se imprime acá al
   terminar, o desde su aplicación. Qué ve cada una se cambia después con «Accesos», que arma otra
   autorización.

   EL NÚMERO LO VALIDA EL BACKEND, que sabe de qué país es la Prestadora. Acá sólo se mira que
   nada quede vacío; lo que el backend rechaza vuelve como motivo y se cuelga del casillero. */

const CAMPOS = ['nombre', 'apellido', 'cuil', 'genero', 'email'];

// Qué casillero tiene la culpa de cada rechazo del backend. Lo que no está acá va arriba.
const CAMPO_DEL_MOTIVO = {
  falta_el_documento: 'cuil',
  numero_no_valido: 'cuil',
  documento_repetido: 'cuil',
  dni_no_coincide: 'cuil',
  correo_de_otra_cuenta: 'email',
  ya_es_persona_autorizada: 'email',
  falta_el_genero: 'genero',
  genero_no_reconocido: 'genero',
};

export function InvitarPersonaAutorizadaModal({ clienteId, prestadoraId, onClose, onInvitado }) {
  const { t } = useLocale();
  const textos = t.clientes.personas_autorizadas;
  const { generos } = useGeneros(prestadoraId);
  const [datos, setDatos] = useState({ nombre: '', apellido: '', cuil: '', genero: '', email: '' });
  const [avisos, setAvisos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [documento, setDocumento] = useState(null);

  /* Con el documento a la vista la persona ya quedó anotada: cerrar le avisa a la pantalla de
     atrás para que se vuelva a leer. */
  const cerrar = useCallback(() => {
    if (documento) {
      onInvitado();
      return;
    }
    onClose();
  }, [documento, onInvitado, onClose]);

  const modal = useModalAccesible(cerrar);

  function cambiar(campo) {
    return (e) => {
      const valor = e.target.value;
      setDatos((d) => ({ ...d, [campo]: valor }));
      // El aviso se va en cuanto el dato se completa, sin esperar a que se vuelva a guardar.
      if (avisos[campo] && valor.trim()) setAvisos(({ [campo]: _, ...resto }) => resto);
    };
  }

  function enfocar(campo) {
    document.getElementById(`field-persona-${campo}`)?.focus();
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    const faltan = Object.fromEntries(
      CAMPOS.filter((c) => !datos[c].trim()).map((c) => [c, t.formularios.falta_un_dato_obligatorio]),
    );
    setAvisos(faltan);
    const primero = CAMPOS.find((c) => faltan[c]);
    if (primero) {
      enfocar(primero);
      return;
    }

    setGuardando(true);
    try {
      const resultado = await llamarApiPanel(`/cuentas/cliente/${clienteId}/personas_autorizadas`, {
        method: 'POST',
        body: JSON.stringify({
          nombre: datos.nombre.trim(),
          apellido: datos.apellido.trim(),
          documento: datos.cuil.trim(),
          genero: datos.genero,
          email: datos.email.trim(),
        }),
      });
      setDocumento(resultado.instruccion.documento_texto);
    } catch (err) {
      const mensaje = mensajeDeError(err, t);
      const campo = CAMPO_DEL_MOTIVO[err?.motivo];
      if (campo) {
        setAvisos({ [campo]: mensaje });
        enfocar(campo);
      } else {
        setError(mensaje);
      }
    } finally {
      setGuardando(false);
    }
  }

  if (documento) {
    return <DocumentoDeLaInstruccion texto={documento} onCerrar={cerrar} />;
  }

  return (
    <div className="panel-modal-fondo" onClick={cerrar}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{textos.invitar_titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={guardar} noValidate>
          <FormField label={textos.invitar_nombre} name="persona-nombre" required value={datos.nombre} onChange={cambiar('nombre')} error={avisos.nombre} />
          <FormField label={textos.invitar_apellido} name="persona-apellido" required value={datos.apellido} onChange={cambiar('apellido')} error={avisos.apellido} />
          <FormField label={textos.invitar_cuil} name="persona-cuil" required inputMode="numeric" value={datos.cuil} onChange={cambiar('cuil')} error={avisos.cuil} />
          <FormField label={textos.invitar_genero} name="persona-genero" type="select" required value={datos.genero} onChange={cambiar('genero')} error={avisos.genero}>
            <option value="">{textos.invitar_elegir}</option>
            {generos.map((uno) => (
              <option key={uno.codigo} value={uno.codigo}>{t.generos[uno.codigo] ?? uno.codigo}</option>
            ))}
          </FormField>
          <FormField label={textos.invitar_email} name="persona-email" type="email" required value={datos.email} onChange={cambiar('email')} error={avisos.email} />

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={cerrar} disabled={guardando}>
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
