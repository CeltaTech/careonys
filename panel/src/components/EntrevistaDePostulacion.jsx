import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { llamadorDe } from '../lib/apiPanel';
import { desdeElCampo, paraElCampo } from '../lib/momentoDeLaEntrevista';
import { mensajeDeError } from '../lib/errores';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Alert } from './ui/Alert';
import { claseBadge } from '../lib/tonos';
import '../styles/molde-paginas.css';
import '../pages/hojaDeTarjetas.css';

/* La entrevista con un postulante, adentro del producto.
   ==========================================================================

   QUÉ HACE. El Responsable del reclutamiento agenda la entrevista y elige al Entrevistador, y
   mientras está agendada puede cambiarlo. El Entrevistador la mueve, la cancela —con el motivo si
   lo escribe— o le carga el informe, que la deja realizada. Al postulante le llega un correo al
   agendar, al mover y al cancelar. Quién puede qué lo dice el backend en cada lectura, y quien no
   puede nada la ve sin botones.

   NO CAMBIA LA SITUACIÓN DE LA POSTULACIÓN: haber entrevistado a alguien no es haberlo aprobado.
   Eso se decide arriba, en el selector de estado, y sigue siendo una decisión de una persona.

   LA DIRECCIÓN DE LA SALA NO SE MUESTRA ACÁ NI VIAJA POR CORREO. Lo que se copia y lo que se le
   manda al postulante es su enlace propio, que le abre la sala solamente a la hora de la cita.
   Así, reprogramar no obliga a mandar una llave nueva, y quien llegue a deshora recibe una
   explicación en vez de una sala vacía. */

const llamar = llamadorDe('/entrevistas');

/** Una entrevista está viva mientras se pueda mover o terminar. Las otras son historia. */
const VIVA = 'agendada';

