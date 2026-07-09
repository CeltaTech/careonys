import crypto from 'crypto';
import { supabase } from '../db/connection.js';

// Mecanismo compartido: crea una cuenta real de Supabase Auth + su fila en `usuarios`,
// sin enviar ningún email todavía. Para Cliente/Asistente (panelCuentas.js) esto es correcto
// tal cual: la PWA correspondiente (Etapa 3/4) no existe aún, así que no tiene sentido invitar
// a alguien a loguearse en una app que no existe — el envío de invitación queda para cuando
// esa PWA esté en producción (usar `admin.inviteUserByEmail` en ese momento). Para
// Coordinador/Admin/Superadmin (panelUsuarios.js) el Panel SÍ existe hoy, así que
// `passwordTemporal` se devuelve al caller para que quien lo crea pueda comunicarlo — no hay
// otro canal de invitación implementado todavía.
export async function crearCuentaConPerfil({ email, nombre, telefono, rol, zonas }) {
  const passwordTemporal = crypto.randomBytes(24).toString('base64url');

  const { data: authData, error: errorAuth } = await supabase.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
  });

  if (errorAuth) {
    throw new Error(errorAuth.message);
  }

  const userId = authData.user.id;

  const { error: errorPerfil } = await supabase
    .from('usuarios')
    .insert({ id: userId, rol, nombre, telefono, zonas });

  if (errorPerfil) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(errorPerfil.message);
  }

  return { userId, passwordTemporal };
}

export async function borrarCuenta(userId) {
  const { error: errorPerfil } = await supabase.from('usuarios').delete().eq('id', userId);
  if (errorPerfil) throw new Error(errorPerfil.message);

  const { error: errorAuth } = await supabase.auth.admin.deleteUser(userId);
  if (errorAuth) throw new Error(errorAuth.message);
}
