import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { mensajeDeError } from '../lib/errores';
import { formatearImporte } from '../lib/dinero';

export default function AccesoIntermediacion() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const [acceso, setAcceso] = useState(undefined);
  const [error, setError] = useState('');
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [baja, setBaja] = useState(null);
  const [errorBaja, setErrorBaja] = useState('');

  const cargar = useCallback(() => {
    api
      .accesoIntermediacion(id)
      .then((data) => setAcceso(data.acceso))
      .catch((e) => setError(mensajeDeError(e, t, 'acceso de Match')));
  }, [id]);

  useEffect(() => {
    setAcceso(undefined);
    cargar();
  }, [cargar]);

  // La baja en un clic: un botón y nada más. No lleva una pantalla de confirmación a propósito —
  // el §3.2 del PRD pide que cancelar sea tan fácil como darse de alta—, y lo que hay que saber
  // antes de apretarlo está escrito arriba: qué se apaga y hasta cuándo sigue lo que ya se pagó.
  async function darDeBaja() {
    setDandoDeBaja(true);
    setErrorBaja('');
    try {
      const { baja: hecha } = await api.darDeBajaAcceso(acceso.id);
      setBaja(hecha);
      cargar();
    } catch (e) {
      setErrorBaja(mensajeDeError(e, t, 'dar de baja el acceso'));
    } finally {
      setDandoDeBaja(false);
    }
  }

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (acceso === undefined) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  return (
    <>
      <Link to={`/pacientes/${id}`} className="btn btn-volver">
        {t.comun.volver}
      </Link>

      <h1>{t.acceso.titulo}</h1>

      {!acceso && <div className="pwa-card estado-vacio" role="status">{t.acceso.sin_acceso}</div>}

      {acceso && (
        <>
          <section className="pwa-card">
            <div className="pwa-card-dato">
              {traducirValor(t.acceso, `estado_${acceso.estado}`)}
            </div>
            <div className="pwa-card-dato">
              {t.acceso.importe}: {formatearImporte(acceso.importe, acceso.moneda, locale)}
            </div>
            {acceso.proximo_cobro && (
              <div className="pwa-card-dato">
                {t.acceso.proximo_cobro}: {acceso.proximo_cobro}
              </div>
            )}
          </section>

          {/* La baja sólo aparece donde hay una renovación que apagar. Una forma que se cobra una
              sola vez no se da de baja: no hay nada que cancelar. */}
          {acceso.renueva_sola && (
            <section className="pwa-card">
              <h2>{t.acceso.baja_titulo}</h2>

              {acceso.cancelada_en || baja ? (
                <>
                  <div className="alert alert-success" role="status">{t.acceso.baja_hecha}</div>
                  <p className="pwa-card-dato">
                    {t.acceso.baja_cancelada_el.replace('{fecha}', (baja?.cancelada_en || acceso.cancelada_en).slice(0, 10))}
                  </p>
                  {(baja?.vigente_hasta || acceso.vigente_hasta || acceso.gratis_hasta) && (
                    <p className="pwa-card-dato">
                      {t.acceso.baja_hasta.replace('{fecha}', baja?.vigente_hasta || acceso.vigente_hasta || acceso.gratis_hasta)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {errorBaja && <div className="alert alert-error" role="alert">{errorBaja}</div>}
                  <button type="button" className="btn btn-secondary btn-full btn-abajo" onClick={darDeBaja} disabled={dandoDeBaja}>
                    {dandoDeBaja ? t.acceso.dando_de_baja : t.acceso.baja_boton}
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
