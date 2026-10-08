import { useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { useModalidades } from '../../context/ModalidadesContext';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { ElegirLugares } from '../../components/lugares/ElegirLugares';
import { mensajeDeError, errorDeLaRespuesta } from '../../lib/errores';
import { modalidadesHabilitadas, mensajeDeModalidad } from '../../lib/modalidades';
import { nombreTipo } from '../../lib/tiposAsistente';
import { useTiposAsistente } from '../../hooks/useTiposAsistente';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { CamposDeDomicilio } from '../../components/domicilio/CamposDeDomicilio';
import { DOMICILIO_VACIO, partesParaGuardar } from '../../lib/partesDeDomicilio';
import { avisosDelDocumento, nombreDelTipo, normalizarDni, normalizarNumero } from '../../lib/documentoDeIdentidad';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useTiposDeDocumento } from '../../hooks/useTiposDeDocumento';
import { useGeneros } from '../../hooks/useGeneros';
import { usePaises } from '../../hooks/usePaises';

const API_URL = import.meta.env.VITE_API_URL;

// Lo que el backend rechaza y tiene casillero propio: el aviso va al pie de ese casillero.
const CASILLERO_DEL_MOTIVO = {
  falta_el_documento: 'documento_numero',
  numero_no_valido: 'documento_numero',
  legajo_repetido: 'documento_numero',
  falta_el_dni: 'dni',
  dni_no_coincide: 'dni',
  falta_el_genero: 'genero',
  genero_no_reconocido: 'genero',
};

// En el orden en que aparecen, para saltar al primero que tenga aviso.
const ORDEN_DE_LOS_CASILLEROS = ['nombre', 'genero', 'documento_tipo', 'documento_numero', 'dni', 'documento_pais', 'email'];

