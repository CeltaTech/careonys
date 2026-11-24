import { useLocale } from '../../i18n/LocaleContext';
import { FormField } from '../ui/FormField';

// El casillero de la hora de salida de un turno de guardia. Es uno solo para el cierre a mano y
// para la autorización de una salida: los dos registran lo mismo y la base valida lo mismo.
//
// `valor` tiene la forma de la caja de fecha y hora (`2026-09-16T14:30`), en el reloj de la
// Prestadora. `error` es el texto al pie, que aparece recién al apretar el botón.
export function CampoHoraDeSalida({ valor, alCambiar, error, name = 'hora-de-salida', disabled }) {
  const { t } = useLocale();
  return (
    <FormField
      label={t.cierre_turno_guardia.hora_de_salida}
      name={name}
      type="datetime-local"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      error={error}
      disabled={disabled}
      required
    />
  );
}
