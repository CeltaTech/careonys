import { useLocale } from '../../i18n/LocaleContext';
import { ListaDeAdvertencias } from './ListaDeAdvertencias';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';
import '../importacion.css';

/* Una hoja del archivo, con su asignación de columnas.
   ==========================================================================

   Cada hoja tiene su propia asignación: qué campo recibe cada columna. Una columna sin asignar
   no se pierde, se guarda en la ficha, y la lista lo dice así en su primera opción. En la Historia
   anterior se elige además qué clase de datos trae la hoja. Los campos obligatorios llevan la
   marca en la lista, antes de confirmar. */

const RENGLONES_DE_MUESTRA = 5;

export function HojaDeImportacion({
  hoja,
  camposDisponibles,
  camposObligatorios,
  clasesDeHoja,
  asignacion,
  onAsignacion,
  clase,
  onClase,
}) {
  const { t } = useLocale();
  const textos = t.importacion;
  const columnas = hoja.headers ?? [];
  const filas = hoja.filas ?? [];
  const obligatorios = new Set(camposObligatorios ?? []);
  const renglones = Number(hoja.renglonesContados) || filas.length;

  function etiquetaDelCampo(campo) {
    const nombre = textos[`campo_${campo}`] || campo;
    return obligatorios.has(campo) ? `${nombre} *` : nombre;
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{hoja.nombre ? con(textos.hoja_titulo, { hoja: hoja.nombre }) : textos.paso2_titulo}</h2>
        <span className="panel-mini">{con(textos.renglones, { n: renglones })}</span>
      </div>

      <ListaDeAdvertencias advertencias={hoja.advertencias} />

      {clasesDeHoja?.length > 0 && (
        <div className="molde-formgrid">
          <div className="form-field">
            <label htmlFor={`clase-hoja-${hoja.indice}`}>{textos.clase_de_hoja}</label>
            <select id={`clase-hoja-${hoja.indice}`} value={clase ?? ''} onChange={(e) => onClase(e.target.value)}>
              {clasesDeHoja.map((una) => (
                <option key={una} value={una}>{t.importacion.clases_hoja[una] ?? textos.clases_hoja.otro}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="importacion-desplazable">
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_archivo}</th>
              <th>{textos.col_campo}</th>
            </tr>
          </thead>
          <tbody>
            {columnas.map((columna) => (
              <tr key={columna}>
                <td><b>{columna}</b></td>
                <td>
                  <div className="molde-campo">
                    <select
                      value={asignacion?.[columna] || ''}
                      onChange={(e) => onAsignacion({ ...asignacion, [columna]: e.target.value || null })}
                      aria-label={con(textos.campo_de_columna, { columna })}
                    >
                      <option value="">{textos.campo_ninguno}</option>
                      {(camposDisponibles ?? []).map((campo) => (
                        <option key={campo} value={campo}>{etiquetaDelCampo(campo)}</option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filas.length > 0 && (
        <>
          <h3>{textos.vista_previa_titulo}</h3>
          <div className="importacion-desplazable">
            <table className="panel-tabla">
              <thead>
                <tr>
                  {columnas.map((columna) => (
                    <th key={columna}>{columna}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, RENGLONES_DE_MUESTRA).map((fila, i) => (
                  <tr key={i}>
                    {columnas.map((columna) => (
                      <td key={columna}>{fila?.[columna] == null ? '' : String(fila[columna])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
