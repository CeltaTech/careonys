import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Button } from '../components/ui/Button';
import { useModalAccesible } from '../hooks/useModalAccesible';

/* La ventana que pregunta antes de algo destructivo, y nada más.

   Vivía adentro del contexto del permiso de acceso, que era otra cosa entera: ahí estaba la
   maquinaria con la que el Panel abría y renovaba el permiso con el que alguien de CeltaTech entra
   a una Prestadora. Esa maquinaria se fue —el permiso lo abre CeltaTech desde su lado—, y la
   ventana de confirmar se quedó, porque la usa medio Panel y nunca tuvo nada que ver con aquello.

   Confirmar es una sola cosa y se escribe una sola vez: qué se va a hacer, y cancelar o seguir. */
const ConfirmacionContext = createContext(null);

export function ConfirmacionProvider({ children }) {
  const modal = useModalAccesible(() => resolverConfirmacion(false));
  const { t } = useLocale();
  const [mensaje, setMensaje] = useState(null);
  const resolverRef = useRef(null);

  const pedirConfirmacion = useCallback((texto) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setMensaje(texto);
    });
  }, []);

  const resolverConfirmacion = useCallback((resultado) => {
    resolverRef.current?.(resultado);
    resolverRef.current = null;
    setMensaje(null);
  }, []);

  return (
    <ConfirmacionContext.Provider value={{ pedirConfirmacion }}>
      {children}
      {mensaje !== null && (
        <div className="panel-modal-fondo" onClick={() => resolverConfirmacion(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
            <p id={modal.idTitulo}>{mensaje}</p>
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => resolverConfirmacion(false)}>
                {t.comun.cancelar}
              </Button>
              <Button onClick={() => resolverConfirmacion(true)}>{t.comun.confirmar}</Button>
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
