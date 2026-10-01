import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { horaDelMomento } from '../lib/horarios';
import { useSeVe } from '../context/PerfilContext';
import { useCirculo } from '../context/CirculoContext';
import { pantallaPermitida } from '../lib/interruptorDeCadaPantalla';
import DomicilioTemporal from '../components/DomicilioTemporal';
import EnlaceAlMapa from '../components/EnlaceAlMapa';
import AvisoInstruccionPendiente from '../components/AvisoInstruccionPendiente';
import TarjetaAcciones from '../components/TarjetaAcciones';

function segundosDesde(fecha) {
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 1000));
}

export default function PacienteDetalle() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const seVe = useSeVe();
  const { puedeVer } = useCirculo();
  // El resumen de alertas pregunta lo mismo que la ruta que las abre, con la misma función.
  const seEntraA = (pantalla) => pantallaPermitida(pantalla, seVe, puedeVer);
  // Se resuelve acá, como un sí o un no, porque además de decidir si se dibuja el mapa
  // decide si conviene abrir la escucha en vivo de la guardia: sin mapa no hay nada que
  // hacer con esas posiciones.
  //
  // Son las dos decisiones de siempre, y acá no pasan por el mapa de pantallas porque esto no
  // es una pantalla: es un bloque adentro de ésta. La Prestadora puede no ofrecer el
  // seguimiento en vivo, y el titular puede habérselo negado a alguien de su círculo.
  const veUbicacionEnVivo = seVe('familia_ubicacion_en_vivo') && puedeVer('circulo_ubicacion_en_vivo');
  const veAlertas = seEntraA('alertas');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [ubicacion, setUbicacion] = useState(null);
  const [, setTick] = useState(0);

  function cargar() {
    api
      .paciente(id)
      .then((data) => setDatos(data))
      .catch(() => setError(t.comun.error_generico));
  }

  useEffect(() => {
    setDatos(null);
    cargar();
  }, [id]);

  const guardiaActiva = datos?.guardiaActiva;

  useEffect(() => {
    if (!veUbicacionEnVivo || !guardiaActiva?.id) {
      setUbicacion(null);
      return;
    }
    if (guardiaActiva.ubicacion_actual_lat && guardiaActiva.ubicacion_actual_lng) {
      setUbicacion({
        lat: guardiaActiva.ubicacion_actual_lat,
        lng: guardiaActiva.ubicacion_actual_lng,
        at: guardiaActiva.ubicacion_actual_at,
      });
    }
    const canal = supabase
      .channel(`guardia-ubicacion-${guardiaActiva.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'guardias', filter: `id=eq.${guardiaActiva.id}` },
        (payload) => {
          const fila = payload.new;
          if (fila.ubicacion_actual_lat && fila.ubicacion_actual_lng) {
            setUbicacion({ lat: fila.ubicacion_actual_lat, lng: fila.ubicacion_actual_lng, at: fila.ubicacion_actual_at });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [guardiaActiva?.id, veUbicacionEnVivo]);

  useEffect(() => {
    if (!ubicacion) return;
    const intervalo = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(intervalo);
  }, [ubicacion]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (datos === null) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  const { paciente, guardiaProxima, alertasActivas } = datos;
  const guardia = guardiaActiva || guardiaProxima;
  const asistente = guardia?.asistentes;

  // "En camino" es el rato entre que el Asistente sale de su casa y llega al domicilio:
  // hay hora de salida registrada y todavía no hay hora de llegada.
  const enCamino = Boolean(guardia?.salida_checkin_at && !guardia?.checkin_at);

  return (
    <>
      {/* Con un solo Paciente la lista se saltea sola y ésta es la primera pantalla que ve la
          Familia, así que la advertencia de la instrucción sin firmar tiene que estar acá también. */}
      <AvisoInstruccionPendiente />

      <section className="pwa-card">
        <div className="mini">{t.paciente.rotulo}</div>
        <h1>{paciente.nombre}</h1>
        <div className="mini mini-abajo">
          {t.paciente.domicilio}: <EnlaceAlMapa lugar={paciente} t={t} />
        </div>
        {/* La dirección de arriba es la de hoy: mientras dura una estadía en otro lado, es esa y
            no la habitual. Acá se dice cuando ese es el caso, con el motivo que cargó la
            Prestadora. */}
        <DomicilioTemporal paciente={paciente} t={t} />
      </section>

      {veAlertas && alertasActivas.length > 0 && (
        <section className="pwa-card">
          <h2>{t.paciente.alertas_activas_titulo}</h2>
          {alertasActivas.map((a) => (
            <div key={a.id} className="pwa-card-dato">
              <span className={`badge badge-${a.nivel}`}>{traducirValor(t.alertas, `nivel_${a.nivel}`)}</span> {a.descripcion}
            </div>
          ))}
        </section>
      )}

      <section className="pwa-card">
        <h2>{guardiaActiva ? t.paciente.guardia_actual_titulo : t.paciente.guardia_proxima_titulo}</h2>

        {!guardia && <div className="pwa-card-dato estado-vacio" role="status">{t.paciente.sin_guardia}</div>}

        {guardia && (
          <>
            <div className="pwa-card-dato">
              {t.paciente.asistente_asignado}: {asistente?.nombre || t.paciente.sin_asistente}
              <div className="mini mini-abajo">
                {guardia.fecha} · {guardia.hora_inicio?.slice(0, 5)} - {guardia.hora_fin?.slice(0, 5)}
              </div>
              {guardiaActiva && !guardiaActiva.checkin_at && <div className="mini mini-abajo">{t.paciente.checkin_pendiente}</div>}
              {enCamino && <div className="mini mini-abajo">{t.paciente.en_camino}</div>}
              {/* A qué hora se estima que llega (pendiente #101). Es una hora y nada más: la Familia
                  nunca ve por dónde va quien viene. El punto del que salió el Asistente es casi
                  siempre su casa, y eso no viaja a este teléfono — el backend lo usa para la cuenta y
                  manda sólo el resultado.

                  Se dice «alrededor de» a propósito: una hora dicha en seco se lee como una promesa,
                  y quien espera a alguien que cuida a su madre la anota en la cabeza como si lo fuera.

                  Sin hora estimada —salida sin ubicación, o domicilio sin coordenadas— no se dibuja
                  nada. Inventar una hora es peor que no dar ninguna. */}
              {enCamino && guardia.llegada_estimada_at && (
                <div className="mini mini-abajo">
                  {t.paciente.llegada_estimada.replace('{hora}', horaDelMomento(guardia.llegada_estimada_at, locale))}
                </div>
              )}
            </div>
            <div className="pwa-card-pie">
              <span className="badge badge-ok">{traducirValor(t.guardias, `estado_${guardia.estado}`)}</span>
            </div>
          </>
        )}
      </section>

      {/* Apagado el mapa, la Familia sigue viendo que el Asistente llegó y que se fue: lo
          que desaparece es el recorrido, el título incluido. */}
      {guardiaActiva && veUbicacionEnVivo && (
        <section className="pwa-card">
          <h2>{t.paciente.ubicacion_en_vivo}</h2>
          {ubicacion ? (
            <>
              <iframe
                className="mapa-embed"
                title={t.paciente.ubicacion_en_vivo}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${ubicacion.lng - 0.01}%2C${ubicacion.lat - 0.01}%2C${ubicacion.lng + 0.01}%2C${ubicacion.lat + 0.01}&layer=mapnik&marker=${ubicacion.lat}%2C${ubicacion.lng}`}
              />
              <p className="mapa-actualizado">{t.paciente.ubicacion_actualizada.replace('{segundos}', segundosDesde(ubicacion.at))}</p>
            </>
          ) : (
            /* Sin esto el título y el mapa desaparecían juntos, y la Familia no sabía si el
               seguimiento no estaba andando o si todavía no había llegado ninguna posición. */
            <p className="mapa-actualizado">{t.paciente.ubicacion_sin_datos}</p>
          )}
        </section>
      )}

      {/* Ver guardias va primero a propósito: arriba se ve una sola guardia, y la pregunta que
          sigue siempre es qué pasa el resto de la semana. */}
      <TarjetaAcciones pacienteId={id} />
    </>
  );
}
