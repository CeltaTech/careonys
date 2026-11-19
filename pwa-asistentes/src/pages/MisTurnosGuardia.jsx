import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { listarCola } from '../lib/colaOffline';
import { motivoQueSeMuestra } from '../lib/reglasDeLaCola';
import { suscribirseASincronizacion } from '../lib/sincronizarCola';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';
import { quedoSinCerrar } from '../lib/turnoGuardiaSinCerrar';
import { nombresDeLaTarjeta } from '../lib/nombresDelTurnoGuardia';
import CoberturasQueCubro from '../components/CoberturasQueCubro';
import { hayDomicilioTemporal } from '../components/DomicilioTemporal';

// LA PANTALLA DE INICIO PIDE SUS DATOS POR ZONAS SEPARADAS, y cada zona tiene sus cuatro estados
// y su propio botón de volver a intentar. Antes era una sola carga: si fallaba, la pantalla
// entera se reemplazaba por un renglón de error, sin nada para tocar. Eso es un callejón sin
// salida — quien acaba de entrar a trabajar se queda sin ver sus turnos de guardia y sin poder hacer nada.
//
// Las zonas son dos, y ninguna se lleva a la otra por delante:
//
//   1. LOS TURNOS, que los pide el backend.
//   2. LO QUE ESPERA SEÑAL EN ESTE TELÉFONO, que sale de la cola guardada en el aparato. No
//      depende del backend: cuando el backend no contesta es justamente cuando más importa, porque
//      es lo que le dice a la persona que lo que hizo no se perdió.

