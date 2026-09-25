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

  // SIN PRESTADORA A PROPÓSITO
  // Es el paso anterior a todo lo demás: de acá sale la Prestadora de esta sesión, y la consulta
  // que viene abajo —la ficha del Asistente— ya la usa. Pedirle a esta que la sepa de antemano
  // sería circular: no hay de dónde sacarla salvo de esta misma fila.
  const { data: perfil, error: errorPerfil } = await supabase
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', userData.user.id)
    .single();

  if (errorPerfil || !perfil || perfil.rol !== 'asistente') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // Dos números distintos, y hace falta tener los dos a mano. `id` es la persona —con qué entra,
  // cómo se llama—; `asistenteId` es lo suyo en esta Prestadora, con su antigüedad, sus lugares y
  // sus matrículas. La misma persona puede tener otro en otra Prestadora, y por eso se busca
  // acotado a la Prestadora de esta sesión.
  const { data: ficha, error: errorFicha } = await supabase
    .from('asistentes')
    .select('id')
    .eq('usuario_id', userData.user.id)
    .eq('prestadora_id', perfil.prestadora_id)
    .maybeSingle();

  if (errorFicha || !ficha) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  req.usuarioAsistente = {
    id: userData.user.id,
    asistenteId: ficha.id,
    prestadoraId: perfil.prestadora_id,
  };
  next();
}
