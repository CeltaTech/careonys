import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { LOCALES } from '../../i18n/translations';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* La medicación que carga el Cliente: si se le pide la firma, y el texto que acepta.

   Mismo criterio que el texto del Pagador: el producto trae un modelo y la Prestadora lo adopta,
   lo cambia o vuelve a él. Hay un texto por idioma, porque el Cliente lo lee en el suyo, y el
   desplegable de idioma muestra lo mismo que el del encabezado. */
export function ConsentimientoMedicacionTab() {
  const { t, locale } = useLocale();
  const [datos, setDatos] = useState(null);
  const [idioma, setIdioma] = useState(locale);
  const [cuerpos, setCuerpos] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const vigente = await llamarApi('/consentimiento-medicacion');
      setDatos(vigente);
      setCuerpos(Object.fromEntries(LOCALES.map((l) => [l, vigente.textos[l]?.cuerpo ?? ''])));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function cambiarPideFirma(pideFirma) {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/consentimiento-medicacion/pide-firma', {
        method: 'PUT',
        body: JSON.stringify({ pideFirma }),
      });
      setDatos((d) => ({ ...d, pideFirma }));
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/consentimiento-medicacion', {
        method: 'PUT',
        body: JSON.stringify({ cuerpo: cuerpos[idioma], idioma }),
      });
      setGuardado(true);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  const delIdioma = datos?.textos[idioma];

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.consentimiento_medicacion_titulo}</h2>
      </div>
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        {datos && (
          <>
            {error && <Alert variant="error">{error}</Alert>}
            {guardado && <Alert variant="info">{t.configuracion.consentimiento_pagador_guardado}</Alert>}

            <div className="molde-formgrid">
              <FormField
                label={t.configuracion.consentimiento_medicacion_pide_firma}
                name="consentimiento_medicacion_pide_firma"
                type="checkbox"
                checked={datos.pideFirma}
                onChange={(e) => cambiarPideFirma(e.target.checked)}
                disabled={guardando}
              />
              <FormField
                label={t.preferencias.idioma}
                name="consentimiento_medicacion_idioma"
                type="select"
                value={idioma}
                onChange={(e) => {
                  setIdioma(e.target.value);
                  setGuardado(false);
                }}
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </FormField>
            </div>

            <Alert variant="info">
              {delIdioma?.esDelProducto
                ? t.configuracion.consentimiento_pagador_es_modelo
                : t.configuracion.consentimiento_pagador_es_propio}
            </Alert>

            <div className="molde-formgrid">
              <div className="molde-ancho">
                <FormField
                  label={t.configuracion.consentimiento_medicacion_cuerpo}
                  name="consentimiento_medicacion_cuerpo"
                  type="textarea"
                  rows={10}
                  value={cuerpos[idioma] ?? ''}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setCuerpos((c) => ({ ...c, [idioma]: valor }));
                    setGuardado(false);
                  }}
                />
              </div>

              <div className="molde-ancho">
                {datos.marcadores.map((marcador) => (
                  <Fragment key={marcador}>
                    <span className="badge badge-neutro">{marcador}</span>{' '}
                  </Fragment>
                ))}
              </div>
            </div>

            <div className="molde-acciones">
              {!delIdioma?.esDelProducto && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCuerpos((c) => ({ ...c, [idioma]: '' }));
                    setGuardado(false);
                  }}
                  disabled={guardando}
                >
                  {t.configuracion.consentimiento_pagador_volver_al_modelo}
                </Button>
              )}
              <Button onClick={guardar} disabled={guardando}>
                {guardando ? t.comun.guardando : t.comun.guardar}
              </Button>
            </div>
          </>
        )}
      </EstadoLista>
    </section>
  );
}
