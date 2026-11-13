import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { formatearImporte } from '../lib/dinero';
import { mesDeLaFecha } from '../lib/ajustePorIndice';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { Cabecera } from '../components/ui/Cabecera';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EstadoLista } from '../components/layout/EstadoLista';

/* Los precios ajustados por índice que esperan revisión.
   ==========================================================================

   La tarea diaria los deja propuestos cuando el Servicio se ajusta con revisión previa. Mientras
   nadie los revisa, rige el precio anterior. Aceptar hace regir el precio nuevo desde el mes que
   correspondía, aunque ya haya pasado; rechazar lo descarta, y el próximo ajuste se cuenta desde
   ese mes. Las dos cosas las hace la base (`aceptar_propuesta_de_ajuste`,
   `rechazar_propuesta_de_ajuste`) y quedan en el registro de actividad. Sólo la administración. */
export function AjustesPorIndice() {
  const { t, locale } = useLocale();
  const pedirConfirmacion = useConfirmarDestructivo();
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [indices, setIndices] = useState({});
  const [revisando, setRevisando] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const [lista, catalogo] = await Promise.all([
      supabase
        .from('propuestas_de_ajuste_por_indice')
        .select('id, indice, precio_actual, precio_propuesto, moneda, rige_desde, servicio:servicios(etiqueta), prestacion:prestaciones!prestacion_id(tipo_servicio)')
        .eq('estado', 'pendiente')
        .order('rige_desde'),
      supabase.from('indices_de_actualizacion').select('codigo, nombre'),
    ]);
    const falla = lista.error || catalogo.error;
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t, 'ajustes por índice'));
      setEstado('error');
      return;
    }
    setPropuestas(lista.data ?? []);
    setIndices(Object.fromEntries((catalogo.data ?? []).map((i) => [i.codigo, i.nombre])));
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function revisar(propuesta, aceptar) {
    const ta = t.ajustes_por_indice;
    const sigue = await pedirConfirmacion(
      aceptar
        ? { texto: ta.confirmar_aceptar, confirmar: ta.aceptar }
        : { texto: ta.confirmar_rechazar, confirmar: ta.rechazar }
    );
    if (!sigue) return;
    setRevisando(propuesta.id);
    setError(null);
    const { error: falla } = await supabase.rpc(
      aceptar ? 'aceptar_propuesta_de_ajuste' : 'rechazar_propuesta_de_ajuste',
      { p_propuesta: propuesta.id }
    );
    setRevisando(null);
    if (falla) {
      setError(mensajeDeError(falla, t, 'revisión de un ajuste por índice'));
      // Otra persona pudo haberla revisado, o el precio cambió: se vuelve a leer la lista.
      cargar();
      return;
    }
    setPropuestas((antes) => antes.filter((p) => p.id !== propuesta.id));
  }

  return (
    <ListaDeAjustesPorIndice
      t={t}
      locale={locale}
      estado={estado}
      errorDeCarga={errorDeCarga}
      recargar={cargar}
      propuestas={propuestas}
      indices={indices}
      revisando={revisando}
      error={error}
      revisar={revisar}
    />
  );
}

// Lo que se dibuja, sin cargar ni guardar nada. Separado para poder probarlo con los textos nuevos.
export function ListaDeAjustesPorIndice({ t, locale, estado, errorDeCarga, recargar, propuestas, indices, revisando, error, revisar }) {
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
        vacio={propuestas.length === 0}
        mensajeVacio={ta.sin_propuestas}
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
            {propuestas.map((p) => {
              const ocupada = revisando !== null;
              return (
                <tr key={p.id}>
                  <td>{[p.servicio?.etiqueta, p.prestacion?.tipo_servicio].filter(Boolean).join(' — ') || '—'}</td>
                  <td>{indices[p.indice] ?? p.indice}</td>
                  <td>{formatearImporte(p.precio_actual, p.moneda, locale)}</td>
                  <td>{formatearImporte(p.precio_propuesto, p.moneda, locale)}</td>
                  <td>{mesDeLaFecha(p.rige_desde)}</td>
                  <td>
                    <div className="molde-acciones">
                      <Button onClick={() => revisar(p, true)} disabled={ocupada}>{ta.aceptar}</Button>
                      <Button variant="secondary" onClick={() => revisar(p, false)} disabled={ocupada}>{ta.rechazar}</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </EstadoLista>
    </div>
  );
}
