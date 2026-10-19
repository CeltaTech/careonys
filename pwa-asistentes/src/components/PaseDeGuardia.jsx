import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { MOTIVOS_SIN_COMPROBAR, MOTIVOS_DEL_PEDIDO } from '../lib/motivosSinComprobar';
import { obtenerUbicacion } from '../lib/ubicacionDelTelefono';

const LECTOR_ID = 'lector-codigo-de-presencia';

// Cada cuánto se le vuelve a preguntar al backend si quien coordina ya autorizó. No es
// una regla de negocio ni una decisión de ninguna Prestadora: es el pulso de una pantalla que
// está esperando, y el Asistente está parado en la puerta mientras tanto. Mismo criterio que el
// sondeo del cobro por QR en la aplicación de los Clientes.
const SONDEO_MS = 4000;

/**
 * El pase de guardia, al marcar la llegada y al cerrar.
 *
 * NO SE ESCANEA NINGÚN CARTEL. Un cartel pegado en el domicilio es un secreto permanente a la
 * vista de cualquiera que pase por la puerta: se fotografía una vez y sirve desde cualquier lado.
 * Lo que se lee acá es un código que alguien muestra en la pantalla de su teléfono y que se
 * renueva solo cada pocos segundos.
 *
 * HAY DOS CAMINOS Y UN PISO:
 *
 *   Plan A — lo muestra quien está en la casa: el Cliente, o el Asistente que se va cuando hay
 *   relevo. Se lee con la cámara o se tipea; las dos cosas terminan en el mismo pedido.
 *
 *   Plan B — no puede leer el código QR. El Asistente pide autorización eligiendo el motivo: queda
 *   anotado desde dónde, a qué hora y por qué la pidió, y el pedido aparece en el Panel. Quien coordina hace
 *   las verificaciones que acostumbre y autoriza. Mientras espera, esta pantalla pregunta sola, y
 *   cuando la autorización llega, la llegada o el cierre se marca desde acá sin tocar nada más.
 *   Si al abrir esta pantalla ya estaba autorizado —el cierre del Asistente que se va, que quedó
 *   autorizado junto con la llegada del que entra—, se marca enseguida.
 *
 *   El piso — si la autorización tampoco llega, se entra igual eligiendo un motivo. La
 *   guardia NUNCA se traba: esto no es una puerta, y ninguna rama de acá adentro termina sin una
 *   salida hacia adelante.
 *
 * `onListo(comprobacion)` recibe { codigo }, { autorizada: true } o { motivoSinComprobar, detalle } y devuelve
 * { ok: true } o { ok: false, mensaje }. Cuando el backend rechaza el código —equivocado, vencido,
 * o de otra casa— este componente se queda abierto con la advertencia: cerrarlo dejaría al Asistente
 * en la puerta sin nada que apretar.
 */
