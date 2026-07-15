import { supabase } from '../db/connection.js';

// Ítem D del pendiente #30 (docs/PLAN_MULTITENANT_PLM.md 3.4.1): tope de 5 min de
// inactividad dentro del "modo prestadora" — se corta en silencio, sin aviso previo,
// distinto del tope absoluto de 60 min (que sí tiene aviso a los 50, ver panelSesionTenant.js).
const INACTIVIDAD_LIMITE_MS = 5 * 60 * 1000;

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
      .select('id, prestadora_id, expira_at, ultima_actividad_at')
      .eq('admin_id', userData.user.id)
      .is('salida_at', null)
      .order('entrada_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ahora = new Date();
    const vigente = Boolean(
      sesion &&
        new Date(sesion.expira_at) > ahora &&
        ahora.getTime() - new Date(sesion.ultima_actividad_at).getTime() <= INACTIVIDAD_LIMITE_MS
    );

    // El cierre real de la sesión vencida (salida_at) lo hace GET /sesion-tenant, que el
    // frontend hace polling cada 30s — acá alcanza con no exponer prestadoraId si no está
    // vigente, más info directa a Supabase con RLS queda igual bloqueada por current_tenant().
    // El polling de estado (GET /sesion-tenant) y el heartbeat de actividad (POST /actividad)
    // no bumpean acá — /actividad ya lo hace explícitamente, y contar el polling como
    // actividad real anularía el propio timeout de inactividad.
    const esRutaPropiaDeSesion = req.baseUrl === '/api/panel/sesion-tenant';
    if (sesion && vigente && !esRutaPropiaDeSesion) {
      await supabase
        .from('sesiones_tenant_admin_plataforma')
        .update({ ultima_actividad_at: ahora.toISOString() })
        .eq('id', sesion.id);
    }

    prestadoraId = vigente ? sesion.prestadora_id : null;
  }

  req.usuarioPanel = { id: userData.user.id, rol: perfil.rol, prestadoraId };
  next();
}
