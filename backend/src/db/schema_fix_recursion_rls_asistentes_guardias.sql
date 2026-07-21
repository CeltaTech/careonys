-- Fix: recursión infinita entre las policies de RLS de `asistentes` y `guardias`
--
-- Encontrado el 2026-07-21 durante la verificación en navegador de la Fase 1 del
-- rediseño de frontend (ver docs/PENDIENTES.md #71): la pantalla "Plantel de Asistentes"
-- del Panel no cargaba ningún dato — Postgres devolvía
-- `infinite recursion detected in policy for relation "asistentes"`.
--
-- Causa raíz: `asistentes.cliente_ve_asistente_asignado` (schema_reportes_alertas_01.sql
-- o donde se haya definido originalmente) hace JOIN contra `guardias`, y
-- `guardias.coordinador_gestiona_guardias_de_su_zona` (schema_modulo6_guardias.sql:151)
-- hacía JOIN directo contra `asistentes`. Evaluar una dispara la otra en loop.
--
-- Fix: la policy de `guardias` deja de hacer JOIN directo contra `asistentes` (tabla con
-- RLS) y en su lugar llama a una función SECURITY DEFINER que lee `zonas` bypaseando RLS
-- — mismo patrón ya usado por current_tenant()/es_superadmin() en schema_multitenant_02.sql,
-- válido porque `asistentes` es propiedad de `postgres` y no tiene FORCE ROW LEVEL SECURITY.
--
-- Aplicado contra Supabase real (migración fix_recursion_rls_asistentes_guardias) y
-- verificado en navegador: /asistentes vuelve a cargar la lista sin error.

CREATE OR REPLACE FUNCTION zonas_de_asistente(p_asistente_id UUID) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT zonas FROM asistentes WHERE id = p_asistente_id
$$;

DROP POLICY IF EXISTS "coordinador_gestiona_guardias_de_su_zona" ON guardias;

CREATE POLICY "coordinador_gestiona_guardias_de_su_zona" ON guardias
  FOR ALL USING (
    guardias.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.rol = 'coordinador' AND u.zonas && zonas_de_asistente(guardias.asistente_id)
    )
  );

NOTIFY pgrst, 'reload schema';
