import { useLocale } from '../../i18n/LocaleContext';
import { FormField } from '../ui/FormField';
import { diasEntre, sumarDias } from '../../lib/horarios';
import {
  DIAS_SEMANA,
  duracionVisible,
  horasDelHorario,
  tramosDeLaGuardia,
  tramoVisible,
} from '../../lib/cronogramaDeGuardias';

/**
 * El comienzo y el fin de una guardia o de un turno de guardia, cargados como en un calendario.
 * Los comparten el alta del turno de guardia y el cronograma de guardias de una Prestación, para
 * que las dos pantallas pregunten lo mismo con las mismas palabras.
 *
 * Dos formas, según venga `diasSemana`:
 * - Una sola fecha: la fecha de comienzo la pone la pantalla que llama (`fecha`), porque de ella
 *   depende qué guardias se ofrecen; acá van la hora de comienzo, la fecha de fin y la hora de fin.
 *   La fecha de fin se vuelve los días hasta el fin que guarda la base, y si cambia la fecha de
 *   comienzo el fin se corre con ella, como en cualquier calendario.
 * - Se repite: los días de la semana marcados, la hora de comienzo, cuántos días después termina
 *   y la hora de fin. Debajo, como dato, cada día marcado con su comienzo y su fin.
 *
 * En las dos, la duración se muestra como dato. Ninguna tiene tope de días.
 *
 * `diasHastaElFin` es texto: lo que la persona escribió, o la cuenta desde la fecha de fin.
 * `prefijo` separa los nombres de los casilleros cuando hay dos juegos en la misma pantalla.
 * `errores` trae el texto de cada casillero que falta, y aparece sólo después de apretar guardar.
 */
export function CasillerosDeHorario({
  prefijo = '',
  diasSemana,
  onAlternarDia,
  fecha,
  horaInicio,
  onHoraInicio,
  horaFin,
  onHoraFin,
  diasHastaElFin,
  onDiasHastaElFin,
  errores = {},
  disabled = false,
}) {
  const { t, locale } = useLocale();
  const textos = t.turnos_guardia.nuevo_turno_guardia;
  const repite = Boolean(diasSemana && onAlternarDia);

  const dias = String(diasHastaElFin ?? '').trim();
  const diasEscritos = /^-?\d+$/.test(dias);
  const fechaFin = fecha && diasEscritos ? sumarDias(fecha, Number(dias)) : '';

  function elegirFechaFin(valor) {
    const cuenta = diasEntre(fecha, valor);
    onDiasHastaElFin(cuenta === null ? '' : String(cuenta));
  }

  const horario = { hora_inicio: horaInicio, hora_fin: horaFin, dias_hasta_el_fin: dias };
  const horas = horasDelHorario(horario);
  const tramos =
    repite && horas !== null ? tramosDeLaGuardia({ ...horario, dias_semana: diasSemana, dias_hasta_el_fin: Number(dias) }) : [];

  const idDias = `field-${prefijo}dias_semana`;

  return (
    <>
      {repite && (
        <div className="form-field">
          <label id={`${idDias}-etiqueta`}>
            {textos.dias_semana}
            <span className="required">*</span>
          </label>
          <div
            className="panel-filtros"
            role="group"
            aria-labelledby={`${idDias}-etiqueta`}
            aria-describedby={errores.dias_semana ? `${idDias}-error` : undefined}
          >
            {DIAS_SEMANA.map((dia, i) => (
              <label key={dia} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  // El primero lleva el nombre del grupo, para que el formulario salte acá si faltan días.
                  id={i === 0 ? idDias : undefined}
                  type="checkbox"
                  checked={diasSemana.includes(dia)}
                  onChange={() => onAlternarDia(dia)}
                  disabled={disabled}
                />
                {textos.dias[dia]}
              </label>
            ))}
          </div>
          {errores.dias_semana && <span className="form-error" id={`${idDias}-error`}>{errores.dias_semana}</span>}
        </div>
      )}

      <FormField
        label={textos.hora_inicio}
        name={`${prefijo}hora_inicio`}
        type="time"
        required
        value={horaInicio}
        onChange={(e) => onHoraInicio(e.target.value)}
        error={errores.hora_inicio}
        disabled={disabled}
      />

      {repite ? (
        <FormField
          label={textos.termina}
          unidad={textos.dias_despues}
          name={`${prefijo}dias_hasta_el_fin`}
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          value={dias}
          onChange={(e) => onDiasHastaElFin(e.target.value)}
          error={errores.dias_hasta_el_fin}
          disabled={disabled}
        />
      ) : (
        <FormField
          label={textos.fecha_fin}
          name={`${prefijo}fecha_fin`}
          type="date"
          required
          min={fecha || undefined}
          value={fechaFin}
          onChange={(e) => elegirFechaFin(e.target.value)}
          error={errores.fecha_fin}
          // Sin fecha de comienzo no hay desde dónde contar el fin.
          disabled={disabled || !fecha}
        />
      )}

      <FormField
        label={textos.hora_fin}
        name={`${prefijo}hora_fin`}
        type="time"
        required
        value={horaFin}
        onChange={(e) => onHoraFin(e.target.value)}
        error={errores.hora_fin}
        disabled={disabled}
      />

      {horas !== null && (
        <dl className="panel-detalle-lista">
          {tramos.length > 0 && (
            <>
              <dt>{textos.comienzo_y_fin}</dt>
              <dd>
                {tramos.map((tr) => (
                  <div key={tr.comienzo.dia}>{tramoVisible(tr, t, locale)}</div>
                ))}
              </dd>
            </>
          )}
          <dt>{textos.duracion_etiqueta}</dt>
          <dd>{duracionVisible(horas, t)}</dd>
        </dl>
      )}
    </>
  );
}
