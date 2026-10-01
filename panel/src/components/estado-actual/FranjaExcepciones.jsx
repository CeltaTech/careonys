import { useMemo } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { resumenDeExcepciones } from '../../lib/excepciones';
import { con } from '../../lib/textos';
import { Button } from '../ui/Button';

/* Las tarjetas de arriba del Inicio: una por cada cosa que puede estar mal. Al tocar una, la
   grilla de abajo queda sólo con esas guardias.

   No cuenta nada: qué guardia cae en cada tarjeta y cuándo va en rojo lo decide
   `lib/excepciones.js`, que es la misma función con la que se filtra la grilla. Así el número
   y la lista no pueden discrepar.

   Quien elige el filtro es la página de arriba (`onElegir`): la franja avisa y nada más. */

export function FranjaExcepciones({ guardias, ctx, excepcionActiva, onElegir }) {
  const { t } = useLocale();

  const resumen = useMemo(() => resumenDeExcepciones(guardias, ctx), [guardias, ctx]);
  const nombreDe = (exc) => con(t.estado_actual[exc.claveEtiqueta], exc.parametros);
  const activa = resumen.find((exc) => exc.id === excepcionActiva) ?? null;

  // Tocar la que ya estaba filtrando la apaga.
  const alTocar = (id) => onElegir?.(id === excepcionActiva ? null : id);

  return (
    <section>
      <div className="panel-kpis">
        {resumen.map((exc) => (
          <button
            key={exc.id}
            type="button"
            className={`panel-kpi-card${exc.critica ? ' panel-kpi-critico' : ''}`}
            aria-pressed={excepcionActiva === exc.id}
            onClick={() => alTocar(exc.id)}
          >
            <span className="panel-kpi-valor">{exc.cantidad}</span>
            <span className="panel-kpi-etiqueta">{nombreDe(exc)}</span>
          </button>
        ))}
      </div>

      {activa && (
        <div className="estado-actual-filtro-activo">
          <span>{con(t.estado_actual.filtrando_por, { excepcion: nombreDe(activa) })}</span>
          <Button variant="secondary" onClick={() => onElegir?.(null)}>
            {t.estado_actual.quitar_filtro}
          </Button>
        </div>
      )}
    </section>
  );
}
