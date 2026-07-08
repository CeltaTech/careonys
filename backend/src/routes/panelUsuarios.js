import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';
import { crearCuentaConPerfil, borrarCuenta } from '../utils/cuentasPanel.js';

export const panelUsuariosRouter = Router();

// Ver y gestionar otros usuarios del panel es sensible (alta/baja de acceso) — solo Admin,
// igual que la creación de cuentas de Cliente en panelCuentas.js.
function requiereAdmin(req, res, next) {
  if (req.usuarioPanel?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo Admin puede gestionar usuarios del panel' });
  }
  next();
}

panelUsuariosRouter.get('/', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, rol, nombre, telefono, zonas, created_at')
    .in('rol', ['admin', 'coordinador'])
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ usuarios: data });
});

panelUsuariosRouter.post('/', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { email, nombre, telefono, zonas } = req.body;
  if (!email || !nombre) {
    return res.status(400).json({ error: 'Faltan email o nombre' });
  }

  try {
    const userId = await crearCuentaConPerfil({ email, nombre, telefono, rol: 'coordinador', zonas });
    res.json({ ok: true, id: userId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

panelUsuariosRouter.patch('/:id', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { nombre, telefono, zonas } = req.body;
  const { error } = await supabase
    .from('usuarios')
    .update({ nombre, telefono, zonas })
    .eq('id', req.params.id)
    .eq('rol', 'coordinador');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

panelUsuariosRouter.delete('/:id', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', req.params.id).single();
  if (usuario?.rol !== 'coordinador') {
    return res.status(400).json({ error: 'Solo se pueden dar de baja cuentas de Coordinador desde acá' });
  }

  await borrarCuenta(req.params.id);
  res.json({ ok: true });
});
