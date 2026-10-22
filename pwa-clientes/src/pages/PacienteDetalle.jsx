import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { horaDelMomento } from '../lib/horarios';
import { useSeVe } from '../context/PerfilContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { pantallaPermitida } from '../lib/interruptorDeCadaPantalla';
import DomicilioTemporal from '../components/DomicilioTemporal';
import EnlaceAlMapa from '../components/EnlaceAlMapa';
import AvisoInstruccionPendiente from '../components/AvisoInstruccionPendiente';
import TarjetaAcciones from '../components/TarjetaAcciones';

// Lo mismo que espera la aplicación del Asistente entre un punto y el siguiente: pedir más
// seguido no traería nada nuevo.
const CADA_CUANTO_SE_REFRESCA_MS = 20000;

function segundosDesde(fecha) {
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 1000));
}

export default function PacienteDetalle() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();
  // El resumen de alertas pregunta lo mismo que la ruta que las abre, con la misma función.
  const seEntraA = (pantalla) => pantallaPermitida(pantalla, seVe, puedeVer);
  // Son las dos decisiones de siempre, y acá no pasan por el mapa de pantallas porque esto no
  // es una pantalla: es un bloque adentro de ésta. La Prestadora puede no ofrecer el
  // seguimiento en vivo, y el titular puede habérselo negado a una de sus personas autorizadas.
  const veUbicacionEnVivo = seVe('cliente_ubicacion_en_vivo') && puedeVer('persona_autorizada_ubicacion_en_vivo');
  const veAlertas = seEntraA('alertas');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
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
  // La guardia que viene es la única que puede estar en viaje: el mapa sigue al Asistente desde
  // «Salgo ahora» hasta que escanea la entrada, y ahí el punto se borra.
  const guardiaProxima = datos?.guardiaProxima;
  const enViaje = Boolean(guardiaProxima?.salida_checkin_at);
  const ubicacion = enViaje && veUbicacionEnVivo && guardiaProxima.ubicacion_actual_lat && guardiaProxima.ubicacion_actual_lng
    ? { lat: guardiaProxima.ubicacion_actual_lat, lng: guardiaProxima.ubicacion_actual_lng, at: guardiaProxima.ubicacion_actual_at }
    : null;

  // Mientras hay una guardia por venir, la pantalla se vuelve a pedir cada tanto: así se entera
  // de «Salgo ahora», de cada punto nuevo y de la llegada sin que el Cliente recargue. Se le pide
  // al backend y no a la base en vivo porque el backend manda sólo las columnas que este Cliente
  // puede ver; la fila de la guardia lleva además el punto de salida, que no viaja a este teléfono.
  // Un refresco que falla deja lo último que se vio: la hora de la posición dice cuán vieja es.
  useEffect(() => {
    if (!guardiaProxima?.id) return undefined;
    const reloj = setInterval(() => {
      api.paciente(id).then(setDatos).catch(() => {});
    }, CADA_CUANTO_SE_REFRESCA_MS);
    return () => clearInterval(reloj);
  }, [guardiaProxima?.id, id]);

  useEffect(() => {
    if (!ubicacion) return undefined;
    const intervalo = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(intervalo);
  }, [ubicacion?.at]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (datos === null) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  const { paciente, alertasActivas } = datos;
  const guardia = guardiaActiva || guardiaProxima;
  const asistente = guardia?.asistentes;

  // "En camino" es el rato entre que el Asistente sale de su casa y llega al domicilio:
  // hay hora de salida registrada y todavía no hay hora de llegada.
  const enCamino = Boolean(guardia?.salida_checkin_at && !guardia?.checkin_at);

  return (
    <>
      {/* Con un solo Paciente la lista se saltea sola y ésta es la primera pantalla que ve el
          Cliente, así que la advertencia de la instrucción sin firmar tiene que estar acá también. */}
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
              {/* A qué hora se estima que llega (pendiente #101). El punto del que salió el
                  Asistente es casi siempre su casa, y eso no viaja a este teléfono — el backend lo
                  usa para la cuenta y manda sólo el resultado. Por dónde va lo muestra el mapa de
                  abajo, si la Prestadora lo tiene prendido.

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

      {/* El mapa es del viaje: aparece con «Salgo ahora» y se va al escanear la entrada. Apagado,
          el Cliente sigue viendo que el Asistente está en camino y la hora estimada: lo que
          desaparece es el recorrido, el título incluido. */}
      {!guardiaActiva && enViaje && veUbicacionEnVivo && (
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
            /* Sin esto el título y el mapa desaparecían juntos, y el Cliente no sabía si el
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
