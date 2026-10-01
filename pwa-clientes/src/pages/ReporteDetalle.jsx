import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { useSeVe } from '../context/PerfilContext';
import { SIGNOS_VITALES, SIGNOS_VITALES_LEGADO, colorSigno } from '../lib/signosVitales';
import { caraDelAnimo } from '../lib/animoDelReporte';

const CAMPOS_TEXTO = ['incidentes', 'observaciones'];

export default function ReporteDetalle() {
  const { id, reporteId } = useParams();
  const { t } = useLocale();
  const seVe = useSeVe();
  const [reporte, setReporte] = useState(null);
  const [rangosVitales, setRangosVitales] = useState({});
  const [error, setError] = useState('');

  // Se pide este reporte y nada más. Antes se pedía la lista entera —hasta 60 reportes con
  // todo adentro— para quedarse con uno: el resto era información de salud de esa persona
  // viajando al teléfono para descartarse en el acto.
  useEffect(() => {
    let activo = true;
    api
      .reporteDelPaciente(id, reporteId)
      .then(({ reporte: uno, rangosVitales: rangos }) => {
        if (!activo) return;
        setReporte(uno || false);
        setRangosVitales(rangos || {});
      })
      .catch((e) => {
        if (!activo) return;
        // Un reporte que no está no es una falla: la pantalla lo muestra como vacío.
        if (e?.status === 404) setReporte(false);
        else setError(t.comun.error_generico);
      });
    return () => {
      activo = false;
    };
  }, [id, reporteId]);

  if (error) return <div className="alert alert-error" role="alert">{error}</div>;
  if (reporte === null) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  if (reporte === false) return <div className="pwa-card estado-vacio" role="status">{t.comun.vacio}</div>;

  return (
    <>
      <Link to={`/pacientes/${id}/reportes`} className="btn btn-volver">
        <span aria-hidden="true">←</span> {t.comun.volver}
      </Link>
      <h1>{t.reporte_detalle.titulo}</h1>

      <section className="pwa-card">
        <h2>{reporte.guardias?.fecha}</h2>
        <div className="pwa-card-dato">
          {t.reporte_detalle.asistente}: {reporte.guardias?.asistentes?.nombre}
        </div>
      </section>

      <section className="pwa-card">
        <h2>{t.reporte_detalle.campo_alimentacion}</h2>
        <div className="pwa-card-dato">{reporte.alimentacion?.descripcion || t.reporte_detalle.sin_datos}</div>
      </section>

      {/* Mismo motivo que los signos vitales: la Prestadora que no muestra la medicación
          tampoco la muestra adentro del reporte del día. Sin esta condición el backend deja de
          mandarla pero el título queda igual, con un "sin datos" debajo que hace creer que ese
          día no se le dio nada. */}
      {seVe('cliente_medicacion_del_paciente') && (
        <section className="pwa-card">
          <h2>{t.reporte_detalle.campo_medicacion}</h2>
          <div className="pwa-card-dato">
            {Array.isArray(reporte.medicacion) && reporte.medicacion.length > 0 ? (
              reporte.medicacion.map((m, i) => (
                <div key={i}>
                  {[m.nombre, m.hora, m.via].filter(Boolean).join(' · ')}
                </div>
              ))
            ) : (
              <div>{t.reporte_detalle.sin_datos}</div>
            )}
          </div>
        </section>
      )}

      {/* La Prestadora que no hace enfermería no toma estos valores. Sin esta condición el
          backend deja de mandarlos pero el título queda igual, con un "sin datos" debajo que
          hace creer que alguien los está controlando y ese día no los cargó. */}
      {seVe('cliente_signos_vitales') && (
        <section className="pwa-card">
          <h2>{t.reporte_detalle.campo_signos_vitales}</h2>
          <div className="pwa-card-dato">
            {reporte.signos_vitales && SIGNOS_VITALES.some((clave) => reporte.signos_vitales[clave]) ? (
              SIGNOS_VITALES.filter((clave) => reporte.signos_vitales[clave]).map((clave) => {
                const color = colorSigno(reporte.signos_vitales[clave], rangosVitales[clave]);
                return (
                  <div key={clave} className={color ? `signo-vital-${color}` : ''}>
                    {t.reporte_detalle[`signo_${clave}`]}: {reporte.signos_vitales[clave]}
                    {rangosVitales[clave] ? ` ${rangosVitales[clave].unidad}` : ''}
                    {color === 'alerta' && <span className="signo-vital-aviso"> — {t.reporte_detalle.signo_fuera_de_rango}</span>}
                  </div>
                );
              })
            ) : reporte.signos_vitales && SIGNOS_VITALES_LEGADO.some((clave) => reporte.signos_vitales[clave]) ? (
              SIGNOS_VITALES_LEGADO.filter((clave) => reporte.signos_vitales[clave]).map((clave) => (
                <div key={clave}>
                  {t.reporte_detalle[`signo_${clave}`]}: {reporte.signos_vitales[clave]}
                </div>
              ))
            ) : (
              <div>{t.reporte_detalle.sin_datos}</div>
            )}
          </div>
        </section>
      )}

      <section className="pwa-card">
        <h2>{t.reporte_detalle.campo_estado_animo}</h2>
        <div className="pwa-card-dato">
          {reporte.estado_animo && caraDelAnimo(reporte.estado_animo) ? (
            <div className="escala-animo-lectura">
              <span aria-hidden="true">{caraDelAnimo(reporte.estado_animo)}</span>
              <span>{t.reporte_detalle[`animo_${reporte.estado_animo}`]}</span>
            </div>
          ) : (
            <div>{t.reporte_detalle.sin_datos}</div>
          )}
        </div>
      </section>

      {CAMPOS_TEXTO.map((campo) => (
        <section key={campo} className="pwa-card">
          <h2>{t.reporte_detalle[`campo_${campo}`]}</h2>
          <div className="pwa-card-dato texto-con-renglones">{reporte[campo] || t.reporte_detalle.sin_datos}</div>
        </section>
      ))}

      {reporte.foto_url && (
        <section className="pwa-card">
          <img src={reporte.foto_url} alt="" className="foto-ancha" />
        </section>
      )}
    </>
  );
}
