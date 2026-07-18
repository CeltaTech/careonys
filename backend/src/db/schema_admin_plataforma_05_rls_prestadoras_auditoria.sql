-- Etapa 0 del plan de panel Admin_plataforma (2026-07-18, aprobado por el Desarrollador
-- para todo el frente "panel Admin_plataforma + faltantes del panel de Prestadora").
--
-- Gap detectado al inventariar: admin_plataforma no tenía ninguna policy RLS propia
-- sobre 'prestadoras' ni 'auditoria_admin_plataforma'. Funcionaba igual porque las
-- rutas Express (backend/src/routes/panelPrestadoras.js, panelAuditoria.js) usan la
-- service role key y bypassan RLS — pero si el Panel alguna vez consulta Supabase
-- directo con el JWT de un admin_plataforma, RLS lo bloqueaba pese a que el código de
-- la app lo permite. Aditivo: no toca la policy de superadmin (schema_admin_plataforma_02_acotar_superadmin.sql:104-105),
-- que ya está correctamente acotada a la sandbox.
--
-- NOTA: esta migración ya fue aplicada directamente vía MCP de Supabase en la sesión
-- del 2026-07-18. Este archivo la deja documentada en el repo, siguiendo la convención
-- de este proyecto (backend/src/db/schema_*.sql), y es idempotente (CREATE POLICY sin
-- IF NOT EXISTS fallaría en un re-run — ver nota abajo antes de re-ejecutar).
--
-- Ejecutar una sola vez en el SQL Editor de Supabase (o vía MCP).

-- admin_plataforma necesita ver el catálogo completo de prestadoras para poder elegir
-- a cuál entrar (pantalla /prestadoras) — es cross-tenant por diseño, no por accidente.
DROP POLICY IF EXISTS "admin_plataforma_lee_prestadoras" ON prestadoras;
CREATE POLICY "admin_plataforma_lee_prestadoras" ON prestadoras
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_plataforma')
  );

-- admin_plataforma solo lee el registro de auditoría de la prestadora en la que está
-- "adentro" ahora mismo (sesión de tenant vigente) — nunca cross-tenant, ni siquiera
-- para su propio rastro fuera de la sesión activa.
DROP POLICY IF EXISTS "admin_plataforma_lee_auditoria_de_su_sesion_activa" ON auditoria_admin_plataforma;
CREATE POLICY "admin_plataforma_lee_auditoria_de_su_sesion_activa" ON auditoria_admin_plataforma
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.rol = 'admin_plataforma'
    )
    AND prestadora_id = current_tenant()
  );

NOTIFY pgrst, 'reload schema';
