// Punto único de verdad (Regla 12, CLAUDE.md §7) para resolver "medicación vigente" de un
// Paciente y "¿puede este Asistente administrar esta vía?" — consumido por
// appClientes.js/appAsistentes.js (para dejar de leer pacientes.medicacion_habitual,
// deprecado), panelMedicacion.js (cola de pendientes) y appAsistentesMedicacion.js (filtro
// de órdenes).

// Cada función entra con la conexión que recibe, que va primero. Detrás va `prestadoraId`, sin
// valor por defecto, como en el resto del archivo: quien llama puede pasar la llave maestra, que se
// saltea la protección por fila, y ahí lo único que separa una Prestadora de otra es este filtro.
export async function medicacionVigenteDelPaciente(db, prestadoraId, pacienteId) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('indicaciones_medicacion')
    .select('id, medicamento, dosis, frecuencia, via_administracion_id, via:vias_administracion(clave), fecha_desde, fecha_hasta')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId)
    .eq('estado', 'aceptada')
    .lte('fecha_desde', hoyISO)
    .or(`fecha_hasta.is.null,fecha_hasta.gte.${hoyISO}`)
    .order('created_at', { ascending: false });
  return (data || []).map(({ via, ...indicacion }) => ({ ...indicacion, via_clave: via?.clave ?? null }));
}

// Qué vías de administración le están prohibidas a un tipo de Asistente: las que alcanzan las
// prohibiciones de ese tipo, sean de fábrica para el país de la Prestadora o propias de ella.
// Con la llave maestra la base no recorta nada, así que el país y la Prestadora se filtran acá.
async function viasProhibidasAlTipo(db, prestadoraId, tipoAsistenteId) {
  const { data: prestadora } = await db.from('prestadoras').select('pais').eq('id', prestadoraId).maybeSingle();
  if (!prestadora?.pais) return null;
  const { data: prohibiciones, error } = await db
    .from('tareas_tipo_asistente')
    .select('id')
    .eq('tipo_asistente_id', tipoAsistenteId)
    .eq('clase', 'prohibida')
    .or(`prestadora_id.eq.${prestadoraId},and(prestadora_id.is.null,pais.eq.${prestadora.pais})`);
  if (error) return null;
  if (!prohibiciones?.length) return new Set();
  const { data: vias, error: errorVias } = await db
    .from('vias_que_alcanza_la_prohibicion')
    .select('via_administracion_id')
    .in('prohibicion_id', prohibiciones.map((p) => p.id))
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`);
  if (errorVias) return null;
  return new Set((vias || []).map((v) => v.via_administracion_id));
}

// ¿Puede este Asistente dar una medicación por esta vía? Falla cerrado: sin vía elegida, sin tipo
// de Asistente o sin poder leer las prohibiciones, la respuesta es no. Que tenga la matrícula de su
// tipo se controla al asignarle la guardia.
export async function asistentePuedeDarLaVia(db, prestadoraId, asistenteId, viaAdministracionId) {
  if (!viaAdministracionId) return false;
  const { data: asistente } = await db
    .from('asistentes')
    .select('tipo_asistente_id')
    .eq('id', asistenteId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (!asistente?.tipo_asistente_id) return false;
  const prohibidas = await viasProhibidasAlTipo(db, prestadoraId, asistente.tipo_asistente_id);
  if (!prohibidas) return false;
  return !prohibidas.has(viaAdministracionId);
}

// Asistentes con alguna Guardia futura o de hoy para ese Paciente — no hace falta un vínculo
// dedicado "asistente asignado", guardias ya es la fuente real de asignación en el resto del
// sistema (mismo criterio que appClientes.js:/pacientes/:id/asistente).
//
// Se pregunta por la lista de la guardia y no por la columna vieja: si un turno cubre a dos
// personas de la misma casa, el Asistente atiende a las dos, y para la segunda no aparecía
// nadie. De acá cuelga el aviso de que nadie asignado puede dar esa vía, así que quedarse corto
// significa avisar de más sobre un pedido que sí se podía cumplir.
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

// ¿Hay Asistentes asignados, y alguno puede dar esta vía? Son dos preguntas y no una: sin nadie
// asignado la indicación se acepta igual; con asignados y ninguno que pueda, sólo se rechaza.
export async function laViaFrenteALosAsignados(db, prestadoraId, pacienteId, viaAdministracionId) {
  const asignados = await asistentesAsignadosAlPaciente(db, prestadoraId, pacienteId);
  for (const asistenteId of asignados) {
    if (await asistentePuedeDarLaVia(db, prestadoraId, asistenteId, viaAdministracionId)) {
      return { hayAsignados: true, alguienPuede: true };
    }
  }
  return { hayAsignados: asignados.length > 0, alguienPuede: false };
}

// Sólo se rechaza cuando hay asignados y ninguno puede. Sin asignados todavía no hay a quién culpar.
export function laViaBloquea({ hayAsignados, alguienPuede }) {
  return hayAsignados && !alguienPuede;
}

// Qué tipos de Asistente pueden dar esta vía en esta Prestadora: los activos —generales o
// propios— a los que ninguna prohibición les alcanza esa vía. Sin vía, ninguno.
export async function tiposQuePuedenDarLaVia(db, prestadoraId, viaAdministracionId) {
  if (!viaAdministracionId) return [];
  const { data: tipos, error } = await db
    .from('tipos_asistente')
    .select('id, clave, nombre, prestadora_id, orden')
    .eq('activo', true)
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`)
    .order('orden');
  if (error || !tipos) return [];
  const pueden = [];
  for (const tipo of tipos) {
    const prohibidas = await viasProhibidasAlTipo(db, prestadoraId, tipo.id);
    if (prohibidas && !prohibidas.has(viaAdministracionId)) pueden.push(tipo);
  }
  return pueden;
}
