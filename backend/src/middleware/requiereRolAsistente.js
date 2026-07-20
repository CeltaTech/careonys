import { supabase } from '../db/connection.js';

// Mismo patrón que requiereRolPanel.js (verificación de Bearer token contra Supabase Auth +
// lookup de rol/prestadora en `usuarios`), acotado al rol `asistente` — Etapa 3 (PWA
// Asistentes). No reutiliza requiereRolPanel porque ese exige un rol de Panel y arrastra
// lógica de modo-Prestadora/MFA que no aplica acá.
export async function requiereRolAsistente(req, res, next) {
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

  if (errorPerfil || !perfil || perfil.rol !== 'asistente') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  req.usuarioAsistente = { id: userData.user.id, prestadoraId: perfil.prestadora_id };
  next();
}
