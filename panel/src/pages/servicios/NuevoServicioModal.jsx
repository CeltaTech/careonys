import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useTiposDeDocumento } from '../../hooks/useTiposDeDocumento';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { mensajeDeError, errorDeLaRespuesta } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { PersonaModal } from '../personas/PersonaModal';

const API_URL = import.meta.env.VITE_API_URL;

// El valor del casillero de Cliente que dice que el Cliente nace junto con el Servicio.
const CLIENTE_NUEVO = 'nuevo';

const ORDEN_DE_LOS_CASILLEROS = ['cliente', 'contratante', 'paciente', 'etiqueta'];

/* El alta de un Servicio.
   ==========================================================================

   Un Servicio es de un Cliente. Se elige uno que ya existe, o se crea el Cliente junto con el
   Servicio a partir de dos personas del Directorio de Personas: quien contrata y quien recibe el
   cuidado. Si alguna de las dos todavía no existe, se carga ahí mismo con el alta del
   Directorio, que es la única que da de alta a una persona. */
export function NuevoServicioModal({ onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const prestadoraId = usePrestadoraActual();
  const documentos = useTiposDeDocumento(prestadoraId);
  const cargaFichas = esAdminOSuperior(usuario?.rol) || puede('editar_personas');

  const [clientes, setClientes] = useState([]);
  const [estadoClientes, setEstadoClientes] = useState('cargando');
  const [cliente, setCliente] = useState('');
  const [contratante, setContratante] = useState(null);
  const [paciente, setPaciente] = useState(null);
  const [etiqueta, setEtiqueta] = useState('');
  // Para qué casillero se está cargando una persona nueva: 'contratante', 'paciente' o null.
  const [fichaPara, setFichaPara] = useState(null);
  // Cambia cada vez que se carga una persona, para que las listas vuelvan a pedirle las personas a la base.
  const [vueltaDeFichas, setVueltaDeFichas] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [intentado, setIntentado] = useState(false);

  const cargarClientes = useCallback(async () => {
    setEstadoClientes('cargando');
    const { data, error: errorConsulta } = await supabase
      .from('clientes')
      .select('id, personas!clientes_contratante_de_la_misma_prestadora(nombre_visible)')
      .is('deleted_at', null);
    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstadoClientes('error');
      return;
    }
    const ordenados = (data ?? [])
      .map((fila) => ({ id: fila.id, nombre: fila.personas?.nombre_visible ?? '—' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setClientes(ordenados);
    setEstadoClientes('listo');
  }, [t]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  const esNuevo = cliente === CLIENTE_NUEVO;

  function avisosEnPantalla() {
    const avisos = {};
    if (!cliente) avisos.cliente = true;
    if (esNuevo && !contratante) avisos.contratante = true;
    if (esNuevo && !paciente) avisos.paciente = true;
    if (!etiqueta.trim()) avisos.etiqueta = true;
    return avisos;
  }

  const avisos = intentado ? avisosEnPantalla() : {};
  const avisoDe = (casillero) => (avisos[casillero] ? t.formularios.falta_un_dato_obligatorio : undefined);

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    const enPantalla = avisosEnPantalla();
    const primero = ORDEN_DE_LOS_CASILLEROS.find((casillero) => enPantalla[casillero]);
    if (primero) {
      setError(null);
      document.getElementById(`field-${primero}`)?.focus();
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/servicio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify(
          esNuevo
            ? { contratantePersonaId: contratante, pacientePersonaId: paciente, etiqueta: etiqueta.trim() }
            : { clienteId: cliente, etiqueta: etiqueta.trim() },
        ),
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      onCreado(resultado.servicioId);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  function selectorConAlta(casillero, valor, alElegir) {
    return (
      <>
        <SelectorDePersona
          key={`${casillero}-${vueltaDeFichas}`}
          name={casillero}
          label={t.servicios.nuevo[casillero]}
          required
          valor={valor}
          alElegir={alElegir}
          deshabilitado={guardando}
          error={avisoDe(casillero)}
        />
        {cargaFichas && (
          <Button variant="secondary" type="button" onClick={() => setFichaPara(casillero)} disabled={guardando}>
            {t.personas.nuevo_titulo}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="panel-modal-fondo" onClick={onClose}>
        <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
          <h2 id={modal.idTitulo}>{t.servicios.nuevo.boton}</h2>

          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit} noValidate>
            <FormField
              label={t.servicios.nuevo.cliente}
              name="cliente"
              type="select"
              required
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              disabled={guardando || estadoClientes !== 'listo'}
              error={avisoDe('cliente')}
            >
              <option value="">
                {estadoClientes === 'cargando' ? t.personas.selector_cargando : t.personas.selector_sin_elegir}
              </option>
              <option value={CLIENTE_NUEVO}>{t.servicios.nuevo.cliente_nuevo}</option>
              {clientes.map((uno) => (
                <option key={uno.id} value={uno.id}>{uno.nombre}</option>
              ))}
            </FormField>

            {esNuevo && selectorConAlta('contratante', contratante, setContratante)}
            {esNuevo && selectorConAlta('paciente', paciente, setPaciente)}

            <FormField
              label={t.servicios.nuevo.etiqueta}
              name="etiqueta"
              required
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              disabled={guardando}
              error={avisoDe('etiqueta')}
            />

            <div className="panel-modal-acciones">
              <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
                {t.comun.cancelar}
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? t.servicios.nuevo.creando : t.servicios.nuevo.crear}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {fichaPara && (
        <PersonaModal
          persona={null}
          prestadoraId={prestadoraId}
          tiposDeDocumento={documentos.porClase}
          onClose={() => setFichaPara(null)}
          onGuardado={(guardada) => {
            if (fichaPara === 'contratante') setContratante(guardada?.id ?? null);
            else setPaciente(guardada?.id ?? null);
            setFichaPara(null);
            setVueltaDeFichas((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
