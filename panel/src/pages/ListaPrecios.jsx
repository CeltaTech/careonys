import { useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { esAdminOSuperior } from '../lib/roles';
import { claseBadge } from '../lib/tonos';
import { useSupabaseTable } from '../hooks/useSupabaseTable';
import { useFiltros } from '../hooks/useFiltros';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { formatearImporte } from '../lib/dinero';
import { ListaPrecioDetalle } from './ListaPrecioDetalle';
import { ImportarListaDePrecios } from '../components/ImportarListaDePrecios';
import { PromocionDeLista } from './PromocionDeLista';
import { admitePromocion, conSusPromociones, esPromocion, promocionRige } from '../lib/promocionDeLista';
import { fechaVisible } from '../lib/fechaVisible';
import { hoyISO } from '../lib/horarios';
import '../styles/molde-paginas.css';

export function ListaPrecios() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const { filas, estado, error, recargar } = useSupabaseTable('lista_precios', { orderBy: 'created_at' });
  const { f, set, limpiar, hayFiltros } = useFiltros({ busqueda: '' });
  const [seleccionado, setSeleccionado] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [conPromocion, setConPromocion] = useState(null);

  const esAdmin = esAdminOSuperior(usuario?.rol);

  const filasFiltradas = useMemo(() => {
    // Un precio reemplazado queda guardado con su fecha de fin y no se muestra entre los vigentes.
    // Una promoción vencida tampoco: el precio de siempre volvió a regir solo. Cada promoción va
    // debajo de su precio de siempre.
    const hoy = hoyISO();
    return conSusPromociones(filas).filter((p) => {
      if (p.vigente_hasta && p.vigente_hasta < hoy) return false;
      if (!f.busqueda) return true;
      const b = f.busqueda.toLowerCase();
      return p.tipo_servicio?.toLowerCase().includes(b) || p.modalidad?.toLowerCase().includes(b);
    });
  }, [filas, f]);

  return (
    <div>
      <Cabecera titulo={t.lista_precios.titulo}>
        {esAdmin && <Button onClick={() => setCreandoNuevo(true)}>{t.lista_precios.nuevo}</Button>}
      </Cabecera>
      {esAdmin && <ImportarListaDePrecios onImportada={recargar} />}
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.lista_precios.titulo}</h2>
          {estado === 'listo' && <span className="panel-mini">{filasFiltradas.length}</span>}
        </div>
        <div className="panel-filtros">
          <input
            type="text"
            placeholder={t.lista_precios.buscar}
            aria-label={t.lista_precios.buscar}
            value={f.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
        </div>

        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && filasFiltradas.length === 0}
          recargar={recargar}
          filtrado={hayFiltros}
          onLimpiarFiltros={limpiar}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.lista_precios.col_tipo_servicio}</th>
                <th>{t.lista_precios.col_modalidad}</th>
                <th>{t.lista_precios.col_precio}</th>
                <th>{t.lista_precios.col_vigente_desde}</th>
                <th>{t.lista_precios.col_vigente_hasta}</th>
                <th>{t.lista_precios.col_activo}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((p) => (
                <tr key={p.id}>
                  <td>
                    {esPromocion(p) ? (
                      <span className={claseBadge(promocionRige(p, hoyISO()) ? 'vigente' : 'programada')}>
                        {t.lista_precios.promocion}
                      </span>
                    ) : (
                      <b>{p.tipo_servicio}</b>
                    )}
                  </td>
                  <td>{p.modalidad}</td>
                  {/* Cada fila trae su propia moneda (`lista_precios.moneda`, que completa sola
                      la base): el precio se muestra con ella y no con la que se suponga. */}
                  <td>{formatearImporte(p.precio, p.moneda, locale)}</td>
                  <td>{fechaVisible(p.vigente_desde, locale)}</td>
                  <td>{fechaVisible(p.vigente_hasta, locale)}</td>
                  <td>
                    <span className={claseBadge(p.activo ? 'activo' : 'inactivo')}>
                      {p.activo ? t.lista_precios.activo_si : t.lista_precios.activo_no}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="panel-enlace" onClick={() => setSeleccionado(p)}>
                      {esAdmin && !esPromocion(p) ? t.comun.editar : t.comun.ver_detalle}
                    </button>
                    {esAdmin && admitePromocion(p) && (
                      <>
                        {' '}
                        <button type="button" className="panel-enlace" onClick={() => setConPromocion(p)}>
                          {t.lista_precios.cargar_promocion}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {(seleccionado || creandoNuevo) && (
        <ListaPrecioDetalle
          precio={seleccionado}
          soloLectura={!esAdmin}
          onClose={() => {
            setSeleccionado(null);
            setCreandoNuevo(false);
          }}
          onActualizada={() => {
            setSeleccionado(null);
            setCreandoNuevo(false);
            recargar();
          }}
        />
      )}
      {conPromocion && (
        <PromocionDeLista
          precio={conPromocion}
          onClose={() => setConPromocion(null)}
          onCargada={() => {
            setConPromocion(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
