import { useState } from 'react';
import { con } from '../lib/textos';
import { useLocale } from '../i18n/LocaleContext';
import { llamarApiImportacionDePrecios as llamarApi } from '../lib/apiActualizacion';
import { mensajeDeError } from '../lib/errores';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';

/* La importación de una lista de precios desde una planilla.
   ==========================================================================

   Tres pasos: se elige el archivo, se dice qué columna es cuál —el backend ya propone las que
   reconoce por el encabezado— y desde qué día rige, y se importa. El precio viejo no se pisa: el
   nuevo empieza ese día y el viejo queda con su fecha de fin. Lo que la base no carga sin duda
   vuelve con su fila y su motivo, y no se carga: se corrige en la planilla y se vuelve a importar.

   `onImportada` avisa a la página que la contiene para que vuelva a leer la lista. */
const CAMPOS = ['tipo_servicio', 'modalidad', 'precio'];

export function ImportarListaDePrecios({ onImportada }) {
  const { t } = useLocale();
  const ta = t.actualizacion_de_precios;
  const [archivo, setArchivo] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [mapeo, setMapeo] = useState({});
  const [desde, setDesde] = useState('');
  const [falta, setFalta] = useState({});
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const etiquetaDe = (campo) => t.lista_precios[`col_${campo}`];

  async function analizar() {
    if (!archivo) {
      setFalta({ archivo: true });
      document.getElementById('field-lista_archivo')?.focus();
      return;
    }
    setAnalizando(true);
    setError(null);
    setResultado(null);
    try {
      const formulario = new FormData();
      formulario.append('archivo', archivo);
      const datos = await llamarApi('/analizar', { method: 'POST', body: formulario });
      setAnalisis(datos);
      setMapeo(datos.mapeoPropuesto ?? {});
    } catch (err) {
      setAnalisis(null);
      setError(mensajeDeError(err, t, 'análisis de la lista de precios'));
    } finally {
      setAnalizando(false);
    }
  }

  function cambiarMapeo(campo, valor) {
    setMapeo((m) => ({ ...m, [campo]: valor || null }));
    setFalta((f) => ({ ...f, [campo]: false }));
  }

  async function importar() {
    const faltantes = {};
    CAMPOS.forEach((campo) => {
      if (!mapeo[campo]) faltantes[campo] = true;
    });
    if (!desde) faltantes.desde = true;
    setFalta(faltantes);
    const primero = Object.keys(faltantes)[0];
    if (primero) {
      document.getElementById(`field-lista_${primero}`)?.focus();
      return;
    }
    setImportando(true);
    setError(null);
    try {
      const datos = await llamarApi('/confirmar', {
        method: 'POST',
        body: JSON.stringify({ filas: analisis.filas, mapeo, archivoNombre: analisis.archivoNombre, desde }),
      });
      setResultado(datos);
      setAnalisis(null);
      setArchivo(null);
      onImportada?.();
    } catch (err) {
      setError(mensajeDeError(err, t, 'importación de la lista de precios'));
    } finally {
      setImportando(false);
    }
  }

  const ocupado = analizando || importando;

  return (
    <section className="molde-pila">
      <h3>{ta.importar_lista}</h3>
      {error && <Alert variant="error">{error}</Alert>}
      {resultado && (
        <Alert variant="info">
          {con(ta.importada, {
            agregados: resultado.agregados,
            cambiados: resultado.cambiados,
            sin_cambio: resultado.sinCambio,
          })}
        </Alert>
      )}
      {resultado && resultado.dudosos?.length > 0 && (
        <>
          <Alert variant="warning">{con(ta.dudosos, { cantidad: resultado.dudosos.length })}</Alert>
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{ta.fila}</th>
                <th>{ta.motivo}</th>
              </tr>
            </thead>
            <tbody>
              {resultado.dudosos.map((d) => (
                <tr key={`${d.fila}-${d.motivo}`}>
                  <td>{d.fila}</td>
                  <td>{ta.motivos_dudoso[d.motivo] ?? ta.motivos_dudoso.dato_invalido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!analisis && (
        <>
          <div className="molde-formgrid">
            <FormField
              label={ta.archivo}
              name="lista_archivo"
              type="file"
              required
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setFalta({});
              }}
              disabled={ocupado}
              error={falta.archivo ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          </div>
          <div className="molde-acciones">
            <Button variant="secondary" onClick={analizar} disabled={ocupado}>
              {analizando ? t.comun.cargando : ta.leer_archivo}
            </Button>
          </div>
        </>
      )}

      {analisis && (
        <>
          <p>{con(ta.filas_leidas, { cantidad: analisis.filas?.length ?? 0 })}</p>
          <div className="molde-formgrid">
            {CAMPOS.map((campo) => (
              <FormField
                key={campo}
                label={etiquetaDe(campo)}
                name={`lista_${campo}`}
                type="select"
                required
                value={mapeo[campo] ?? ''}
                onChange={(e) => cambiarMapeo(campo, e.target.value)}
                disabled={ocupado}
                error={falta[campo] ? t.formularios.falta_un_dato_obligatorio : undefined}
              >
                <option value="">{ta.elegir_columna}</option>
                {(analisis.headers ?? []).map((encabezado) => (
                  <option key={encabezado} value={encabezado}>{encabezado}</option>
                ))}
              </FormField>
            ))}
            <FormField
              label={ta.vigente_desde}
              name="lista_desde"
              type="date"
              required
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setFalta((f) => ({ ...f, desde: false }));
              }}
              disabled={ocupado}
              error={falta.desde ? t.formularios.falta_un_dato_obligatorio : undefined}
            />
          </div>
          <div className="molde-acciones">
            <Button
              variant="secondary"
              onClick={() => {
                setAnalisis(null);
                setArchivo(null);
                setFalta({});
              }}
              disabled={ocupado}
            >
              {t.comun.cancelar}
            </Button>
            <Button onClick={importar} disabled={ocupado}>
              {importando ? t.comun.guardando : ta.importar}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