export default function PaseDeGuardia({ t, guardiaId, momento, onListo, onCancelar }) {
  // codigo · pedido · esperando · sin_comprobar
  const [paso, setPaso] = useState('codigo');
  const [codigo, setCodigo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  // Lo que salió mal en el último intento de comprobar. Es una advertencia y no un error: siempre queda
  // algo para hacer abajo.
  const [advertencia, setAdvertencia] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // La cámara se prende desde un efecto y nunca desde un clic: el lector se engancha a un elemento
  // del documento por su identificador, y ese elemento sólo existe mientras se está pidiendo el
  // código. Este contador es lo que vuelve a disparar el efecto, ya con la pantalla dibujada.
  const [intento, setIntento] = useState(0);
  const lectorRef = useRef(null);
  const leyendoRef = useRef(false);
  const vivoRef = useRef(true);
  // La autorización se entrega una sola vez, aunque el sondeo la vea dos.
  const autorizadaRef = useRef(false);

  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  const detenerCamara = useCallback(async () => {
    if (lectorRef.current && leyendoRef.current) {
      leyendoRef.current = false;
      try {
        await lectorRef.current.stop();
        lectorRef.current.clear();
      } catch {
        // la cámara ya pudo haberse detenido sola
      }
    }
  }, []);

  /* Entregar lo comprobado hacia arriba. Es el único camino de salida: los dos planes y el piso
     terminan acá, con formas distintas del mismo dato. */
  const entregar = useCallback(
    async (comprobacion) => {
      if (enviando) return;
      setEnviando(true);
      setAdvertencia('');
      setError('');
      await detenerCamara();
      try {
        const resultado = await onListo(comprobacion);
        if (resultado && resultado.ok === false && vivoRef.current) {
          setAdvertencia(resultado.mensaje);
          setCodigo('');
          // La cámara se apagó para mandar el pedido; si el código no sirvió, hay que volver a
          // prenderla para que se pueda intentar de nuevo sin salir y entrar de la pantalla.
          if (paso === 'codigo') setIntento((n) => n + 1);
        }
      } finally {
        if (vivoRef.current) setEnviando(false);
      }
    },
    [detenerCamara, enviando, onListo, paso],
  );

  // ---- Plan A: la cámara -------------------------------------------------------------------

  useEffect(() => {
    if (paso !== 'codigo') return undefined;
    let cancelado = false;

    (async () => {
      try {
        const lector = new Html5Qrcode(LECTOR_ID);
        lectorRef.current = lector;
        leyendoRef.current = true;
        await lector.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (leido) => {
            if (!leyendoRef.current || cancelado) return;
            leyendoRef.current = false;
            setCodigo(String(leido ?? '').trim());
            entregar({ codigo: String(leido ?? '').trim() });
          },
          () => {},
        );
      } catch {
        // Sin cámara, sin permiso, o el navegador no la deja usar acá. No se avisa nada: abajo
        // está el mismo código para tipear, que es exactamente lo mismo con más trabajo.
        leyendoRef.current = false;
      }
    })();

    return () => {
      cancelado = true;
      detenerCamara();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, intento]);

  // ---- Plan B: la autorización de quien coordina -------------------------------------------

  const entregarAutorizada = useCallback(() => {
    if (autorizadaRef.current) return;
    autorizadaRef.current = true;
    entregar({ autorizada: true });
  }, [entregar]);

  async function irAlPedido() {
    await detenerCamara();
    setAdvertencia('');
    setError('');
    setMotivo('');
    setDetalle('');
    setPaso('pedido');
  }

  async function pedirAutorizacion() {
    setEnviando(true);
    setError('');
    setAdvertencia('');
    try {
      // Sin ubicación el pedido sale igual: quien coordina decide con lo que tiene, y la guardia
      // no se traba por un GPS que no contesta.
      let punto = { lat: null, lng: null };
      try {
        punto = await obtenerUbicacion();
      } catch {
        // se pide sin ubicación
      }
      await api.pedirAutorizacion(guardiaId, { momento, lat: punto.lat, lng: punto.lng, motivo, detalle });
      if (vivoRef.current) setPaso('esperando');
    } catch (e) {
      if (vivoRef.current) setError(mensajeDeError(e, t, 'pedir autorización'));
    } finally {
      if (vivoRef.current) setEnviando(false);
    }
  }

  // Al abrir, una sola pregunta: si ya estaba autorizado, no hay nada que leer.
  useEffect(() => {
    let cancelado = false;
    api.estadoDeComprobacion(guardiaId, momento)
      .then((estado) => {
        if (cancelado) return;
        if (estado?.estado === 'comprobada') entregarAutorizada();
        else if (estado?.estado === 'pendiente_de_autorizacion') setPaso('esperando');
      })
      .catch(() => {
        // Sin respuesta se sigue con el código QR, que es el camino de siempre.
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardiaId, momento]);

  // Mientras espera, la pantalla pregunta sola. Cuando dice «comprobada», ya lo autorizaron.
  useEffect(() => {
    if (paso !== 'esperando') return undefined;
    let cancelado = false;

    async function mirar() {
      try {
        const estado = await api.estadoDeComprobacion(guardiaId, momento);
        if (!cancelado && estado?.estado === 'comprobada') entregarAutorizada();
      } catch {
        // Sin señal o con el backend caído, el próximo ciclo vuelve a preguntar. Y si nunca llega,
        // abajo está el botón de entrar igual.
      }
    }

    mirar();
    const reloj = setInterval(mirar, SONDEO_MS);
    return () => {
      cancelado = true;
      clearInterval(reloj);
    };
  }, [paso, guardiaId, momento, entregarAutorizada]);

  // ---- El piso -----------------------------------------------------------------------------

  async function irAlPiso() {
    await detenerCamara();
    setAdvertencia('');
    setError('');
    setPaso('sin_comprobar');
  }

  async function volverAlCodigo() {
    setAdvertencia('');
    setError('');
    setPaso('codigo');
    setIntento((n) => n + 1);
  }

  const titulo = momento === 'checkin' ? t.pase_de_guardia.titulo_checkin : t.pase_de_guardia.titulo_checkout;

  const botonEntrarIgual = (
    <button type="button" className="btn btn-secondary btn-full pwa-card-pie" onClick={irAlPiso} disabled={enviando}>
      {momento === 'checkin' ? t.pase_de_guardia.entrar_igual : t.pase_de_guardia.cerrar_igual}
    </button>
  );

  const campoDelCodigo = (
    <>
      <div className="form-field">
        <label htmlFor="pase-codigo">{t.pase_de_guardia.codigo_label}</label>
        <input
          id="pase-codigo"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          disabled={enviando}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={() => entregar({ codigo: codigo.trim() })}
        disabled={enviando || !codigo.trim()}
      >
        {enviando ? t.pase_de_guardia.confirmando : t.pase_de_guardia.confirmar_codigo}
      </button>
    </>
  );

  return (
    <div className="guardia-card">
      <p className="guardia-card-paciente">{titulo}</p>

      {advertencia && <div className="alert alert-alerta" role="status">{advertencia}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {paso === 'codigo' && (
        <>
          <p className="guardia-card-detalle">{t.pase_de_guardia.instrucciones}</p>
          <div id={LECTOR_ID} className="lector-camara" />
          <p className="guardia-card-detalle pwa-card-pie">{t.pase_de_guardia.o_tipear}</p>
          {campoDelCodigo}
          <button
            type="button"
            className="btn btn-secondary btn-full pwa-card-pie"
            onClick={irAlPedido}
            disabled={enviando}
          >
            {t.pase_de_guardia.pedir_autorizacion}
          </button>
          {botonEntrarIgual}
        </>
      )}

      {paso === 'pedido' && (
        <>
          <p className="guardia-card-detalle">{t.pase_de_guardia.pedido_titulo}</p>
          {MOTIVOS_DEL_PEDIDO.map((m) => (
            <label key={m} htmlFor={`pase-pedido-${m}`} className="opcion-unica">
              <input
                id={`pase-pedido-${m}`}
                type="radio"
                name="pase-pedido"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                disabled={enviando}
              />
              {t.pase_de_guardia[`motivo_${m}`]}
            </label>
          ))}
          <div className="form-field pwa-card-pie">
            <label htmlFor="pase-pedido-detalle">{t.pase_de_guardia.detalle_label}</label>
            <textarea
              id="pase-pedido-detalle"
              rows={2}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              disabled={enviando}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={pedirAutorizacion}
            disabled={enviando || !motivo}
          >
            {enviando ? t.pase_de_guardia.pidiendo_autorizacion : t.pase_de_guardia.pedir_autorizacion}
          </button>
          <button type="button" className="btn btn-secondary btn-full pwa-card-pie" onClick={volverAlCodigo} disabled={enviando}>
            {t.pase_de_guardia.volver_al_codigo}
          </button>
        </>
      )}

      {paso === 'esperando' && (
        <>
          <div className="estado-cargando" role="status">
            {enviando ? t.pase_de_guardia.confirmando : t.pase_de_guardia.esperando}
          </div>
          {botonEntrarIgual}
        </>
      )}

      {paso === 'sin_comprobar' && (
        <>
          <p className="guardia-card-detalle">{t.pase_de_guardia.sin_comprobar_titulo}</p>
          {MOTIVOS_SIN_COMPROBAR.map((m) => (
            <label key={m} htmlFor={`pase-motivo-${m}`} className="opcion-unica">
              <input
                id={`pase-motivo-${m}`}
                type="radio"
                name="pase-motivo"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                disabled={enviando}
              />
              {t.pase_de_guardia[`motivo_${m}`]}
            </label>
          ))}
          <div className="form-field pwa-card-pie">
            <label htmlFor="pase-detalle">{t.pase_de_guardia.detalle_label}</label>
            <textarea
              id="pase-detalle"
              rows={2}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              disabled={enviando}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => entregar({ motivoSinComprobar: motivo, detalle })}
            disabled={enviando || !motivo}
          >
            {enviando ? t.pase_de_guardia.confirmando : t.pase_de_guardia.sin_comprobar_continuar}
          </button>
          <button type="button" className="btn btn-secondary btn-full pwa-card-pie" onClick={volverAlCodigo} disabled={enviando}>
            {t.pase_de_guardia.volver_al_codigo}
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-secondary btn-full pwa-card-pie"
        onClick={async () => { await detenerCamara(); onCancelar(); }}
        disabled={enviando}
      >
        {t.comun.cancelar}
      </button>
    </div>
  );
}
