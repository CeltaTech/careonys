import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { con } from '../lib/textos';
import { mensajeDeError, situacionDelError } from '../lib/errores';
import { horaDelMomento } from '../lib/horarios';
import { agregarACola, nuevoId } from '../lib/colaOffline';
import { sincronizarCola } from '../lib/sincronizarCola';
import { useTelefonoParaEmergencias } from '../context/PerfilContext';

// Cuánto hay que mantenerlo apretado, y cuánto dura la cuenta en la que todavía se puede cancelar.
const MANTENER_MS = 3000;
const CUENTA_SEGUNDOS = 10;

/**
 * El Relevo de emergencia: a mitad del turno, el Asistente tiene una emergencia y necesita irse.
 *
 * NO ES EL RELEVO QUE NO LLEGA. Aquel es el turno que terminó sin que apareciera el siguiente, y lo
 * cuenta `ExtensionDeTurno.jsx`. Éste se pide en cualquier momento de la guardia en curso, más de
 * una vez si hace falta, no cierra la guardia y le hace sonar la alarma al Coordinador.
 *
 * CÓMO SE EVITA QUE SE APRIETE SOLO. Va aparte de los botones de todos los días, hay que mantenerlo
 * apretado tres segundos y después corre una cuenta de diez con «Cancelar» a la vista, con sonido,
 * vibración y luz para que no pase inadvertida. Recién al terminar la cuenta sale el pedido. Es la
 * forma de los botones de pánico de los servicios con personal de guardia: no hay ventana de
 * confirmación, porque quien está en una emergencia no tiene que leer nada para pedir ayuda.
 *
 * SIN DETALLE. Quien está en el medio de algo puede no estar en condiciones de escribir, y el
 * Coordinador lo va a llamar igual.
 *
 * SIN SEÑAL SE DICE CON TODAS LAS LETRAS, igual que la emergencia: mientras la cola no salga no se
 * enteró nadie, y al lado queda el botón para llamar a la Prestadora si cargó un teléfono.
 */
