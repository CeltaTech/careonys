// LOS DATOS QUE LA PRESTADORA TIENE DE UNA PERSONA, juntos, para entregárselos cuando los pide.
// Los usan el Panel —la administración se los baja para entregárselos— y la aplicación del Cliente
// —la persona se los baja ella misma—.
//
// Se leen con la conexión de quien pide, así que cada uno recibe lo que la base le deja ver. La
// información de salud pasa por esa misma conexión, que la manda por las funciones que anotan cada
// lectura en el registro de accesos: bajarla también es leerla.
//
// Son los datos tal como están guardados: la ficha de la persona, sus fichas de Paciente, su
// Cliente si es titular de uno, sus autorizaciones como persona autorizada, y la historia de su
// registro clínico.

async function leer(consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * @param {object} db  la conexión de quien pide, con la información de salud envuelta
 * @param {string} personaId
 * @param {string} prestadoraId
 * @returns {Promise<object|null>}  null si la persona no existe o quien pide no la ve
 */
export async function datosDeLaPersona(db, personaId, prestadoraId) {
  const persona = await leer(db.from('personas').select('*')
    .eq('id', personaId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle());
  if (!persona) return null;

  const [pacientes, clientes, autorizaciones] = await Promise.all([
    leer(db.from('pacientes').select('*').eq('persona_id', personaId).eq('prestadora_id', prestadoraId)),
    leer(db.from('clientes').select('*').eq('contratante_persona_id', personaId).eq('prestadora_id', prestadoraId)),
    leer(db.from('personas_autorizadas').select('*').eq('persona_id', personaId).eq('prestadora_id', prestadoraId)),
  ]);

  const idsDePacientes = (pacientes ?? []).map((p) => p.id);
  const versiones = idsDePacientes.length === 0 ? [] : await leer(db.from('versiones_registro_clinico')
    .select('*')
    .in('paciente_id', idsDePacientes)
    .eq('prestadora_id', prestadoraId)
    .order('momento', { ascending: true }));

  return {
    persona,
    pacientes: pacientes ?? [],
    clientes: clientes ?? [],
    personas_autorizadas: autorizaciones ?? [],
    versiones_registro_clinico: versiones ?? [],
  };
}

/** La persona del Directorio que es quien usa la aplicación del Cliente: la del titular o la de la
    persona autorizada. null si no tiene ninguna. */
export async function personaDeQuienUsaLaAplicacion(db, { usuarioId, clienteId, esTitular, prestadoraId }) {
  if (esTitular) {
    const cliente = await leer(db.from('clientes').select('contratante_persona_id')
      .eq('id', clienteId)
      .eq('prestadora_id', prestadoraId)
      .maybeSingle());
    return cliente?.contratante_persona_id ?? null;
  }
  const autorizada = await leer(db.from('personas_autorizadas').select('persona_id')
    .eq('usuario_id', usuarioId)
    .eq('cliente_id', clienteId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle());
  return autorizada?.persona_id ?? null;
}

/** Las personas del Directorio que son los Pacientes de un Cliente. */
export async function personasDeLosPacientesDelCliente(db, { clienteId, prestadoraId }) {
  const pacientes = await leer(db.from('pacientes').select('persona_id')
    .eq('cliente_id', clienteId)
    .eq('prestadora_id', prestadoraId));
  return [...new Set((pacientes ?? []).map((p) => p.persona_id).filter(Boolean))];
}
