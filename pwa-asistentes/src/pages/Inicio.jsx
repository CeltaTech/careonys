import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { nombreTipo } from '../lib/tipoDeAsistente';
import { hoyISO } from '../lib/horarios';
import { turnoGuardiaQueSigue, estaEnCurso } from '../lib/proximaTurnoGuardia';
import { nombresDeLaTarjeta, cuandoEsElTurnoGuardia } from '../lib/nombresDelTurnoGuardia';
import { con } from '../lib/textos';

// La primera pantalla: el saludo y el turno de guardia que sigue. Las dos tarjetas piden sus datos por
// separado, cada una con sus cuatro estados, para que una que falla no se lleve a la otra.
export default function Inicio() {
  const { t } = useLocale();
  const { sinResponder = 0 } = useOutletContext() ?? {};

  const [perfil, setPerfil] = useState(null);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [pidiendoPerfil, setPidiendoPerfil] = useState(false);

  const [turnos_guardia, setTurnosGuardia] = useState(null);
  const [errorTurnosGuardia, setErrorTurnosGuardia] = useState('');
  const [pidiendoTurnosGuardia, setPidiendoTurnosGuardia] = useState(false);

  const pedirPerfil = useCallback(() => {
    setErrorPerfil('');
    setPidiendoPerfil(true);
    return api
      .perfil()
      .then(({ perfil: data }) => setPerfil(data ?? {}))
      .catch((e) => setErrorPerfil(mensajeDeError(e, t, 'cargar mi perfil')))
      .finally(() => setPidiendoPerfil(false));
  }, [t]);

  const pedirTurnosGuardia = useCallback(() => {
    setErrorTurnosGuardia('');
    setPidiendoTurnosGuardia(true);
    return api
      .misTurnosGuardia()
      .then(({ turnos_guardia: data }) => setTurnosGuardia(data ?? []))
      .catch((e) => setErrorTurnosGuardia(mensajeDeError(e, t, 'cargar mis turnos de guardia')))
      .finally(() => setPidiendoTurnosGuardia(false));
  }, [t]);

  useEffect(() => {
    pedirPerfil();
    pedirTurnosGuardia();
  }, [pedirPerfil, pedirTurnosGuardia]);

  // La lista cambia sin que el Asistente toque nada —una licencia esconde turnos de guardia, una vuelta
  // anotada las devuelve—, así que se vuelve a pedir cada vez que vuelve a mirar el teléfono.
  useEffect(() => {
    const alVolverAMirar = () => {
      if (document.visibilityState === 'visible') pedirTurnosGuardia();
    };
    document.addEventListener('visibilitychange', alVolverAMirar);
    return () => document.removeEventListener('visibilitychange', alVolverAMirar);
  }, [pedirTurnosGuardia]);

  const siguiente = turnos_guardia ? turnoGuardiaQueSigue(turnos_guardia) : null;
  const enCurso = estaEnCurso(siguiente);

  return (
    <div>
      {/* El saludo lleva a Mi Perfil: es donde están sus datos, la clave y la salida. */}
      {errorPerfil ? (
        <div className="pwa-card">
          <div className="alert alert-error" role="alert">
            {errorPerfil}
            <button type="button" className="btn btn-secondary" onClick={pedirPerfil} disabled={pidiendoPerfil}>
              {t.comun.reintentar}
            </button>
          </div>
        </div>
      ) : (
        <Link to="/perfil" className="pwa-card">
          <div className="mini">{t.inicio.hola}</div>
          {perfil === null ? (
            <div className="estado-cargando" role="status">{t.comun.cargando}</div>
          ) : (
            <>
              <h1 className="saludo-nombre">{perfil.nombre || t.perfil.titulo}</h1>
              <div className="mini mini-abajo">{nombreTipo(perfil.tipos_asistente, t)}</div>
            </>
          )}
        </Link>
      )}

      <section className="pwa-card">
        <h2>{enCurso ? t.inicio.turno_guardia_en_curso : t.inicio.proxima_turno_guardia}</h2>
        {errorTurnosGuardia && (
          <div className="alert alert-error" role="alert">
            {errorTurnosGuardia}
            <button type="button" className="btn btn-secondary" onClick={pedirTurnosGuardia} disabled={pidiendoTurnosGuardia}>
              {t.comun.reintentar}
            </button>
          </div>
        )}
        {turnos_guardia === null && !errorTurnosGuardia && (
          <div className="estado-cargando" role="status">{t.comun.cargando}</div>
        )}
        {turnos_guardia !== null && !siguiente && (
          <div className="estado-vacio" role="status">{t.inicio.sin_proxima}</div>
        )}
        {siguiente && (
          <>
            <div className="pwa-card-dato">{cuandoEsElTurnoGuardia(siguiente, t, hoyISO())}</div>
            <div className="mini mini-abajo">{nombresDeLaTarjeta(siguiente, t)}</div>
            <Link to={`/turnos-guardia/${siguiente.id}`} className="btn btn-primary btn-full pwa-card-pie">
              {enCurso ? t.inicio.abrir_turno_guardia : t.inicio.registrar_inicio}
            </Link>
          </>
        )}
      </section>

      {sinResponder > 0 && (
        <section className="pwa-card">
          <h2>{t.asignaciones.titulo}</h2>
          <div className="mini">
            {sinResponder === 1
              ? t.nav.sin_responder_una
              : con(t.nav.sin_responder, { n: sinResponder })}
          </div>
          <Link to="/asignaciones" className="btn btn-full pwa-card-pie">
            {t.inicio.ver_asignaciones}
          </Link>
        </section>
      )}
    </div>
  );
}