export default function RelevoDeEmergencia({ t, locale, guardiaId, alPedir }) {
  const tr = t.relevo_emergencia;
  // reposo → apretando → cuenta → enviando → reposo.
  const [fase, setFase] = useState('reposo');
  const [progreso, setProgreso] = useState(0);
  const [segundos, setSegundos] = useState(CUENTA_SEGUNDOS);
  const [soltoAntes, setSoltoAntes] = useState(false);
  const [error, setError] = useState('');
  // Lo que pasó con el último pedido, en este teléfono: o salió y a qué hora, o quedó esperando señal.
  const [pedido, setPedido] = useState(null);
  const telefonoEmergencias = useTelefonoParaEmergencias();

  const relojes = useRef({ mantener: null, cuenta: null, aviso: null });
  const audio = useRef(null);

  function pararRelojes() {
    const r = relojes.current;
    clearInterval(r.mantener);
    clearInterval(r.cuenta);
    clearTimeout(r.aviso);
    relojes.current = { mantener: null, cuenta: null, aviso: null };
    navigator.vibrate?.(0);
  }

  useEffect(
    () => () => {
      pararRelojes();
      audio.current?.close?.();
    },
    [],
  );

  // El sonido se prepara en el mismo toque que empieza a apretar: los teléfonos no dejan sonar
  // nada que no haya arrancado con un gesto de la persona.
  function prepararSonido() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    if (!audio.current) audio.current = new Contexto();
    audio.current.resume?.();
  }

  function senal() {
    navigator.vibrate?.(300);
    const ctx = audio.current;
    if (!ctx) return;
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    oscilador.type = 'square';
    oscilador.frequency.value = 880;
    volumen.gain.setValueAtTime(0.2, ctx.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscilador.connect(volumen).connect(ctx.destination);
    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.3);
  }

  function empezarAApretar() {
    if (fase !== 'reposo') return;
    setError('');
    setSoltoAntes(false);
    prepararSonido();
    setFase('apretando');
    // Un reloj común y no el de cuadros de animación: ése el navegador lo frena cuando la pantalla
    // no está al frente, y el apretado se quedaría contando para siempre.
    const inicio = Date.now();
    relojes.current.mantener = setInterval(() => {
      const hecho = Math.min(1, (Date.now() - inicio) / MANTENER_MS);
      setProgreso(hecho);
      if (hecho === 1) {
        clearInterval(relojes.current.mantener);
        relojes.current.mantener = null;
        empezarCuenta();
      }
    }, 50);
  }

  function soltar() {
    if (fase !== 'apretando') return;
    pararRelojes();
    setProgreso(0);
    setFase('reposo');
    // Un toque corto no hace nada, pero se dice cómo se usa: si no, parece que el botón no anda.
    setSoltoAntes(true);
    relojes.current.aviso = setTimeout(() => setSoltoAntes(false), 2500);
  }

  function empezarCuenta() {
    setFase('cuenta');
    setSegundos(CUENTA_SEGUNDOS);
    senal();
    let quedan = CUENTA_SEGUNDOS;
    relojes.current.cuenta = setInterval(() => {
      quedan -= 1;
      if (quedan > 0) {
        setSegundos(quedan);
        senal();
      } else {
        pararRelojes();
        enviar();
      }
    }, 1000);
  }

  function cancelar() {
    pararRelojes();
    setProgreso(0);
    setFase('reposo');
  }

  async function enviar() {
    setFase('enviando');
    // El identificador del envío se pone antes del primer intento, para que un reenvío no anote el
    // mismo pedido dos veces. Y la hora viaja con él: si queda en la cola, ese rato no se pierde.
    const clienteUuid = nuevoId();
    const datos = { ocurrido_at: new Date().toISOString(), clienteUuid };
    try {
      const resultado = await api.relevoDeEmergencia(guardiaId, datos);
      setPedido({ at: resultado.avisadoAt, enviado: true });
      alPedir?.();
    } catch (e) {
      // Sin señal o con el servidor caído, el pedido no llegó a nadie y se guarda para reintentar.
      // Un rechazo con motivo se muestra y no se guarda.
      if (!(e instanceof TypeError) && situacionDelError(e) !== 'falla_del_sistema') {
        setError(mensajeDeError(e, t, 'pedir el relevo de emergencia'));
      } else {
        await agregarACola({ id: clienteUuid, tipo: 'relevo_de_emergencia', guardiaId, payload: datos });
        setPedido({ at: datos.ocurrido_at, enviado: false });
        alPedir?.();
        sincronizarCola();
      }
    } finally {
      setProgreso(0);
      setFase('reposo');
    }
  }

  const apretable = fase === 'reposo' || fase === 'apretando';

  return (
    <div className="pwa-card-bloque relevo-emergencia">
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {pedido && (
        <div className={pedido.enviado ? 'alert alert-info' : 'alert alert-error'} role="alert">
          {pedido.enviado ? con(tr.avisado, { hora: horaDelMomento(pedido.at, locale) }) : tr.sin_conexion}
        </div>
      )}
      {pedido && !pedido.enviado && telefonoEmergencias && (
        <a className="btn btn-primary btn-full" href={`tel:${telefonoEmergencias.replace(/[^\d+]/g, '')}`}>
          {t.emergencia.llamar_a_la_prestadora}
        </a>
      )}

      {apretable && (
        <button
          type="button"
          className="btn btn-full btn-relevo-emergencia"
          style={{ '--progreso': `${Math.round(progreso * 100)}%` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            empezarAApretar();
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              empezarAApretar();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') soltar();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {soltoAntes ? con(tr.mantener, { segundos: MANTENER_MS / 1000 }) : tr.boton}
        </button>
      )}

      {fase === 'cuenta' && (
        <div className="relevo-emergencia-cuenta" role="alert" aria-live="assertive">
          <p>{con(tr.cuenta, { segundos })}</p>
          <button type="button" className="btn btn-secondary btn-full" onClick={cancelar}>
            {t.comun.cancelar}
          </button>
        </div>
      )}

      {fase === 'enviando' && (
        <button type="button" className="btn btn-full btn-relevo-emergencia" disabled>
          {tr.enviando}
        </button>
      )}
    </div>
  );
}
