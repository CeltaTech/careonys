// Prueba puntual del pendiente #36 (2026-07-15, reescrita el 2026-07-28 para la Etapa 2) —
// confirma que quien entra por una sesión de soporte técnico puede leer/editar Configuración
// sin el 403 que tenía antes del fix en panelConfiguracion.js, y que sin sesión abierta y sin
// Prestadora propia recibe un 400 entendible en vez de romper.
// Corre contra el backend local. Borra todo lo que crea al terminar.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
dotenv.config();

const API = 'http://localhost:4000/api/panel';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panelEnv = readFileSync(new URL('../../panel/.env', import.meta.url), 'utf8');
const anonKey = panelEnv.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const anon = createClient(process.env.SUPABASE_URL, anonKey);

const SANDBOX_ID = '5d727437-a5ff-432f-b9f6-10015e61ffef';
const EMAIL = 'alas.para.escribir.2026+pendiente36.test@gmail.com';
// La contraseña de las cuentas de prueba entra por el entorno, como cualquier credencial. Escrita
// acá queda a la vista de cualquiera que abra el repositorio, y si el script se corta antes de
// borrar lo que creó, las cuentas quedan con ella puesta. Sin la variable no arranca.
const PASSWORD = process.env.SEED_TEST_PASSWORD;
if (!PASSWORD) {
  console.error('Falta la variable SEED_TEST_PASSWORD. Es la contraseña con la que nacen las cuentas de prueba, y no se escribe en el código.');
  process.exit(1);
}

let authUserId;

async function main() {
  const { data: auth, error: errorAuth } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (errorAuth) throw errorAuth;
  authUserId = auth.user.id;

  const { error: errorUsuario } = await admin.from('usuarios').insert({
    id: authUserId, rol: 'superadmin', nombre: 'PRUEBA temporal — pendiente #36',
  });
  if (errorUsuario) throw errorUsuario;

  const { data: sesion, error: errorLogin } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (errorLogin) throw errorLogin;
  const token = sesion.session.access_token;
  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  // 1. Sin permiso de acceso abierto: debe dar 400 explícito, no 403 ni crash
  const rSinTenant = await fetch(`${API}/configuracion/empresa`, { headers: headers() });
  console.log('1. GET /configuracion/empresa sin permiso de acceso:', rSinTenant.status);
  if (rSinTenant.status !== 400) throw new Error('FALLO: esperaba 400 sin permiso de acceso, dio ' + rSinTenant.status);

  // 2. Abrir el permiso de acceso a Sandbox. Se escribe la fila, que es exactamente lo que hace
  //    CeltaTech desde su lado: el producto no tiene ninguna ruta para abrirlo
  //    (`celtatech/docs/EL_PERMISO_DE_ACCESO.md`).
  const ahora = new Date();
  const { error: errorPermiso } = await admin.from('permisos_de_acceso').insert({
    admin_id: authUserId,
    prestadora_id: SANDBOX_ID,
    entrada_at: ahora.toISOString(),
    ultima_actividad_at: ahora.toISOString(),
    expira_at: new Date(ahora.getTime() + 60 * 60 * 1000).toISOString(),
  });
  console.log('2. Permiso de acceso abierto sobre Sandbox:', errorPermiso ? errorPermiso.message : 'OK');
  if (errorPermiso) throw new Error('FALLO al abrir el permiso de acceso: ' + errorPermiso.message);

  // 3. Con el permiso abierto, antes del fix esto daba 403 — ahora debe dar 200
  const rConTenant = await fetch(`${API}/configuracion/empresa`, { headers: headers() });
  const jConTenant = await rConTenant.json();
  console.log('3. GET /configuracion/empresa con el permiso abierto:', rConTenant.status, jConTenant.empresa ? '(datos recibidos)' : jConTenant);
  if (rConTenant.status !== 200) throw new Error('FALLO: esperaba 200 con el permiso abierto, dio ' + rConTenant.status + ' — ' + JSON.stringify(jConTenant));

  // 4. Otra ruta del mismo router (zonas), para confirmar que el fix cubre todo el router, no solo /empresa
  const rZonas = await fetch(`${API}/configuracion/zonas`, { headers: headers() });
  console.log('4. GET /configuracion/zonas con el permiso abierto:', rZonas.status);
  if (rZonas.status !== 200) throw new Error('FALLO: esperaba 200 en /zonas, dio ' + rZonas.status);

  console.log('Pendiente #36 verificado correctamente: 400 sin permiso de acceso, 200 en /empresa y /zonas con el permiso abierto.');
}

async function limpiar() {
  if (authUserId) {
    // el paso 2 deja fila en permisos_de_acceso y en auditoria_de_accesos — hay que borrarlas
    // antes que el usuario o el delete de abajo falla en silencio por FK y deja el usuario de
    // prueba huérfano (pasó en una corrida anterior).
    await admin.from('permisos_de_acceso').delete().eq('admin_id', authUserId);
    await admin.from('auditoria_de_accesos').delete().eq('admin_id', authUserId);
    await admin.from('usuarios').delete().eq('id', authUserId);
    await admin.auth.admin.deleteUser(authUserId);
  }
  console.log('Datos de prueba borrados.');
}

main()
  .then(() => limpiar())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await limpiar();
    process.exit(1);
  });
