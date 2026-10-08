import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePaises } from '../../hooks/usePaises';
import { CamposDeDomicilio } from '../../components/domicilio/CamposDeDomicilio';
import { DOMICILIO_VACIO, partesDesdeFila, partesParaGuardar } from '../../lib/partesDeDomicilio';
import { avisosDelDocumento, nombreDelTipo, normalizarDni, normalizarNumero } from '../../lib/documentoDeIdentidad';
import { useGeneros } from '../../hooks/useGeneros';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { TelefonosDeLaPersona } from './TelefonosDeLaPersona';
import { cargarUnTelefono } from '../../lib/apiPersonasTelefonos';

/* El alta y la corrección de una Ficha de Persona.
   ==========================================================================

   El mismo formulario para las dos cosas, porque los datos que se piden son los mismos: cargar una
   Persona y corregir cómo está cargada no son dos tareas distintas.

   LA CLASE CAMBIA LOS CASILLEROS. Una persona física tiene nombre y apellido; una jurídica tiene
   razón social y no tiene apellido. Y cada clase tiene sus propios documentos, que salen del
   catálogo del país y no de acá.

   EL DOCUMENTO ES OBLIGATORIO, y es lo que la distingue de otra con el mismo nombre. Los que se
   emiten afuera piden además el país que lo emitió, porque el mismo número de pasaporte puede
   existir en dos países. Lo que está mal se avisa al pie de su casillero al apretar Guardar, y
   el aviso se va en cuanto el dato se corrige.

   Y LA JURÍDICA TIENE APODERADO. Una entidad no firma con la mano: firma por ella quien tiene
   poder legal para obligarla. Se anota acá y no en cada contratación, para que el día que haya que
   firmar ya esté puesto. No otorga ningún permiso: quien figure ahí no gana acceso a nada.

   LOS TELÉFONOS SON VARIOS, y por eso no están entre los casilleros. Al dar de alta se pide uno,
   que es lo que se sabe en ese momento; corrigiendo aparece la lista entera, con los que haya, y
   ahí se agregan, se corrigen y se sacan. Cuál es el preferido para llamar no se elige: es el que
   esa Persona usa en su cuenta.

   NO HAY BOTÓN DE BORRAR, y tampoco lo va a haber. Una Ficha queda con el historial de cómo se
   comportó esa persona en cada rol que desempeñó, y con quien dejó de ser Cliente se vuelve a
   cruzar. La base también lo rechaza, por si alguna pantalla lo intentara igual. */

// Lo que rechaza la base y tiene casillero propio: el aviso va al pie de ese casillero y no a un
// cartel arriba. `23505` es el documento repetido, que sólo la base puede saber.
const AVISO_DE_LA_BASE = {
  falta_el_documento: ['documento_tipo', 'falta_el_documento'],
  numero_no_valido: ['documento_numero', 'numero_no_valido'],
  falta_el_pais_del_documento: ['documento_pais', 'falta_el_pais'],
  falta_el_dni: ['dni', 'falta_el_dni'],
  dni_no_coincide: ['dni', 'dni_no_coincide'],
  falta_el_genero: ['genero', 'falta_el_genero'],
  genero_no_corresponde: ['genero', 'genero_no_reconocido'],
  23505: ['documento_numero', 'documento_repetido'],
};

// En el orden en que aparecen, para saltar al primero que tenga aviso.
const ORDEN_DE_LOS_CASILLEROS = ['nombre', 'apellido', 'genero', 'documento_tipo', 'documento_numero', 'dni', 'documento_pais'];