export function EntrevistaDePostulacion({ postulacionId }) {
  const { t, locale } = useLocale();
  const tr = t.postulaciones.entrevista;
  const confirmarDestructivo = useConfirmarDestructivo();
  const { usuario } = useAuth();

  const [entrevistas, setEntrevistas] = useState(null);
  const [permisos, setPermisos] = useState({ puede_agendar: false, puede_actuar: false, puede_reasignar: false });
  const [personas, setPersonas] = useState([]);
  const [entrevistador, setEntrevistador] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [cuando, setCuando] = useState('');
  const [informe, setInforme] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { entrevistas: filas, personas: lista, ...puede } = await llamar(`/${postulacionId}`);
      setEntrevistas(filas);
      setPersonas(lista ?? []);
      setPermisos({
        puede_agendar: Boolean(puede.puede_agendar),
        puede_actuar: Boolean(puede.puede_actuar),
        puede_reasignar: Boolean(puede.puede_reasignar),
      });
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }, [postulacionId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const viva = entrevistas?.find((fila) => fila.estado === VIVA) || null;
  const historia = (entrevistas || []).filter((fila) => fila.estado !== VIVA);

  // Al abrirse la pantalla, el campo arranca con la fecha que ya tiene la entrevista viva: mover
  // una cita casi siempre es correrla un rato, no escribirla de nuevo desde cero.
  useEffect(() => {
    setCuando(paraElCampo(viva?.agendada_para));
  }, [viva?.agendada_para]);

  // El Entrevistador arranca en el de la entrevista viva, y para agendar una nueva en quien agenda.
  useEffect(() => {
    setEntrevistador(viva?.entrevistador_id ?? usuario?.id ?? '');
  }, [viva?.entrevistador_id, usuario?.id]);

  function enPalabras(iso) {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
  }

  /* Un solo camino para las cinco operaciones. Cada una manda lo suyo, pero todas apagan los
     botones mientras corren, vuelven a leer la lista al terminar y muestran la frase del catálogo
     si el backend rechazó el pedido. */
  async function operar(hacer) {
    setTrabajando(true);
    setError(null);
    try {
      await hacer();
      await cargar();
      setInforme('');
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setTrabajando(false);
    }
  }

  function handleAgendar() {
    const agendada_para = desdeElCampo(cuando);
    if (!agendada_para) return;
    return operar(() =>
      llamar(`/${postulacionId}`, {
        method: 'POST',
        body: JSON.stringify({ agendada_para, entrevistador_id: entrevistador || null }),
      }),
    );
  }

  async function handleReprogramar() {
    const agendada_para = desdeElCampo(cuando);
    if (!agendada_para) return;
    if (!(await confirmarDestructivo(tr.reprogramar_confirmar))) return;
    return operar(() =>
      llamar(`/${postulacionId}`, { method: 'PATCH', body: JSON.stringify({ agendada_para }) }),
    );
  }

  async function handleCancelar() {
    if (!(await confirmarDestructivo(tr.cancelar_confirmar))) return;
    return operar(() =>
      llamar(`/${postulacionId}/cancelacion`, {
        method: 'POST',
        body: JSON.stringify({ observaciones: informe.trim() || null }),
      }),
    );
  }

  function handleCargarInforme() {
    if (!informe.trim()) return;
    return operar(() =>
      llamar(`/${postulacionId}/informe`, {
        method: 'POST',
        body: JSON.stringify({ informe }),
      }),
    );
  }

  function handleCambiarEntrevistador() {
    if (!entrevistador) return;
    return operar(() =>
      llamar(`/${postulacionId}/entrevistador`, {
        method: 'PATCH',
        body: JSON.stringify({ entrevistador_id: entrevistador }),
      }),
    );
  }

  async function handleCopiar() {
    if (!viva.enlace) return;
    await navigator.clipboard.writeText(viva.enlace);
    setCopiado(true);
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{tr.titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      {cargando ? (
        <p className="panel-mini">{t.comun.cargando}</p>
      ) : (
        <>
          {!viva && historia.length === 0 && <p className="molde-vacio">{tr.vacio}</p>}

          {viva && (
            <>
              <div className="panel-grilla panel-columnas-3">
                <div className="hoja-dato">
                  <div className="panel-mini">{tr.cuando}</div>
                  <b>{enPalabras(viva.agendada_para)}</b>
                </div>
                <div className="hoja-dato">
                  <div className="panel-mini">{tr.entrevistador}</div>
                  <b>{viva.entrevistador_nombre}</b>
                </div>
                <div className="hoja-dato">
                  <div className="panel-mini">{tr.enlace_del_postulante}</div>
                  <Button variant="secondary" onClick={handleCopiar}>
                    {copiado ? tr.enlace_copiado : tr.enlace_copiar}
                  </Button>
                </div>
              </div>

              {/* El producto no prohíbe: avisa. Sin dirección de videollamada la entrevista se
                  agenda igual, y quien la agendó tiene que enterarse de que va a haber que
                  comunicarse por otro medio. */}
              {!viva.sala_videollamada && <Alert variant="warning">{tr.sin_videollamada}</Alert>}
            </>
          )}

          {(permisos.puede_actuar || permisos.puede_agendar || permisos.puede_reasignar) && (
            <div className="molde-formgrid">
              {(permisos.puede_actuar || permisos.puede_agendar) && (
                <FormField
                  label={tr.cuando}
                  name="agendada_para"
                  type="datetime-local"
                  value={cuando}
                  onChange={(e) => setCuando(e.target.value)}
                />
              )}

              {(permisos.puede_agendar || permisos.puede_reasignar) && (
                <FormField
                  label={tr.entrevistador}
                  name="entrevistador"
                  type="select"
                  value={entrevistador}
                  onChange={(e) => setEntrevistador(e.target.value)}
                >
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.nombre}
                    </option>
                  ))}
                </FormField>
              )}

              {permisos.puede_actuar && (
                <div className="molde-ancho">
                  <FormField
                    label={tr.informe}
                    name="informe_entrevista"
                    type="textarea"
                    value={informe}
                    onChange={(e) => setInforme(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="molde-acciones">
            {permisos.puede_reasignar && (
              <Button
                variant="secondary"
                onClick={handleCambiarEntrevistador}
                disabled={trabajando || !entrevistador || entrevistador === viva?.entrevistador_id}
              >
                {tr.cambiar_entrevistador}
              </Button>
            )}
            {permisos.puede_actuar && (
              <>
                <Button variant="secondary" onClick={handleReprogramar} disabled={trabajando || !cuando}>
                  {tr.reprogramar}
                </Button>
                <Button variant="secondary" onClick={handleCancelar} disabled={trabajando}>
                  {tr.cancelar}
                </Button>
                <Button onClick={handleCargarInforme} disabled={trabajando || !informe.trim()}>
                  {tr.cargar_informe}
                </Button>
              </>
            )}
            {permisos.puede_agendar && (
              <Button onClick={handleAgendar} disabled={trabajando || !cuando}>
                {trabajando ? t.comun.guardando : tr.agendar}
              </Button>
            )}
          </div>

          {/* La historia: cada entrevista pasada con su fecha, quién la hizo y el informe o el motivo
              de la cancelación. */}
          {historia.map((fila) => (
            <div key={fila.id} className="panel-fila-alerta">
              <div>
                <b>{enPalabras(fila.agendada_para)}</b>
                {fila.entrevistador_nombre && (
                  <span className="panel-mini">{tr.entrevistador}: {fila.entrevistador_nombre}</span>
                )}
                {fila.observaciones && <span className="panel-mini">{fila.observaciones}</span>}
              </div>
              <span className={claseBadge(fila.estado)}>{tr[`estado_${fila.estado}`]}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
