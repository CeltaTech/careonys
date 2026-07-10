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
export async function crearCuentaConPerfil({ email, nombre, telefono, rol, zonas, prestadoraId }) {
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
    .insert({ id: userId, rol, nombre, telefono, zonas, prestadora_id: prestadoraId });

  if (errorPerfil) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(errorPerfil.message);
  }

  return { userId, passwordTemporal };
}

// `prestadoraId`/`esSuperadmin` son la misma verificación de tenant que ya hacen los
// callers antes de invocar esta función (panelUsuarios.js valida con un SELECT previo;
// panelCuentas.js borra un id recién creado en el mismo request) — se repite acá adentro
// para que la función no dependa por completo de la disciplina de cada llamador presente
// y futuro (mismo tipo de hueco que tenía panelUsuarios.js antes de este bloque).
export async function borrarCuenta(userId, { prestadoraId, esSuperadmin = false } = {}) {
  if (!esSuperadmin) {
    const { data: objetivo, error: errorObjetivo } = await supabase
      .from('usuarios')
      .select('prestadora_id')
      .eq('id', userId)
      .single();
    if (errorObjetivo || !objetivo || objetivo.prestadora_id !== prestadoraId) {
      throw new Error('No tenés permiso para dar de baja esa cuenta');
    }
  }

  const { error: errorPerfil } = await supabase.from('usuarios').delete().eq('id', userId);
  if (errorPerfil) throw new Error(errorPerfil.message);

  const { error: errorAuth } = await supabase.auth.admin.deleteUser(userId);
  if (errorAuth) throw new Error(errorAuth.message);
}
