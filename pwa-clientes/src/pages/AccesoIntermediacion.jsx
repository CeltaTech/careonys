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
        </>
      )}
    </>
  );
}
