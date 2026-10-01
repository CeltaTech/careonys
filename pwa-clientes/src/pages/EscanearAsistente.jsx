import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { nombreTipo } from '../lib/tipoDeAsistente';
import { mensajeDeError } from '../lib/errores';

const LECTOR_ID = 'lector-qr-asistente';

export default function EscanearAsistente() {
  const { id } = useParams();
  const { t } = useLocale();
  const lectorRef = useRef(null);
  const escaneandoRef = useRef(false);
  const [estado, setEstado] = useState('pidiendo_permiso');
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    iniciarCamara();
    return () => {
      detenerCamara();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarCamara() {
    setEstado('pidiendo_permiso');
    setError('');
    try {
      const lector = new Html5Qrcode(LECTOR_ID);
      lectorRef.current = lector;
      escaneandoRef.current = true;
      await lector.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (qrToken) => manejarLectura(qrToken),
        () => {},
      );
      setEstado('escaneando');
    } catch {
      setEstado('error');
      setError(t.escaneo.error_permiso);
    }
  }

  async function detenerCamara() {
    if (lectorRef.current && escaneandoRef.current) {
      escaneandoRef.current = false;
      try {
        await lectorRef.current.stop();
        lectorRef.current.clear();
      } catch {
        // la cámara ya pudo haberse detenido
      }
    }
  }

  async function manejarLectura(qrToken) {
    if (!escaneandoRef.current) return;
    escaneandoRef.current = false;
    await detenerCamara();
    setEstado('verificando');
    try {
      const datos = await api.verificarAsistente(id, qrToken);
      setResultado(datos);
      setEstado('resultado');
    } catch (e) {
      setEstado('error');
      // El único caso propio de esta pantalla es el código que no corresponde a nadie: eso
      // el backend lo contesta como "no encontrado". Todo lo demás —sin señal, sesión vencida,
      // función apagada en la Prestadora— lo explica lib/errores.js con las traducciones.
      setError(e?.status === 404 ? t.escaneo.error_qr_invalido : mensajeDeError(e, t, 'verificar el QR del Asistente'));
    }
  }

  function escanearDeNuevo() {
    setResultado(null);
    setError('');
    iniciarCamara();
  }

  return (
    <>
      <Link to={`/pacientes/${id}/asistente`} className="btn btn-volver">
        <span aria-hidden="true">←</span> {t.comun.volver}
      </Link>
      <h1>{t.escaneo.titulo}</h1>

      {estado === 'pidiendo_permiso' && <div className="estado-cargando" role="status">{t.escaneo.pidiendo_permiso}</div>}

      {(estado === 'pidiendo_permiso' || estado === 'escaneando') && (
        <section className="pwa-card">
          <p className="mini">{t.escaneo.instrucciones}</p>
          <div id={LECTOR_ID} className="foto-ancha mini-abajo lector-de-codigo" />
        </section>
      )}

      {estado === 'verificando' && <div className="estado-cargando" role="status">{t.escaneo.verificando}</div>}

      {estado === 'error' && (
        <section className="pwa-card">
          <div className="alert alert-error" role="alert">{error}</div>
          <div className="pwa-acciones">
            <button className="btn btn-primary btn-full" onClick={escanearDeNuevo}>
              {t.escaneo.volver_a_escanear}
            </button>
          </div>
        </section>
      )}

      {estado === 'resultado' && resultado && (
        <section className="pwa-card">
          {/* Estos motivos no son errores: llegan en una respuesta correcta y cada uno pinta
              la advertencia de otro color, así que no pasan por lib/errores.js. */}
          {resultado.motivo === 'sin_guardia_hoy' && (
            <div className="alert alert-info" role="status">{t.escaneo.resultado_sin_guardia}</div>
          )}
          {resultado.motivo === 'guardia_sin_cubrir' && (
            <div className="alert alert-alerta" role="status">{t.escaneo.resultado_sin_cubrir}</div>
          )}
          {resultado.motivo === 'asignado' && (
            <div className="alert alert-success" role="status">{t.escaneo.resultado_coincide}</div>
          )}
          {resultado.motivo === 'no_asignado' && (
            <div className="alert alert-error" role="alert">{t.escaneo.resultado_no_coincide}</div>
          )}

          <div className="guardia-card">
            {resultado.asistenteEscaneado.foto_url && (
              <img
                src={resultado.asistenteEscaneado.foto_url}
                alt={resultado.asistenteEscaneado.nombre}
                className="foto-persona-chica"
              />
            )}
            <div className="guardia-card-paciente">{resultado.asistenteEscaneado.nombre}</div>
            {resultado.tipoEscaneado && (
              <div className="guardia-card-detalle">
                {t.asistente.tipo}: {nombreTipo(resultado.tipoEscaneado, t)}
              </div>
            )}
            <div className="guardia-card-detalle">
              {resultado.certificado ? t.escaneo.certificado_vigente : t.escaneo.certificado_vencido}
            </div>
          </div>

          <p className="mini mini-abajo">{t.escaneo.alcance}</p>

          <div className="pwa-acciones">
            <button className="btn btn-secondary btn-full" onClick={escanearDeNuevo}>
              {t.escaneo.volver_a_escanear}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
