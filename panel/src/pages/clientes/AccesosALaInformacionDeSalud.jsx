import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { llamarApiPanel } from '../../lib/apiPanel';
import { mensajeDeError } from '../../lib/errores';
import { armarCsv, bajarCsv } from '../../lib/exportarCsv';

/* Quién vio la información de salud de los Pacientes de este Cliente, y desde dónde. Lo ve sólo
   la administración —el backend y la base niegan a cualquier otro— y se le puede entregar al
   Cliente bajado como planilla. */
export function AccesosALaInformacionDeSalud({ clienteId }) {
  const { t, locale } = useLocale();
  const textos = t.clientes.accesos_salud;
  const [accesos, setAccesos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setEstado('cargando');
    llamarApiPanel(`/auditoria/accesos-a-la-informacion-de-salud/${clienteId}`)
      .then((r) => {
        if (!vigente) return;
        const lista = r.accesos ?? [];
        setAccesos(lista);
        setEstado(lista.length ? 'listo' : 'vacio');
      })
      .catch((err) => {
        if (!vigente) return;
        setError(mensajeDeError(err, t));
        setEstado('error');
      });
    return () => { vigente = false; };
  }, [clienteId, t]);

  const fecha = (momento) => new Date(momento).toLocaleString(locale);
  const informacion = (categorias) => categorias
    .map((c) => textos.categorias[c] ?? textos.categorias.otra)
    .join(', ');
  const fila = (a) => [
    fecha(a.momento),
    a.persona ?? textos.sistema,
    a.paciente ?? '—',
    informacion(a.categorias),
    textos.lugares[a.lugar] ?? textos.lugares.sistema,
  ];

  function bajar() {
    const encabezados = [textos.col_momento, textos.col_persona, textos.col_paciente, textos.col_informacion, textos.col_lugar];
    bajarCsv(`${textos.archivo}.csv`, armarCsv(encabezados, accesos.map(fila)));
  }

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo}</h2>
        {estado === 'listo' && (
          <Button variant="secondary" onClick={bajar}>{textos.bajar}</Button>
        )}
      </div>
      {estado === 'cargando' && <p className="molde-vacio">{t.comun.cargando}</p>}
      {estado === 'error' && <p className="molde-vacio">{error || t.comun.error_generico}</p>}
      {estado === 'vacio' && <p className="molde-vacio">{textos.vacio}</p>}
      {estado === 'listo' && (
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_momento}</th>
              <th>{textos.col_persona}</th>
              <th>{textos.col_paciente}</th>
              <th>{textos.col_informacion}</th>
              <th>{textos.col_lugar}</th>
            </tr>
          </thead>
          <tbody>
            {accesos.map((a) => (
              <tr key={a.id}>
                {fila(a).map((valor, i) => <td key={i}>{valor}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
