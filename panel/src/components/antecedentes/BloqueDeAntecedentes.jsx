import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { antecedentesOrdenados, pedirAntecedentes, valorDelAntecedente } from '../../lib/antecedentes';
import '../../styles/molde-paginas.css';
import '../../pages/tarjetas.css';

/* La Historia anterior del Paciente, o los Antecedentes del Legajo o del Cliente.
   ==========================================================================

   Sólo se ve. El bloque aparece cuando hay algo que mostrar: mientras se lee, si la lectura falla
   o si no hay ningún antecedente, no se dibuja nada, porque un cartel vacío no le dice nada a
   quien trabaja. */

function fechaLegible(fecha, locale) {
  if (!fecha) return '—';
  const conHora = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T00:00:00` : fecha;
  const dia = new Date(conHora);
  return Number.isNaN(dia.getTime()) ? String(fecha) : dia.toLocaleDateString(locale);
}

export function BloqueDeAntecedentes({ sujeto, id, titulo }) {
  const { t, locale } = useLocale();
  const textos = t.antecedentes;
  const [antecedentes, setAntecedentes] = useState(null);

  useEffect(() => {
    let vigente = true;
    setAntecedentes(null);
    pedirAntecedentes(sujeto, id).then((leidos) => {
      if (vigente) setAntecedentes(leidos);
    });
    return () => {
      vigente = false;
    };
  }, [sujeto, id]);

  if (!antecedentes?.length) return null;

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
        <span className="panel-mini">{antecedentes.length}</span>
      </div>
      <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_fecha}</th>
              <th>{textos.col_clase}</th>
              <th>{textos.col_dato}</th>
              <th>{textos.col_valor}</th>
              <th>{textos.col_documento}</th>
            </tr>
          </thead>
          <tbody>
            {antecedentesOrdenados(antecedentes).map((antecedente) => (
              <tr key={antecedente.id}>
                <td>{fechaLegible(antecedente.fecha, locale)}</td>
                <td>{textos.clases[antecedente.clase] ?? textos.clases.otro}</td>
                <td>{antecedente.etiqueta || '—'}</td>
                <td>{valorDelAntecedente(antecedente) || '—'}</td>
                <td>
                  {antecedente.documento?.url ? (
                    <a className="panel-enlace" href={antecedente.documento.url} target="_blank" rel="noreferrer">
                      {antecedente.documento.nombre || textos.abrir_documento}
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </section>
  );
}
