import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { esAdminDePrestadora } from '../../lib/roles';
import { claseBadge } from '../../lib/tonos';
import { formatearImporte } from '../../lib/dinero';
import { llamarApiMatch } from '../../lib/apiMatch';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { FormaDeCobroDetalle } from './FormaDeCobroDetalle';

/* Cómo cobra la Prestadora.
   ==========================================================================

   Acá carga sus formas de cobro: qué se cobra, cada cuánto, con cuántos días gratis y con qué
   saldo de contactos. Es lo que le faltaba al Match: hasta ahora cada cobro se cargaba a
   mano, sin ningún valor de referencia, mientras que la prestación directa ya tenía su lista de
   precios.

   CeltaTech no pone ni sugiere ninguno de estos números: la política de comercialización es de
   cada Prestadora. Por eso verlas es de la administración y cargarlas es solamente del Admin de
   la Prestadora. */
export function FormasDeCobro() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const [formas, setFormas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);
  const [creandoNueva, setCreandoNueva] = useState(false);

  const esAdmin = esAdminDePrestadora(usuario?.rol);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { formas: filas, unidades_de_periodo: unidadesDelCatalogo } =
        await llamarApiMatch('/formas-de-cobro');
      setFormas(filas || []);
      setUnidades(unidadesDelCatalogo || []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /* Cada cuánto se cobra, dicho como se dice. Sin período, la forma se cobra una sola vez —un
     paquete de contactos, por ejemplo—; con período de uno, se dice «por mes» y no «cada 1 mes». */
  function comoSeCobra(forma) {
    if (!forma.periodo_cantidad || !forma.periodo_unidad) return t.match.forma_periodo_una_vez;
    const singular = t.match[`periodo_${forma.periodo_unidad}`] || forma.periodo_unidad;
    if (Number(forma.periodo_cantidad) === 1) {
      return t.match.forma_periodo_por.replace('{unidad}', singular);
    }
    const plural = t.match[`periodo_${forma.periodo_unidad}_plural`] || singular;
    return t.match.forma_periodo_cada
      .replace('{cantidad}', forma.periodo_cantidad)
      .replace('{unidad}', plural);
  }

  return (
    <div>
      <h1>{t.match.formas_titulo}</h1>
      <p className="panel-explicacion">{t.match.formas_explicacion}</p>

      {estado === 'error' && error && <Alert variant="error">{error}</Alert>}

      {esAdmin && (
        <div className="panel-filtros">
          <Button onClick={() => setCreandoNueva(true)}>{t.match.formas_nueva}</Button>
        </div>
      )}

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && formas.length === 0}
        recargar={recargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.match.forma_nombre}</th>
              <th>{t.match.forma_importe}</th>
              <th>{t.match.forma_col_periodo}</th>
              <th>{t.match.forma_dias_gratis}</th>
              <th>{t.match.forma_contactos_incluidos}</th>
              <th>{t.match.forma_renueva_sola}</th>
              <th>{t.match.forma_ofrecida}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {formas.map((forma) => (
              <tr key={forma.id}>
                <td>{forma.nombre}</td>
                {/* Cada forma trae su moneda, que completó la base con la de la Prestadora. */}
                <td>{formatearImporte(forma.importe, forma.moneda, locale)}</td>
                <td>{comoSeCobra(forma)}</td>
                <td>{forma.dias_gratis ?? '—'}</td>
                <td>{forma.contactos_incluidos ?? '—'}</td>
                <td>{forma.renueva_sola ? t.comun.si : t.comun.no}</td>
                <td>
                  <span className={claseBadge(forma.ofrecida ? 'activo' : 'inactivo')}>
                    {forma.ofrecida ? t.match.forma_ofrecida_si : t.match.forma_ofrecida_no}
                  </span>
                </td>
                <td>
                  <button onClick={() => setSeleccionada(forma)}>
                    {esAdmin ? t.comun.editar : t.comun.ver_detalle}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {(seleccionada || creandoNueva) && (
        <FormaDeCobroDetalle
          forma={seleccionada}
          unidades={unidades}
          soloLectura={!esAdmin}
          onClose={() => {
            setSeleccionada(null);
            setCreandoNueva(false);
          }}
          onGuardada={() => {
            setSeleccionada(null);
            setCreandoNueva(false);
            recargar();
          }}
        />
      )}
    </div>
  );
}
