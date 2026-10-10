// El candado al lado de lo que trae el producto y ninguna Prestadora edita ni borra: los tipos de
// Asistente de fábrica y las tareas fijas de cada uno. Se dibuja con el mismo trazo que los
// íconos del menú, y lleva nombre para quien no ve la pantalla.
export function Candado({ etiqueta }) {
  return (
    <span className="panel-candado" role="img" aria-label={etiqueta} title={etiqueta}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}
