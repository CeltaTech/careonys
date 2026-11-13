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
import {
  AJUSTES_POR_INDICE_POSIBLES,
  BORDES,
  CLAVES_DE_LAS_CONDICIONES,
  FORMAS_DE_PRECIO_POSIBLES,
  FRECUENCIAS_DE_COBRO_POSIBLES,
  MEDICIONES_POSIBLES,
  SIN_INDICE,
  VALORES_DE_FABRICA_DEL_CLIENTE,
  condicionesQueSePuedenGuardar,
} from '../../lib/condicionesDelCliente';
import { CONDICIONES_DE_CADA_MEDICION } from '../../lib/calcularLiquidacion';
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
  // Las condiciones de fábrica con las que se le cobra a cada Cliente. Cada Servicio puede tener
  // las suyas desde su Ficha; las que no tenga salen de acá.
  const [condiciones, setCondiciones] = useState(VALORES_DE_FABRICA_DEL_CLIENTE);
  const [indices, setIndices] = useState([]);
  const [errorIndices, setErrorIndices] = useState(null);
  // La condición mal cargada, que se señala recién al apretar guardar.
  const [condicionMal, setCondicionMal] = useState(null);

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
      setCondiciones(
        Object.fromEntries(CLAVES_DE_LAS_CONDICIONES.map((clave) => [clave, configuracion[clave] ?? null]))
      );
      setCondicionMal(null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Los índices salen del catálogo de la base. Si no se pueden leer, el resto de la configuración
  // sigue funcionando: sólo la opción del índice queda sin lista.
  useEffect(() => {
    let vigente = true;
    llamarApi('/facturacion-clientes/indices')
      .then(({ indices: lista }) => {
        if (vigente) setIndices(lista || []);
      })
      .catch((err) => {
        if (vigente) setErrorIndices(mensajeDeError(err, t));
      });
    return () => {
      vigente = false;
    };
  }, [t]);

  const ponerCondicion = (clave, valor) => {
    setCondiciones((antes) => ({ ...antes, [clave]: valor }));
    if (clave === condicionMal) setCondicionMal(null);
    setGuardado(false);
  };
  const cambiarCondicion = (clave) => (e) => ponerCondicion(clave, e.target.value === '' ? null : e.target.value);
  const cambiarSiNo = (clave) => (e) => ponerCondicion(clave, e.target.checked);

  // Sin índice no hay nada que aplicar: los meses y la forma de aplicarlo no se muestran.
  const conIndice = (condiciones.indice_de_actualizacion ?? SIN_INDICE) !== SIN_INDICE;
  const medicionQueRige = condiciones.medicion ?? VALORES_DE_FABRICA_DEL_CLIENTE.medicion;
  const errorDe = (clave, texto) => (condicionMal === clave ? texto : undefined);

  // La misma comprobación que hace el backend antes de escribir, leída del archivo compartido: así
  // el botón no ofrece guardar algo que después se rechaza.
  const revisado = plazoQueSePuedeGuardar(dias === '' ? '' : Number(dias));

  async function guardar() {
    const condicionesRevisadas = condicionesQueSePuedenGuardar(condiciones);
    if (!condicionesRevisadas.ok) {
      // Las demás son listas cerradas o casillas: lo que se puede cargar mal son los números.
      setCondicionMal(condicionesRevisadas.clave);
      document.getElementsByName(condicionesRevisadas.clave)[0]?.focus();
      return;
    }
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
          ...condiciones,
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
          <FormField
            label={t.configuracion.condiciones_cliente.forma_de_precio}
            name="forma_de_precio"
            type="select"
            value={condiciones.forma_de_precio ?? ''}
            onChange={cambiarCondicion('forma_de_precio')}
          >
            {FORMAS_DE_PRECIO_POSIBLES.map((valor) => (
              <option key={valor} value={valor}>
                {t.configuracion.condiciones_cliente.valores.forma_de_precio[valor]}
              </option>
            ))}
          </FormField>
          <FormField
            label={t.configuracion.condiciones_cliente.frecuencia_de_cobro}
            name="frecuencia_de_cobro"
            type="select"
            value={condiciones.frecuencia_de_cobro ?? ''}
            onChange={cambiarCondicion('frecuencia_de_cobro')}
          >
            {FRECUENCIAS_DE_COBRO_POSIBLES.map((valor) => (
              <option key={valor} value={valor}>
                {t.configuracion.condiciones_cliente.valores.frecuencia_de_cobro[valor]}
              </option>
            ))}
          </FormField>
          <FormField
            label={t.configuracion.condiciones_cliente.medicion}
            name="medicion"
            type="select"
            value={condiciones.medicion ?? ''}
            onChange={cambiarCondicion('medicion')}
          >
            {MEDICIONES_POSIBLES.map((valor) => (
              <option key={valor} value={valor}>
                {t.configuracion.condiciones_cliente.valores.medicion[valor]}
              </option>
            ))}
          </FormField>
          {/* Sólo las condiciones que cambian algo con la medición elegida. */}
          {(CONDICIONES_DE_CADA_MEDICION[medicionQueRige] ?? []).map((clave) =>
            clave === 'recargo_del_adicional' ? (
              <FormField
                key={clave}
                label={t.configuracion.condiciones_cliente.recargo_del_adicional}
                name={clave}
                type="number"
                min={BORDES.recargo_del_adicional.minimo}
                max={BORDES.recargo_del_adicional.maximo}
                step="1"
                value={condiciones.recargo_del_adicional ?? ''}
                error={errorDe(clave, t.configuracion.condiciones_cliente.recargo_fuera_de_borde)}
                onChange={cambiarCondicion(clave)}
              />
            ) : (
              <div className="molde-ancho" key={clave}>
                <FormField
                  label={t.configuracion.condiciones_cliente[clave]}
                  name={clave}
                  type="checkbox"
                  checked={(condiciones[clave] ?? VALORES_DE_FABRICA_DEL_CLIENTE[clave]) === true}
                  onChange={cambiarSiNo(clave)}
                />
              </div>
            )
          )}
          <FormField
            label={t.configuracion.condiciones_cliente.indice_de_actualizacion}
            name="indice_de_actualizacion"
            type="select"
            value={condiciones.indice_de_actualizacion ?? SIN_INDICE}
            error={errorIndices ?? undefined}
            onChange={cambiarCondicion('indice_de_actualizacion')}
          >
            <option value={SIN_INDICE}>{t.actualizacion_de_precios.sin_indice}</option>
            {indices.map((indice) => (
              <option key={indice.codigo} value={indice.codigo}>
                {indice.nombre}
              </option>
            ))}
          </FormField>
          {conIndice && (
            <>
              <FormField
                label={t.configuracion.condiciones_cliente.meses_entre_actualizaciones}
                name="meses_entre_actualizaciones"
                type="number"
                min={BORDES.meses_entre_actualizaciones.minimo}
                max={BORDES.meses_entre_actualizaciones.maximo}
                step="1"
                value={condiciones.meses_entre_actualizaciones ?? ''}
                error={errorDe('meses_entre_actualizaciones', t.configuracion.condiciones_cliente.meses_fuera_de_borde)}
                onChange={cambiarCondicion('meses_entre_actualizaciones')}
              />
              <FormField
                label={t.configuracion.condiciones_cliente.ajuste_por_indice}
                name="ajuste_por_indice"
                type="select"
                value={condiciones.ajuste_por_indice ?? VALORES_DE_FABRICA_DEL_CLIENTE.ajuste_por_indice}
                onChange={cambiarCondicion('ajuste_por_indice')}
              >
                {AJUSTES_POR_INDICE_POSIBLES.map((valor) => (
                  <option key={valor} value={valor}>
                    {t.configuracion.condiciones_cliente.valores.ajuste_por_indice[valor]}
                  </option>
                ))}
              </FormField>
            </>
          )}
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
