import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { formatearImporte } from '../lib/dinero';
import { mesDeLaFecha } from '../lib/ajustePorIndice';
import { Cabecera } from '../components/ui/Cabecera';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EstadoLista } from '../components/layout/EstadoLista';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { usePermisos } from '../context/PermisosContext';
import { COLUMNAS_DE_LA_PROPUESTA, motivoDeLaRevisionDelLegajo, valoresDeLaPropuesta } from '../lib/propuestasDelLegajo';

/* Revisar precios: los precios ajustados por índice que esperan revisión.
   ==========================================================================

   Cada renglón trae el precio nuevo ya escrito. Quien revisa lo deja, lo corrige o vuelve a
   escribir el actual, y aprieta Guardar. La base (`revisar_propuesta_de_ajuste`) hace regir el
   precio desde el mes que correspondía, o deja todo como estaba si es el mismo precio actual, y
   lo anota en el registro de actividad. Sin renglones pendientes, la página no tiene nada que
   mostrar y vuelve a Estado actual. Sólo la administración.

   Abajo, los valores del Legajo ajustados por índice, para la administración que ve los pagos a
   los Asistentes. Cada renglón se acepta —el Legajo cambia— o se rechaza —sigue el valor de hoy y
   no se pierde nada—. Igual que el renglón de los precios, el botón actúa directo. La base
   (`revisar_propuesta_de_ajuste_del_legajo`) lo anota en el registro de actividad. */
export function AjustesPorIndice() {
  const { t, locale } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [indices, setIndices] = useState({});
  const [precios, setPrecios] = useState({});
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState(null);
  const { puede, estado: estadoDePermisos } = usePermisos();
  const veLosPagos = puede('ver_pagos_asistente');
  const [estadoDelLegajo, setEstadoDelLegajo] = useState('cargando');
  const [errorDeCargaDelLegajo, setErrorDeCargaDelLegajo] = useState(null);
  const [propuestasDelLegajo, setPropuestasDelLegajo] = useState([]);
  const [revisando, setRevisando] = useState(null);
  const [errorDelLegajo, setErrorDelLegajo] = useState(null);

  const cargar = useCallback(async () => {
    if (!prestadoraId) return;
    setEstado('cargando');
    setErrorDeCarga(null);
    const [lista, catalogo] = await Promise.all([
      supabase
        .from('propuestas_de_ajuste_por_indice')
        .select('id, indice, precio_actual, precio_propuesto, moneda, rige_desde, servicio:servicios(etiqueta), prestacion:prestaciones!prestacion_id(tipo_servicio)')
        .eq('prestadora_id', prestadoraId)
        .eq('estado', 'pendiente')
        .order('rige_desde'),
      supabase.from('indices_de_actualizacion').select('codigo, nombre'),
    ]);
    const falla = lista.error || catalogo.error;
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t, 'revisión de precios'));
      setEstado('error');
      return;
    }
    const filas = lista.data ?? [];
    setPropuestas(filas);
    setPrecios(Object.fromEntries(filas.map((p) => [p.id, String(p.precio_propuesto)])));
    setIndices(Object.fromEntries((catalogo.data ?? []).map((i) => [i.codigo, i.nombre])));
    setEstado('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarDelLegajo = useCallback(async () => {
    if (!prestadoraId || !veLosPagos) return;
    setEstadoDelLegajo('cargando');
    setErrorDeCargaDelLegajo(null);
    const { data, error: falla } = await supabase
      .from('propuestas_de_ajuste_del_legajo')
      .select(COLUMNAS_DE_LA_PROPUESTA)
      .eq('prestadora_id', prestadoraId)
      .eq('estado', 'pendiente')
      .order('rige_desde');
    if (falla) {
      setErrorDeCargaDelLegajo(mensajeDeError(falla, t, 'revisión de valores del Legajo'));
      setEstadoDelLegajo('error');
      return;
    }
    setPropuestasDelLegajo(data ?? []);
    setEstadoDelLegajo('listo');
  }, [prestadoraId, veLosPagos, t]);

  useEffect(() => {
    cargarDelLegajo();
  }, [cargarDelLegajo]);

  async function revisarDelLegajo(propuesta, aceptar) {
    setErrorDelLegajo(null);
    setRevisando(propuesta.id);
    const { error: falla } = await supabase.rpc('revisar_propuesta_de_ajuste_del_legajo', {
      p_propuesta: propuesta.id,
      p_aceptar: aceptar,
    });
    setRevisando(null);
    if (falla) {
      const motivo = motivoDeLaRevisionDelLegajo(falla);
      setErrorDelLegajo(
        motivo ? t.ajustes_por_indice[`legajo_error_${motivo}`] : mensajeDeError(falla, t, 'revisión de valores del Legajo'),
      );
      cargarDelLegajo();
      return;
    }
    setPropuestasDelLegajo((antes) => antes.filter((p) => p.id !== propuesta.id));
  }

  // La sección del Legajo cuenta sólo para quien ve los pagos. Mientras los permisos no llegan, no
  // se sabe si hay algo que mostrar.
  const legajoSinNada = estadoDePermisos !== 'cargando' && (!veLosPagos || (estadoDelLegajo === 'listo' && propuestasDelLegajo.length === 0 && !errorDelLegajo));

  async function guardar(propuesta) {
    const precio = Number(String(precios[propuesta.id] ?? '').replace(',', '.'));
    setError(null);
    if (!Number.isFinite(precio) || precio <= 0) {
      setError(t.errores.motivos.dato_invalido);
      return;
    }
    setGuardando(propuesta.id);
    const { error: falla } = await supabase.rpc('revisar_propuesta_de_ajuste', {
      p_propuesta: propuesta.id,
      p_precio: precio,
    });
    setGuardando(null);
    if (falla) {
      setError(mensajeDeError(falla, t, 'revisión de precios'));
      cargar();
      return;
    }
    setPropuestas((antes) => antes.filter((p) => p.id !== propuesta.id));
  }

  if (estado === 'listo' && propuestas.length === 0 && !error && legajoSinNada) return <Navigate to="/" replace />;

  return (
    <>
    <ListaDeAjustesPorIndice
      t={t}
      locale={locale}
      estado={estado}
      errorDeCarga={errorDeCarga}
      recargar={cargar}
      propuestas={propuestas}
      indices={indices}
      precios={precios}
      cambiarPrecio={(id, valor) => setPrecios((antes) => ({ ...antes, [id]: valor }))}
      guardando={guardando}
      error={error}
      guardar={guardar}
    />
    {veLosPagos && (
      <ListaDePropuestasDelLegajo
        t={t}
        locale={locale}
        estado={estadoDelLegajo}
        errorDeCarga={errorDeCargaDelLegajo}
        recargar={cargarDelLegajo}
        propuestas={propuestasDelLegajo}
        indices={indices}
        revisando={revisando}
        error={errorDelLegajo}
        revisar={revisarDelLegajo}
      />
    )}
    </>
  );
}

