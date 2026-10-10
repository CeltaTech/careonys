import { nombreTarea, detalleTarea } from '../lib/tipoDeAsistente';

// Las tareas del tipo de Asistente, en sus tres clases: habilitadas, no incluidas y
// prohibidas. El Asistente y el Cliente ven exactamente lo mismo, así que las dos partes
// miran la misma lista: es lo que corta la discusión en la puerta.
//
// Una clase sin tareas no se dibuja. Si las tres están vacías, se dice una sola vez.
// El detalle de cada tarea se abre al tocar su nombre.
//
// Este archivo es el original de una copia idéntica en la aplicación de Clientes
// (`scripts/copias_entre_apps.mjs`): nunca se edita la copia a mano.

const CLASES = ['habilitada', 'no_incluida', 'prohibida'];

function Tarea({ tarea, t }) {
  const nombre = nombreTarea(tarea, t);
  const detalle = detalleTarea(tarea, t);
  if (!detalle) return <li>{nombre}</li>;
  return (
    <li>
      <details className="tarea-con-detalle">
        <summary>{nombre}</summary>
        <p>{detalle}</p>
      </details>
    </li>
  );
}

export default function TareasDelTipo({ tareas, vacio, t }) {
  const conTareas = CLASES.filter((clase) => (tareas?.[clase] || []).length > 0);
  if (conTareas.length === 0) return <div className="estado-vacio" role="status">{vacio}</div>;
  return conTareas.map((clase) => (
    <div key={clase} className="tareas-de-una-clase">
      <h3>{t.tareas_asistente[`clase_${clase}`]}</h3>
      <ul className="lista-tareas">
        {tareas[clase].map((tarea) => (
          <Tarea key={tarea.id} tarea={tarea} t={t} />
        ))}
      </ul>
    </div>
  ));
}
