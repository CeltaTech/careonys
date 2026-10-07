import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import {
  LARGO_MINIMO_DEL_SECRETO_DEL_AVISO,
  PLAZO_MAXIMO_EN_DIAS,
  plazoQueSePuedeGuardar,
} from '../../lib/facturacionDeClientes';
import '../../styles/molde-paginas.css';

/* A qué plazo pagan los Clientes lo que se les factura.
   ==========================================================================

   PARA QUÉ SIRVE ESTE NÚMERO. De acá sale la fecha de vencimiento de cada factura, y de esa
   fecha sale si un Cliente figura en mora. Hasta entonces la fecha se escribía a mano cada vez
   que se generaba una tanda, igual para todas.

   NO HAY VALOR DE FÁBRICA, Y ES A PROPÓSITO. A qué plazo paga cada Cliente es parte de lo que se
   acordó con ella, y un plazo que invente el sistema pondría facturas en mora sin que nadie lo
   haya decidido. Mientras esto quede vacío, la pantalla de saldos sigue pidiendo la fecha.

   Y VACÍO NO ES CERO. Cero quiere decir «paga el mismo día», que es un acuerdo posible.

   Lo de acá rige para toda la Prestadora; con un Cliente en particular se puede acordar otro
   plazo desde la Ficha del cliente, y ese gana. La cuenta vive en `lib/facturacionDeClientes.js`, que es el
   mismo archivo que usa el backend. */
