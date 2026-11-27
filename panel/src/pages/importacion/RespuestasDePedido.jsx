import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { llamarApiImportacion, valoresDelHallazgo } from '../../lib/importacion';
import { usePersonasParaElegir } from '../../hooks/usePersonasParaElegir';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* Los pedidos de dato que se contestan con una acción propia.
   ==========================================================================

   · persona: no se sabe de quién es el renglón. Se elige la clase y la persona de la lista.
   · hallazgo: la IA encontró en un documento una medicación o los valores normales de un signo
     vital. Se revisan los valores y se confirma o se descarta; nada entra solo.
   · receta: la medicación importada no trae receta. Se sube el archivo.
   · firma_medicacion: la medicación importada no trae la firma de la familia. Se marca resuelto
     cuando la firma ya se cerró por el camino de siempre.
   · renglones: la cuenta de renglones del archivo no cierra. Se da conformidad.

   Cada respuesta manda lo que pide el backend y, además, el mismo dato bajo `valor`, que es como
   se contestan los pedidos de siempre. */

const CLASES_DE_PERSONA = ['paciente', 'asistente', 'cliente'];
const CLAVE_DE_LA_PERSONA = { paciente: 'pacienteId', asistente: 'asistenteId', cliente: 'clienteId' };

function useResponder(pedido, alResponder) {
  const { t } = useLocale();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function responder(cuerpo) {
    setGuardando(true);
    setError(null);
    try {
      await llamarApiImportacion(`/pedidos/${encodeURIComponent(pedido.id)}/responder`, {
        method: 'POST',
        body: JSON.stringify({ valor: cuerpo, ...cuerpo }),
      });
      alResponder();
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedido de dato'));
    } finally {
      setGuardando(false);
    }
  }

  return { guardando, setGuardando, error, setError, responder };
}

function RespuestaDePersona({ pedido, alResponder }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const nombre = `pedido-${pedido.id}`;
  const { estado, listas } = usePersonasParaElegir(CLASES_DE_PERSONA);
  const [clase, setClase] = useState('paciente');
  const [personaId, setPersonaId] = useState('');
  const [intentado, setIntentado] = useState(false);
  const { guardando, error, responder } = useResponder(pedido, alResponder);
  const falta = intentado && !personaId;

  function guardar(e) {
    e.preventDefault();
    setIntentado(true);
    if (!personaId) {
      document.getElementById(`field-${nombre}-persona`)?.focus();
      return;
    }
    responder({ [CLAVE_DE_LA_PERSONA[clase]]: personaId });
  }

  return (
    <form onSubmit={guardar} noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      {estado === 'error' && <Alert variant="error">{t.comun.error_generico}</Alert>}
      <div className="molde-formgrid">
        <FormField
          label={textos.persona_clase}
          name={`${nombre}-clase`}
          type="select"
          required
          value={clase}
          onChange={(e) => {
            setClase(e.target.value);
            setPersonaId('');
          }}
          disabled={guardando}
        >
          {CLASES_DE_PERSONA.map((una) => (
            <option key={una} value={una}>{textos.personas[una]}</option>
          ))}
        </FormField>
        <FormField
          label={textos.persona_elegida}
          name={`${nombre}-persona`}
          type="select"
          required
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          disabled={guardando || estado !== 'listo'}
          error={falta ? t.formularios.falta_un_dato_obligatorio : undefined}
        >
          <option value="">{estado === 'cargando' ? t.comun.cargando : textos.sin_elegir}</option>
          {(listas[clase] ?? []).map((persona) => (
            <option key={persona.id} value={persona.id}>{persona.nombre}</option>
          ))}
        </FormField>
      </div>
      <div className="molde-acciones">
        <Button type="submit" disabled={guardando || estado !== 'listo'}>
          {guardando ? textos.guardando : textos.guardar}
        </Button>
      </div>
    </form>
  );
}

