import { nombreTarea, detalleTarea } from '../../lib/tiposAsistente';

// El nombre de la tarea se toca y debajo se abre su detalle. Es el texto que ven igual la
// Prestadora, el Cliente y el Asistente, y por eso corta la discusión sobre qué incluye.
// Lo usan Configuración, donde se escribe, y el Servicio, donde se acuerda.
export function TareaConDetalle({ tarea, t }) {
  const nombre = nombreTarea(tarea, t);
  const detalle = detalleTarea(tarea, t);
  if (!detalle) return <div><b>{nombre}</b></div>;
  return (
    <details className="panel-tarea-con-detalle">
      <summary><b>{nombre}</b></summary>
      <p>{detalle}</p>
    </details>
  );
}
