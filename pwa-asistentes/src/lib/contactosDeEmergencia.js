// Los contactos de emergencia de cada Paciente, tal como los muestra el turno de guardia en curso.
//
// El backend los manda sólo entre la llegada y la salida del turno de guardia, y fuera de ese
// rato manda un objeto vacío. Acá no se mira el reloj ni el estado del turno: se muestra lo que
// llegó, ordenado por prioridad, y nada más.

/**
 * Los contactos de un Paciente, en orden de prioridad, con sólo los teléfonos que se pueden llamar.
 * Un contacto sin ningún teléfono no se muestra: no hay a quién llamar.
 */
export function contactosDelPaciente(porPaciente, pacienteId) {
  const lista = porPaciente?.[pacienteId];
  if (!Array.isArray(lista)) return [];
  return lista
    .map((c) => ({
      prioridad: Number(c?.prioridad),
      nombre: c?.nombre ?? '',
      telefonos: (Array.isArray(c?.telefonos) ? c.telefonos : []).filter((tel) => enlaceDeLlamada(tel)),
    }))
    .filter((c) => c.telefonos.length > 0)
    .sort((a, b) => ordenDePrioridad(a.prioridad) - ordenDePrioridad(b.prioridad));
}

/**
 * Los Pacientes del turno de guardia que tienen al menos un contacto para llamar, cada uno con su
 * lista. El que no tiene ninguno no aparece, así no queda ningún recuadro vacío.
 */
export function pacientesConContactos(pacientes, porPaciente) {
  return (pacientes ?? [])
    .map((paciente) => ({ paciente, contactos: contactosDelPaciente(porPaciente, paciente.id) }))
    .filter((p) => p.contactos.length > 0);
}

/**
 * El enlace que abre el marcador del teléfono. Deja sólo las cifras y el signo más del principio,
 * que es lo que entiende el marcador. Sin ninguna cifra devuelve vacío.
 */
export function enlaceDeLlamada(telefono) {
  if (typeof telefono !== 'string' && typeof telefono !== 'number') return '';
  const texto = String(telefono).trim();
  const cifras = texto.replace(/\D/g, '');
  if (!cifras) return '';
  return `tel:${texto.startsWith('+') ? '+' : ''}${cifras}`;
}

// Una prioridad que no llegó como número va al final, en vez de romper el orden de las demás.
function ordenDePrioridad(prioridad) {
  return Number.isFinite(prioridad) ? prioridad : Number.MAX_SAFE_INTEGER;
}
