import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { usePedidosDeAutorizacion } from '../context/PedidosDeAutorizacionContext';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { TONO, claseBadgeTono } from '../lib/tonos';
import { llamarApiComprobaciones } from '../lib/apiComprobaciones';
import { mensajeDeError } from '../lib/errores';
import '../styles/molde-paginas.css';
import './seguimientoDeGuardias.css';

/* El pase de guardia visto desde la Prestadora (pendiente #113).
   ==========================================================================

   DOS LISTAS, Y UNA SOLA ES URGENTE.

     Arriba, quién está esperando. El Asistente llegó al domicilio y no pudo leer el código QR.
     Pidió autorización sin escribir nada: quedó anotado desde dónde y a qué hora la pidió.
     Quien coordina hace las verificaciones que acostumbre —llamando a la casa, por videollamada,
     como sea— y aprieta «Autorizar ingreso». Eso vale lo mismo que leer el código QR: la llegada
     queda comprobada con quién la autorizó y cuándo, y la salida del Asistente que se va queda
     autorizada también. Esta lista se refresca sola: ver `context/PedidosDeAutorizacionContext.jsx`.

     Abajo, qué quedó sin comprobar. La guardia nunca se traba: si la autorización no llegó, el
     Asistente entró igual eligiendo un motivo de una lista corta. Eso ya pasó, no hay nada que
     apurar, y queda acá hasta que alguien lo mire y lo cierre.

   CERRAR NO ES APROBAR NI RECHAZAR. Es decir que alguien la miró. Lo que se haya averiguado va
   en la nota, y la fila queda con quién la cerró y cuándo. No existe un botón de "rechazar"
   porque la llegada ya ocurrió: negarla después no la borra. */

function aLaHora(iso, locale) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString(locale);
}

function horario(fila) {
  const partes = [fila.fecha, fila.horaInicio && fila.horaFin ? `${fila.horaInicio}–${fila.horaFin}` : null];
  return partes.filter(Boolean).join(' · ') || '—';
}

/* La ventana que pide la nota antes de cerrar. La nota es opcional —a veces no hay nada que
   contar— así que el botón de cerrar no la exige. */
function CerrarSinComprobar({ fila, onCerrado, onClose }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onClose);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleCerrar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApiComprobaciones(`/${fila.id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({ nota }),
      });
      onCerrado();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.pase_de_guardia.cerrar_titulo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          label={t.pase_de_guardia.cerrar_nota}
          name="nota"
          type="textarea"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleCerrar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.pase_de_guardia.cerrar_accion}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PaseDeGuardia() {
  const { t, locale } = useLocale();
  const { pedidos, estado: estadoPedidos, error: errorPedidos, recargar: recargarPedidos } = usePedidosDeAutorizacion();

  const [autorizandoId, setAutorizandoId] = useState(null);
  const [errorAlAutorizar, setErrorAlAutorizar] = useState(null);

  const [sinComprobar, setSinComprobar] = useState([]);
  const [estadoSinComprobar, setEstadoSinComprobar] = useState('cargando');
  const [errorSinComprobar, setErrorSinComprobar] = useState(null);
  const [cerrando, setCerrando] = useState(null);

  const recargarSinComprobar = useCallback(async () => {
    setEstadoSinComprobar('cargando');
    setErrorSinComprobar(null);
    try {
      const lista = await llamarApiComprobaciones('/sin-comprobar');
      setSinComprobar(Array.isArray(lista) ? lista : []);
      setEstadoSinComprobar('listo');
    } catch (err) {
      setErrorSinComprobar(mensajeDeError(err, t));
      setEstadoSinComprobar('error');
    }
  }, [t]);

  useEffect(() => {
    recargarSinComprobar();
  }, [recargarSinComprobar]);

  async function autorizar(pedido) {
    setAutorizandoId(pedido.id);
    setErrorAlAutorizar(null);
    try {
      await llamarApiComprobaciones(`/${pedido.id}/autorizar`, { method: 'POST' });
      // Se vuelve a preguntar en el momento: el pedido autorizado sale de la lista para
      // cualquier otro que esté mirando.
      recargarPedidos();
    } catch (err) {
      setErrorAlAutorizar(mensajeDeError(err, t));
    } finally {
      setAutorizandoId(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.pase_de_guardia.titulo} />
      <div className="molde-pila">
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.pase_de_guardia.pedidos_titulo}</h2>
        </div>
      {/* El error de un refresco que falló cuando la lista ya estaba cargada: la lista se queda
          donde está y el mensaje va al lado, porque borrarla escondería un pedido que sigue
          esperando. */}
      {estadoPedidos === 'listo' && errorPedidos && <Alert variant="error">{errorPedidos}</Alert>}
      {errorAlAutorizar && <Alert variant="error">{errorAlAutorizar}</Alert>}

      <EstadoLista
        estado={estadoPedidos}
        error={errorPedidos}
        vacio={estadoPedidos === 'listo' && pedidos.length === 0}
        recargar={recargarPedidos}
        mensajeVacio={t.pase_de_guardia.pedidos_vacio}
      >
        {pedidos.map((pedido) => (
          <div key={pedido.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              {/* Si es la llegada o la salida es un dato, no un estado: no hay nada mejor ni
                  peor en ninguna de las dos, así que va con el tono que dice justamente eso. */}
              <b>{pedido.asistente || '—'}</b>{' '}
              <span className={claseBadgeTono(TONO.INFO)}>
                {t.pase_de_guardia[`momento_${pedido.momento}`] ?? pedido.momento}
              </span>
              <span className="panel-mini">{horario(pedido)}</span>
              <span className="panel-mini">{t.pase_de_guardia.pedido_desde}: {aLaHora(pedido.pedidoEn, locale)}</span>
            </div>
            <div className="seguimiento-acciones">
              <Button onClick={() => autorizar(pedido)} disabled={autorizandoId !== null}>
                {autorizandoId === pedido.id ? t.pase_de_guardia.autorizando : t.pase_de_guardia.autorizar}
              </Button>
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.pase_de_guardia.sin_comprobar_titulo}</h2>
        </div>
      <EstadoLista
        estado={estadoSinComprobar}
        error={errorSinComprobar}
        vacio={estadoSinComprobar === 'listo' && sinComprobar.length === 0}
        recargar={recargarSinComprobar}
        mensajeVacio={t.pase_de_guardia.sin_comprobar_vacio}
      >
        {sinComprobar.map((fila) => (
          <div key={fila.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              <b>{fila.asistente || '—'}</b>{' '}
              <span className={claseBadgeTono(TONO.INFO)}>
                {t.pase_de_guardia[`momento_${fila.momento}`] ?? fila.momento}
              </span>
              <span className="panel-mini">{horario(fila)}</span>
              <span className="panel-mini">{t.pase_de_guardia.ocurrida_en}: {aLaHora(fila.ocurridaEn, locale)}</span>
              <span className="panel-mini">
                {t.pase_de_guardia.col_motivo}: {t.pase_de_guardia[`motivo_${fila.motivo}`] ?? fila.motivo}
              </span>
              {fila.detalle && <p className="seguimiento-texto">{fila.detalle}</p>}
            </div>
            <div className="seguimiento-acciones">
              <Button onClick={() => setCerrando(fila)}>{t.pase_de_guardia.cerrar_accion}</Button>
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>
      </div>

      {cerrando && (
        <CerrarSinComprobar
          fila={cerrando}
          onClose={() => setCerrando(null)}
          onCerrado={() => {
            setCerrando(null);
            recargarSinComprobar();
          }}
        />
      )}
    </div>
  );
}
