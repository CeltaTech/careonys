import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { mensajeDeError } from '../lib/errores';
import { formatearImporte } from '../lib/dinero';
import { periodoEnPalabras, diaEnPalabras } from '../lib/fechaEnPalabras';

// De qué está hecho el importe de un período.
//
// Un total solo no se puede comprobar ni discutir, y quien paga tiene que poder hacer las dos
// cosas: qué se cobró, cuánto de cada cosa, y qué pagos entraron contra eso.
//
// EL COBRO ANULADO SE MUESTRA, MARCADO. Anular no es borrar: un pago que se anotó y después se
// dio de baja, sacado de la pantalla, queda indistinguible de uno que nunca existió, y quien lo
// hizo se entera de que no cuenta cuando le reclaman. El motivo de la anulación no viene: ésa es
// una nota de trabajo de la Prestadora.
//
// LO COBRADO, EL SALDO Y EL ESTADO PUEDEN NO VENIR. Con la cobranza en manos de otro software, el
// backend deja de calcularlos y no los manda. Lo que no viene no se dibuja: un cero o un guion se
// leen como si fueran ciertos. Los renglones y la fecha siguen, que son datos guardados.
export default function FacturaDetalle() {
  const { facturaId } = useParams();
  const { t, locale } = useLocale();
  const [detalle, setDetalle] = useState(undefined);
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    let activo = true;
    setDetalle(undefined);
    api
      .factura(facturaId)
      .then((data) => {
        if (activo) setDetalle(data);
      })
      .catch((e) => {
        if (!activo) return;
        setError(e?.status === 404 ? t.facturas.no_encontrada : mensajeDeError(e, t, 'factura del Cliente'));
      });
    return () => {
      activo = false;
    };
  }, [facturaId]);

  // La dirección se pide en el momento de tocar el botón y vence enseguida, así que no se guarda
  // ni se vuelve a usar: cada descarga pide la suya.
  async function bajarElComprobante() {
    setBajando(true);
    setError('');
    try {
      const { direccion } = await api.direccionDelComprobante(facturaId);
      window.location.assign(direccion);
    } catch (e) {
      setError(mensajeDeError(e, t, 'comprobante de la factura'));
    }
    setBajando(false);
  }

  const volver = (
    <Link to="/facturas" className="btn btn-volver">
      <span aria-hidden="true">←</span> {t.comun.volver}
    </Link>
  );

  // El error de la carga tapa la pantalla porque no hay nada que mostrar; el de la descarga se
  // avisa al lado del botón, sin hacer desaparecer la factura que se estaba mirando.
  if (error && detalle === undefined) {
    return (
      <>
        {volver}
        <div className="alert alert-error" role="alert">{error}</div>
      </>
    );
  }
  if (detalle === undefined) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  const { factura, renglones, cobros } = detalle;

  return (
    <>
      {volver}
      <h1>{periodoEnPalabras(factura.periodo, locale)}</h1>

      <section className="pwa-card">
        <dl className="pwa-datos">
          <dt>{t.facturas.col_facturado}</dt>
          <dd>{formatearImporte(factura.monto_total, factura.moneda, locale)}</dd>
          {factura.cobrado !== undefined && (
            <>
              <dt>{t.facturas.col_cobrado}</dt>
              <dd>{formatearImporte(factura.cobrado, factura.moneda, locale)}</dd>
            </>
          )}
          {factura.saldo !== undefined && (
            <>
              <dt>{t.facturas.col_saldo}</dt>
              <dd>{formatearImporte(factura.saldo, factura.moneda, locale)}</dd>
            </>
          )}
          {factura.estado !== undefined && (
            <>
              <dt>{t.facturas.col_estado}</dt>
              <dd>{traducirValor(t.facturas, `estado_${factura.estado}`)}</dd>
            </>
          )}
          <dt>{t.facturas.col_emision}</dt>
          <dd>{diaEnPalabras(factura.fecha_emision, locale)}</dd>
          <dt>{t.facturas.col_vencimiento}</dt>
          <dd>{diaEnPalabras(factura.fecha_vencimiento, locale)}</dd>
        </dl>

        {/* El papel sólo se ofrece cuando la Prestadora reparte las facturas por acá y el
            comprobante ya está guardado. Apagado el interruptor, no se dice ni que existe. */}
        {detalle.entrega_la_factura && factura.tiene_comprobante && (
          <button
            type="button"
            className="btn btn-secondary btn-full btn-abajo"
            onClick={bajarElComprobante}
            disabled={bajando}
          >
            {bajando ? t.comun.cargando : t.facturas.bajar_comprobante}
          </button>
        )}
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="pwa-card">
        <h2>{t.facturas.renglones_titulo}</h2>
        {renglones.length === 0 ? (
          <div className="estado-vacio" role="status">{t.facturas.sin_renglones}</div>
        ) : (
          renglones.map((r) => (
            <div key={r.id} className="guardia-card">
              <div className="guardia-card-paciente">{r.descripcion}</div>
              <div className="guardia-card-detalle">{formatearImporte(r.monto, r.moneda, locale)}</div>
            </div>
          ))
        )}
      </section>

      <section className="pwa-card">
        <h2>{t.facturas.cobros_titulo}</h2>
        {cobros.length === 0 ? (
          <div className="estado-vacio" role="status">{t.facturas.sin_cobros}</div>
        ) : (
          cobros.map((c) => (
            <div key={c.id} className="guardia-card">
              <div className="guardia-card-paciente">
                {formatearImporte(c.monto, c.moneda, locale)}
                {c.estado === 'anulado' && <> · {t.facturas.cobro_anulado}</>}
              </div>
              <div className="guardia-card-detalle">
                {diaEnPalabras(c.fecha_cobro, locale)} · {traducirValor(t.facturas, `medio_${c.medio}`)}
              </div>
            </div>
          ))
        )}
      </section>

      <p className="mini">{t.facturas.no_es_comprobante}</p>
    </>
  );
}
