-- Fase 2 del plan "Terminar la Etapa 2 (Panel)" (ver plan aprobado, carga de datos +
-- permisos configurables + importación masiva): motor de permisos configurable por
-- Prestadora. Reemplaza la regla fija "coordinador puede editar clientes/pacientes,
-- nunca dar de alta a mano" por una tabla de configuración que cada Admin_prestadora
-- edita desde Configuración > Permisos (panel/src/pages/Configuracion.jsx, TabPermisos).
--
-- Principio (CLAUDE.md §2, "Configuración sobre programación"): admin_prestadora y
-- superadmin siempre pueden todo — el motor solo decide qué puede hacer, además, un
-- coordinador, de forma general o con excepciones puntuales por persona.

CREATE TABLE IF NOT EXISTS permisos_prestadora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  accion TEXT NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'solo_admin' CHECK (alcance IN ('solo_admin', 'admin_y_coordinador')),
  excepciones_permitir UUID[] NOT NULL DEFAULT '{}',
  excepciones_denegar UUID[] NOT NULL DEFAULT '{}',
  actualizado_por UUID REFERENCES usuarios(id),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prestadora_id, accion)
);

ALTER TABLE permisos_prestadora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gestiona_permisos_prestadora" ON permisos_prestadora;
CREATE POLICY "admin_gestiona_permisos_prestadora" ON permisos_prestadora
  FOR ALL USING (
    es_superadmin() OR (
      permisos_prestadora.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

-- Función de lectura usada desde las policies de asistentes/clientes/pacientes — ahí
-- auth.uid() está disponible porque esas mutaciones llegan directo del frontend con el
-- JWT del usuario. El alta manual (asistente-directo/cliente-directa) es distinto: corre
-- en Express con la service role key, sin auth.uid(), y se resuelve en JS
-- (backend/src/utils/permisos.js replica esta misma lógica para ese caso).
CREATE OR REPLACE FUNCTION tiene_permiso(p_accion TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
  v_prestadora_id UUID;
  v_cfg permisos_prestadora;
BEGIN
  SELECT rol, prestadora_id INTO v_rol, v_prestadora_id FROM usuarios WHERE id = auth.uid();

  IF v_rol IN ('admin_prestadora', 'superadmin') THEN
    RETURN TRUE;
  END IF;
  IF v_rol IS DISTINCT FROM 'coordinador' THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_cfg FROM permisos_prestadora
    WHERE prestadora_id = v_prestadora_id AND accion = p_accion;

  IF NOT FOUND THEN
    -- Default razonable si la Prestadora todavía no configuró nada para esta acción —
    -- punto de partida editable desde el día uno, no una regla fija (CLAUDE.md §2).
    RETURN p_accion NOT IN ('alta_manual_asistente', 'alta_manual_cliente');
  END IF;

  IF auth.uid() = ANY(v_cfg.excepciones_denegar) THEN RETURN FALSE; END IF;
  IF auth.uid() = ANY(v_cfg.excepciones_permitir) THEN RETURN TRUE; END IF;
  RETURN v_cfg.alcance = 'admin_y_coordinador';
END;
$$;

REVOKE EXECUTE ON FUNCTION tiene_permiso(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tiene_permiso(TEXT) TO authenticated;

-- asistentes: la edición de identidad por coordinador (ya acotada a su zona desde
-- schema_multitenant_02.sql) ahora además pasa por el motor de permisos.
DROP POLICY IF EXISTS "coordinador_edita_asistentes_de_su_zona" ON asistentes;
CREATE POLICY "coordinador_edita_asistentes_de_su_zona" ON asistentes
  FOR UPDATE USING (
    asistentes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador' AND u.zonas && asistentes.zonas)
    AND tiene_permiso('editar_identidad_asistente')
  );

-- clientes: se separa la policy única en una de Admin (sin cambios de fondo) y una de
-- Coordinador acotada por el motor de permisos. Antes, la policy "FOR ALL" única dejaba
-- a cualquier coordinador dar de alta o borrar un Cliente por API directa a Supabase,
-- sin pasar por el alta manual del Panel ni por ningún permiso — se cierra ese hueco acá.
DROP POLICY IF EXISTS "panel_gestiona_clientes" ON clientes;
CREATE POLICY "admin_gestiona_clientes" ON clientes
  FOR ALL USING (
    es_superadmin() OR (
      clientes.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );
DROP POLICY IF EXISTS "coordinador_lee_clientes" ON clientes;
CREATE POLICY "coordinador_lee_clientes" ON clientes
  FOR SELECT USING (
    clientes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
  );
DROP POLICY IF EXISTS "coordinador_edita_clientes" ON clientes;
CREATE POLICY "coordinador_edita_clientes" ON clientes
  FOR UPDATE USING (
    clientes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND tiene_permiso('editar_datos_cliente')
  );

-- pacientes: mismo criterio que clientes. El INSERT (agregar un segundo paciente a una
-- cliente existente) usa la misma acción 'editar_datos_paciente' que el UPDATE — es la
-- misma decisión de negocio ("puede gestionar los pacientes de esta cliente"), no dos
-- permisos separados.
DROP POLICY IF EXISTS "panel_gestiona_pacientes" ON pacientes;
CREATE POLICY "admin_gestiona_pacientes" ON pacientes
  FOR ALL USING (
    es_superadmin() OR (
      pacientes.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );
DROP POLICY IF EXISTS "coordinador_lee_pacientes" ON pacientes;
CREATE POLICY "coordinador_lee_pacientes" ON pacientes
  FOR SELECT USING (
    pacientes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
  );
DROP POLICY IF EXISTS "coordinador_edita_pacientes" ON pacientes;
CREATE POLICY "coordinador_edita_pacientes" ON pacientes
  FOR UPDATE USING (
    pacientes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND tiene_permiso('editar_datos_paciente')
  );
DROP POLICY IF EXISTS "coordinador_agrega_pacientes" ON pacientes;
CREATE POLICY "coordinador_agrega_pacientes" ON pacientes
  FOR INSERT WITH CHECK (
    pacientes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    AND tiene_permiso('editar_datos_paciente')
  );

-- Política de verificación al dar de alta un Asistente a mano (Fase 1 la dejó pendiente,
-- ver backend/src/routes/panelCuentas.js "asistente-directo"): ahora es una configuración
-- más de este mismo motor, no un caso especial aparte.
ALTER TABLE prestadoras ADD COLUMN IF NOT EXISTS politica_verificacion_alta_manual TEXT NOT NULL DEFAULT 'omitir'
  CHECK (politica_verificacion_alta_manual IN ('omitir', 'pendiente', 'aprobado'));

NOTIFY pgrst, 'reload schema';
