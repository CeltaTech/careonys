// Punto único de verdad del renglón de una lista que abre su detalle.
//
// El detalle se abre con un clic en cualquier parte del renglón, o con Enter cuando el
// renglón tiene el foco. Un clic sobre un botón, un enlace o un casillero que viva adentro
// del renglón hace lo suyo y no abre el detalle: cada control conserva su propia acción.

const CONTROLES = 'button, a, input, select, textarea, label, [role="button"]';

function vieneDeUnControl(evento) {
  const control = evento.target?.closest?.(CONTROLES);
  return Boolean(control) && control !== evento.currentTarget;
}

export function propsDeFilaQueAbre(abrir) {
  return {
    className: 'listado-fila-abre',
    tabIndex: 0,
    onClick: (evento) => {
      if (vieneDeUnControl(evento)) return;
      abrir();
    },
    onKeyDown: (evento) => {
      if (evento.key !== 'Enter' || evento.target !== evento.currentTarget) return;
      abrir();
    },
  };
}