export function PersonaModal({ persona, prestadoraId, tiposDeDocumento, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { paises } = usePaises();
  const corrigiendo = Boolean(persona);

  const [clase, setClase] = useState(persona?.clase ?? 'fisica');
  const [nombre, setNombre] = useState(persona?.nombre ?? '');
  const [apellido, setApellido] = useState(persona?.apellido ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(persona?.fecha_nacimiento ?? '');
  const [documentoTipo, setDocumentoTipo] = useState(persona?.documento_tipo ?? '');
  const [documentoNumero, setDocumentoNumero] = useState(persona?.documento_numero ?? '');
  const [documentoPais, setDocumentoPais] = useState(persona?.documento_pais ?? '');
  const [dni, setDni] = useState(persona?.dni ?? '');
  const [genero, setGenero] = useState(persona?.genero ?? '');
  const { generos } = useGeneros(prestadoraId);
  // Sólo sirve en el alta. La Ficha ya cargada no trae ningún teléfono adentro: los tiene aparte,
  // porque son varios.
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState(persona?.email ?? '');
  const [notas, setNotas] = useState(persona?.notas ?? '');
  const [apoderado, setApoderado] = useState(persona?.apoderado_persona_id ?? null);
  const [domicilio, setDomicilio] = useState(persona ? partesDesdeFila(persona) : DOMICILIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  // Hasta que se aprieta Guardar no se avisa nada: un casillero al que no le llegó el turno no
  // está mal, está vacío. Después, los avisos se recalculan con cada tecla y se van solos.
  const [intentado, setIntentado] = useState(false);
  // Lo que dijo la base al guardar. Vale para el documento con que se guardó, y se olvida en
  // cuanto se toca el documento.
  const [avisoDeLaBase, setAvisoDeLaBase] = useState(null);

  const tipos = tiposDeDocumento?.[clase] ?? [];
  const tipo = tipos.find((uno) => uno.codigo === documentoTipo) ?? null;
  const esJuridica = clase === 'juridica';

  function avisosEnPantalla() {
    const avisos = {};
    if (!nombre.trim()) avisos.nombre = 'falta_el_dato';
    if (!esJuridica && !apellido.trim()) avisos.apellido = 'falta_el_dato';
    return Object.assign(
      avisos,
      avisosDelDocumento({ tipo, numero: documentoNumero, pais: documentoPais, dni, genero, pideGenero: !esJuridica }),
    );
  }

  const avisos = intentado ? avisosEnPantalla() : {};
  if (avisoDeLaBase && !avisos[avisoDeLaBase[0]]) avisos[avisoDeLaBase[0]] = avisoDeLaBase[1];
  const TEXTO_DEL_AVISO = {
    falta_el_dato: t.formularios.falta_un_dato_obligatorio,
    falta_el_pais: t.formularios.falta_un_dato_obligatorio,
    falta_el_documento: t.personas.falta_el_documento,
    numero_no_valido: t.personas.numero_no_valido,
    documento_repetido: t.personas.documento_repetido,
    falta_el_dni: t.personas.falta_el_dni,
    dni_no_coincide: t.personas.dni_no_coincide,
    falta_el_genero: t.personas.falta_el_genero,
    genero_no_reconocido: t.personas.genero_no_reconocido,
  };
  const avisoDe = (casillero) => (avisos[casillero] ? TEXTO_DEL_AVISO[avisos[casillero]] : undefined);

  function saltarAlPrimero(conAviso) {
    const primero = ORDEN_DE_LOS_CASILLEROS.find((casillero) => conAviso[casillero]);
    if (primero) document.getElementById(`field-${primero}`)?.focus();
  }

  function cambiarDocumento(cambiar) {
    return (valor) => {
      cambiar(valor);
      setAvisoDeLaBase(null);
    };
  }

  function cambiarClase(nueva) {
    setClase(nueva);
    // El documento elegido pertenece a la lista de la clase anterior: dejarlo puesto guardaría un
    // tipo que no le corresponde a esta Persona.
    setDocumentoTipo('');
    setDocumentoPais('');
    setAvisoDeLaBase(null);
    // Una entidad no nace: la base rechaza la fecha en una jurídica.
    // El DNI y el género son de la persona física.
    if (nueva === 'juridica') {
      setApellido('');
      setFechaNacimiento('');
      setDni('');
      setGenero('');
    }
    // Una persona física se representa sola, así que el Apoderado que hubiera quedado elegido no
    // le corresponde. La base lo rechaza igual, pero enterarse al guardar sería enterarse tarde.
    if (nueva !== 'juridica') setApoderado(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIntentado(true);
    setAvisoDeLaBase(null);

    const enPantalla = avisosEnPantalla();
    if (Object.keys(enPantalla).length > 0) {
      saltarAlPrimero(enPantalla);
      return;
    }

    setGuardando(true);
    try {
      const partes = partesParaGuardar(domicilio);
      const fila = {
        clase,
        nombre: nombre.trim(),
        apellido: esJuridica ? null : apellido.trim(),
        fecha_nacimiento: esJuridica ? null : fechaNacimiento || null,
        documento_tipo: documentoTipo,
        documento_numero: normalizarNumero(documentoNumero, tipo.verifica_modulo_11),
        documento_pais: tipo.lleva_pais ? documentoPais : null,
        dni: tipo.contiene_dni ? normalizarDni(dni) : null,
        genero: esJuridica ? null : genero,
        email: email.trim() || null,
        notas: notas.trim() || null,
        apoderado_persona_id: esJuridica ? apoderado || null : null,
        ...partes,
      };

      // Se escribe derecho contra la base: quién puede cargar y corregir lo decide la política.
      // La Prestadora va en el alta y la política comprueba que sea la de quien está trabajando;
      // en la corrección no viaja, porque una Ficha no cambia de Prestadora.
      //
      // Y vuelve la fila guardada, porque quien abrió este formulario desde otro casillero
      // necesita saber cuál Ficha quedó cargada para señalarla ahí mismo.
      const { data: guardado, error: errorGuardar } = corrigiendo
        ? await supabase.from('personas').update(fila).eq('id', persona.id).select('id, nombre_visible').single()
        : await supabase.from('personas').insert({ ...fila, prestadora_id: prestadoraId }).select('id, nombre_visible').single();
      if (errorGuardar) {
        const deLaBase = AVISO_DE_LA_BASE[errorGuardar.code === '23505' ? '23505' : errorGuardar.message];
        if (deLaBase) {
          setAvisoDeLaBase(deLaBase);
          saltarAlPrimero({ [deLaBase[0]]: true });
          return;
        }
        throw errorGuardar;
      }

      // El teléfono del alta se carga recién con la Ficha creada, porque cuelga de ella. En la
      // corrección no pasa por acá: ahí está la lista entera, que se maneja sola.
      if (!corrigiendo && telefono.trim()) {
        await cargarUnTelefono(guardado.id, telefono.trim());
      }

      onGuardado(guardado);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{corrigiendo ? t.comun.editar : t.personas.nuevo_titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label={t.personas.clase}
            name="clase"
            type="select"
            required
            value={clase}
            onChange={(e) => cambiarClase(e.target.value)}
            disabled={guardando}
          >
            <option value="fisica">{t.personas.clase_fisica}</option>
            <option value="juridica">{t.personas.clase_juridica}</option>
          </FormField>

          <FormField
            label={esJuridica ? t.personas.razon_social : t.personas.nombre}
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            error={avisoDe('nombre')}
          />
          {!esJuridica && (
            <FormField
              label={t.personas.apellido}
              name="apellido"
              required
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              disabled={guardando}
              error={avisoDe('apellido')}
            />
          )}
          {!esJuridica && (
            <FormField
              label={t.clientes.fecha_nacimiento}
              name="fecha_nacimiento"
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              disabled={guardando}
            />
          )}
          {!esJuridica && (
            <FormField
              label={t.personas.genero}
              name="genero"
              type="select"
              required
              value={genero}
              onChange={(e) => cambiarDocumento(setGenero)(e.target.value)}
              disabled={guardando}
              error={avisoDe('genero')}
            >
              <option value="">{t.personas.selector_sin_elegir}</option>
              {generos.map((uno) => (
                <option key={uno.codigo} value={uno.codigo}>{t.generos[uno.codigo] ?? uno.codigo}</option>
              ))}
            </FormField>
          )}

          <FormField
            label={t.personas.documento_tipo}
            name="documento_tipo"
            type="select"
            required
            value={documentoTipo}
            onChange={(e) => cambiarDocumento(setDocumentoTipo)(e.target.value)}
            disabled={guardando}
            error={avisoDe('documento_tipo')}
          >
            <option value="">{t.personas.selector_sin_elegir}</option>
            {tipos.map((uno) => (
              <option key={uno.codigo} value={uno.codigo}>{nombreDelTipo(uno, t.personas.tipos_de_documento)}</option>
            ))}
          </FormField>
          <FormField
            label={t.personas.documento_numero}
            name="documento_numero"
            required
            value={documentoNumero}
            onChange={(e) => cambiarDocumento(setDocumentoNumero)(e.target.value)}
            disabled={guardando}
            error={avisoDe('documento_numero')}
          />
          {tipo?.contiene_dni && (
            <FormField
              label={t.personas.dni}
              name="dni"
              required
              inputMode="numeric"
              value={dni}
              onChange={(e) => cambiarDocumento(setDni)(e.target.value)}
              disabled={guardando}
              error={avisoDe('dni')}
            />
          )}
          {tipo?.lleva_pais && (
            <FormField
              label={t.personas.documento_pais}
              name="documento_pais"
              type="select"
              required
              value={documentoPais}
              onChange={(e) => cambiarDocumento(setDocumentoPais)(e.target.value)}
              disabled={guardando}
              error={avisoDe('documento_pais')}
            >
              <option value="">{t.personas.selector_sin_elegir}</option>
              {paises.map((pais) => (
                <option key={pais.codigo} value={pais.codigo}>{pais.nombre}</option>
              ))}
            </FormField>
          )}

          {/* Quién firma por esta entidad. Se elige del Directorio y es siempre una persona física:
              el poder legal lo ejerce alguien de carne y hueso. */}
          {esJuridica && (
            <SelectorDePersona
              name="apoderado_persona_id"
              label={t.personas.apoderado}
              valor={apoderado}
              alElegir={setApoderado}
              clase="fisica"
              deshabilitado={guardando}
            />
          )}

          <CamposDeDomicilio valor={domicilio} alCambiar={setDomicilio} deshabilitado={guardando} />

          {/* En el alta, un casillero: es el teléfono que se tiene a mano en ese momento. Los
              demás se agregan después, con la Ficha ya creada. */}
          {!corrigiendo && (
            <FormField
              label={t.personas.telefono}
              name="telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              disabled={guardando}
            />
          )}
          <FormField
            label={t.personas.email}
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={guardando}
          />
          <FormField
            label={t.personas.notas}
            name="notas"
            type="textarea"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            disabled={guardando}
          />

          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? t.personas.guardando : t.personas.guardar}
            </Button>
          </div>
        </form>

        {/* Afuera del formulario a propósito: cada teléfono se carga, se corrige y se saca solo, y
            no espera al botón de guardar de la Ficha. */}
        {corrigiendo && <TelefonosDeLaPersona personaId={persona.id} puedeEditar />}
      </div>
    </div>
  );
}