function RespuestaDeHallazgo({ pedido, alResponder }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const nombre = `pedido-${pedido.id}`;
  const hallazgo = pedido.hallazgo ?? null;
  const [valores, setValores] = useState(() => valoresDelHallazgo(hallazgo));
  const [decision, setDecision] = useState(null);
  const { guardando, error, responder } = useResponder(pedido, alResponder);
  const donde = hallazgo?.donde;

  function etiquetaDe(clave) {
    return t.importacion[`campo_${clave}`] || clave;
  }

  function contestar(confirmar) {
    setDecision(confirmar ? 'confirmar' : 'descartar');
    responder(confirmar ? { confirmar: true, valores } : { confirmar: false });
  }

  return (
    <div>
      {donde && (donde.pagina != null || donde.fragmento) && (
        <p className="panel-mini">
          {donde.pagina != null
            ? con(textos.hallazgo_donde, { pagina: donde.pagina, fragmento: donde.fragmento ?? '' })
            : donde.fragmento}
        </p>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="molde-formgrid">
        {Object.keys(valores).map((clave) => (
          <FormField
            key={clave}
            label={etiquetaDe(clave)}
            name={`${nombre}-${clave}`}
            value={valores[clave] == null ? '' : String(valores[clave])}
            onChange={(e) => setValores((previos) => ({ ...previos, [clave]: e.target.value }))}
            disabled={guardando}
          />
        ))}
      </div>
      <div className="molde-acciones">
        <Button variant="secondary" onClick={() => contestar(false)} disabled={guardando}>
          {guardando && decision === 'descartar' ? textos.guardando : textos.hallazgo_descartar}
        </Button>
        <Button onClick={() => contestar(true)} disabled={guardando}>
          {guardando && decision === 'confirmar' ? textos.guardando : textos.hallazgo_confirmar}
        </Button>
      </div>
    </div>
  );
}

function RespuestaDeReceta({ pedido, alResponder }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const nombre = `pedido-${pedido.id}`;
  const [archivo, setArchivo] = useState(null);
  const [intentado, setIntentado] = useState(false);
  const { guardando, setGuardando, error, setError } = useResponder(pedido, alResponder);

  async function guardar(e) {
    e.preventDefault();
    setIntentado(true);
    if (!archivo) {
      document.getElementById(`field-${nombre}-archivo`)?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', archivo);
      await llamarApiImportacion(`/pedidos/${encodeURIComponent(pedido.id)}/archivo`, { method: 'POST', body: cuerpo });
      alResponder();
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedido de dato'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      <FormField
        label={textos.receta_archivo}
        name={`${nombre}-archivo`}
        type="file"
        required
        onChange={(e) => setArchivo(e.target.files?.[0] || null)}
        disabled={guardando}
        error={intentado && !archivo ? t.formularios.falta_un_dato_obligatorio : undefined}
      />
      <div className="molde-acciones">
        <Button type="submit" disabled={guardando}>
          {guardando ? textos.guardando : textos.receta_subir}
        </Button>
      </div>
    </form>
  );
}

function RespuestaDeUnBoton({ pedido, alResponder, cuerpo, etiqueta }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const { guardando, error, responder } = useResponder(pedido, alResponder);
  return (
    <div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="molde-acciones">
        <Button onClick={() => responder(cuerpo)} disabled={guardando}>
          {guardando ? textos.guardando : etiqueta}
        </Button>
      </div>
    </div>
  );
}

/** La respuesta de un pedido de clase persona, hallazgo, receta, firma_medicacion o renglones. */
export function RespuestaDePedido({ pedido, alResponder }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  if (pedido.dato === 'persona') return <RespuestaDePersona pedido={pedido} alResponder={alResponder} />;
  if (pedido.dato === 'hallazgo') return <RespuestaDeHallazgo pedido={pedido} alResponder={alResponder} />;
  if (pedido.dato === 'receta') return <RespuestaDeReceta pedido={pedido} alResponder={alResponder} />;
  if (pedido.dato === 'firma_medicacion') {
    return <RespuestaDeUnBoton pedido={pedido} alResponder={alResponder} cuerpo={{ resuelto: true }} etiqueta={textos.firma_resuelta} />;
  }
  return <RespuestaDeUnBoton pedido={pedido} alResponder={alResponder} cuerpo={{ conforme: true }} etiqueta={textos.renglones_conforme} />;
}
