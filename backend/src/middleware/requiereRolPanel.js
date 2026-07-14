import { supabase } from '../db/connection.js';

export async function requiereRolPanel(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { data: userData, error: errorUsuario } = await supabase.auth.getUser(token);
  if (errorUsuario || !userData?.user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', userData.user.id)
    .single();

  if (errorPerfil || !perfil || !['admin_prestadora', 'coordinador', 'superadmin', 'admin_plataforma'].includes(perfil.rol)) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  let prestadoraId = perfil.prestadora_id;

  // admin_plataforma no tiene prestadora_id propia (docs/PLAN_MULTITENANT_PLM.md 3.4.1):
  // la resuelve acá, una vez, a partir de su sesión de tenant activa — así el resto de
  // las rutas reutiliza el mismo req.usuarioPanel.prestadoraId que ya usa admin_prestadora,
  // sin ningún branch específico de admin_plataforma en cada endpoint.
  if (perfil.rol === 'admin_plataforma') {
    const { data: sesion } = await supabase
      .from('sesiones_tenant_admin_plataforma')
      .select('prestadora_id, expira_at')
      .eq('admin_id', userData.user.id)
      .is('salida_at', null)
      .order('entrada_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    prestadoraId = sesion && new Date(sesion.expira_at) > new Date() ? sesion.prestadora_id : null;
  }

  req.usuarioPanel = { id: userData.user.id, rol: perfil.rol, prestadoraId };
  next();
}
