import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Cabecera } from '../../components/ui/Cabecera';
import { Estrellas } from '../../components/ui/Estrellas';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError, errorDeLaRespuesta } from '../../lib/errores';
import '../hojaDeTarjetas.css';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/match${path}`, {
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

export function MatchCalificaciones() {
  const { t } = useLocale();
  const [calificaciones, setCalificaciones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [cambiandoId, setCambiandoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { calificaciones: filas } = await llamarApi('/calificaciones');
      setCalificaciones(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function alternarVisibilidad(calificacion) {
    setCambiandoId(calificacion.id);
    setError(null);
    try {
      await llamarApi(`/calificaciones/${calificacion.id}/visibilidad`, {
        method: 'PATCH',
        body: JSON.stringify({ visible_publica: !calificacion.visible_publica }),
      });
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.match.calificaciones_titulo} />
      {error && <Alert variant="error">{error}</Alert>}

      <section className="panel-tarjeta hoja-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{t.match.calificaciones_titulo}</h2>
        {estado === 'listo' && <span className="panel-mini">{calificaciones.length}</span>}
      </div>
      <EstadoLista estado={estado} error={null} vacio={estado === 'listo' && calificaciones.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.match.col_asistente_calificado}</th>
              <th>{t.match.col_estrellas}</th>
              <th>{t.match.col_comentario}</th>
              <th>{t.match.col_descargo}</th>
              <th>{t.match.col_visible}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calificaciones.map((c) => (
              <tr key={c.id}>
                <td><b>{c.asistente_nombre || '—'}</b></td>
                <td>
                  <Estrellas cantidad={c.estrellas} />
                </td>
                <td>{c.comentario || '—'}</td>
                <td>{c.descargo_asistente || t.match.sin_descargo}</td>
                <td>{c.visible_publica ? t.comun.si : t.comun.no}</td>
                <td>
                  <Button variant="secondary" onClick={() => alternarVisibilidad(c)} disabled={cambiandoId === c.id}>
                    {c.visible_publica ? t.match.marcar_oculta : t.match.marcar_visible}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
      </section>
    </div>
  );
}
