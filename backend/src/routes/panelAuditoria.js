import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';

// Ítem G del pendiente #30 — lectura del log de auditoría de admin_plataforma
// (auditoria_admin_plataforma, schema_admin_plataforma_03_auditoria.sql). El backend usa
// service role, así que el filtro por rol se hace acá a mano en vez de delegarlo a las
// policies RLS de la tabla (esas policies sí rigen cuando algo consulta la tabla directo
// desde el frontend con el JWT del usuario, no a través de este endpoint).
export const panelAuditoriaRouter = Router();

panelAuditoriaRouter.get('/', requiereRolPanel, async (req, res) => {
  const { rol, prestadoraId } = req.usuarioPanel;

  if (!['superadmin', 'admin_prestadora', 'admin_plataforma'].includes(rol)) {
    return res.status(403).json({ error: 'Sin permiso para ver el log de auditoría' });
  }

  let consulta = supabase
    .from('auditoria_admin_plataforma')
    .select('id, admin_id, prestadora_id, tipo_evento, tabla_afectada, operacion, registro_id, detalle, created_at, usuarios(nombre), prestadoras(nombre_fantasia)')
    .order('created_at', { ascending: false })
    .limit(500);

  // admin_prestadora (dueño de la prestadora auditada) solo ve lo que pasó dentro de la
  // suya — mismo criterio que la policy RLS "admin_prestadora_lee_auditoria_de_su_prestadora".
  // admin_plataforma solo ve lo de la prestadora en la que está "adentro" ahora mismo
  // (prestadoraId viene de su sesión de tenant activa, ver requiereRolPanel.js) — sin
  // sesión activa no hay prestadoraId y por lo tanto no ve nada, coherente con que fuera
  // del modo "dentro de una prestadora" no tiene ningún acceso cross-tenant.
  if (rol === 'admin_prestadora' || rol === 'admin_plataforma') {
    if (!prestadoraId) return res.status(403).json({ error: 'Sin prestadora asociada' });
    consulta = consulta.eq('prestadora_id', prestadoraId);
  }

  const { data, error } = await consulta;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ eventos: data });
});
