// Calificaciones y descargos de los Asistentes, en el Panel. Valen para las dos modalidades: la
// Cliente califica al Asistente que la atendió, sea de prestación directa o de Match, así que acá
// no hay candado de modalidad. Si la Prestadora deja calificar o no lo decide su configuración.
//
// La visibilidad pública es el único campo que la Prestadora edita (schema_calificaciones_asistente.sql);
// el contenido, incluido el descargo del Asistente, nunca se edita desde acá.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Qué filas ve lo decide la RLS por la membresía de esa persona.
// Donde queda la llave maestra, un comentario dice por qué, y ahí el filtro por Prestadora se
// mantiene.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { responderError } from '../utils/errorConMotivo.js';

export const panelCalificacionesRouter = Router();

panelCalificacionesRouter.use(requiereRolPanel);
panelCalificacionesRouter.use(exigirOrganizacionActiva);

panelCalificacionesRouter.get('/', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('calificaciones_asistente')
    .select('id, asistente_id, paciente_id, cliente_id, estrellas, comentario, visible_publica, descargo_asistente, descargo_en, created_at')
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  const asistenteIds = [...new Set(data.map((c) => c.asistente_id).filter(Boolean))];
  // Los nombres, con la llave maestra: el Coordinador sólo alcanza los Asistentes de su zona, y
  // una calificación de un Asistente de otra zona quedaría sin nombre en la lista.
  const { data: asistentes } = asistenteIds.length
    ? await supabase
        .from('asistentes')
        .select('id, nombre')
        .eq('prestadora_id', req.usuarioPanel.prestadoraId)
        .in('id', asistenteIds)
    : { data: [] };
  const nombreAsistente = new Map((asistentes || []).map((a) => [a.id, a.nombre]));

  const calificaciones = data.map((c) => ({ ...c, asistente_nombre: nombreAsistente.get(c.asistente_id) || null }));

  res.json({ calificaciones });
});

panelCalificacionesRouter.patch('/:id/visibilidad', async (req, res) => {
  const { visible_publica: visiblePublica } = req.body || {};
  if (typeof visiblePublica !== 'boolean') {
    return res.status(400).json({ error: 'Falta visible_publica (booleano)' });
  }
  // La escritura devuelve la fila tocada: sin esto la base contesta que salió bien aunque no
  // haya encontrado ninguna, y la pantalla muestra un cambio de visibilidad que no ocurrió.
  // Con la llave maestra: la política de modificación de `calificaciones_asistente` no incluye a
  // Superadmin. Por eso el filtro por Prestadora sigue escrito acá.
  const { data: modificada, error } = await supabase
    .from('calificaciones_asistente')
    .update({ visible_publica: visiblePublica })
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select('id');
  if (error) return responderError(res, error);
  if (!modificada?.length) {
    // No existe, o es de otra Prestadora. Se contesta lo mismo en los dos casos.
    return res.status(404).json({ error: 'No se encontró esa calificación' });
  }
  res.json({ ok: true });
});
