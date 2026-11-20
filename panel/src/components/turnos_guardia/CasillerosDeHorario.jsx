import { useMemo } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { FormField } from '../ui/FormField';
import { horasDeTurnoGuardia } from '../../lib/horarios';
import { DIAS_HASTA_EL_FIN, DIAS_SEMANA } from '../../lib/cronogramaDeGuardias';

const TERMINA = ['termina_mismo_dia', 'termina_dia_siguiente', 'termina_dos_dias', 'termina_tres_dias'];

/**
 * Los casilleros de días de la semana y horario que comparten el alta del turno de guardia y el
 * cronograma de guardias de una Prestación. Escritos una sola vez para que las dos pantallas
 * pregunten lo mismo con las mismas palabras.
 *
 * `prefijo` separa los nombres de los casilleros cuando hay dos juegos en la misma pantalla.
 * `diasSemana` y `onAlternarDia` son opcionales: sin ellos no se muestran los días.
 * `errores` trae el texto de cada casillero que falta, y aparece sólo después de apretar guardar.
 */
export function CasillerosDeHorario({
  prefijo = '',
  diasSemana,
  onAlternarDia,
  horaInicio,
  onHoraInicio,
  horaFin,
  onHoraFin,
  diasHastaElFin,
  onDiasHastaElFin,
  errores = {},
  disabled = false,
}) {
  const { t } = useLocale();
  const textos = t.turnos_guardia.nuevo_turno_guardia;

  // Cuánto dura, dicho en horas, al lado de donde se elige: es el único lugar donde un error de
  // carga se ve antes de guardarlo. La cuenta es la de `horarios.js`, la de todo el producto.
  const duracionEnHoras = useMemo(() => {
    if (!horaInicio || !horaFin) return null;
    const horas = horasDeTurnoGuardia({
      fecha: '2000-01-01', // un día cualquiera: cuánto dura no depende de qué día sea
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      dias_hasta_el_fin: Number(diasHastaElFin),
    });
    return Number.isFinite(horas) && horas > 0 ? Math.round(horas * 100) / 100 : null;
  }, [horaInicio, horaFin, diasHastaElFin]);

  const idDias = `field-${prefijo}dias_semana`;

  return (
    <>
      {diasSemana && onAlternarDia && (
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

      {/* Hasta cuándo va se elige, no se deduce: comparando dos horas de reloj no hay forma de
          distinguir un turno de fin de semana de uno de veinticuatro horas. */}
      <FormField
        label={textos.termina}
        name={`${prefijo}dias_hasta_el_fin`}
        type="select"
        value={String(diasHastaElFin)}
        onChange={(e) => onDiasHastaElFin(e.target.value)}
        disabled={disabled}
      >
        {DIAS_HASTA_EL_FIN.map((n) => (
          <option key={n} value={String(n)}>{textos[TERMINA[n]]}</option>
        ))}
      </FormField>

      {duracionEnHoras !== null && (
        <p className="panel-explicacion">
          {duracionEnHoras === 1 ? textos.duracion_uno : textos.duracion.replace('{horas}', duracionEnHoras)}
        </p>
      )}
    </>
  );
}
