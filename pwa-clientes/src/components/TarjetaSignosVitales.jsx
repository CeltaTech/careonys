import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import {
  esteAparatoGuardaLlaves,
  firmarConLaLlaveDelAparato,
  guardarLaLlaveEnEsteAparato,
  loCancelaronAMano,
} from '../lib/llaveDelDispositivo';

/**
 * La autorización para que un Asistente le tome los signos vitales al Paciente. La casilla se
 * marca sola cuando hay una aceptada. Sin ninguna —ni pendiente—, el titular la firma acá o sube
 * el documento firmado, que queda pendiente hasta que se lo acepte en el Panel.
 *
 * Firmar es tocar «Firmar» con el texto delante: no hay casilla de por medio. El texto vuelve con
 * su identificador de verificación, y la base comprueba que se firmó ese y no otro.
 */
export default function TarjetaSignosVitales({ pacienteId }) {
  const { t, locale } = useLocale();
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [guardaLlaves, setGuardaLlaves] = useState(false);
  const [paraFirmar, setParaFirmar] = useState(null);
  const [firmado, setFirmado] = useState(null);
  const elegirArchivo = useRef(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError('');
    setParaFirmar(null);
    setFirmado(null);
    try {
      setDatos(await api.autorizacionSignosVitales(pacienteId));
      setEstado('listo');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t, 'autorización de signos vitales'));
      setEstado('error');
    }
  }, [pacienteId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    esteAparatoGuardaLlaves().then(setGuardaLlaves);
  }, []);

  async function ejecutar(accion, contexto) {
    setOcupado(true);
    setError('');
    try {
      return await accion();
    } catch (fallo) {
      if (!loCancelaronAMano(fallo)) setError(mensajeDeError(fallo, t, contexto));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function ver() {
    const documento = await ejecutar(() => api.verAutorizacionSignosVitales(datos.autorizacion.id), 'documento firmado');
    if (documento?.url) window.open(documento.url, '_blank', 'noopener');
    else if (documento) setFirmado(documento);
  }

  async function mostrarTexto() {
    const documento = await ejecutar(() => api.documentoSignosVitales(pacienteId, locale), 'texto para firmar');
    if (documento) setParaFirmar(documento);
  }

  async function firmar() {
    const hecho = await ejecutar(async () => {
      let firma;
      try {
        firma = await firmarConLaLlaveDelAparato(api.desafioDeFirma);
      } catch (sinLlave) {
        // Sin llave en este teléfono, el propio teléfono ofrece guardarla y después se firma.
        if (sinLlave?.motivo !== 'sin_llave') throw sinLlave;
        await guardarLaLlaveEnEsteAparato({ desafio: api.desafioDeLlave, guardar: api.guardarLlave });
        firma = await firmarConLaLlaveDelAparato(api.desafioDeFirma);
      }
      return api.firmarSignosVitales(pacienteId, {
        respuesta: firma,
        verificador: paraFirmar.verificador,
        idioma: paraFirmar.idioma,
      });
    }, 'firmar la autorización');
    if (hecho) cargar();
  }

  async function subir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    const hecho = await ejecutar(() => api.subirSignosVitales(pacienteId, locale, cuerpo), 'subir el documento');
    if (hecho) cargar();
  }

  const autorizacion = datos?.autorizacion;
  const puedeFirmar = datos?.puedeFirmar && !autorizacion;

  return (
    <section className="pwa-card" aria-labelledby="tarjeta-signos-vitales">
      <h2 id="tarjeta-signos-vitales">{t.vitales_autorizacion.titulo}</h2>

      {estado === 'cargando' && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {estado === 'listo' && (
        <>
          <label className="pwa-card-dato">
            <input type="checkbox" checked={autorizacion?.estado === 'aceptada'} readOnly disabled />{' '}
            {t.vitales_autorizacion.autorizacion}
          </label>

          {firmado?.texto && <div className="texto-a-aceptar">{firmado.texto}</div>}
          {paraFirmar && <div className="texto-a-aceptar">{paraFirmar.texto}</div>}

          <div className="pwa-acciones">
            {autorizacion && !firmado && (
              <button type="button" className="btn" onClick={ver} disabled={ocupado}>
                {t.vitales_autorizacion.ver}
              </button>
            )}
            {puedeFirmar && paraFirmar && (
              <>
                <button type="button" className="btn" onClick={() => setParaFirmar(null)} disabled={ocupado}>
                  {t.comun.cancelar}
                </button>
                <button type="button" className="btn btn-primary" onClick={firmar} disabled={ocupado}>
                  {t.vitales_autorizacion.firmar}
                </button>
              </>
            )}
            {puedeFirmar && !paraFirmar && (
              <>
                {guardaLlaves && (
                  <button type="button" className="btn" onClick={mostrarTexto} disabled={ocupado}>
                    {t.vitales_autorizacion.firmar}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => elegirArchivo.current?.click()} disabled={ocupado}>
                  {t.vitales_autorizacion.subir_documento}
                </button>
                <input
                  ref={elegirArchivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  hidden
                  onChange={subir}
                />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
