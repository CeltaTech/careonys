import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';

export const panelConfiguracionRouter = Router();

// Módulo 8 (Configuración) es a nivel de toda la empresa — Coordinador no entra acá,
// solo Admin/Superadmin (misma restricción que precios y escalas legales).
function requiereAdminOSuperior(req, res, next) {
  if (!['admin_prestadora', 'superadmin'].includes(req.usuarioPanel?.rol)) {
    return res.status(403).json({ error: 'Solo Admin o Superadmin puede editar la configuración' });
  }
  next();
}

panelConfiguracionRouter.use(requiereRolPanel, requiereAdminOSuperior);

// --- Datos de la empresa ---
panelConfiguracionRouter.get('/empresa', async (req, res) => {
  const { data, error } = await supabase.from('configuracion_empresa').select('*').eq('id', 1).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ empresa: data });
});

panelConfiguracionRouter.patch('/empresa', async (req, res) => {
  const { nombre, telefono, whatsapp_numero, email, dominio, zona_cobertura_texto } = req.body;
  const { error } = await supabase
    .from('configuracion_empresa')
    .update({ nombre, telefono, whatsapp_numero, email, dominio, zona_cobertura_texto, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- Zonas de cobertura ---
panelConfiguracionRouter.get('/zonas', async (req, res) => {
  let query = supabase.from('zonas_cobertura').select('*').order('orden');
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ zonas: data });
});

panelConfiguracionRouter.post('/zonas', async (req, res) => {
  const { codigo, nombre, categoria, orden } = req.body;
  if (!codigo || !nombre || !categoria) {
    return res.status(400).json({ error: 'Faltan código, nombre o categoría' });
  }
  const { error } = await supabase
    .from('zonas_cobertura')
    .insert({ codigo, nombre, categoria, orden: orden ?? 0, prestadora_id: req.usuarioPanel.prestadoraId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/zonas/:id', async (req, res) => {
  const { nombre, categoria, activa, orden } = req.body;
  let query = supabase
    .from('zonas_cobertura')
    .update({ nombre, categoria, activa, orden })
    .eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/zonas/:id', async (req, res) => {
  let query = supabase.from('zonas_cobertura').delete().eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- Servicios: escalada de relevo (protocolo de continuidad de guardia) ---
panelConfiguracionRouter.get('/escalada-relevo', async (req, res) => {
  let query = supabase.from('configuracion_escalada_relevo').select('*').order('nivel');
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ niveles: data });
});

panelConfiguracionRouter.post('/escalada-relevo', async (req, res) => {
  const { nivel, minutos_demora, orden_prioridad, plantilla_mensaje } = req.body;
  if (!nivel || !plantilla_mensaje) {
    return res.status(400).json({ error: 'Faltan nivel o plantilla de mensaje' });
  }
  const { error } = await supabase
    .from('configuracion_escalada_relevo')
    .insert({ nivel, minutos_demora, orden_prioridad, plantilla_mensaje, prestadora_id: req.usuarioPanel.prestadoraId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/escalada-relevo/:id', async (req, res) => {
  const { nivel, minutos_demora, orden_prioridad, plantilla_mensaje } = req.body;
  let query = supabase
    .from('configuracion_escalada_relevo')
    .update({ nivel, minutos_demora, orden_prioridad, plantilla_mensaje })
    .eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/escalada-relevo/:id', async (req, res) => {
  let query = supabase.from('configuracion_escalada_relevo').delete().eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- Servicios: personal de emergencia (roster de suplentes/franqueros/emergencia
//     disponibles para el protocolo de continuidad de guardia, Parte 2 de Módulo 6) ---
panelConfiguracionRouter.get('/personal-emergencia', async (req, res) => {
  let query = supabase
    .from('personal_emergencia')
    .select('id, asistente_id, tipo, activo, created_at, asistentes(nombre)')
    .order('created_at', { ascending: false });
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ personal: data });
});

panelConfiguracionRouter.post('/personal-emergencia', async (req, res) => {
  const { asistente_id, tipo } = req.body;
  if (!asistente_id || !tipo) {
    return res.status(400).json({ error: 'Faltan asistente_id o tipo' });
  }
  const { error } = await supabase
    .from('personal_emergencia')
    .insert({ asistente_id, tipo, prestadora_id: req.usuarioPanel.prestadoraId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/personal-emergencia/:id', async (req, res) => {
  const { activo } = req.body;
  let query = supabase.from('personal_emergencia').update({ activo }).eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/personal-emergencia/:id', async (req, res) => {
  let query = supabase.from('personal_emergencia').delete().eq('id', req.params.id);
  if (req.usuarioPanel.rol !== 'superadmin') {
    query = query.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- Configuración de notificaciones ---
panelConfiguracionRouter.get('/notificaciones', async (req, res) => {
  const { data, error } = await supabase.from('configuracion_notificaciones').select('*').order('evento');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ notificaciones: data });
});

panelConfiguracionRouter.patch('/notificaciones/:evento', async (req, res) => {
  const { emails, activo } = req.body;
  const { error } = await supabase
    .from('configuracion_notificaciones')
    .update({ emails, activo })
    .eq('evento', req.params.evento);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
