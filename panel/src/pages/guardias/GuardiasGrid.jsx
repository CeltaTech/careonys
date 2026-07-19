import { Fragment, useMemo } from 'react';
import { useLocale } from '../../i18n/LocaleContext';

function diasDeGrilla(desde, hasta) {
  const dias = [];
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  for (let i = 0; i < 7; i += 1) {
    const f = new Date(inicio);
    f.setDate(f.getDate() + i);
    if (f > fin) break;
    dias.push(f.toISOString().slice(0, 10));
  }
  return dias.length ? dias : [desde];
}

export function GuardiasGrid({ filas, desde, hasta, tieneAlerta, onSeleccionar, onReasignar }) {
  const { t } = useLocale();

  const dias = useMemo(() => diasDeGrilla(desde, hasta), [desde, hasta]);

  const asistentes = useMemo(() => {
    const porId = new Map();
    for (const g of filas) {
      if (!dias.includes(g.fecha)) continue;
      if (!porId.has(g.asistente_id)) {
        porId.set(g.asistente_id, { id: g.asistente_id, nombre: g.asistente_nombre });
      }
    }
    return Array.from(porId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas, dias]);

  const celdas = useMemo(() => {
    const mapa = new Map();
    for (const g of filas) {
      const clave = `${g.asistente_id}__${g.fecha}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(g);
    }
    return mapa;
  }, [filas]);

  function handleDrop(e, asistenteId, fecha) {
    e.preventDefault();
    const guardiaId = e.dataTransfer.getData('guardiaId');
    if (!guardiaId) return;
    onReasignar(guardiaId, asistenteId, fecha);
  }

  if (asistentes.length === 0) {
    return <p className="estado-vacio">{t.guardias.sin_guardias_rango}</p>;
  }

  return (
    <div className="panel-guardias-grid-wrap">
      <div className="panel-guardias-grid">
        <div className="panel-guardias-grid-header panel-guardias-grid-esquina">{t.guardias.col_asistente}</div>
        {dias.map((fecha) => (
          <div key={fecha} className="panel-guardias-grid-header">
            {new Date(`${fecha}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        ))}

        {asistentes.map((asistente) => (
          <Fragment key={asistente.id}>
            <div className="panel-guardias-grid-fila-titulo">{asistente.nombre}</div>
            {dias.map((fecha) => (
              <div
                key={`${asistente.id}-${fecha}`}
                className="panel-guardias-grid-celda"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, asistente.id, fecha)}
              >
                {(celdas.get(`${asistente.id}__${fecha}`) ?? []).map((g) => (
                  <div
                    key={g.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('guardiaId', g.id)}
                    onClick={() => onSeleccionar(g)}
                    className={`panel-guardia-chip guardia-${g.estado}`}
                  >
                    <strong>{g.hora_inicio}–{g.hora_fin}</strong>
                    <div>{g.paciente_nombre}</div>
                    {tieneAlerta(g) && <div className="panel-guardia-alerta">{t.guardias.alerta_checkin_sin_checkout}</div>}
                  </div>
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
