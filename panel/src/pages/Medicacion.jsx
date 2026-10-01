import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAdvertenciaLegal } from '../context/AdvertenciaLegalContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import '../styles/molde-paginas.css';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/medicacion${path}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}

export function Medicacion() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { verificarAntesDeActivar } = useAdvertenciaLegal();
  const [pendientes, setPendientes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { pendientes: filas } = await llamarApi('/pendientes');
      setPendientes(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function aceptar(fila) {
    if (fila.sinMatricula) {
      const respuesta = await verificarAntesDeActivar(prestadoraId, 'medicacion_via_sin_matricula');
      // No se pudo consultar si hay advertencia que mostrar: se lo dice y no se acepta nada. La
      // alternativa —seguir como si no hubiera nada que advertir— es la que se corrigió.
      if (respuesta === 'error') {
        setError(t.comun.error_generico);
        return;
      }
      if (respuesta !== 'seguir') return;
    }
    setAccionEnCurso(fila.id);
    setError(null);
    try {
      await llamarApi(`/${fila.id}/aceptar`, { method: 'POST' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function confirmarRechazo(fila) {
    if (!motivoRechazo) return;
    setAccionEnCurso(fila.id);
    setError(null);
    try {
      await llamarApi(`/${fila.id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo_rechazo: motivoRechazo }) });
      setRechazando(null);
      setMotivoRechazo('');
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function verArchivo(ruta) {
    try {
      const { url } = await llamarApi(`/archivo-url?ruta=${encodeURIComponent(ruta)}`);
      window.open(url, '_blank', 'noreferrer');
    } catch {
      setError(t.comun.error_generico);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.medicacion.titulo} />
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && pendientes.length === 0} recargar={recargar}>
        <div className="molde-pila">
          {pendientes.map((fila) => (
            <section key={fila.id} className="panel-tarjeta">
              <div className="panel-tarjeta-titulo">
                <h2>{fila.pacientes?.nombre}</h2>
                {fila.prescripcion_archivo_url && (
                  <button type="button" className="panel-enlace" onClick={() => verArchivo(fila.prescripcion_archivo_url)}>
                    {t.medicacion.ver_prescripcion}
                  </button>
                )}
              </div>
              <div className="panel-fila-alerta">
                <div>
                  <b>{fila.medicamento}</b>
                  <span className="panel-mini">
                    {fila.dosis} · {fila.frecuencia} ({fila.via_administracion})
                  </span>
                </div>
                <span className="panel-mini">
                  {t.medicacion.desde}: {fila.fecha_desde} {fila.fecha_hasta ? `— ${t.medicacion.hasta}: ${fila.fecha_hasta}` : ''}
                </span>
              </div>
              {fila.sinMatricula && <Alert variant="info">{t.medicacion.sin_matricula_aviso}</Alert>}

              {rechazando === fila.id ? (
                <>
                  <div className="molde-formgrid">
                    <div className="molde-ancho">
                      <FormField
                        label={t.medicacion.motivo_rechazo}
                        name={`motivo-${fila.id}`}
                        value={motivoRechazo}
                        onChange={(e) => setMotivoRechazo(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="molde-acciones">
                    <Button variant="secondary" onClick={() => { setRechazando(null); setMotivoRechazo(''); }} disabled={accionEnCurso === fila.id}>
                      {t.comun.cancelar}
                    </Button>
                    <Button onClick={() => confirmarRechazo(fila)} disabled={accionEnCurso === fila.id || !motivoRechazo}>
                      {accionEnCurso === fila.id ? t.comun.guardando : t.medicacion.confirmar_rechazo}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="molde-acciones">
                  <Button variant="secondary" onClick={() => setRechazando(fila.id)} disabled={accionEnCurso === fila.id}>
                    {t.medicacion.rechazar}
                  </Button>
                  <Button onClick={() => aceptar(fila)} disabled={accionEnCurso === fila.id}>
                    {accionEnCurso === fila.id ? t.comun.guardando : t.medicacion.aceptar}
                  </Button>
                </div>
              )}
            </section>
          ))}
        </div>
      </EstadoLista>
    </div>
  );
}
