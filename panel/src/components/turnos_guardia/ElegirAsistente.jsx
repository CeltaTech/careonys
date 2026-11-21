import { useId, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { con } from '../../lib/textos';
import { claseBadgeTono, TONO } from '../../lib/tonos';
import { etiquetasDe, filtrarPorNombre } from '../../lib/sugerenciasDeAsistentes';
import { useNombreConDisponibilidad } from '../../hooks/useNombreConDisponibilidad';
import { useSugerenciasDeAsistentes } from '../../hooks/useSugerenciasDeAsistentes';
import { EstadoLista } from '../layout/EstadoLista';

/* A quién asignar uno o varios turnos de guardia, en una lista con buscador.

   Primero quienes están libres, no se pisan con otro turno de guardia y no pasan su tope de horas;
   después quienes se pueden asignar con advertencia; al final, sin poder elegirlos, quienes no
   trabajan en la modalidad del turno de guardia, que la base rechazaría igual. Las advertencias van
   al lado del nombre y no frenan: quien coordina decide.

   El orden y las advertencias salen de `lib/sugerenciasDeAsistentes.js`; los datos, de
   `hooks/useSugerenciasDeAsistentes.js`.

   Hay dos piezas:
   - `ElegirAsistente` trae los datos solo. Es la que usa una pantalla que sólo necesita el nombre
     elegido.
   - `ListaDeAsistentes` sólo dibuja. La usa quien ya llamó al hook porque además necesita las
     advertencias del elegido, como la ventana de asignar un turno vacante. */

/** El nombre de cada Asistente, sus advertencias y la búsqueda. Recibe lo que devuelve el hook. */
export function ListaDeAsistentes({
  sugerencias,
  value = '',
  onChange,
  disabled = false,
  name,
  label,
  opcionSinAsignar = null,
  // Lo que vale «nadie». Vacío por defecto; quien guarda otra cosa para «sin asignar» la pasa acá.
  valorSinAsignar = '',
}) {
  const { t } = useLocale();
  const nombreConDisponibilidad = useNombreConDisponibilidad();
  const [busqueda, setBusqueda] = useState('');
  const idEtiqueta = useId();
  const textos = t.turnos_guardia.cobertura_panel;

  const { estado, error, candidatos, recargar } = sugerencias;
  const visibles = useMemo(() => filtrarPorNombre(candidatos, busqueda), [candidatos, busqueda]);
  const elegir = (id, candidato = null) => onChange?.(id, candidato);

  return (
    <div className="form-field">
      <label id={idEtiqueta}>{label}</label>
      <div className="panel-filtros">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t.turnos_guardia.elegir_asistente?.buscar}
          aria-label={t.turnos_guardia.elegir_asistente?.buscar}
          disabled={disabled || estado !== 'listo'}
        />
      </div>
      <EstadoLista
        estado={estado}
        error={error}
        recargar={recargar}
        vacio={estado === 'listo' && visibles.length === 0 && !opcionSinAsignar}
        filtrado={Boolean(busqueda)}
        onLimpiarFiltros={() => setBusqueda('')}
      >
        <div className="panel-lista-pacientes" role="radiogroup" aria-labelledby={idEtiqueta}>
          {opcionSinAsignar && (
            <label>
              <input
                type="radio"
                name={name}
                value={valorSinAsignar}
                checked={value === valorSinAsignar}
                onChange={() => elegir(valorSinAsignar)}
                disabled={disabled}
              />
              <span>{opcionSinAsignar}</span>
            </label>
          )}
          {visibles.map((c) => {
            const etiquetas = etiquetasDe(c);
            return (
              <label key={c.asistente.id}>
                <input
                  type="radio"
                  name={name}
                  value={c.asistente.id}
                  checked={value === c.asistente.id}
                  onChange={() => elegir(c.asistente.id, c)}
                  disabled={disabled || c.bloqueado}
                />
                <span>
                  {nombreConDisponibilidad(c.asistente)}
                  {etiquetas.length > 0 && (
                    <small>
                      {etiquetas.map((m) => (
                        <span key={m.clave}>
                          <span className={claseBadgeTono(TONO.ATENCION)}>{con(textos[m.clave], m.valores)}</span>{' '}
                        </span>
                      ))}
                    </small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </EstadoLista>
    </div>
  );
}

/**
 * La lista con sus datos.
 *
 * @param huecos     turnos de guardia ya armados, con `fecha`, `hora_inicio`, `hora_fin` y sus Pacientes.
 * @param idsHuecos  en lugar de `huecos`, los ids de turnos de guardia que ya existen.
 * @param serieId    sólo los turnos de guardia de ese turno fijo.
 * @param excluir    ids de Asistente que no se ofrecen.
 * @param servicioId      el Servicio, para sus criterios. Sin él, el de los turnos de guardia que ya existen.
 * @param turnoGuardiaId  el turno de guardia, para mirar el lugar y las tareas de ese día.
 * @param onChange   recibe el id elegido —o `valorSinAsignar` si se eligió no asignar— y el candidato.
 */
export function ElegirAsistente({
  huecos = null,
  idsHuecos = null,
  serieId = null,
  servicioId = null,
  turnoGuardiaId = null,
  excluir = [],
  ...lista
}) {
  const sugerencias = useSugerenciasDeAsistentes({ huecos, idsHuecos, serieId, servicioId, turnoGuardiaId, excluir });
  return <ListaDeAsistentes sugerencias={sugerencias} {...lista} />;
}
