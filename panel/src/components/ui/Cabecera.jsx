/* El renglón de arriba de cada página: el título a la izquierda y, a la derecha, la acción
   principal de la página. Es el mismo en todas para que el botón esté siempre en el mismo
   lugar. */

export function Cabecera({ titulo, children }) {
  return (
    <div className="panel-cabecera">
      <h1>{titulo}</h1>
      {children && <div className="panel-cabecera-acciones">{children}</div>}
    </div>
  );
}