// Lo que se dibuja, sin cargar ni guardar nada. Separado para poder probarlo con los textos nuevos.
export function ListaDeAjustesPorIndice({ t, locale, estado, errorDeCarga, recargar, propuestas, indices, precios, cambiarPrecio, guardando, error, guardar }) {
  const ta = t.ajustes_por_indice;
  const tp = t.actualizacion_de_precios;
  return (
    <div>
      <Cabecera titulo={ta.titulo} />
      {error && <Alert variant="error">{error}</Alert>}
      <EstadoLista
        estado={estado}
        error={errorDeCarga}
        recargar={recargar}
        vacio={estado === 'listo' && propuestas.length === 0}
      >
        <div className="tarjeta-desplazable"><table className="panel-tabla">
          <thead>
            <tr>
              <th>{ta.col_servicio}</th>
              <th>{tp.indice}</th>
              <th>{tp.precio_actual}</th>
              <th>{tp.precio_nuevo}</th>
              <th>{tp.desde}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {propuestas.map((p) => (
              <tr key={p.id}>
                <td>{[p.servicio?.etiqueta, p.prestacion?.tipo_servicio].filter(Boolean).join(' — ') || '—'}</td>
                <td>{indices[p.indice] ?? p.indice}</td>
                <td>{formatearImporte(p.precio_actual, p.moneda, locale)}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={tp.precio_nuevo}
                    value={precios?.[p.id] ?? ''}
                    onChange={(e) => cambiarPrecio(p.id, e.target.value)}
                  />
                </td>
                <td>{mesDeLaFecha(p.rige_desde)}</td>
                <td>
                  <Button onClick={() => guardar(p)} disabled={guardando !== null}>{t.comun.guardar}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </EstadoLista>
    </div>
  );
}

// Los valores del Legajo que esperan revisión. Lo que se dibuja, sin cargar ni guardar nada.
// Cada valor va con su moneda, y la unidad dice con qué se mide el trabajo de esa persona.
export function ListaDePropuestasDelLegajo({ t, locale, estado, errorDeCarga, recargar, propuestas, indices, revisando, error, revisar }) {
  // Sin valores que revisar no queda nada que decir: sale la tarjeta entera, con su título.
  if (estado === 'listo' && propuestas.length === 0 && !error) return null;
  const ta = t.ajustes_por_indice;
  const tp = t.actualizacion_de_precios;
  const montos = (p, lado) =>
    valoresDeLaPropuesta(p).map((fila) => (
      <div key={fila.valor}>
        {t.asistentes[fila.valor]}: {fila[lado] === null ? '—' : formatearImporte(fila[lado], p.moneda, locale)}
      </div>
    ));
  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{ta.legajo_titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <EstadoLista
        estado={estado}
        error={errorDeCarga}
        recargar={recargar}
        vacio={false}
      >
        <div className="tarjeta-desplazable"><table className="panel-tabla">
          <thead>
            <tr>
              <th>{ta.legajo_col_asistente}</th>
              <th>{tp.indice}</th>
              <th>{ta.legajo_col_unidad}</th>
              <th>{ta.legajo_valor_actual}</th>
              <th>{ta.legajo_valor_nuevo}</th>
              <th>{tp.desde}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {propuestas.map((p) => (
              <tr key={p.id}>
                <td>{p.asistente?.nombre ?? '—'}</td>
                <td>{indices[p.indice] ?? p.indice}</td>
                <td>{t.asistentes[`unidad_${p.unidad_medicion}`] ?? '—'}</td>
                <td>{montos(p, 'actual')}</td>
                <td>{montos(p, 'propuesto')}</td>
                <td>{mesDeLaFecha(p.rige_desde)}</td>
                <td>
                  <div className="panel-fila-acciones">
                    <Button onClick={() => revisar(p, true)} disabled={revisando !== null}>{ta.legajo_aceptar}</Button>
                    <Button variant="secondary" onClick={() => revisar(p, false)} disabled={revisando !== null}>
                      {ta.legajo_rechazar}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </EstadoLista>
    </section>
  );
}
