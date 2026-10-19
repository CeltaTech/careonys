import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { useModalAccesible } from '../hooks/useModalAccesible';

/* La ventana que pregunta antes de algo destructivo, y nada más.

   Vivía adentro del contexto del permiso de acceso, que era otra cosa entera: ahí estaba la
   maquinaria con la que el Panel abría y renovaba el permiso con el que alguien de CeltaTech entra
   a una Prestadora. Esa maquinaria se fue —el permiso lo abre CeltaTech desde su lado—, y la
   ventana de confirmar se quedó, porque la usa medio Panel y nunca tuvo nada que ver con aquello.

   Confirmar es una sola cosa y se escribe una sola vez: qué se va a hacer, y cancelar o seguir.
   Se le pasa el texto solo, o `{ texto, confirmar }` cuando el botón tiene que decir qué hace.

   Con `{ texto, confirmar, motivo: true }` la ventana pide además el motivo, obligatorio, y al
   confirmar devuelve el motivo escrito en lugar de `true`; al cancelar, `false`. Es lo que pide
   desactivar una cuenta, que guarda por qué. */
const ConfirmacionContext = createContext(null);

export function ConfirmacionProvider({ children }) {
  const modal = useModalAccesible(() => resolverConfirmacion(false));
  const { t } = useLocale();
  const [mensaje, setMensaje] = useState(null);
  const [textoBoton, setTextoBoton] = useState(null);
  const [pideMotivo, setPideMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [faltaElMotivo, setFaltaElMotivo] = useState(false);
  const resolverRef = useRef(null);

  const pedirConfirmacion = useCallback((pedido) => {
    const conBoton = pedido !== null && typeof pedido === 'object';
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setTextoBoton(conBoton ? pedido.confirmar ?? null : null);
      setPideMotivo(conBoton && pedido.motivo === true);
      setMotivo('');
      setFaltaElMotivo(false);
      setMensaje(conBoton ? pedido.texto : pedido);
    });
  }, []);

  const resolverConfirmacion = useCallback((resultado) => {
    resolverRef.current?.(resultado);
    resolverRef.current = null;
    setMensaje(null);
  }, []);

  // El motivo vacío se avisa al apretar confirmar, no antes.
  const confirmar = () => {
    if (!pideMotivo) return resolverConfirmacion(true);
    const escrito = motivo.trim();
    if (!escrito) return setFaltaElMotivo(true);
    return resolverConfirmacion(escrito);
  };

  return (
    <ConfirmacionContext.Provider value={{ pedirConfirmacion }}>
      {children}
      {mensaje !== null && (
        <div className="panel-modal-fondo" onClick={() => resolverConfirmacion(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <p id={modal.idTitulo}>{mensaje}</p>
            {pideMotivo && (
              <FormField
                type="textarea"
                name="motivo-de-la-confirmacion"
                label={t.comun.motivo}
                required
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  if (e.target.value.trim()) setFaltaElMotivo(false);
                }}
                error={faltaElMotivo ? t.formularios.falta_un_dato_obligatorio : null}
              />
            )}
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => resolverConfirmacion(false)}>
                {t.comun.cancelar}
              </Button>
              <Button onClick={confirmar}>{textoBoton ?? t.comun.confirmar}</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmacionContext.Provider>
  );
}

export function useConfirmacion() {
  const ctx = useContext(ConfirmacionContext);
  if (!ctx) throw new Error('useConfirmacion debe usarse dentro de ConfirmacionProvider');
  return ctx;
}

export function useConfirmarDestructivo() {
  return useConfirmacion().pedirConfirmacion;
}
