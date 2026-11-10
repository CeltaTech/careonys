import { useEffect, useId, useRef, useState } from 'react';
import './iconoInfo.css';

/* La «i» en un redondel al lado de una etiqueta: deja corto el nombre y muestra qué incluye al
   pasar el puntero, al enfocarla o al tocarla. Es la excepción a «ningún casillero lleva una
   explicación debajo» y se usa sólo donde la aclaración es imprescindible. */
export function IconoInfo({ texto, etiqueta }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const raiz = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    function cerrarSiEsAfuera(e) {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false);
    }
    function cerrarConEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('pointerdown', cerrarSiEsAfuera);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('pointerdown', cerrarSiEsAfuera);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [abierto]);

  if (!texto) return null;

  return (
    <span
      ref={raiz}
      className="icono-info"
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
    >
      <button
        type="button"
        className="icono-info-boton"
        aria-label={etiqueta}
        aria-describedby={abierto ? id : undefined}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
      >
        i
      </button>
      {abierto && (
        <span role="tooltip" id={id} className="icono-info-texto">
          {texto}
        </span>
      )}
    </span>
  );
}
