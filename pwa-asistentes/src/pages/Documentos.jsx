import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';
import { estadoDelCertificado, estadoVisible, ordenarDocumentos } from '../lib/documentos';

// ============================================================================
// Los documentos que le pide su Prestadora, la Matrícula entre ellos.
//
// POR QUÉ ESTA PANTALLA EXISTE
// Un documento que falta o que venció puede dejarlo sin guardias. Si él no lo
// ve venir, lo único que nota es que dejaron de llamarlo. Acá ve cuántos mandó,
// y cuál está en qué estado, con lo que hay que atender arriba.
//
// CADA RENGLÓN ES UN ENLACE, SIN BOTONES. Lo que se puede hacer con un documento
// —mirar por qué lo observaron, mandarlo— está adentro, en `Documento.jsx`.
//
// EL CERTIFICADO DE APTITUD va abajo y con su propio título: no es uno de los
// documentos que se piden, es lo que la Prestadora emite cuando los demás están.
// Viene en `/perfil`, que es donde ya está.
// ============================================================================

/** Qué cartelito lleva cada estado: los tonos del producto, nunca un color escrito acá. */
export const CLASE_DEL_ESTADO = {
  falta: 'badge badge-roja',
  observado: 'badge badge-roja',
  vencido: 'badge badge-roja',
  por_vencer: 'badge badge-alerta',
  en_revision: 'badge badge-info',
  aprobado: 'badge badge-ok',
};

/** El ícono de cada estado. Va al lado del nombre del estado, nunca en su lugar. */
export const ICONO_DEL_ESTADO = {
  falta: '+',
  observado: '!',
  vencido: '!',
  por_vencer: '◷',
  en_revision: '…',
  aprobado: '✓',
};

export function EstadoDelDocumento({ estado, t }) {
  return (
    <span className={CLASE_DEL_ESTADO[estado] ?? 'badge'}>
      <span aria-hidden="true">{ICONO_DEL_ESTADO[estado]}</span>&nbsp;{t.documentos[`estado_${estado}`]}
    </span>
  );
}

export default function Documentos() {
  const { t, locale } = useLocale();
  const td = t.documentos;
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    setError('');
    return Promise.all([api.documentos(), api.perfil()])
      .then(([documentos, perfil]) => setDatos({ ...documentos, certificado: perfil?.certificado ?? null }))
      .catch((e) => setError(mensajeDeError(e, t, 'documentos')))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  function fecha(dia) {
    return dia ? new Date(`${String(dia).slice(0, 10)}T00:00:00`).toLocaleDateString(locale) : null;
  }

  const volver = (
    <Link to="/perfil" className="btn btn-volver">
      <span aria-hidden="true">←</span> {t.comun.volver}
    </Link>
  );

  if (cargando && !datos) {
    return (
      <div>
        {volver}
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      </div>
    );
  }

  if (error && !datos) {
    return (
      <div>
        {volver}
        <div className="alert alert-error" role="alert">
          {error}
          <button type="button" className="btn" onClick={cargar}>{t.comun.reintentar}</button>
        </div>
      </div>
    );
  }

  const documentos = ordenarDocumentos(datos?.documentos);
  const certificado = datos?.certificado ?? null;
  const estadoCertificado = estadoDelCertificado(certificado);

  return (
    <div>
      {volver}
      <h1>{td.titulo}</h1>

      <section className="pwa-card">
        {documentos.length === 0 ? (
          <div className="estado-vacio" role="status">{td.vacio}</div>
        ) : (
          <>
            <p className="mini">{con(td.enviados, { n: datos?.enviados ?? 0, total: datos?.total ?? documentos.length })}</p>
            {documentos.map((documento) => (
              <Link
                key={documento.tipo_documento_id}
                to={`/documentos/${documento.tipo_documento_id}`}
                className="guardia-card"
              >
                <div className="guardia-card-paciente">{documento.nombre}</div>
                <EstadoDelDocumento estado={estadoVisible(documento)} t={t} />
              </Link>
            ))}
          </>
        )}
      </section>

      <section className="pwa-card">
        <h2>{td.certificado_titulo}</h2>
        {!certificado ? (
          <p className="mini">{td.certificado_sin_certificado}</p>
        ) : (
          <p className="mini">
            {td[`certificado_estado_${estadoCertificado}`]}
            {certificado.fecha_emision && ` · ${con(td.certificado_emitido_el, { fecha: fecha(certificado.fecha_emision) })}`}
            {certificado.fecha_vencimiento && ` · ${con(td.vence_el, { fecha: fecha(certificado.fecha_vencimiento) })}`}
          </p>
        )}
      </section>
    </div>
  );
}
