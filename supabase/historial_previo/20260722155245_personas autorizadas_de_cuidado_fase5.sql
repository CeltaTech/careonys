-- Fase 5 del rediseño de frontend (Personas autorizadas)
-- Ver backend/src/db/schema_personas autorizadas_cuidado.sql para el comentario completo.

-- ============================================================================
-- 1. Tabla de personas autorizadas
-- ============================================================================

CREATE TABLE IF NOT EXISTS miembros_cliente (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'solo_lectura' CHECK (rol IN ('solo_lectura')),
  creado_por UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_miembros_cliente_cliente ON miembros_cliente (cliente_id);

ALTER TABLE miembros_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembro_lee_su_propia_fila" ON miembros_cliente
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "admin_gestiona_personas autorizadas_cliente" ON miembros_cliente
  FOR ALL USING (
    es_superadmin() OR EXISTS (
      SELECT 1 FROM clientes f
      WHERE f.id = miembros_cliente.cliente_id
        AND f.prestadora_id = current_tenant()
        AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

CREATE POLICY "coordinador_gestiona_personas autorizadas_cliente" ON miembros_cliente
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clientes f
      WHERE f.id = miembros_cliente.cliente_id
        AND f.prestadora_id = current_tenant()
        AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
    )
    AND tiene_permiso('editar_datos_cliente')
  );

-- ============================================================================
-- 2. Función helper
-- ============================================================================

CREATE OR REPLACE FUNCTION cliente_id_de_usuario(p_usuario_id UUID) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM clientes WHERE id = p_usuario_id),
    (SELECT cliente_id FROM miembros_cliente WHERE usuario_id = p_usuario_id)
  )
$$;

REVOKE EXECUTE ON FUNCTION cliente_id_de_usuario(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_id_de_usuario(UUID) TO authenticated;

-- ============================================================================
-- 3. Actualización de las policies existentes
-- ============================================================================

DROP POLICY IF EXISTS "cliente_ve_su_propia_fila" ON clientes;
CREATE POLICY "cliente_ve_su_propia_fila" ON clientes
  FOR SELECT USING (id = cliente_id_de_usuario(auth.uid()));

DROP POLICY IF EXISTS "cliente_ve_sus_pacientes" ON pacientes;
CREATE POLICY "cliente_ve_sus_pacientes" ON pacientes
  FOR SELECT USING (
    pacientes.prestadora_id = current_tenant()
    AND cliente_id = cliente_id_de_usuario(auth.uid())
  );

DROP POLICY IF EXISTS "cliente_ve_guardias_de_sus_pacientes" ON guardias;
CREATE POLICY "cliente_ve_guardias_de_sus_pacientes" ON guardias
  FOR SELECT USING (
    guardias.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM pacientes p WHERE p.id = guardias.paciente_id AND p.cliente_id = cliente_id_de_usuario(auth.uid()))
  );

DROP POLICY IF EXISTS "cliente_ve_asistente_asignado" ON asistentes;
CREATE POLICY "cliente_ve_asistente_asignado" ON asistentes
  FOR SELECT USING (
    asistentes.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM guardias g
      JOIN pacientes p ON p.id = g.paciente_id
      WHERE g.asistente_id = asistentes.id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cliente_ve_certificado_asistente_asignado" ON certificados;
CREATE POLICY "cliente_ve_certificado_asistente_asignado" ON certificados
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guardias g
      JOIN pacientes p ON p.id = g.paciente_id
      WHERE g.asistente_id = certificados.asistente_id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cliente_ve_reportes_de_sus_pacientes" ON reportes;
CREATE POLICY "cliente_ve_reportes_de_sus_pacientes" ON reportes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guardias g
      JOIN pacientes p ON p.id = g.paciente_id
      WHERE g.id = reportes.guardia_id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cliente_ve_alertas_de_sus_pacientes" ON alertas;
CREATE POLICY "cliente_ve_alertas_de_sus_pacientes" ON alertas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pacientes p WHERE p.id = alertas.paciente_id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cliente_gestiona_sus_calificaciones" ON calificaciones_asistente;
CREATE POLICY "cliente_gestiona_sus_calificaciones" ON calificaciones_asistente
  FOR ALL USING (
    cliente_id = cliente_id_de_usuario(auth.uid())
    OR EXISTS (
      SELECT 1 FROM pacientes p WHERE p.id = calificaciones_asistente.paciente_id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  )
  WITH CHECK (cliente_id = cliente_id_de_usuario(auth.uid()));

DROP POLICY IF EXISTS "cliente_ve_sus_facturas" ON facturas_cliente;
CREATE POLICY "cliente_ve_sus_facturas" ON facturas_cliente
  FOR SELECT USING (cliente_id = cliente_id_de_usuario(auth.uid()));

DROP POLICY IF EXISTS "cliente_ve_items_de_sus_facturas" ON facturas_cliente_items;
CREATE POLICY "cliente_ve_items_de_sus_facturas" ON facturas_cliente_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM facturas_cliente f WHERE f.id = facturas_cliente_items.factura_id AND f.cliente_id = cliente_id_de_usuario(auth.uid()))
  );

NOTIFY pgrst, 'reload schema';
;
