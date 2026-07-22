import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';

const ESTADOS_ANIMO = ['muy_bien', 'bien', 'regular', 'mal', 'muy_mal'];
const CARAS_ANIMO = { muy_bien: '😄', bien: '🙂', regular: '😐', mal: '🙁', muy_mal: '😣' };

const SIGNOS = ['presion_sistolica', 'presion_diastolica', 'temperatura', 'saturacion', 'glucemia'];

function parseNumero(texto) {
  if (texto === null || texto === undefined) return '';
  const match = String(texto).match(/-?\d+([.,]\d+)?/);
  return match ? match[0].replace(',', '.') : '';
}

function signosIniciales(signosIA) {
  const presionMatch = String(signosIA?.presion || '').match(/(\d+)\D+(\d+)/);
  return {
    presion_sistolica: presionMatch ? presionMatch[1] : '',
    presion_diastolica: presionMatch ? presionMatch[2] : '',
    temperatura: parseNumero(signosIA?.temperatura),
    saturacion: parseNumero(signosIA?.saturacion),
    glucemia: parseNumero(signosIA?.glucemia),
  };
}

function colorSigno(valor, rango) {
  if (!rango || valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  if (Number.isNaN(numero)) return null;
  return numero >= rango.min && numero <= rango.max ? 'normal' : 'alerta';
}

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
  const [vitalesHabilitados, setVitalesHabilitados] = useState(false);
  const [rangosVitales, setRangosVitales] = useState({});

  useEffect(() => {
    let activo = true;
    api
      .guardia(id)
      .then(({ vitalesHabilitados: habilitados, rangosVitales: rangos }) => {
        if (!activo) return;
        setVitalesHabilitados(!!habilitados);
        setRangosVitales(rangos || {});
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [id]);

  async function alEstructurar() {
    setError('');
    setEstructurando(true);
    try {
      const { estructurado: data } = await api.estructurarReporte(id, textoLibre);
      setEstructurado({ ...data, signos_vitales: signosIniciales(data.signos_vitales) });
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
        signosVitales: vitalesHabilitados ? estructurado.signos_vitales : null,
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
        <span aria-hidden="true">←</span> {t.comun.volver}
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

          {vitalesHabilitados && (
            <div className="reporte-preview-campo">
              <label>{t.reporte.campo_signos_vitales}</label>
              {SIGNOS.map((signo) => {
                const rango = rangosVitales[signo];
                const color = colorSigno(estructurado.signos_vitales?.[signo], rango);
                return (
                  <div key={signo} className={`signo-vital-fila${color ? ` signo-vital-${color}` : ''}`} style={{ marginBottom: '0.4rem' }}>
                    <label htmlFor={`signo-${signo}`}>
                      {t.reporte[`signo_${signo}`]} {rango ? `(${rango.unidad})` : ''}
                    </label>
                    <input
                      id={`signo-${signo}`}
                      type="number"
                      step="0.1"
                      value={estructurado.signos_vitales?.[signo] || ''}
                      onChange={(e) => actualizarSignos(signo, e.target.value)}
                      style={{ width: '100%' }}
                    />
                    {color === 'alerta' && <span className="signo-vital-aviso">{t.reporte.signo_fuera_de_rango}</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="reporte-preview-campo">
            <label>{t.reporte.campo_estado_animo}</label>
            <div className="escala-animo">
              {ESTADOS_ANIMO.map((estado) => (
                <button
                  key={estado}
                  type="button"
                  className={`escala-animo-opcion${estructurado.estado_animo === estado ? ' seleccionada' : ''}`}
                  onClick={() => actualizarCampo('estado_animo', estado)}
                  aria-pressed={estructurado.estado_animo === estado}
                  title={t.reporte[`animo_${estado}`]}
                >
                  <span aria-hidden="true">{CARAS_ANIMO[estado]}</span>
                  <span className="escala-animo-etiqueta">{t.reporte[`animo_${estado}`]}</span>
                </button>
              ))}
            </div>
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
