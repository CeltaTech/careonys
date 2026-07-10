// Superadmin es un quinto rol real, distinto de Admin_prestadora (ver CLAUDE.md,
// docs/CONTEXT.md), pero tiene todo el acceso de Admin_prestadora más el técnico
// (Módulo 8). Por eso cualquier chequeo que compara contra 'admin_prestadora' pasa a
// usar este helper en vez de repetir la comparación.
//
// Rename admin → admin_prestadora completado (Bloque 2 del kickoff,
// docs/PLAN_MULTITENANT_PLM.md 4.1): el dato en `usuarios.rol` ya dice
// 'admin_prestadora', no 'admin'.
export function esAdminOSuperior(rol) {
  return rol === 'admin_prestadora' || rol === 'superadmin';
}

export const ROLES_PANEL = ['admin_prestadora', 'coordinador', 'superadmin'];
