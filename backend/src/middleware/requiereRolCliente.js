import { supabase } from '../db/connection.js';

// Mismo patrón que requiereRolAsistente.js, acotado al rol `cliente` — Etapa 4 (PWA
// Clientes).
export async function requiereRolCliente(req, res, next) {
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

  if (errorPerfil || !perfil || perfil.rol !== 'cliente') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // El usuario logueado puede ser el titular de la cuenta (fila propia en `clientes`) o
  // alguien invitado a las personas autorizadas (fila en `miembros_cliente`, Fase 5) — se
  // resuelve acá una sola vez, no en cada ruta de appClientes.js.
  const { data: titular } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  let clienteId = titular?.id ?? null;
  let rolPersonasAutorizadas = titular ? 'titular' : null;

  if (!clienteId) {
    const { data: miembro } = await supabase
      .from('miembros_cliente')
      .select('cliente_id, rol')
      .eq('usuario_id', userData.user.id)
      .maybeSingle();

    clienteId = miembro?.cliente_id ?? null;
    rolPersonasAutorizadas = miembro?.rol ?? null;
  }

  if (!clienteId) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  req.usuarioCliente = {
    id: userData.user.id,
    clienteId,
    rolPersonasAutorizadas,
    prestadoraId: perfil.prestadora_id,
  };
  next();
}
