import { useLocale } from '../i18n/LocaleContext';
import { horaDelMomento } from '../lib/horarios';
import { claseBadge } from '../lib/tonos';
import { formatearHoras } from '../lib/formatoDeHoras';

/* Las horas de una liquidación, turno de guardia por turno de guardia.
   ==========================================================================

   Es lo que se guardó al generar la liquidación: el horario programado, la llegada y el cierre
   que marcó el Asistente, y las horas que salieron de esas marcas. No se recalcula nada acá: la
   liquidación es una foto, y esta tabla muestra la misma foto renglón por renglón. */

function fechaDelDia(dia, locale) {
  if (!dia) return '—';
  return new Date(`${dia}T00:00:00`).toLocaleDateString(locale);
}

/**
 * La tabla de horas por turno de guardia.
 *
 * @param {{ detalle: Array<object> }} props  los renglones guardados en la liquidación
 */
export function DetalleDeHoras({ detalle }) {
  const { t, locale } = useLocale();
  const textos = t.pagos_asistentes;
  const renglones = Array.isArray(detalle) ? detalle : [];

  if (renglones.length === 0) {
    return <p className="panel-explicacion">{textos.detalle_horas_vacio}</p>;
  }

  const hora = (momento) => horaDelMomento(momento, locale) || '—';

  return (
    <table className="panel-tabla">
      <thead>
        <tr>
          <th>{textos.col_fecha}</th>
          <th>{textos.col_programado}</th>
          <th>{textos.col_llegada}</th>
          <th>{textos.col_cierre}</th>
          <th>{textos.col_horas}</th>
          <th>{textos.horas_extra}</th>
        </tr>
      </thead>
      <tbody>
        {renglones.map((renglon, posicion) => (
          <tr key={renglon.turno_guardia_id ?? posicion}>
            <td>{fechaDelDia(renglon.fecha, locale)}</td>
            <td>
              {hora(renglon.programado_desde)} – {hora(renglon.programado_hasta)}
            </td>
            <td>{hora(renglon.llegada)}</td>
            <td>{hora(renglon.cierre)}</td>
            <td>
              {renglon.sin_marca ? (
                <span className={claseBadge('vencido')}>{textos.sin_marca}</span>
              ) : (
                formatearHoras(Number(renglon.minutos ?? 0) / 60, locale)
              )}
            </td>
            <td>{formatearHoras(Number(renglon.minutos_extra ?? 0) / 60, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