export function FacturacionClientesTab() {
  const { t } = useLocale();
  const [dias, setDias] = useState('');
  const [sigue, setSigue] = useState(true);
  const [entrega, setEntrega] = useState(true);
  const [prestadoraId, setPrestadoraId] = useState(null);
  const [cobranzaConectada, setCobranzaConectada] = useState(false);
  const [secreto, setSecreto] = useState('');
  const [guardandoSecreto, setGuardandoSecreto] = useState(false);
  const [facturacionConectada, setFacturacionConectada] = useState(false);
  const [secretoDeFacturacion, setSecretoDeFacturacion] = useState('');
  const [guardandoSecretoDeFacturacion, setGuardandoSecretoDeFacturacion] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { configuracion } = await llamarApi('/facturacion-clientes');
      setDias(configuracion.dias_hasta_el_vencimiento === null ? '' : String(configuracion.dias_hasta_el_vencimiento));
      setSigue(configuracion.sigue_la_cobranza !== false);
      setEntrega(configuracion.entrega_la_factura !== false);
      setCobranzaConectada(!!configuracion.aviso_de_restriccion_conectado);
      setFacturacionConectada(!!configuracion.aviso_de_facturacion_conectado);
      setPrestadoraId(configuracion.prestadora_id ?? null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // La misma comprobación que hace el backend antes de escribir, leída del archivo compartido: así
  // el botón no ofrece guardar algo que después se rechaza.
  const revisado = plazoQueSePuedeGuardar(dias === '' ? '' : Number(dias));

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      await llamarApi('/facturacion-clientes', {
        method: 'PUT',
        body: JSON.stringify({
          dias_hasta_el_vencimiento: dias === '' ? '' : Number(dias),
          sigue_la_cobranza: sigue,
          entrega_la_factura: entrega,
        }),
      });
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  // El secreto se guarda aparte del resto, y a propósito: va a la caja fuerte de la base por otra
  // puerta, no vuelve a salir nunca, y guardarlo junto con lo demás obligaría a volver a
  // escribirlo cada vez que se cambia el plazo de pago.
  async function guardarSecreto() {
    setGuardandoSecreto(true);
    setError(null);
    try {
      await llamarApi('/facturacion-clientes/secreto-del-aviso', {
        method: 'PUT',
        body: JSON.stringify({ secreto }),
      });
      setSecreto('');
      setCobranzaConectada(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoSecreto(false);
    }
  }

  // El secreto con el que firma el software de facturación. Es otro, y no el de arriba: el que
  // factura y el que sigue la cobranza pueden ser de dos proveedores que no se conocen.
  async function guardarSecretoDeFacturacion() {
    setGuardandoSecretoDeFacturacion(true);
    setError(null);
    try {
      await llamarApi('/facturacion-clientes/secreto-del-aviso-de-facturacion', {
        method: 'PUT',
        body: JSON.stringify({ secreto: secretoDeFacturacion }),
      });
      setSecretoDeFacturacion('');
      setFacturacionConectada(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoSecretoDeFacturacion(false);
    }
  }

  return (
    <>
      <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.facturacion_clientes_titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <EstadoLista estado={estado} error={error} recargar={recargar}>
        <>
          <div className="molde-formgrid">
          <FormField
            label={t.configuracion.facturacion_clientes_dias}
            name="dias_hasta_el_vencimiento"
            type="number"
            min="0"
            max={PLAZO_MAXIMO_EN_DIAS}
            value={dias}
            error={!revisado.ok ? t.configuracion.facturacion_clientes_fuera_de_borde : undefined}
            onChange={(e) => {
              setDias(e.target.value);
              setGuardado(false);
            }}
          />
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.cobranza_sigue_titulo}
              name="sigue_la_cobranza"
              type="checkbox"
              checked={sigue}
              onChange={(e) => {
                setSigue(e.target.checked);
                setGuardado(false);
              }}
            />
          </div>
          {/* Quién reparte la factura es otra decisión que quién sigue la cobranza: una Prestadora
              puede hacer llegar las facturas por su cuenta y seguir llevando el saldo acá. */}
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.factura_entrega_titulo}
              name="entrega_la_factura"
              type="checkbox"
              checked={entrega}
              onChange={(e) => {
                setEntrega(e.target.checked);
                setGuardado(false);
              }}
            />
          </div>
          </div>
          <div className="molde-acciones">
            <Button onClick={guardar} disabled={guardando || !revisado.ok}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </>
      </EstadoLista>
      </section>

      {/* Que el software de facturación avise solo lo que emitió. Se ofrece siempre, sin
          importar quién sigue la cobranza: son dos decisiones distintas, y facturar lo hace
          siempre alguien de afuera. Mientras no haya secreto cargado, no entra ningún dato,
          y se sigue anotando a mano o con el archivo. */}
      {estado === 'listo' && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.configuracion.facturacion_aviso_titulo}</h2>
            <span className={`badge ${facturacionConectada ? 'badge-exito' : 'badge-neutro'}`}>
              {facturacionConectada
                ? t.configuracion.facturacion_aviso_conectado
                : t.configuracion.facturacion_aviso_sin_conectar}
            </span>
          </div>
          <div className="molde-formgrid">
            {prestadoraId && (
              <div className="molde-ancho">
                <FormField
                  label={t.configuracion.facturacion_aviso_direccion}
                  name="direccion_del_aviso_de_facturacion"
                  value={`${import.meta.env.VITE_API_URL}/api/avisos-de-facturacion/${prestadoraId}`}
                  readOnly
                />
              </div>
            )}
            <FormField
              label={t.configuracion.facturacion_aviso_secreto}
              name="secreto_del_aviso_de_facturacion"
              type="password"
              value={secretoDeFacturacion}
              onChange={(e) => setSecretoDeFacturacion(e.target.value)}
            />
          </div>
          <div className="molde-acciones">
            <Button
              onClick={guardarSecretoDeFacturacion}
              disabled={
                guardandoSecretoDeFacturacion ||
                secretoDeFacturacion.trim().length < LARGO_MINIMO_DEL_SECRETO_DEL_AVISO
              }
            >
              {guardandoSecretoDeFacturacion ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </section>
      )}

      {estado === 'listo' && !sigue && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.configuracion.cobranza_aviso_titulo}</h2>
            <span className={`badge ${cobranzaConectada ? 'badge-exito' : 'badge-neutro'}`}>
              {cobranzaConectada
                ? t.configuracion.cobranza_aviso_conectado
                : t.configuracion.cobranza_aviso_sin_conectar}
            </span>
          </div>
          <div className="molde-formgrid">
            {prestadoraId && (
              <div className="molde-ancho">
                <FormField
                  label={t.configuracion.cobranza_aviso_direccion}
                  name="direccion_del_aviso"
                  value={`${import.meta.env.VITE_API_URL}/api/avisos-de-cobranza/${prestadoraId}`}
                  readOnly
                />
              </div>
            )}
            <FormField
              label={t.configuracion.cobranza_aviso_secreto}
              name="secreto_del_aviso"
              type="password"
              value={secreto}
              onChange={(e) => setSecreto(e.target.value)}
            />
          </div>
          <div className="molde-acciones">
            <Button
              onClick={guardarSecreto}
              disabled={guardandoSecreto || secreto.trim().length < LARGO_MINIMO_DEL_SECRETO_DEL_AVISO}
            >
              {guardandoSecreto ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
