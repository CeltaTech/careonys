import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { usePermisos } from '../../context/PermisosContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { guardarPlanillaAnalizada } from '../../lib/planillaAnalizada';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import '../../styles/molde-paginas.css';

/* Arrancar la configuración inicial desde una planilla que la Prestadora ya tiene.
   ==========================================================================

   POR QUÉ EXISTE. La guía de primeros pasos pide ocho cosas, y una Prestadora que ya venía
   trabajando las tiene casi todas escritas en una planilla. Pedirle que las vuelva a tipear de
   a una es convertir cada exigencia en un formulario más, que es justo lo contrario de lo que
   tiene que hacer el producto.

   NO ES UNA LECTURA NUEVA. Usa la que ya existe —la de la pantalla de importación, backend
   `backend/src/routes/panelImportacion.js`—: las mismas tres capas (formato conocido, dump SQL,
   juicio de la IA para lo demás) y el mismo mapeo propuesto. Lo único que agrega es la
   pregunta que la importación no hacía: qué de lo que nombra la planilla todavía no está
   configurado.

   QUÉ MUESTRA Y POR QUÉ ESO. Cuántas filas trae, y —para una planilla de Asistentes— los tipos
   de Asistente que nombra y no existen. Eso importa antes de importar: la importación no los
   crea, y un tipo desconocido deja al Asistente sin tipo, que es lo que decide si se le va a
   exigir Matrícula. Después se descubre abriendo de a un Legajo del Asistente. Las localidades
   no se proponen: la importación las reconoce sola.

   NO CREA NADA. Al continuar se sigue a la pantalla de importación, que es donde están los dos
   frenos humanos: revisar el mapeo y conformar el resultado real. Lo leído viaja en memoria
   (`lib/planillaAnalizada.js`) para no leer el archivo —ni preguntarle a la IA— dos veces.

   QUIÉN LO VE. Sólo quien puede importar (`importar_datos_masivos`), y nunca un Superadmin de
   visita: la guía es de la Prestadora, no un trabajo para él. */

const RUTA_TIPOS = '/configuracion/asistentes';

export function PropuestaDesdePlanilla() {
  const { t } = useLocale();
  const { puede, cargado } = usePermisos();
  const navegar = useNavigate();

  const [tipo, setTipo] = useState('asistente');
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState('vacio');
  const [error, setError] = useState(null);
  const [propuesta, setPropuesta] = useState(null);

  if (!cargado || !puede('importar_datos_masivos')) return null;

  const textos = t.guia_primeros_pasos;

  async function leerPlanilla(evento) {
    evento.preventDefault();
    if (!archivo) {
      setError(textos.planilla_falta_archivo);
      setEstado('error');
      return;
    }
    setEstado('leyendo');
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', archivo);
      cuerpo.append('tipo', tipo);
      const resultado = await llamarApiPanel('/importacion/propuesta-inicial', { method: 'POST', body: cuerpo });
      setPropuesta(resultado);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }

  function empezarDeNuevo() {
    setArchivo(null);
    setPropuesta(null);
    setError(null);
    setEstado('vacio');
  }

  // La revisión y la confirmación viven en la pantalla de importación: acá sólo se le entrega
  // lo ya leído para que no vuelva a pedir el archivo.
  function continuarAImportacion() {
    guardarPlanillaAnalizada(propuesta.tipo, propuesta.analisis);
    navegar('/importacion');
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.planilla_titulo}</h2>
      </div>

      {estado === 'error' && <Alert variant="error">{error}</Alert>}

      {estado !== 'listo' && (
        <form onSubmit={leerPlanilla}>
          <div className="molde-formgrid">
            <FormField
              label={textos.planilla_tipo}
              name="tipo-planilla"
              type="select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="asistente">{textos.planilla_tipo_asistente}</option>
              <option value="cliente">{textos.planilla_tipo_cliente}</option>
            </FormField>
            <FormField
              label={textos.planilla_archivo}
              name="archivo-planilla"
              type="file"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </div>
          <div className="molde-acciones">
            <Button type="submit" disabled={estado === 'leyendo'}>
              {estado === 'leyendo' ? textos.planilla_leyendo : textos.planilla_leer}
            </Button>
          </div>
        </form>
      )}

      {estado === 'listo' && propuesta && (
        <div>
          <Alert variant="info">
            {con(
              propuesta.tipo === 'asistente' ? textos.planilla_filas_asistente : textos.planilla_filas_cliente,
              { n: propuesta.filasTotales },
            )}
          </Alert>

          {propuesta.tiposNuevos.length > 0 && (
            <Alert variant="info">
              {con(textos.planilla_tipos_nuevos, { lista: propuesta.tiposNuevos.join(', ') })}{' '}
              <Link to={RUTA_TIPOS} className="btn btn-secondary">
                {textos.planilla_tipos_cta}
              </Link>
            </Alert>
          )}

          {propuesta.tiposNuevos.length === 0 && (
            <Alert variant="success">{textos.planilla_nada_para_configurar}</Alert>
          )}

          {propuesta.advertencias.length > 0 && (
            <Alert variant="info">
              <strong>{textos.planilla_advertencias_titulo}</strong>
              <ul>
                {propuesta.advertencias.map((advertencia, i) => (
                  <li key={i}>{advertencia}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="molde-acciones">
            <Button variant="secondary" onClick={empezarDeNuevo}>
              {textos.planilla_otra}
            </Button>
            <Button onClick={continuarAImportacion}>{textos.planilla_continuar}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
