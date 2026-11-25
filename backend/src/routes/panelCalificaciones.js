// Calificaciones y descargos de los Asistentes, en el Panel. Valen para las dos modalidades: el
// Cliente califica al Asistente que lo atendió, sea de prestación directa o de Match, así que acá
// no hay candado de modalidad. Si la Prestadora deja calificar o no lo decide su configuración.
//
// Nadie de la Prestadora cambia las estrellas, el comentario ni el descargo del Asistente. Lo único
// que se elige es cuáles calificaciones de Match ven los Clientes de Match en la vidriera, y eso es
// sólo del Administrador de la Prestadora. En la prestación directa no hay nada que elegir: el
// Cliente nunca ve las calificaciones que dejaron otros. Cada calificación trae su modalidad, que
// la base copia del turno de guardia calificado.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Qué filas ve y cuáles puede cambiar lo decide la RLS por la
// membresía de esa persona, así que ninguna consulta lleva el filtro de la Prestadora de la sesión.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirAdminDePrestadora } from '../middleware/exigirAdministracion.js';
import { responderError } from '../utils/errorConMotivo.js';

export const panelCalificacionesRouter = Router();

panelCalificacionesRouter.use(requiereRolPanel);
panelCalificacionesRouter.use(exigirOrganizacionActiva);

const soloElAdministradorElige = exigirAdminDePrestadora(
  'Sólo el Administrador de la Prestadora elige qué calificaciones ven los Clientes de Match'
);

const MODALIDADES_DE_LA_CALIFICACION = ['directa', 'intermediacion'];

// Sin modalidad pedida trae las de las dos. La pantalla de Match pide sólo las de Match.
panelCalificacionesRouter.get('/', async (req, res) => {
  const { modalidad } = req.query;
  if (modalidad !== undefined && !MODALIDADES_DE_LA_CALIFICACION.includes(modalidad)) {
    return res.status(400).json({ error: 'Modalidad desconocida' });
  }
  let consulta = clienteDelPedido(req)
    .from('calificaciones_asistente')
    .select('id, asistente_id, paciente_id, cliente_id, estrellas, comentario, visible_publica, canal_modalidad, descargo_asistente, descargo_en, created_at')
    .order('created_at', { ascending: false });
  if (modalidad) consulta = consulta.eq('canal_modalidad', modalidad);
  const { data, error } = await consulta;
  if (error) return responderError(res, error);

  const asistenteIds = [...new Set(data.map((c) => c.asistente_id).filter(Boolean))];
  // Los nombres, con la credencial del trabajo de esta Prestadora: el Coordinador sólo alcanza los
  // Asistentes de su zona, y una calificación de un Asistente de otra zona quedaría sin nombre en
  // la lista. Esa credencial no sale de la Prestadora de la sesión.
  const { data: asistentes } = asistenteIds.length
    ? await enLaPrestadora(req.usuarioPanel.prestadoraId, 'nombres de las calificaciones', (db) =>
        db.from('asistentes').select('id, nombre').in('id', asistenteIds))
    : { data: [] };
  const nombreAsistente = new Map((asistentes || []).map((a) => [a.id, a.nombre]));

  const calificaciones = data.map((c) => ({ ...c, asistente_nombre: nombreAsistente.get(c.asistente_id) || null }));

  res.json({ calificaciones });
});

panelCalificacionesRouter.patch('/:id/visibilidad', soloElAdministradorElige, async (req, res) => {
  const { visible_publica: visiblePublica } = req.body || {};
  if (typeof visiblePublica !== 'boolean') {
    return res.status(400).json({ error: 'Falta visible_publica (booleano)' });
  }
  // La escritura devuelve la fila tocada: sin esto la base contesta que salió bien aunque no
  // haya encontrado ninguna, y la pantalla muestra un cambio de visibilidad que no ocurrió.
  const { data: modificada, error } = await clienteDelPedido(req)
    .from('calificaciones_asistente')
    .update({ visible_publica: visiblePublica })
    .eq('id', req.params.id)
    .eq('canal_modalidad', 'intermediacion')
    .select('id');
  if (error) return responderError(res, error);
  if (!modificada?.length) {
    // No existe, es de otra Prestadora o es de prestación directa. Se contesta lo mismo.
    return res.status(404).json({ error: 'No se encontró esa calificación' });
  }
  res.json({ ok: true });
});
