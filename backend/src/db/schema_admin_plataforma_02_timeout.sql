-- Ítem D del pendiente #30 (docs/PENDIENTES.md, docs/PLAN_MULTITENANT_PLM.md 3.4.1) —
-- timeout doble de la sesión de tenant de admin_plataforma: 5 min de inactividad (corte
-- silencioso) + tope absoluto de 60 min (con aviso a los 50 y reconfirmación vía
-- POST /api/panel/sesion-tenant/renovar, ver backend/src/routes/panelSesionTenant.js).
--
-- current_tenant() (schema_admin_plataforma_01.sql:81-91) hoy solo chequea expira_at.
-- Buena parte del Panel consulta Supabase directo desde el frontend con el JWT del
-- usuario (RLS), no solo vía el backend Express — así que el corte por inactividad tiene
-- que vivir acá también, no alcanza con que lo chequee requiereRolPanel.js (que solo
-- cubre las rutas que pasan por el backend).
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION current_tenant() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.prestadora_id FROM sesiones_tenant_admin_plataforma s
      WHERE s.admin_id = auth.uid()
        AND s.salida_at IS NULL
        AND s.expira_at > NOW()
        AND s.ultima_actividad_at > NOW() - INTERVAL '5 minutes'
      ORDER BY s.entrada_at DESC LIMIT 1),
    (SELECT prestadora_id FROM usuarios WHERE id = auth.uid())
  )
$$;

NOTIFY pgrst, 'reload schema';
