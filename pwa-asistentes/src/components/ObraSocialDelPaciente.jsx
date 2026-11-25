/**
 * La obra social y el número de afiliado de cada Paciente durante el turno de guardia en curso,
 * debajo de los contactos de emergencia.
 *
 * El backend los manda sólo entre la llegada y la salida, y sólo de los Pacientes cuyo Cliente
 * firmó la Autorización al Asistente. Fuera de eso no llega nada y no se dibuja nada.
 */
export default function ObraSocialDelPaciente({ pacientes, porPaciente, mostrarNombre, t }) {
  const conObraSocial = (pacientes ?? [])
    .map((paciente) => ({ paciente, cobertura: porPaciente?.[paciente.id] }))
    .filter(({ cobertura }) => cobertura && (cobertura.obra_social || cobertura.numero_afiliado));
  if (conObraSocial.length === 0) return null;
  const tr = t.turno_guardia_activo;

  return (
    <section className="pwa-card">
      <h2>{tr.obra_social}</h2>
      {conObraSocial.map(({ paciente, cobertura }) => (
        <div key={paciente.id} className="tarjeta">
          {mostrarNombre && <div className="tarjeta-paciente">{paciente.nombre}</div>}
          {cobertura.obra_social && <div>{cobertura.obra_social}</div>}
          {cobertura.numero_afiliado && <div>{tr.numero_afiliado}: {cobertura.numero_afiliado}</div>}
        </div>
      ))}
    </section>
  );
}
