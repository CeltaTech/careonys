import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { useEmergenciasSinAtender } from '../../context/EmergenciasSinAtenderContext';
import { useAlarmasTomadas } from '../../hooks/useAlarmasTomadas';
import { TIPOS_DE_ALARMA } from '../../lib/alarmasTomadas';
import { horaDelMomento } from '../../lib/horarios';
import { con } from '../../lib/textos';
import { claseBadgeTono, TONO } from '../../lib/tonos';

/* Un renglón por cada emergencia sin atender, con quién la está atendiendo.
   ==========================================================================

   Lo usan Situación operativa y Comunicación, arriba de todo. Cada renglón lleva a la sección
   Emergencias, que es donde se lee lo que escribió el Asistente y donde se marca atendida: acá no
   se muestra ese texto (ver `EmergenciasSinAtenderContext.jsx`).

   Quién la tomó sale del mismo lugar que el botón «La tomo yo», con la misma regla de vencimiento:
   una toma vencida se dibuja como que nadie la está atendiendo, porque la alarma ya volvió. */
export function RenglonesDeEmergencias() {
  const { t, locale } = useLocale();
  const { emergencias } = useEmergenciasSinAtender();
  const { tomaDe, recargar } = useAlarmasTomadas();

  // Cada vez que cambia la lista, quién tomó cada una puede haber cambiado también.
  useEffect(() => {
    recargar();
  }, [emergencias, recargar]);

  if (emergencias.length === 0) return null;

  return emergencias.map((emergencia) => {
    const toma = tomaDe(TIPOS_DE_ALARMA.EMERGENCIA, emergencia.id);
    return (
      <Link key={emergencia.id} className="panel-fila-alerta" to="/emergencias">
        <div>
          <b>{t.emergencias.detalle_titulo}</b>
          <span className="panel-mini">
            {toma
              ? con(t.continuidad.la_esta_atendiendo, { nombre: toma.tomada_por_nombre || '—' })
              : t.emergencias.nadie_la_atiende}
          </span>
        </div>
        <span className={claseBadgeTono(TONO.CRITICO)}>{horaDelMomento(emergencia.reportado_at, locale)}</span>
      </Link>
    );
  });
}
