// Cómo se lee el Cliente de un Servicio. Escrito una sola vez porque lo necesitan la lista de
// Servicios, el Estado actual y el Detalle del servicio.
//
// El Servicio dice de qué Cliente es con `cliente_id`. Los datos de contacto salen de los datos
// de quien contrata, en el Directorio de Personas, y llegan aparte, en un mapa que cada
// pantalla arma con `contactosDeClientes`.

/**
 * @param {object|null} servicio Una fila de `servicios` que traiga `cliente_id`.
 * @param {Map<string, object>} [contactos] Mapa de identificador de Cliente a sus datos de
 *   contacto —nombre, localidad, teléfono, correo—. Puede venir vacío mientras se carga.
 * @returns {{id: string|null, contacto: object|null, ruta: string|null}}
 *   `contacto` es lo que se muestra, y `ruta` adónde lleva el botón que abre la Ficha del cliente.
 */
export function clienteDelServicio(servicio, contactos) {
  const id = servicio?.cliente_id ?? null;
  if (!id) return { id: null, contacto: null, ruta: null };
  return { id, contacto: contactos?.get?.(id) ?? null, ruta: `/clientes/${id}` };
}

/**
 * Trae los datos de contacto de los Clientes de una lista de Servicios y los devuelve en el mapa
 * que espera `clienteDelServicio`.
 *
 * @param {object} supabase El cliente de la base.
 * @param {Array<object>} servicios Filas con `cliente_id`.
 * @returns {Promise<{contactos: Map<string, object>, error: object|null}>}
 */
export async function contactosDeClientes(supabase, servicios) {
  const idsCliente = [...new Set((servicios ?? []).map((s) => s?.cliente_id).filter(Boolean))];

  if (idsCliente.length === 0) return { contactos: new Map(), error: null };

  const { data, error } = await supabase
    .from('clientes')
    .select(
      'id, personas!clientes_contratante_de_la_misma_prestadora(nombre_visible, email, ' +
        'lugares!personas_lugar_fkey(nombre), ' +
        'telefonos_de_la_persona!el_telefono_es_de_una_persona_de_esta_prestadora(telefono))',
    )
    .in('id', idsCliente);

  if (error) return { contactos: new Map(), error };

  return {
    contactos: new Map((data ?? []).filter((f) => f.personas).map((f) => [f.id, contactoDeLaPersona(f.personas)])),
    error: null,
  };
}

/** Lo que se muestra de una persona del Directorio como contacto del Cliente. */
function contactoDeLaPersona(persona) {
  return {
    nombre: persona.nombre_visible ?? null,
    email: persona.email ?? null,
    localidad: persona.lugares?.nombre ?? null,
    telefono: persona.telefonos_de_la_persona?.[0]?.telefono ?? null,
  };
}