export default function MisTurnosGuardia() {
  const { t } = useLocale();
  const { sinResponder = 0 } = useOutletContext() ?? {};

  // Zona 1: los turnos de guardia.
  const [turnos_guardia, setTurnosGuardia] = useState(null);
  const [errorTurnosGuardia, setErrorTurnosGuardia] = useState('');
  const [pidiendoTurnosGuardia, setPidiendoTurnosGuardia] = useState(false);

  // Zona 2: lo que espera señal. `null` mientras no se leyó todavía.
  const [enEsteTelefono, setEnEsteTelefono] = useState(null);
  const [errorCola, setErrorCola] = useState('');
  const [pidiendoCola, setPidiendoCola] = useState(false);

  const pedirTurnosGuardia = useCallback(() => {
    setErrorTurnosGuardia('');
    setPidiendoTurnosGuardia(true);
    return api
      .misTurnosGuardia()
      .then(({ turnos_guardia: data }) => setTurnosGuardia(data ?? []))
      .catch((e) => setErrorTurnosGuardia(mensajeDeError(e, t, 'cargar mis turnos de guardia')))
      .finally(() => setPidiendoTurnosGuardia(false));
  }, [t]);

  // Qué turnos de guardia tienen algo esperando en este teléfono, y cuál de ellos quedó con un rechazo.
  // La cola ya viene filtrada por quien tiene la sesión abierta: lo de otra cuenta no se lista.
  const pedirCola = useCallback(() => {
    setErrorCola('');
    setPidiendoCola(true);
    return listarCola()
      .then((cola) => {
        const porTurnoGuardia = new Map();
        for (const item of cola) {
          const motivo = motivoQueSeMuestra(item);
          if (!porTurnoGuardia.has(item.turnoGuardiaId)) porTurnoGuardia.set(item.turnoGuardiaId, '');
          if (motivo) porTurnoGuardia.set(item.turnoGuardiaId, motivo);
        }
        setEnEsteTelefono(porTurnoGuardia);
      })
      .catch((e) => setErrorCola(mensajeDeError(e, t, 'leer lo que espera señal')))
      .finally(() => setPidiendoCola(false));
  }, [t]);

  useEffect(() => {
    pedirTurnosGuardia();
    pedirCola();
    const desuscribir = suscribirseASincronizacion(pedirCola);
    return desuscribir;
  }, [pedirTurnosGuardia, pedirCola]);

  // La lista cambia sin que el Asistente toque nada —una licencia esconde turnos de guardia, una vuelta
  // anotada las devuelve—, así que se vuelve a pedir cada vez que vuelve a mirar el teléfono.
  useEffect(() => {
    const alVolverAMirar = () => {
      if (document.visibilityState === 'visible') pedirTurnosGuardia();
    };
    document.addEventListener('visibilitychange', alVolverAMirar);
    return () => document.removeEventListener('visibilitychange', alVolverAMirar);
  }, [pedirTurnosGuardia]);

  return (
    <div>
      {/* El título va siempre, también cuando algo falló y cuando no hay ningún turno de guardia. Sin él,
          la pantalla no tiene encabezado y quien la recorre con un lector de pantalla no sabe
          dónde está. */}
      <h1>{t.turnos_guardia.titulo}</h1>

      {/* Las asignaciones sin responder cuelgan de acá: es la pestaña que lleva el número de las
          que esperan respuesta. */}
      <section className="pwa-card">
        <h2>{t.asignaciones.titulo}</h2>
        {sinResponder > 0 && (
          <div className="mini">
            {sinResponder === 1
              ? t.nav.sin_responder_una
              : con(t.nav.sin_responder, { n: sinResponder })}
          </div>
        )}
        <Link to="/asignaciones" className="btn btn-full pwa-card-pie">
          {t.inicio.ver_asignaciones}
        </Link>
      </section>

      {errorCola && (
        <div className="alert alert-error" role="alert">
          {errorCola}
          <button type="button" className="btn btn-secondary" onClick={pedirCola} disabled={pidiendoCola}>
            {t.comun.reintentar}
          </button>
        </div>
      )}

      {errorTurnosGuardia && (
        <div className="alert alert-error" role="alert">
          {errorTurnosGuardia}
          <button type="button" className="btn btn-secondary" onClick={pedirTurnosGuardia} disabled={pidiendoTurnosGuardia}>
            {t.comun.reintentar}
          </button>
        </div>
      )}

      {/* Lo que ya estaba leído se queda donde está: un intento que falla no borra la lista. */}
      {turnos_guardia === null && !errorTurnosGuardia && (
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      )}

      {turnos_guardia !== null && turnos_guardia.length === 0 && (
        <div className="estado-vacio" role="status">{t.turnos_guardia.sin_turnos_guardia}</div>
      )}

      <CoberturasQueCubro />

      {(turnos_guardia ?? []).map((g) => (
        <Link key={g.id} to={`/turnos-guardia/${g.id}`} className="tarjeta">
          <div className="tarjeta-paciente">{nombresDeLaTarjeta(g, t)}</div>
          <div className="tarjeta-detalle">
            {g.fecha} · {g.hora_inicio?.slice(0, 5)} - {g.hora_fin?.slice(0, 5)}
          </div>
          <span className="badge">{traducirValor(t.turnos_guardia, `estado_${g.estado}`)}</span>
          {/* Esta tarjeta no muestra direcciones —alcanza con saber a quién y a qué hora—, pero
              sí tiene que avisar cuando la de ese día no es la de siempre: es lo que hace abrir
              el turno de guardia antes de salir, en lugar de arrancar de memoria hacia la casa de
              siempre. La dirección y el motivo están adentro. */}
          {hayDomicilioTemporal(g.pacientes) && (
            <span className="badge badge-alerta">{t.domicilio.temporal}</span>
          )}
          {quedoSinCerrar(g) && <span className="badge badge-alerta">{t.turnos_guardia.sin_cerrar}</span>}
          {/* Lo que espera señal, y lo que el backend rechazó. En una tarjeta de lista no entra la
              frase entera del rechazo: acá se dice cuál es el turno de guardia y el motivo se lee adentro,
              que es donde hay lugar para contarlo. */}
          {enEsteTelefono?.has(g.id) && (
            <span className="badge badge-alerta">
              {enEsteTelefono.get(g.id) ? (
                t.comun.no_se_pudo_enviar
              ) : (
                <>
                  <span aria-hidden="true">⏳</span> {t.comun.pendiente_de_enviar}
                </>
              )}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
