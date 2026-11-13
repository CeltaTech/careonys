import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { AJUSTES_POR_INDICE_POSIBLES, SIN_INDICE } from '../lib/condicionesDelCliente';
import {
  MESES_POSIBLES,
  ajusteQueRige,
  ajusteQueSePuedeGuardar,
  casillerosDelAjuste,
  textoDeMeses,
} from '../lib/ajustePorIndice';

/* El ajuste periódico por índice del precio de un Servicio.
   ==========================================================================

   Tres casilleros: qué índice, cada cuántos meses y si el precio nuevo se aplica solo o queda
   propuesto para que la administración lo revise. Cada uno abre mostrando lo que rige —fábrica,
   la Prestadora o el Servicio—, y lo que al guardar coincide con lo de arriba se guarda null,
   para que un cambio de la Prestadora le llegue a este Servicio (`lib/ajustePorIndice.js`).
   Sin índice que rija, los meses y el ajuste no se muestran.

   La configuración de la Prestadora sólo se la abre la base a la administración. Si no se la pudo
   leer, la regla queda sin conocer: se muestra fábrica y se guarda lo elegido tal cual. */
export function ActualizacionDelServicio({ servicioId, puedeEditar = true }) {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [regla, setRegla] = useState(undefined);
  const [indices, setIndices] = useState([]);
  const [casilleros, setCasilleros] = useState(() => casillerosDelAjuste(null, null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [claveMal, setClaveMal] = useState(null);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const [condiciones, configuracion, catalogo] = await Promise.all([
      supabase
        .from('condiciones_comerciales_servicio')
        .select('indice_de_actualizacion, meses_entre_actualizaciones, ajuste_por_indice')
        .eq('servicio_id', servicioId)
        .maybeSingle(),
      prestadoraId
        ? supabase.from('configuracion_facturacion_clientes').select('regla').eq('prestadora_id', prestadoraId).maybeSingle()
        : Promise.resolve({ data: null, error: true }),
      supabase.from('indices_de_actualizacion').select('codigo, nombre').order('nombre'),
    ]);
    const falla = condiciones.error || catalogo.error;
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t, 'ajuste por índice del Servicio'));
      setEstado('error');
      return;
    }
    if (!condiciones.data) {
      setEstado('vacio');
      return;
    }
    // Sin fila, la Prestadora no decidió nada y rige fábrica: la regla se conoce y está vacía.
    const reglaLeida = configuracion.error ? undefined : configuracion.data?.regla ?? null;
    setRegla(reglaLeida);
    setIndices(catalogo.data ?? []);
    setCasilleros(casillerosDelAjuste(reglaLeida, condiciones.data));
    setEstado('listo');
  }, [servicioId, prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiar(clave, valor) {
    setCasilleros((antes) => ({ ...antes, [clave]: valor }));
    setGuardado(false);
    if (claveMal === clave) setClaveMal(null);
  }

  async function guardar() {
    const revisado = ajusteQueSePuedeGuardar(regla, casilleros);
    if (!revisado.ok) {
      setClaveMal(revisado.clave);
      return;
    }
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const { data, error: falla } = await supabase
      .from('condiciones_comerciales_servicio')
      .update(revisado.valores)
      .eq('servicio_id', servicioId)
      .select('servicio_id');
    setGuardando(false);
    if (falla) {
      setError(mensajeDeError(falla, t, 'ajuste por índice del Servicio'));
      return;
    }
    if (!data || data.length === 0) {
      setError(t.errores.sin_permiso);
      return;
    }
    setGuardado(true);
  }

  return (
    <AjusteDelServicio
      t={t}
      estado={estado}
      errorDeCarga={errorDeCarga}
      recargar={cargar}
      indices={indices}
      casilleros={casilleros}
      conIndice={ajusteQueRige(regla, casilleros).indice_de_actualizacion !== null}
      cambiar={cambiar}
      guardar={guardar}
      puedeEditar={puedeEditar}
      guardando={guardando}
      error={error}
      claveMal={claveMal}
      guardado={guardado}
    />
  );
}

// Lo que se dibuja, sin cargar ni guardar nada. Separado para poder probarlo con los textos nuevos.
export function AjusteDelServicio({
  t,
  estado,
  errorDeCarga,
  recargar,
  indices,
  casilleros,
  conIndice,
  cambiar,
  guardar,
  puedeEditar,
  guardando,
  error,
  claveMal,
  guardado,
}) {
  const ta = t.actualizacion_de_precios;
  const tc = t.configuracion.condiciones_cliente;
  const apagado = !puedeEditar || guardando;
  // Los tres son listas: lo único que puede faltar es elegir.
  const malCargado = (clave) => (claveMal === clave ? t.formularios.falta_un_dato_obligatorio : undefined);

  return (
    <section className="molde-ancho">
      <h3>{ta.titulo_del_servicio}</h3>
      {estado === 'cargando' && <p className="estado-cargando" role="status">{t.comun.cargando}</p>}
      {estado === 'error' && (
        <Alert variant="error">
          {errorDeCarga}{' '}
          <Button variant="secondary" onClick={recargar}>{t.comun.reintentar}</Button>
        </Alert>
      )}
      {estado === 'vacio' && <p className="molde-vacio">{ta.servicio_sin_condiciones}</p>}
      {estado === 'listo' && (
        <>
          {error && <Alert variant="error">{error}</Alert>}
          {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
          <div className="molde-formgrid">
            <FormField
              label={tc.indice_de_actualizacion}
              name="indice_de_actualizacion"
              type="select"
              value={casilleros.indice_de_actualizacion}
              onChange={(e) => cambiar('indice_de_actualizacion', e.target.value)}
              disabled={apagado}
              error={malCargado('indice_de_actualizacion')}
            >
              <option value={SIN_INDICE}>{ta.sin_indice}</option>
              {indices.map((i) => (
                <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
              ))}
            </FormField>
            {conIndice && (
              <>
                <FormField
                  label={tc.meses_entre_actualizaciones}
                  name="meses_entre_actualizaciones"
                  type="select"
                  value={casilleros.meses_entre_actualizaciones}
                  onChange={(e) => cambiar('meses_entre_actualizaciones', e.target.value)}
                  disabled={apagado}
                  error={malCargado('meses_entre_actualizaciones')}
                >
                  {MESES_POSIBLES.map((n) => (
                    <option key={n} value={String(n)}>{textoDeMeses(tc, n)}</option>
                  ))}
                </FormField>
                <FormField
                  label={tc.ajuste_por_indice}
                  name="ajuste_por_indice"
                  type="select"
                  value={casilleros.ajuste_por_indice}
                  onChange={(e) => cambiar('ajuste_por_indice', e.target.value)}
                  disabled={apagado}
                  error={malCargado('ajuste_por_indice')}
                >
                  {AJUSTES_POR_INDICE_POSIBLES.map((valor) => (
                    <option key={valor} value={valor}>{tc.valores.ajuste_por_indice[valor]}</option>
                  ))}
                </FormField>
              </>
            )}
          </div>
          {puedeEditar && (
            <div className="molde-acciones">
              <Button onClick={guardar} disabled={guardando}>
                {guardando ? t.comun.guardando : t.comun.guardar}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
