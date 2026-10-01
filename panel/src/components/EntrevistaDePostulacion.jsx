import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
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

   QUÉ RESOLVÍA MAL ESTO. La entrevista se acordaba por fuera —un correo escrito a mano, un
   teléfono— y de vuelta no quedaba nada: ni cuándo fue, ni si la persona se presentó, ni quién
   había quedado en llamarla. La única constancia era una nota interna que alguien se acordara de
   escribir.

   QUÉ HACE Y QUÉ NO. Agenda, mueve, cancela y cierra una entrevista, y le avisa al postulante por
   correo cada vez. NO CAMBIA LA SITUACIÓN DE LA POSTULACIÓN: haber entrevistado a alguien no es
   haberlo aprobado. Eso se decide arriba, en el selector de estado, y sigue siendo una decisión
   de una persona.

   LA DIRECCIÓN DE LA SALA NO SE MUESTRA ACÁ NI VIAJA POR CORREO. Lo que se copia y lo que se le
   manda al postulante es su enlace propio, que le abre la sala solamente a la hora de la cita.
   Así, reprogramar no obliga a mandar una llave nueva, y quien llegue a deshora recibe una
   explicación en vez de una sala vacía. */

const llamar = llamadorDe('/entrevistas');

/** Una entrevista está viva mientras se pueda mover o cerrar. Las otras tres son historia. */
const VIVA = 'agendada';

export function EntrevistaDePostulacion({ postulacionId }) {
  const { t, locale } = useLocale();
  const tr = t.postulaciones.entrevista;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [entrevistas, setEntrevistas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [cuando, setCuando] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { entrevistas: filas } = await llamar(`/${postulacionId}`);
      setEntrevistas(filas);
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

  function enPalabras(iso) {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
  }

  /* Un solo camino para las cuatro operaciones. Cada una manda lo suyo, pero todas apagan los
     botones mientras corren, vuelven a leer la lista al terminar y muestran la frase del catálogo
     si el backend rechazó el pedido. */
  async function operar(hacer) {
    setTrabajando(true);
    setError(null);
    try {
      await hacer();
      await cargar();
      setObservaciones('');
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
      llamar(`/${postulacionId}`, { method: 'POST', body: JSON.stringify({ agendada_para }) }),
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
        body: JSON.stringify({ observaciones: observaciones || null }),
      }),
    );
  }

  function handleCerrar(estado) {
    return operar(() =>
      llamar(`/${postulacionId}/cierre`, {
        method: 'POST',
        body: JSON.stringify({ estado, observaciones: observaciones || null }),
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

          <div className="molde-formgrid">
            <FormField
              label={tr.cuando}
              name="agendada_para"
              type="datetime-local"
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
            />

            <div className="molde-ancho">
              <FormField
                label={tr.observaciones}
                name="observaciones_entrevista"
                type="textarea"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
          </div>

          <div className="molde-acciones">
            {viva ? (
              <>
                <Button variant="secondary" onClick={handleReprogramar} disabled={trabajando || !cuando}>
                  {tr.reprogramar}
                </Button>
                <Button variant="secondary" onClick={handleCancelar} disabled={trabajando}>
                  {tr.cancelar}
                </Button>
                <Button onClick={() => handleCerrar('realizada')} disabled={trabajando}>
                  {tr.cierre_realizada}
                </Button>
                <Button onClick={() => handleCerrar('no_asistio')} disabled={trabajando}>
                  {tr.cierre_no_asistio}
                </Button>
              </>
            ) : (
              <Button onClick={handleAgendar} disabled={trabajando || !cuando}>
                {trabajando ? t.comun.guardando : tr.agendar}
              </Button>
            )}
          </div>

          {/* La historia. Que a alguien se le haya reprogramado dos veces y no se haya presentado
              es justamente lo que se quiere ver antes de decidir. */}
          {historia.map((fila) => (
            <div key={fila.id} className="panel-fila-alerta">
              <div>
                <b>{enPalabras(fila.agendada_para)}</b>
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
