import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { useZonasCobertura } from '../hooks/useZonasCobertura';
import { useOpcionesPostulacion } from '../hooks/useOpcionesPostulacion';
import { useListaDeOpciones } from '../hooks/useListaDeOpciones';
import { useTiposAsistente } from '../hooks/useTiposAsistente';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { esAdminOSuperior } from '../lib/roles';
import { nombreTipo } from '../lib/tiposAsistente';
import { traducirCodigos } from '../lib/postulacionCodigos';
import { useMotivosDeResolucion } from '../hooks/useMotivosDeResolucion';
import { resolver } from '../lib/resoluciones';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { Cabecera } from '../components/ui/Cabecera';
import { claseBadge } from '../lib/tonos';
import { EntrevistaDePostulacion } from '../components/EntrevistaDePostulacion';
import '../styles/molde-paginas.css';
import './hojaDeTarjetas.css';
import './postulaciones.css';

// Qué se resuelve en esta pantalla. Es el nombre guardado de la tabla, y con él salen los motivos
// del catálogo de la Prestadora y se escribe la resolución.
const TABLA = 'postulaciones';
const API_URL = import.meta.env.VITE_API_URL;

export function PostulacionDetalle({ postulacion, onClose, onActualizada }) {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const navigate = useNavigate();
  const prestadoraId = usePrestadoraActual();
  const { filas: zonas } = useZonasCobertura(prestadoraId);
  const zonasLabels = useMemo(
    () => Object.fromEntries(zonas.map((z) => [z.codigo, z.nombre])),
    [zonas],
  );
  // Las especialidades son las que cargó esta Prestadora, no dos escritas en las traducciones.
  const { labels: especialidadesLabels } = useOpcionesPostulacion(prestadoraId, 'especialidad');
  const { paraElegir: tiposAsistente } = useTiposAsistente();
  // La disponibilidad y la situación fiscal salen del registro de opciones, no del archivo de
  // traducciones: lo guardado es la clave y el texto lo pone el catálogo.
  const laDisponibilidad = useListaDeOpciones('disponibilidad');
  const laSituacionFiscal = useListaDeOpciones('situacion_fiscal');
  // Los motivos de esta Prestadora para resolver una postulación. En qué estado queda la
  // postulación lo dice el motivo elegido, así que acá no hay ninguna lista de estados escrita.
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
  const [tipoAsistenteId, setTipoAsistenteId] = useState('');
  const [nota, setNota] = useState(postulacion.nota_interna || '');
  const [guardando, setGuardando] = useState(false);
  const [iniciandoVerificacion, setIniciandoVerificacion] = useState(false);
  const [error, setError] = useState(null);

  async function handleIniciarVerificacion() {
    const confirmado = await confirmarDestructivo(t.postulaciones.confirmar_iniciar_verificacion);
    if (!confirmado) return;

    setIniciandoVerificacion(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/cuentas/asistente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ postulacionId: postulacion.id, tipo_asistente_id: tipoAsistenteId }),
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
      navigate(`/asistentes/${resultado.asistenteId}`);
    } catch (err) {
      setError(mensajeDeError(err, t));
      setIniciandoVerificacion(false);
    }
  }

  async function handleGuardar() {
    // Resolver no es pisar el estado: es dejar escrito por qué se decidió y quién lo decidió. El
    // estado en el que queda sale del motivo, nunca de esta pantalla.
    const nuevoEstado = motivoElegido?.estado ?? null;
    const cambiaElEstado = Boolean(nuevoEstado) && nuevoEstado !== postulacion.estado;

    if (cambiaElEstado) {
      const confirmado = await confirmarDestructivo(t.postulaciones.confirmar_cambio_estado);
      if (!confirmado) return;
    }

    setGuardando(true);
    setError(null);

    if (motivoElegido) {
      const { error: errorResolucion } = await resolver({
        tabla: TABLA,
        filaId: postulacion.id,
        motivoId: motivoElegido.id,
        detalle: motivoElegido.pide_detalle ? detalle.trim() : null,
      });

      if (errorResolucion) {
        setError(mensajeDeError(errorResolucion, t));
        setGuardando(false);
        return;
      }
    }

    // La nota interna es otra cosa y se guarda aparte: es lo que el equipo anota, no la decisión.
    const { error: errorUpdate } = await supabase
      .from('postulaciones')
      .update({ nota_interna: nota })
      .eq('id', postulacion.id);

    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      setGuardando(false);
      return;
    }

    if (cambiaElEstado) {
      try {
        const { data } = await supabase.auth.getSession();
        await fetch(`${API_URL}/api/panel/notificar/postulante`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.session?.access_token}`,
          },
          body: JSON.stringify({
            email: postulacion.email,
            nombre: postulacion.nombre,
            nuevoEstado,
            idioma: postulacion.idioma,
          }),
        });
      } catch {
        // el cambio de estado ya se guardó; el email es best-effort
      }
    }

    setGuardando(false);
    onActualizada();
  }

  const puedeGuardar = !(guardando || (motivoElegido?.pide_detalle && !detalle.trim()));

  return (
    <div>
      <Cabecera titulo={postulacion.nombre}>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>
          {t.comun.cancelar}
        </Button>
        <Button onClick={handleGuardar} disabled={!puedeGuardar}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </Button>
      </Cabecera>
      <div className="panel-mini hoja-ficha-datos">
        {t.postulaciones[`estado_${postulacion.estado}`]} · {postulacion.telefono} · {postulacion.email}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="molde-pila">
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.comun.detalle}</h2>
          </div>
          <div className="panel-grilla panel-columnas-3">
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.dni}</div>
              <b>{postulacion.dni || '—'}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.telefono}</div>
              <b>{postulacion.telefono}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.email}</div>
              <b>{postulacion.email}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.col_especialidades}</div>
              <b>{traducirCodigos(postulacion.especialidades, especialidadesLabels)}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.col_zonas}</div>
              <b>{traducirCodigos(postulacion.zonas, zonasLabels)}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.disponibilidad}</div>
              <b>{traducirCodigos(postulacion.disponibilidad, laDisponibilidad.textos)}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.anios_experiencia}</div>
              <b>{postulacion.anios_experiencia || '—'}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.col_situacion_fiscal}</div>
              <b>{laSituacionFiscal.textos[postulacion.situacion_fiscal] ?? postulacion.situacion_fiscal}</b>
            </div>
            <div className="hoja-dato">
              <div className="panel-mini">{t.postulaciones.como_conocio}</div>
              <b>{postulacion.como_conocio || '—'}</b>
            </div>
            <div className="hoja-dato postulaciones-dato-ancho">
              <div className="panel-mini">{t.postulaciones.mensaje}</div>
              <b>{postulacion.mensaje || '—'}</b>
            </div>
          </div>
        </section>

        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.postulaciones.col_estado}</h2>
            <span className={claseBadge(postulacion.estado)}>
              {t.postulaciones[`estado_${postulacion.estado}`]}
            </span>
          </div>

          {/* Los cuatro estados de lo que carga datos: mientras la lista de motivos viene, se avisa;
              si falló, se ofrece volver a pedirla; si la Prestadora se quedó sin ninguno encendido,
              no hay nada que elegir. */}
          {estadoMotivos === 'cargando' && <p className="panel-mini">{t.comun.cargando}</p>}
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

        {/* La entrevista va antes del Proceso de Incorporación y no depende del estado: entrevistar
            es lo que se hace para decidir, así que tiene que estar disponible mientras la
            postulación todavía se está mirando. */}
        <EntrevistaDePostulacion postulacionId={postulacion.id} />

        {esAdminOSuperior(usuario?.rol) && postulacion.estado === 'aprobado' && (
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.postulaciones.iniciar_verificacion}</h2>
            </div>
            {postulacion.asistente_id ? (
              <p className="molde-vacio">{t.postulaciones.ya_iniciada_verificacion}</p>
            ) : (
              <>
                {/* Qué va a ser esta persona en la Prestadora. Se elige acá, mirando la
                    postulación, y no se copia de lo que la persona escribió en el
                    formulario público: el tipo decide si se le va a exigir Matrícula
                    vigente para poder atender, así que es una decisión de quien aprueba. */}
                <div className="molde-formgrid">
                  <FormField
                    label={t.postulaciones.tipo_asistente}
                    name="tipo_asistente_id"
                    type="select"
                    value={tipoAsistenteId}
                    onChange={(e) => setTipoAsistenteId(e.target.value)}
                  >
                    <option value="">{t.postulaciones.tipo_asistente_elegir}</option>
                    {tiposAsistente.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
                    ))}
                  </FormField>
                </div>
                <div className="molde-acciones">
                  <Button
                    variant="secondary"
                    onClick={handleIniciarVerificacion}
                    disabled={iniciandoVerificacion || !tipoAsistenteId}
                  >
                    {iniciandoVerificacion ? t.comun.guardando : t.postulaciones.iniciar_verificacion}
                  </Button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
