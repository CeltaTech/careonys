// La autorización de acceso que espera la firma del titular, cuando la armó la Prestadora desde
// el Panel. Se llega desde la advertencia que ve el titular en las otras pantallas.
//
// ESTO NO FRENA NADA. Hasta que la firme sigue rigiendo lo anterior, así que se puede volver sin
// firmar: la advertencia queda a la vista hasta que lo haga.

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { mensajeDeError } from '../lib/errores';
import DocumentoParaFirmar from '../components/DocumentoParaFirmar';

// Cuánto queda a la vista la confirmación antes de volver sola. Lo suficiente para leerla.
export const MS_ANTES_DE_VOLVER = 2500;

export default function FirmarInstruccion() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { recargar } = usePersonasAutorizadas();

  // `undefined` mientras se pregunta, `null` cuando no hay ninguna: son dos estados distintos y
  // se dibujan distinto.
  const [instruccion, setInstruccion] = useState(undefined);
  const [error, setError] = useState('');
  const reloj = useRef(null);

  // A dónde se vuelve: la pantalla de la que salió la advertencia, o la de siempre.
  const desde = location.state?.desde ?? '/pacientes';

  useEffect(() => {
    let activo = true;
    api
      .instruccionPendiente()
      .then(({ instruccion: pendiente }) => {
        if (activo) setInstruccion(pendiente ?? null);
      })
      .catch((e) => {
        if (activo) setError(mensajeDeError(e, t, 'autorización de acceso'));
      });
    return () => {
      activo = false;
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, []);

  function alFirmar() {
    // Recién ahora la advertencia tiene que desaparecer de todas las pantallas.
    recargar();
    reloj.current = setTimeout(() => navigate(desde, { replace: true }), MS_ANTES_DE_VOLVER);
  }

  const volver = (
    <Link to={desde} className="btn btn-volver">
      <span aria-hidden="true">←</span> {t.comun.volver}
    </Link>
  );

  if (error) {
    return (
      <>
        {volver}
        <div className="alert alert-error" role="alert">{error}</div>
      </>
    );
  }

  if (instruccion === undefined) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  if (instruccion === null) {
    return (
      <>
        {volver}
        <h1>{t.instruccion.titulo}</h1>
        <div className="pwa-card estado-vacio" role="status">{t.instruccion.sin_instruccion}</div>
      </>
    );
  }

  return (
    <>
      {volver}
      <DocumentoParaFirmar instruccion={instruccion} onFirmada={alFirmar} />
    </>
  );
}
