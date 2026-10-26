// La autorización de acceso tal como se firma: el documento y el código que llega por otro camino.
//
// La usan dos pantallas: la que abre la advertencia, cuando la autorización la armó la Prestadora,
// y la del alta de una persona autorizada, que muestra acá mismo lo que el titular acaba de cargar.
//
// CÓMO SE FIRMA, Y POR QUÉ ASÍ. Firmar es haber entrado con la contraseña —eso ya pasó, si está
// mirando esta pantalla— y confirmar con un código que llega por otro camino. Las dos cosas juntas
// son lo que después permite sostener que la autorización la dio él.
//
// EL TEXTO SE MUESTRA TAL CUAL LLEGÓ. Se guardó entero el día que se armó: si mañana cambia una
// descripción del catálogo, lo que se ve acá sigue siendo lo que se firma. El primer renglón es el
// título y va como `h1`, el único de la pantalla; el resto va en un `pre`, sin reacomodar nada.

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { useMarca } from '../context/PerfilContext';
import { mensajeDeError } from '../lib/errores';
import { fraseDeEspera } from '../lib/fraseDeEspera';

// Agotados los intentos, la autorización se bloquea unos minutos, igual que el cambio de
// contraseña, y se dice lo mismo: cuánto esperar.
function errorDeLaFirma(e, t, que) {
  return e?.motivo === 'demasiados_intentos' ? fraseDeEspera(t, e.minutos) : mensajeDeError(e, t, que);
}

const LARGO_DEL_CODIGO = 6;

export default function DocumentoParaFirmar({ instruccion, onFirmada }) {
  const { t } = useLocale();
  const marca = useMarca();
  const [pidiendoCodigo, setPidiendoCodigo] = useState(false);
  const [enviadoA, setEnviadoA] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [firmado, setFirmado] = useState(false);
  const campo = useRef(null);

  const [titulo, ...resto] = String(instruccion.documento_texto ?? '').split('\n');
  const cuerpo = resto.join('\n').replace(/^\n+/, '');

  useEffect(() => {
    if (enviadoA) campo.current?.focus();
  }, [enviadoA]);

  async function pedirCodigo() {
    setPidiendoCodigo(true);
    setError('');
    try {
      const { enviadoA: destino } = await api.pedirCodigoDeInstruccion(instruccion.id);
      setEnviadoA(destino);
      // El código anterior, si lo hubo, ya no sirve.
      setCodigo('');
    } catch (e) {
      setError(errorDeLaFirma(e, t, 'pedir el código de la autorización'));
    } finally {
      setPidiendoCodigo(false);
    }
  }

  async function confirmar(valor) {
    setConfirmando(true);
    setError('');
    try {
      await api.confirmarInstruccion(instruccion.id, valor);
      setFirmado(true);
      onFirmada?.();
    } catch (e) {
      setError(errorDeLaFirma(e, t, 'confirmar la autorización'));
      setCodigo('');
    } finally {
      setConfirmando(false);
    }
  }

  // Se firma solo al completar el sexto dígito: no hay nada más que decidir en ese momento.
  function escribir(e) {
    const valor = e.target.value.replace(/\D/g, '').slice(0, LARGO_DEL_CODIGO);
    setCodigo(valor);
    if (valor.length === LARGO_DEL_CODIGO && !confirmando) confirmar(valor);
  }

  return (
    <>
      <article className="pwa-card documento-autorizacion">
        <div className="documento-marca">
          {marca.logoUrl && <img className="logo-prestadora" src={marca.logoUrl} alt="" />}
          {marca.nombre && <p className="nombre-prestadora">{marca.nombre}</p>}
        </div>
        <h1 className="documento-titulo">{titulo}</h1>
        <pre className="documento-instruccion">{cuerpo}</pre>
      </article>

      {firmado ? (
        <div className="alert alert-success" role="status">{t.instruccion.firmada}</div>
      ) : !enviadoA ? (
        <>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button type="button" className="btn btn-primary btn-full btn-abajo" disabled={pidiendoCodigo} onClick={pedirCodigo}>
            {pidiendoCodigo ? t.instruccion.firmando : t.instruccion.firmar}
          </button>
        </>
      ) : (
        <section className="pwa-card">
          <div className="alert alert-info" role="status">
            {enviadoA === 'telefono' ? t.instruccion.codigo_enviado_whatsapp : t.instruccion.codigo_enviado_email}
          </div>
          <div className="form-field">
            <label htmlFor="codigo-autorizacion">{t.instruccion.campo_codigo}</label>
            <input
              id="codigo-autorizacion"
              ref={campo}
              // El teclado numérico y el relleno automático del código que acaba de llegar.
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LARGO_DEL_CODIGO}
              value={codigo}
              disabled={confirmando}
              onChange={escribir}
              aria-describedby={error ? 'codigo-autorizacion-error' : undefined}
              aria-invalid={error ? 'true' : undefined}
            />
            {error && <span className="form-error" id="codigo-autorizacion-error" role="alert">{error}</span>}
          </div>
          {confirmando ? (
            <div className="estado-cargando" role="status">{t.instruccion.confirmando}</div>
          ) : (
            <button type="button" className="btn-enlace" disabled={pidiendoCodigo} onClick={pedirCodigo}>
              {t.instruccion.reenviar}
            </button>
          )}
        </section>
      )}
    </>
  );
}
