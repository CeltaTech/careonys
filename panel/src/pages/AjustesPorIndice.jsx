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

/* Revisar precios: los precios ajustados por índice que esperan revisión.
   ==========================================================================

   Cada renglón trae el precio nuevo ya escrito. Quien revisa lo deja, lo corrige o vuelve a
   escribir el actual, y aprieta Guardar. La base (`revisar_propuesta_de_ajuste`) hace regir el
   precio desde el mes que correspondía, o deja todo como estaba si es el mismo precio actual, y
   lo anota en el registro de actividad. Sin renglones pendientes, la página no tiene nada que
   mostrar y vuelve a Estado actual. Sólo la administración. */
export function AjustesPorIndice() {
  const { t, locale } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [indices, setIndices] = useState({});
  const [precios, setPrecios] = useState({});
  const [guardando, setGuardando] = useState(null);
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
      setErrorDeCarga(mensajeDeError(falla, t, 'revisión de precios'));
      setEstado('error');
      return;
    }
    const filas = lista.data ?? [];
    setPropuestas(filas);
    setPrecios(Object.fromEntries(filas.map((p) => [p.id, String(p.precio_propuesto)])));
    setIndices(Object.fromEntries((catalogo.data ?? []).map((i) => [i.codigo, i.nombre])));
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

  if (estado === 'listo' && propuestas.length === 0 && !error) return <Navigate to="/" replace />;

  return (
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
        vacio={false}
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
