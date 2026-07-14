import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';

// "Modo dentro de una prestadora" — pendiente #30, docs/PLAN_MULTITENANT_PLM.md 3.4.1.
// Exclusivo de admin_plataforma: entra a una prestadora licenciataria por vez, nunca
// varias a la vez. El resto del acceso (banner, timeout de 5/60 min, advertencia en
// operaciones destructivas, log de auditoría) es trabajo de fases posteriores del mismo
// pendiente — esta ruta solo abre/cierra la sesión de tenant en sí.
export const panelSesionTenantRouter = Router();

const SESION_DURACION_MS = 60 * 60 * 1000; // tope absoluto de 60 min (item D define el resto)

function requiereAdminPlataforma(req, res, next) {
  if (req.usuarioPanel?.rol !== 'admin_plataforma') {
    return res.status(403).json({ error: 'Solo admin_plataforma tiene modo dentro de una prestadora' });
  }
  next();
}

panelSesionTenantRouter.get('/', requiereRolPanel, requiereAdminPlataforma, async (req, res) => {
  const { data: sesion, error } = await supabase
    .from('sesiones_tenant_admin_plataforma')
    .select('prestadora_id, entrada_at, expira_at, prestadoras(nombre_fantasia)')
    .eq('admin_id', req.usuarioPanel.id)
    .is('salida_at', null)
    .order('entrada_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!sesion || new Date(sesion.expira_at) <= new Date()) {
    return res.json({ sesion: null });
  }
  res.json({ sesion });
});

panelSesionTenantRouter.post('/', requiereRolPanel, requiereAdminPlataforma, async (req, res) => {
  const { prestadora_id } = req.body;
  if (!prestadora_id) {
    return res.status(400).json({ error: 'Falta prestadora_id' });
  }

  const { data: sesionVigente } = await supabase
    .from('sesiones_tenant_admin_plataforma')
    .select('id')
    .eq('admin_id', req.usuarioPanel.id)
    .is('salida_at', null)
    .maybeSingle();

  if (sesionVigente) {
    return res.status(409).json({ error: 'Ya hay una sesión de prestadora activa — salí primero para entrar a otra' });
  }

  const { data: prestadora } = await supabase.from('prestadoras').select('id').eq('id', prestadora_id).maybeSingle();
  if (!prestadora) {
    return res.status(404).json({ error: 'Prestadora inexistente' });
  }

  const ahora = new Date();
  const { data: sesion, error } = await supabase
    .from('sesiones_tenant_admin_plataforma')
    .insert({
      admin_id: req.usuarioPanel.id,
      prestadora_id,
      entrada_at: ahora.toISOString(),
      ultima_actividad_at: ahora.toISOString(),
      expira_at: new Date(ahora.getTime() + SESION_DURACION_MS).toISOString(),
    })
    .select('prestadora_id, entrada_at, expira_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, sesion });
});

panelSesionTenantRouter.post('/salir', requiereRolPanel, requiereAdminPlataforma, async (req, res) => {
  const { error } = await supabase
    .from('sesiones_tenant_admin_plataforma')
    .update({ salida_at: new Date().toISOString() })
    .eq('admin_id', req.usuarioPanel.id)
    .is('salida_at', null);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
