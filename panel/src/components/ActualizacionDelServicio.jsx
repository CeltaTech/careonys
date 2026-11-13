import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import {
  FORMAS_DE_ACTUALIZACION,
  condicionDe,
  condicionDelServicioQueSePuedeGuardar,
} from '../lib/condicionesDelCliente';

/* Cómo se actualiza el precio de un Servicio.
   ==========================================================================

   Dos decisiones: la forma (a mano, por importación o por índice) y, si es por índice, cuál. Cada
   una vacía quiere decir «rige la de la configuración de facturación de la Prestadora», y la
   opción vacía dice cuál es esa, para que se vea qué rige sin ir a buscarlo.

   Qué rige lo decide `condicionDe`, la misma regla que usa la base al aplicar un índice
   (`actualizar_precios_por_indice`). Los índices salen del catálogo de la base.

   La configuración de la Prestadora sólo se la abre la base a la administración: para el resto
   llega vacía y la opción vacía muestra el valor de fábrica. Por eso un error al leerla no frena. */
const FORMAS = Object.values(FORMAS_DE_ACTUALIZACION);

export function ActualizacionDelServicio({ servicioId, puedeEditar = true }) {
  const { t } = useLocale();
  const ta = t.actualizacion_de_precios;
  const prestadoraId = usePrestadoraActual();
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [regla, setRegla] = useState(null);
  const [indices, setIndices] = useState([]);
  const [forma, setForma] = useState('');
  const [indice, setIndice] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [faltaElIndice, setFaltaElIndice] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const [condiciones, configuracion, catalogo] = await Promise.all([
      supabase
        .from('condiciones_comerciales_servicio')
        .select('forma_de_actualizacion, indice_de_actualizacion')
        .eq('servicio_id', servicioId)
        .maybeSingle(),
      prestadoraId
        ? supabase.from('configuracion_facturacion_clientes').select('regla').eq('prestadora_id', prestadoraId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('indices_de_actualizacion').select('codigo, nombre').order('nombre'),
    ]);
    const falla = condiciones.error || catalogo.error;
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t, 'actualización del Servicio'));
      setEstado('error');
      return;
    }
    if (!condiciones.data) {
      setEstado('vacio');
      return;
    }
    setRegla(configuracion.error ? null : configuracion.data?.regla ?? null);
    setIndices(catalogo.data ?? []);
    setForma(condiciones.data.forma_de_actualizacion || '');
    setIndice(condiciones.data.indice_de_actualizacion || '');
    setEstado('listo');
  }, [servicioId, prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreDelIndice = (codigo) => indices.find((i) => i.codigo === codigo)?.nombre ?? codigo;
  const delServicio = { forma_de_actualizacion: forma || null, indice_de_actualizacion: indice || null };
  const formaQueRige = condicionDe('forma_de_actualizacion', regla, delServicio);
  const formaDeLaPrestadora = condicionDe('forma_de_actualizacion', regla, null);
  // El índice que hereda: el de la Prestadora, si ella actualiza por índice.
  const indiceDeLaPrestadora = regla?.indice_de_actualizacion || null;
  const indiceQueRige = condicionDe('indice_de_actualizacion', regla, delServicio);

  function elegirForma(valor) {
    setForma(valor);
    setGuardado(false);
    setFaltaElIndice(false);
  }

  async function guardar() {
    const formaElegida = condicionDelServicioQueSePuedeGuardar('forma_de_actualizacion', forma);
    // El índice sólo se guarda si lo que rige es por índice: la base no acepta un índice suelto.
    const conIndice = formaQueRige === FORMAS_DE_ACTUALIZACION.INDICE;
    const indiceElegido = conIndice
      ? condicionDelServicioQueSePuedeGuardar('indice_de_actualizacion', indice)
      : { ok: true, valor: null };
    if (!formaElegida.ok || !indiceElegido.ok) {
      setError(t.errores.dato_invalido);
      return;
    }
    if (conIndice && !indiceQueRige) {
      setFaltaElIndice(true);
      return;
    }

    setGuardando(true);
    setError(null);
    setGuardado(false);
    const { data, error: falla } = await supabase
      .from('condiciones_comerciales_servicio')
      .update({ forma_de_actualizacion: formaElegida.valor, indice_de_actualizacion: indiceElegido.valor })
      .eq('servicio_id', servicioId)
      .select('servicio_id');
    setGuardando(false);
    if (falla) {
      setError(mensajeDeError(falla, t, 'actualización del Servicio'));
      return;
    }
    if (!data || data.length === 0) {
      setError(t.errores.sin_permiso);
      return;
    }
    if (!conIndice) setIndice('');
    setGuardado(true);
  }

  return (
    <section className="molde-ancho">
      <h3>{ta.titulo_del_servicio}</h3>
      {estado === 'cargando' && <p className="estado-cargando" role="status">{t.comun.cargando}</p>}
      {estado === 'error' && (
        <Alert variant="error">
          {errorDeCarga}{' '}
          <Button variant="secondary" onClick={cargar}>{t.comun.reintentar}</Button>
        </Alert>
      )}
      {estado === 'vacio' && <p className="molde-vacio">{ta.servicio_sin_condiciones}</p>}
      {estado === 'listo' && (
        <>
          {error && <Alert variant="error">{error}</Alert>}
          {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
          <div className="molde-formgrid">
            <FormField
              label={ta.forma}
              name="forma_de_actualizacion"
              type="select"
              value={forma}
              onChange={(e) => elegirForma(e.target.value)}
              disabled={!puedeEditar || guardando}
            >
              <option value="">{`${ta.la_de_la_configuracion} (${ta.formas[formaDeLaPrestadora]})`}</option>
              {FORMAS.map((valor) => (
                <option key={valor} value={valor}>{ta.formas[valor]}</option>
              ))}
            </FormField>
            {formaQueRige === FORMAS_DE_ACTUALIZACION.INDICE && (
              <FormField
                label={ta.indice}
                name="indice_de_actualizacion"
                type="select"
                value={indice}
                onChange={(e) => {
                  setIndice(e.target.value);
                  setGuardado(false);
                  setFaltaElIndice(false);
                }}
                disabled={!puedeEditar || guardando}
                required={!indiceDeLaPrestadora}
                error={faltaElIndice ? t.formularios.falta_un_dato_obligatorio : undefined}
              >
                <option value="">
                  {indiceDeLaPrestadora
                    ? `${ta.la_de_la_configuracion} (${nombreDelIndice(indiceDeLaPrestadora)})`
                    : ta.elegir_indice}
                </option>
                {indices.map((i) => (
                  <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
                ))}
              </FormField>
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
