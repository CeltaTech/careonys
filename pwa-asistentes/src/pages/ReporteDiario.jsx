import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

const ESTADOS_ANIMO = ['muy_bien', 'bien', 'regular', 'mal', 'muy_mal'];

function obtenerUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('sin_geo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolve({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      () => reject(new Error('sin_geo')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export default function ReporteDiario() {
  const { id } = useParams();
  const { t } = useLocale();
  const navigate = useNavigate();

  const [textoLibre, setTextoLibre] = useState('');
  const [estructurando, setEstructurando] = useState(false);
  const [estructurado, setEstructurado] = useState(null);
  const [foto, setFoto] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [guardadoOk, setGuardadoOk] = useState(false);

  async function alEstructurar() {
    setError('');
    setEstructurando(true);
    try {
      const { estructurado: data } = await api.estructurarReporte(id, textoLibre);
      setEstructurado(data);
    } catch (e) {
      setError(t.comun.error_generico);
    } finally {
      setEstructurando(false);
    }
  }

  function actualizarCampo(campo, valor) {
    setEstructurado((prev) => ({ ...prev, [campo]: valor }));
  }

  function actualizarAlimentacion(clave, valor) {
    setEstructurado((prev) => ({ ...prev, alimentacion: { ...prev.alimentacion, [clave]: valor } }));
  }

  function actualizarSignos(clave, valor) {
    setEstructurado((prev) => ({ ...prev, signos_vitales: { ...prev.signos_vitales, [clave]: valor } }));
  }

  async function alSubirFoto(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setFoto(archivo);
    try {
      const { fotoUrl: ruta } = await api.subirFotoReporte(id, archivo);
      setFotoUrl(ruta);
    } catch {
      setError(t.comun.error_generico);
    }
  }

  async function alConfirmar() {
    setError('');
    setConfirmando(true);
    try {
      const { lat, lng } = await obtenerUbicacion();
      await api.confirmarReporte(id, {
        textoLibre,
        alimentacion: estructurado.alimentacion,
        medicacion: estructurado.medicacion,
        signosVitales: estructurado.signos_vitales,
        estadoAnimo: estructurado.estado_animo,
        incidentes: estructurado.incidentes,
        observaciones: estructurado.observaciones,
        fotoUrl,
        lat,
        lng,
      });
      setGuardadoOk(true);
      setTimeout(() => navigate('/guardias'), 1500);
    } catch (e) {
      setError(e.message === 'sin_geo' ? t.guardia_activa.geo_no_disponible : t.comun.error_generico);
    } finally {
      setConfirmando(false);
    }
  }

  if (guardadoOk) return <div className="alert alert-info">{t.reporte.guardado_ok}</div>;

  return (
    <div>
      <Link to={`/guardias/${id}`} className="btn btn-secondary" style={{ marginBottom: '1rem', fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
        ← {t.comun.volver}
      </Link>
      <h1>{t.reporte.titulo}</h1>
      {error && <div className="alert alert-error">{error}</div>}

      {!estructurado && (
        <>
          <div className="form-field">
            <label htmlFor="texto-libre">{t.reporte.texto_libre_label}</label>
            <textarea
              id="texto-libre"
              value={textoLibre}
              onChange={(e) => setTextoLibre(e.target.value)}
              placeholder={t.reporte.texto_libre_placeholder}
              rows={6}
            />
          </div>
          <button className="btn btn-primary btn-full" onClick={alEstructurar} disabled={estructurando || !textoLibre.trim()}>
            {estructurando ? t.reporte.estructurando : t.reporte.estructurar}
          </button>
        </>
      )}

      {estructurado && (
        <>
          <h2>{t.reporte.revisar_titulo}</h2>

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_alimentacion}</label>
            <textarea
              value={estructurado.alimentacion?.descripcion || ''}
              onChange={(e) => actualizarAlimentacion('descripcion', e.target.value)}
              rows={2}
            />
          </div>

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_signos_vitales}</label>
            {['presion', 'temperatura', 'saturacion', 'glucemia'].map((clave) => (
              <input
                key={clave}
                value={estructurado.signos_vitales?.[clave] || ''}
                onChange={(e) => actualizarSignos(clave, e.target.value)}
                placeholder={clave}
                style={{ marginBottom: '0.4rem', width: '100%' }}
              />
            ))}
          </div>

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_estado_animo}</label>
            <select
              value={estructurado.estado_animo || ''}
              onChange={(e) => actualizarCampo('estado_animo', e.target.value || null)}
            >
              <option value="">—</option>
              {ESTADOS_ANIMO.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </div>

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_incidentes}</label>
            <textarea value={estructurado.incidentes || ''} onChange={(e) => actualizarCampo('incidentes', e.target.value)} rows={2} />
          </div>

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_observaciones}</label>
            <textarea value={estructurado.observaciones || ''} onChange={(e) => actualizarCampo('observaciones', e.target.value)} rows={3} />
          </div>

          <div className="form-field">
            <label htmlFor="foto">{t.reporte.agregar_foto}</label>
            <input id="foto" type="file" accept="image/jpeg,image/png" onChange={alSubirFoto} />
          </div>

          <button className="btn btn-exito btn-full" onClick={alConfirmar} disabled={confirmando}>
            {confirmando ? t.reporte.confirmando : t.reporte.confirmar}
          </button>
        </>
      )}
    </div>
  );
}