export function NuevoAsistenteModal({ onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { porClase } = useTiposDeDocumento(prestadoraId);
  const { generos } = useGeneros(prestadoraId);
  const { paises } = usePaises();
  const [nombre, setNombre] = useState('');
  const [genero, setGenero] = useState('');
  const [documentoTipo, setDocumentoTipo] = useState('');
  const [documentoNumero, setDocumentoNumero] = useState('');
  const [documentoPais, setDocumentoPais] = useState('');
  const [dni, setDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [domicilio, setDomicilio] = useState(DOMICILIO_VACIO);
  const [tipoAsistenteId, setTipoAsistenteId] = useState('');
  /* Dónde acepta trabajar. Se guarda cuál de los lugares de la Prestadora, nunca el nombre
     tecleado: escrito a mano, «Villa Urquiza» y «villa urquiza» son dos lugares distintos y
     ninguna búsqueda los junta. Puede quedar vacío en el alta y cargarse después en el Legajo del Asistente. */
  const [lugares, setLugares] = useState([]);
  const { paraElegir: tiposAsistente } = useTiposAsistente();
  const { modalidades } = useModalidades();

  /* Las formas de recibir trabajo que la Prestadora tiene activas. Arrancan todas marcadas:
     es lo mismo que haría la base si el alta no dijera nada, y así queda a la vista antes de
     crear a la persona, en vez de descubrirlo después en el Legajo del Asistente. */
  const modalidadesPosibles = useMemo(() => modalidadesHabilitadas(modalidades), [modalidades]);
  const [elegidas, setElegidas] = useState(null);
  const modalidadesMarcadas = elegidas ?? modalidadesPosibles;

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  // Hasta que se aprieta Guardar no se avisa nada; después los avisos se recalculan solos.
  const [intentado, setIntentado] = useState(false);
  // Lo que rechazó el backend: [casillero, motivo]. Se olvida en cuanto se toca la identidad.
  const [avisoDelBackend, setAvisoDelBackend] = useState(null);

  const tipos = porClase.fisica;
  const tipo = tipos.find((uno) => uno.codigo === documentoTipo) ?? null;

  function avisosEnPantalla() {
    const avisos = {};
    if (!nombre.trim()) avisos.nombre = 'falta_el_dato';
    if (!email.trim()) avisos.email = 'falta_el_dato';
    return Object.assign(
      avisos,
      avisosDelDocumento({ tipo, numero: documentoNumero, pais: documentoPais, dni, genero, pideGenero: true }),
    );
  }

  const avisos = intentado ? avisosEnPantalla() : {};
  if (avisoDelBackend && !avisos[avisoDelBackend[0]]) avisos[avisoDelBackend[0]] = avisoDelBackend[1];
  const TEXTO_DEL_AVISO = {
    falta_el_dato: t.formularios.falta_un_dato_obligatorio,
    falta_el_pais: t.formularios.falta_un_dato_obligatorio,
    falta_el_documento: t.personas.falta_el_documento,
    numero_no_valido: t.personas.numero_no_valido,
    falta_el_dni: t.personas.falta_el_dni,
    dni_no_coincide: t.personas.dni_no_coincide,
    falta_el_genero: t.personas.falta_el_genero,
    genero_no_reconocido: t.personas.genero_no_reconocido,
    legajo_repetido: t.errores.motivos.legajo_repetido,
  };
  const avisoDe = (casillero) => (avisos[casillero] ? TEXTO_DEL_AVISO[avisos[casillero]] : undefined);

  function saltarAlPrimero(conAviso) {
    const primero = ORDEN_DE_LOS_CASILLEROS.find((casillero) => conAviso[casillero]);
    if (primero) document.getElementById(`field-${primero}`)?.focus();
  }

  function cambiarIdentidad(cambiar) {
    return (e) => {
      cambiar(e.target.value);
      setAvisoDelBackend(null);
    };
  }

  function alternarModalidad(modalidad) {
    setElegidas(
      modalidadesMarcadas.includes(modalidad)
        ? modalidadesMarcadas.filter((m) => m !== modalidad)
        : [...modalidadesMarcadas, modalidad],
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    setAvisoDelBackend(null);
    const enPantalla = avisosEnPantalla();
    if (Object.keys(enPantalla).length > 0) {
      setError(null);
      saltarAlPrimero(enPantalla);
      return;
    }
    if (modalidadesMarcadas.length === 0) {
      setError(t.modalidades.falta_elegir);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/asistente-directo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({
          nombre,
          documento_tipo: documentoTipo,
          documento_numero: normalizarNumero(documentoNumero, tipo.verifica_modulo_11),
          documento_pais: tipo.lleva_pais ? documentoPais : null,
          dni: tipo.contiene_dni ? normalizarDni(dni) : null,
          genero,
          telefono,
          email,
          domicilioPartido: partesParaGuardar(domicilio),
          tipo_asistente_id: tipoAsistenteId || null,
          lugares,
          modalidades: modalidadesMarcadas,
        }),
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        throw errorDeLaRespuesta(respuesta, resultado);
      }
      onCreado();
    } catch (err) {
      const casillero = CASILLERO_DEL_MOTIVO[err.motivo];
      if (casillero) {
        setAvisoDelBackend([casillero, err.motivo]);
        saltarAlPrimero({ [casillero]: true });
        return;
      }
      setError(mensajeDeModalidad(err, t.modalidades) ?? mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.asistentes.nuevo.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label={t.asistentes.col_nombre}
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            error={avisoDe('nombre')}
          />
          <FormField
            label={t.asistentes.genero}
            name="genero"
            type="select"
            required
            value={genero}
            onChange={cambiarIdentidad(setGenero)}
            disabled={guardando}
            error={avisoDe('genero')}
          >
            <option value="">{t.personas.selector_sin_elegir}</option>
            {generos.map((uno) => (
              <option key={uno.codigo} value={uno.codigo}>{t.generos[uno.codigo] ?? uno.codigo}</option>
            ))}
          </FormField>
          <FormField
            label={t.personas.documento_tipo}
            name="documento_tipo"
            type="select"
            required
            value={documentoTipo}
            onChange={cambiarIdentidad(setDocumentoTipo)}
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
            onChange={cambiarIdentidad(setDocumentoNumero)}
            disabled={guardando}
            error={avisoDe('documento_numero')}
          />
          {tipo?.contiene_dni && (
            <FormField
              label={t.asistentes.dni}
              name="dni"
              required
              inputMode="numeric"
              value={dni}
              onChange={cambiarIdentidad(setDni)}
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
              onChange={cambiarIdentidad(setDocumentoPais)}
              disabled={guardando}
              error={avisoDe('documento_pais')}
            >
              <option value="">{t.personas.selector_sin_elegir}</option>
              {paises.map((pais) => (
                <option key={pais.codigo} value={pais.codigo}>{pais.nombre}</option>
              ))}
            </FormField>
          )}
          <FormField label={t.asistentes.telefono} name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={guardando} />
          <FormField
            label={t.asistentes.email}
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={guardando}
            error={avisoDe('email')}
          />
          {/* Opcional: si no se sabe al dar de alta, se carga después desde el legajo. */}
          <CamposDeDomicilio valor={domicilio} alCambiar={setDomicilio} deshabilitado={guardando} />
          <FormField label={t.asistentes.col_tipo} name="tipo_asistente_id" type="select" value={tipoAsistenteId} onChange={(e) => setTipoAsistenteId(e.target.value)}>
            <option value="">{t.asistentes.tipo_sin_asignar}</option>
            {tiposAsistente.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
            ))}
          </FormField>
          <h3>{t.configuracion.lugares_elegir_titulo}</h3>
          <ElegirLugares valor={lugares} onChange={setLugares} deshabilitado={guardando} />

          <h3>{t.modalidades.etiqueta}</h3>
          {modalidadesPosibles.map((modalidad) => (
            <FormField
              key={modalidad}
              label={t.modalidades[modalidad]}
              name={`modalidad_${modalidad}`}
              type="checkbox"
              checked={modalidadesMarcadas.includes(modalidad)}
              onChange={() => alternarModalidad(modalidad)}
            />
          ))}


          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? t.asistentes.nuevo.creando : t.asistentes.nuevo.crear}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
