// Punto único de verdad (Regla 12, CLAUDE.md §7) para resolver "medicación vigente" de un
// Paciente y "¿puede este Asistente administrar esta vía?" — consumido por
// appFamilias.js/appAsistentes.js (para dejar de leer pacientes.medicacion_habitual,
// deprecado), panelMedicacion.js (cola de pendientes) y appAsistentesMedicacion.js (filtro
// de órdenes).

// Cada función entra con la conexión que recibe, que va primero. Detrás va `prestadoraId`, sin
// valor por defecto, como en el resto del archivo: quien llama puede pasar la llave maestra, que se
// saltea la protección por fila, y ahí lo único que separa una Prestadora de otra es este filtro.
export async function medicacionVigenteDelPaciente(db, prestadoraId, pacienteId) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('indicaciones_medicacion')
    .select('id, medicamento, dosis, frecuencia, via_administracion, fecha_desde, fecha_hasta')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId)
    .eq('estado', 'aceptada')
    .lte('fecha_desde', hoyISO)
    .or(`fecha_hasta.is.null,fecha_hasta.gte.${hoyISO}`)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function tipoMatriculaRequerida(db, prestadoraId, viaAdministracion) {
  const { data } = await db
    .from('configuracion_matricula_via_medicacion')
    .select('tipo_matricula_requerida')
    .eq('prestadora_id', prestadoraId)
    .eq('via_administracion', viaAdministracion)
    .maybeSingle();
  return data?.tipo_matricula_requerida ?? null;
}

// El filtro por Prestadora va aunque el identificador del Asistente ya sea de una sola: quien llama
// puede pasar la llave maestra, que se saltea la protección por fila, y ahí lo único que separa
// una Prestadora de otra son estos filtros. Y de acá cuelga si se puede dar una medicación.
export async function asistenteTieneMatriculaVigente(db, prestadoraId, asistenteId, tipoRequerido) {
  if (!tipoRequerido) return true;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('matriculas_asistente')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('asistente_id', asistenteId)
    .eq('tipo', tipoRequerido)
    .lte('vigente_desde', hoyISO)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoyISO}`)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// Asistentes con alguna Guardia futura o de hoy para ese Paciente — no hace falta un vínculo
// dedicado "asistente asignado", guardias ya es la fuente real de asignación en el resto del
// sistema (mismo criterio que appFamilias.js:/pacientes/:id/asistente).
//
// Se pregunta por la lista de la guardia y no por la columna vieja: si un turno cubre a dos
// personas de la misma casa, el Asistente atiende a las dos, y para la segunda no aparecía
// nadie. De acá cuelga si se puede aceptar una indicación de medicación que requiere
// matrícula, así que quedarse corto significa rechazar un pedido que sí se podía cumplir.
export async function asistentesAsignadosAlPaciente(db, prestadoraId, pacienteId) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('guardia_pacientes')
    .select('guardias!inner(asistente_id)')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId)
    .not('guardias.asistente_id', 'is', null)
    .gte('guardias.fecha', hoyISO);
  return [...new Set((data || []).map((f) => f.guardias?.asistente_id).filter(Boolean))];
}

export async function hayAsistenteAsignadoConMatricula(db, prestadoraId, pacienteId, tipoRequerido) {
  if (!tipoRequerido) return true;
  const asignados = await asistentesAsignadosAlPaciente(db, prestadoraId, pacienteId);
  for (const asistenteId of asignados) {
    if (await asistenteTieneMatriculaVigente(db, prestadoraId, asistenteId, tipoRequerido)) return true;
  }
  return false;
}
