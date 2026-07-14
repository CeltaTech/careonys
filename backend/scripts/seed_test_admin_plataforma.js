// Prueba puntual de Fase 1 del pendiente #30 (2026-07-14) — crea una cuenta admin_plataforma
// de prueba para verificar el flujo entrar/salir de una prestadora de punta a punta. Se borra
// al terminar la prueba, igual que seed_test_cierre_servicio.js.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRESTADORA_ID = '874f54d7-4383-4d54-8b9f-f51d02f0dd11';

async function main() {
  const { data: auth, error: errorAuth } = await supabase.auth.admin.createUser({
    email: 'alas.para.escribir.2026+admin.plataforma.test@gmail.com',
    password: 'PruebaAdminPlataforma2026!',
    email_confirm: true,
  });
  if (errorAuth) throw errorAuth;

  const { error: errorUsuario } = await supabase.from('usuarios').insert({
    id: auth.user.id,
    rol: 'admin_plataforma',
    nombre: 'PRUEBA temporal — Admin_plataforma',
    prestadora_id: null,
  });
  if (errorUsuario) throw errorUsuario;

  console.log('admin_plataforma test creado:', auth.user.id);
  console.log('PRESTADORA_ID de prueba para entrar:', PRESTADORA_ID);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
