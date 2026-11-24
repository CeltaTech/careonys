import { con } from '../lib/textos';
import { pacientesConContactos, enlaceDeLlamada } from '../lib/contactosDeEmergencia';

/**
 * Los contactos de emergencia de cada Paciente durante el turno de guardia en curso, en orden de
 * prioridad y con un botón para llamar a cada teléfono.
 *
 * El backend los manda sólo entre la llegada y la salida, así que fuera de ese rato no llega
 * ninguno y no se dibuja nada. Un Paciente sin contactos tampoco aparece.
 */
export default function ContactosDeEmergencia({ pacientes, porPaciente, mostrarNombre, t }) {
  const conContactos = pacientesConContactos(pacientes, porPaciente);
  if (conContactos.length === 0) return null;
  const tr = t.turno_guardia_activo;

  return (
    <section className="pwa-card">
      <h2>{tr.contactos_de_emergencia}</h2>
      {conContactos.map(({ paciente, contactos }) => (
        <div key={paciente.id}>
          {mostrarNombre && <div className="tarjeta-paciente">{paciente.nombre}</div>}
          {contactos.map((c) => (
            <div key={`${paciente.id}-${c.prioridad}-${c.nombre}`} className="tarjeta">
              <div className="tarjeta-paciente">{c.nombre}</div>
              {c.telefonos.map((tel) => (
                <a
                  key={tel}
                  className="btn btn-secondary btn-full pwa-card-pie"
                  href={enlaceDeLlamada(tel)}
                  aria-label={con(tr.llamar_a_contacto, { nombre: c.nombre, telefono: tel })}
                >
                  {con(tr.llamar_al_telefono, { telefono: tel })}
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
