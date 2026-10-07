import { useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useMotivosDeResolucion } from '../hooks/useMotivosDeResolucion';
import { resolver } from '../lib/resoluciones';
import { esAdminOSuperior } from '../lib/roles';
import { linkWhatsapp } from '../lib/telefono';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { Cabecera } from '../components/ui/Cabecera';
import { claseBadge } from '../lib/tonos';
import { useCatalogoDeLugares } from '../hooks/useCatalogoDeLugares';
import { ElegirUnLugar } from '../components/lugares/ElegirUnLugar';
import { AsistentesSugeridos } from './solicitudes/AsistentesSugeridos';
import { NuevaGuardiaModal } from './guardias/NuevaGuardiaModal';
import '../styles/molde-paginas.css';
import './hojaDeTarjetas.css';

// Qué se resuelve en esta pantalla. Es el nombre guardado de la tabla, y con él salen los motivos
// del catálogo de la Prestadora y se escribe la resolución.
const TABLA = 'solicitudes';
// El estado en el que queda una Solicitud que ya tiene su Guardia armada. Es lo único que esta
// pantalla nombra de los estados, porque es el que ella misma resuelve sin preguntar; el motivo
// con el que se resuelve sale igual del catálogo.
const ESTADO_ASIGNADA = 'asignada';
const API_URL = import.meta.env.VITE_API_URL;

