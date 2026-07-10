// Valor explícito para el único código que corre sin una sesión de panel de la que tomar
// `prestadora_id` (formularios públicos sin login, cron de vencimientos). Hoy solo existe
// una prestadora (prestadora-original) y el proyecto no tiene todavía ningún mecanismo de resolución de
// tenant por dominio/origen de request (ver docs/PLAN_MULTITENANT_PLM.md, inventario de
// branding). Cuando exista una segunda prestadora con presencia pública propia, este valor
// fijo deja de alcanzar y hay que diseñar esa resolución — no es trabajo de este bloque.
export const prestadora-original_PRESTADORA_ID = '874f54d7-4383-4d54-8b9f-f51d02f0dd11';
