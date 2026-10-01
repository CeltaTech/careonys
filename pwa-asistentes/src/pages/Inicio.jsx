import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { nombreTipo } from '../lib/tipoDeAsistente';
import { hoyISO } from '../lib/horarios';
import { guardiaQueSigue, estaEnCurso } from '../lib/proximaGuardia';
import { nombresDeLaTarjeta, cuandoEsLaGuardia } from '../lib/nombresDeLaGuardia';
import { con } from '../lib/textos';
import AvisoConsentimientoPendiente from '../components/AvisoConsentimientoPendiente';

// La primera pantalla: el saludo y la guardia que sigue. Las dos tarjetas piden sus datos por
// separado, cada una con sus cuatro estados, para que una que falla no se lleve a la otra.
export default function Inicio() {
  const { t } = useLocale();
  const { ofertasAbiertas = 0 } = useOutletContext() ?? {};

  const [perfil, setPerfil] = useState(null);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [pidiendoPerfil, setPidiendoPerfil] = useState(false);

  const [guardias, setGuardias] = useState(null);
  const [errorGuardias, setErrorGuardias] = useState('');
  const [pidiendoGuardias, setPidiendoGuardias] = useState(false);

  const pedirPerfil = useCallback(() => {
    setErrorPerfil('');
    setPidiendoPerfil(true);
    return api
      .perfil()
      .then(({ perfil: data }) => setPerfil(data ?? {}))
      .catch((e) => setErrorPerfil(mensajeDeError(e, t, 'cargar mi perfil')))
      .finally(() => setPidiendoPerfil(false));
  }, [t]);

  const pedirGuardias = useCallback(() => {
    setErrorGuardias('');
    setPidiendoGuardias(true);
    return api
      .misGuardias()
      .then(({ guardias: data }) => setGuardias(data ?? []))
      .catch((e) => setErrorGuardias(mensajeDeError(e, t, 'cargar mis guardias')))
      .finally(() => setPidiendoGuardias(false));
  }, [t]);

  useEffect(() => {
    pedirPerfil();
    pedirGuardias();
  }, [pedirPerfil, pedirGuardias]);

  const siguiente = guardias ? guardiaQueSigue(guardias) : null;
  const enCurso = estaEnCurso(siguiente);

  return (
    <div>
      <AvisoConsentimientoPendiente />

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
        <h2>{enCurso ? t.inicio.guardia_en_curso : t.inicio.proxima_guardia}</h2>
        {errorGuardias && (
          <div className="alert alert-error" role="alert">
            {errorGuardias}
            <button type="button" className="btn btn-secondary" onClick={pedirGuardias} disabled={pidiendoGuardias}>
              {t.comun.reintentar}
            </button>
          </div>
        )}
        {guardias === null && !errorGuardias && (
          <div className="estado-cargando" role="status">{t.comun.cargando}</div>
        )}
        {guardias !== null && !siguiente && (
          <div className="estado-vacio" role="status">{t.inicio.sin_proxima}</div>
        )}
        {siguiente && (
          <>
            <div className="pwa-card-dato">{cuandoEsLaGuardia(siguiente, t, hoyISO())}</div>
            <div className="mini mini-abajo">{nombresDeLaTarjeta(siguiente, t)}</div>
            <Link to={`/guardias/${siguiente.id}`} className="btn btn-primary btn-full pwa-card-pie">
              {enCurso ? t.inicio.abrir_guardia : t.inicio.registrar_inicio}
            </Link>
          </>
        )}
      </section>

      {ofertasAbiertas > 0 && (
        <section className="pwa-card">
          <h2>{t.ofertas.titulo}</h2>
          <div className="mini">
            {ofertasAbiertas === 1
              ? t.nav.ofertas_sin_contestar_una
              : con(t.nav.ofertas_sin_contestar, { n: ofertasAbiertas })}
          </div>
          <Link to="/ofertas" className="btn btn-full pwa-card-pie">
            {t.inicio.ver_ofertas}
          </Link>
        </section>
      )}
    </div>
  );
}