export function SolicitudDetalle({ solicitud, onClose, onActualizada }) {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const prestadoraId = usePrestadoraActual();
  // Los motivos de esta Prestadora para resolver una Solicitud. En qué estado queda lo dice el
  // motivo elegido, así que acá no hay ninguna lista de estados escrita.
  const {
    filas: motivos,
    estado: estadoMotivos,
    error: errorMotivos,
    recargar: recargarMotivos,
  } = useMotivosDeResolucion(prestadoraId, TABLA);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const motivoElegido = useMemo(
    () => motivos.find((motivo) => motivo.id === motivoId) ?? null,
    [motivos, motivoId],
  );
  // Con cuál se resuelve sola la Solicitud que acaba de quedar con su Guardia armada.
  const motivoDeAsignada = useMemo(
    // Uno que no pida escribir qué pasó: nadie va a estar ahí para escribirlo.
    () => motivos.find((motivo) => motivo.estado === ESTADO_ASIGNADA && !motivo.pide_detalle) ?? null,
    [motivos],
  );
  const [nota, setNota] = useState(solicitud.nota_interna || '');
  // Qué lugar de la lista es el que dijo quien llamó. Son dos cosas distintas y por eso se guardan
  // aparte: `localidad` es lo que se escuchó, y esto es lo que se entendió. Sin esto, el Cliente
  // que nazca de esta Solicitud arranca sin localidad y no la encuentra ninguna búsqueda.
  const [lugar, setLugar] = useState(solicitud.lugar_id || '');
  const catalogo = useCatalogoDeLugares();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [errorConversion, setErrorConversion] = useState(null);
  // Qué Asistente y qué Pacientes se eligieron en la lista de sugeridos, mientras la ventana de
  // guardia nueva está abierta. En nulo, esa ventana no está.
  const [guardiaNueva, setGuardiaNueva] = useState(null);
  const [tab, setTab] = useState('detalle');

  // Una Solicitud con una guardia asignada ya no es una Solicitud nueva ni en gestión, y que ese
  // estado lo tenga que mover alguien a mano es pedirle a una persona que copie lo que el sistema
  // acaba de ver. Queda resuelta con el motivo del catálogo que deja la Solicitud asignada, y la
  // firma es de quien armó la guardia. Si la resolución falla, la guardia quedó creada igual: se
  // avisa y la ventana no se cierra, para que se pueda resolver a mano ahí mismo.
  async function guardiaCreada() {
    setGuardiaNueva(null);
    if (solicitud.estado === ESTADO_ASIGNADA) {
      onActualizada();
      return;
    }

    if (!motivoDeAsignada) {
      setError(t.comun.error_generico);
      return;
    }

    const { error: errorResolucion } = await resolver({
      tabla: TABLA,
      filaId: solicitud.id,
      motivoId: motivoDeAsignada.id,
    });

    if (errorResolucion) {
      setError(mensajeDeError(errorResolucion, t));
      return;
    }

    onActualizada();
  }

  async function handleConvertirEnCliente() {
    const confirmado = await confirmarDestructivo(t.solicitudes.confirmar_convertir_cliente);
    if (!confirmado) return;

    setConvirtiendo(true);
    setErrorConversion(null);

    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/cliente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ solicitudId: solicitud.id }),
      });
      const resultado = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      onActualizada();
    } catch (err) {
      setErrorConversion(mensajeDeError(err, t));
    } finally {
      setConvirtiendo(false);
    }
  }

  async function handleGuardar() {
    // Resolver no es pisar el estado: es dejar escrito por qué se decidió y quién lo decidió. El
    // estado en el que queda sale del motivo, nunca de esta pantalla.
    const nuevoEstado = motivoElegido?.estado ?? null;
    const cambiaElEstado = Boolean(nuevoEstado) && nuevoEstado !== solicitud.estado;

    if (cambiaElEstado) {
      const confirmado = await confirmarDestructivo(t.solicitudes.confirmar_cambio_estado);
      if (!confirmado) return;
    }

    setGuardando(true);
    setError(null);

    if (motivoElegido) {
      const { error: errorResolucion } = await resolver({
        tabla: TABLA,
        filaId: solicitud.id,
        motivoId: motivoElegido.id,
        detalle: motivoElegido.pide_detalle ? detalle.trim() : null,
      });

      if (errorResolucion) {
        setError(mensajeDeError(errorResolucion, t));
        setGuardando(false);
        return;
      }
    }

    // Lo que se anotó y qué lugar se reconoció son otra cosa que la decisión, y se guardan aparte.
    const { error: errorUpdate } = await supabase
      .from('solicitudes')
      .update({ nota_interna: nota, lugar_id: lugar || null })
      .eq('id', solicitud.id);

    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      setGuardando(false);
      return;
    }

    setGuardando(false);
    onActualizada();
  }

  const esAdmin = esAdminOSuperior(usuario?.rol);
  const estadoDeLaSolicitud = solicitud.estado || 'nueva';
  const datosDeLaSolicitud = [
    solicitud.telefono,
    solicitud.localidad,
    solicitud.tipo_servicio,
    t.solicitudes[`estado_${estadoDeLaSolicitud}`],
  ].filter(Boolean);
  const pestanas = [
    { id: 'detalle', titulo: t.comun.detalle },
    { id: 'motivo', titulo: t.comun.motivo },
    { id: 'sugeridos', titulo: t.solicitudes.sugeridos.titulo },
  ];

  return (
    <div>
      <Cabecera titulo={solicitud.nombre}>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>
          {t.comun.cancelar}
        </Button>
        {esAdmin && !solicitud.cliente_id && (
          <Button variant="secondary" onClick={handleConvertirEnCliente} disabled={convirtiendo}>
            {convirtiendo ? t.comun.guardando : t.solicitudes.convertir_en_cliente}
          </Button>
        )}
        <Button
          onClick={handleGuardar}
          disabled={guardando || (motivoElegido?.pide_detalle && !detalle.trim())}
        >
          {guardando ? t.comun.guardando : t.comun.guardar}
        </Button>
      </Cabecera>
      {datosDeLaSolicitud.length > 0 && (
        <div className="panel-mini hoja-ficha-datos">{datosDeLaSolicitud.join(' · ')}</div>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {errorConversion && <Alert variant="error">{errorConversion}</Alert>}
      {esAdmin && solicitud.cliente_id && <Alert variant="info">{t.solicitudes.ya_convertida_cliente}</Alert>}

      <section className="panel-tarjeta">
        <div className="panel-tabs" role="tablist">
          {pestanas.map((pestana) => (
            <button
              key={pestana.id}
              type="button"
              role="tab"
              aria-selected={tab === pestana.id}
              className={`panel-tab ${tab === pestana.id ? 'panel-tab-activo' : ''}`}
              onClick={() => setTab(pestana.id)}
            >
              {pestana.titulo}
            </button>
          ))}
        </div>
      </section>

      <div className="panel-tab-contenido molde-pila">
        {tab === 'detalle' && (
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.comun.detalle}</h2>
              <span className={claseBadge(estadoDeLaSolicitud)}>
                {t.solicitudes[`estado_${estadoDeLaSolicitud}`]}
              </span>
            </div>
            <div className="panel-grilla panel-columnas-3">
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.col_telefono}</div>
                <b>
                  <a href={linkWhatsapp(solicitud.telefono)} target="_blank" rel="noreferrer">{solicitud.telefono}</a> ({t.solicitudes.llamar})
                </b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.email}</div>
                <b>{solicitud.email || '—'}</b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.nombre_paciente}</div>
                <b>{solicitud.nombre_paciente || '—'}</b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.col_localidad}</div>
                <b>{solicitud.localidad || '—'}</b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.col_tipo_servicio}</div>
                <b>{solicitud.tipo_servicio || '—'}</b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.col_modalidad}</div>
                <b>{solicitud.modalidad || '—'}</b>
              </div>
              <div className="hoja-dato">
                <div className="panel-mini">{t.solicitudes.dias_horario}</div>
                <b>{solicitud.dias_horario || '—'}</b>
              </div>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.solicitudes.descripcion}</div>
              <b>{solicitud.descripcion || '—'}</b>
            </div>
          </section>
        )}

        {tab === 'motivo' && (
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.comun.motivo}</h2>
            </div>

            {/* Los cuatro estados de lo que carga datos: mientras la lista de motivos viene, se
                avisa; si falló, se ofrece volver a pedirla; si no hay ninguno, no hay qué elegir. */}
            {estadoMotivos === 'cargando' && <p className="molde-vacio">{t.comun.cargando}</p>}
            {estadoMotivos === 'error' && (
              <Alert variant="error">
                {errorMotivos}{' '}
                <Button variant="secondary" onClick={recargarMotivos}>{t.comun.reintentar}</Button>
              </Alert>
            )}
            {estadoMotivos === 'vacio' && (
              <Alert variant="info">{t.comun.vacio}</Alert>
            )}

            <div className="molde-formgrid">
              {/* Es una lista y nunca texto libre: lo que queda guardado es cuál, no cómo se
                  llama. La localidad de arriba no se pisa, porque es lo que dijo quien llamó. */}
              <ElegirUnLugar
                lugares={catalogo.lugares}
                zonas={catalogo.zonas}
                estado={catalogo.estado}
                valor={lugar}
                onChange={(elegido) => setLugar(elegido || '')}
                label={t.solicitudes.lugar_reconocido}
                name="lugar_reconocido"
                deshabilitado={guardando}
              />

              <FormField
                label={t.comun.motivo}
                name="motivo"
                type="select"
                value={motivoId}
                onChange={(e) => {
                  setMotivoId(e.target.value);
                  setDetalle('');
                }}
                disabled={guardando || estadoMotivos !== 'listo'}
              >
                <option value="">{t.comun.motivo_elegir}</option>
                {motivos.map((motivo) => (
                  <option key={motivo.id} value={motivo.id}>{motivo.nombre}</option>
                ))}
              </FormField>

              {motivoElegido?.pide_detalle && (
                <div className="molde-ancho">
                  <FormField
                    label={t.comun.detalle}
                    name="detalle"
                    type="textarea"
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    disabled={guardando}
                    required
                  />
                </div>
              )}

              <div className="molde-ancho">
                <FormField
                  label={t.comun.nota_interna}
                  name="nota"
                  type="textarea"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
              </div>
            </div>
          </section>
        )}

        {tab === 'sugeridos' && (
          <AsistentesSugeridos solicitud={solicitud} onAsignar={setGuardiaNueva} />
        )}
      </div>

      {/* La misma ventana de guardia nueva que usa la pantalla de Guardias, con el Asistente y
          los Pacientes ya elegidos. La fecha y el horario se completan ahí. */}
      {guardiaNueva && (
        <NuevaGuardiaModal
          inicial={guardiaNueva}
          onClose={() => setGuardiaNueva(null)}
          onCreada={guardiaCreada}
        />
      )}
    </div>
  );
}
