-- Fase 5 del rediseño de frontend (Personas autorizadas, ver
-- C:\Users\Usuario\.claude\plans\distributed-scribbling-wirth.md) — permite que un Cliente
-- invite a otra persona (ej. un segundo familiar) a ver el estado de su Paciente, sin
-- compartir la cuenta del titular. Alcance mínimo aprobado por el Desarrollador: un solo rol
-- invitable, 'solo_lectura' — ve lo mismo que el titular pero no puede calificar guardias ni
-- (a futuro) hacer ninguna otra escritura. Roles más granulares quedan para cuando haya un
-- pedido de negocio concreto que los necesite (no se diseñan de antemano sin caso de uso).
--
-- Hallazgo que motivó este cambio (ver docs/claude_history.md, Regla 12 de CLAUDE.md): las
-- 13 policies de RLS que ya existían para "el Cliente ve/gestiona lo suyo" comparaban
-- `cliente_id = auth.uid()` en forma directa — asumían que el usuario logueado ES la fila
-- de `clientes`, sin ningún concepto de un tercero con acceso a esa misma Cliente. Esta
-- migración agrega la función SECURITY DEFINER `cliente_id_de_usuario()` (mismo patrón que
-- `zonas_de_asistente()` en schema_fix_recursion_rls_asistentes_guardias.sql: resuelve
-- una relación bypaseando RLS, sin duplicar la condición policy por policy) y actualiza las
-- 14 policies (13 + `cliente_ve_su_propia_fila`) para usarla, en vez de reescribir la
-- condición a mano en cada una.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

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

-- El propio miembro invitado puede leer su fila (para saber a qué Cliente está vinculado).
CREATE POLICY "miembro_lee_su_propia_fila" ON miembros_cliente
  FOR SELECT USING (usuario_id = auth.uid());

-- Admin/Coordinador de la Prestadora de esa Cliente gestionan las personas autorizadas — misma acción de
-- permisos ya usada para editar los datos de contacto del Cliente (reutilizada, no se
-- crea un permiso nuevo para esto: gestionar quién tiene acceso es parte de "editar los
-- datos de esta Cliente").
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
-- 2. Función helper — punto único de verdad para "¿a qué Cliente pertenece este usuario?"
--    Devuelve la propia fila si es el titular, o el Cliente a la que fue invitado si es un
--    miembro de las personas autorizadas. NULL si no es ninguna de las dos cosas.
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
-- 3. Actualización de las policies existentes — mismo criterio de negocio de siempre,
--    ahora resuelto a través de la función de arriba en vez de `auth.uid()` directo.
-- ============================================================================

-- schema_etapa2c.sql
DROP POLICY IF EXISTS "cliente_ve_su_propia_fila" ON clientes;
CREATE POLICY "cliente_ve_su_propia_fila" ON clientes
  FOR SELECT USING (id = cliente_id_de_usuario(auth.uid()));

-- schema_pwa_clientes_01.sql
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

-- push_subscriptions: cada miembro de las personas autorizadas gestiona su PROPIA suscripción push (no la
-- del titular) — sigue siendo `cliente_id = auth.uid()` a propósito en la columna
-- `cliente_id` de esta tabla puntual, porque el backend (appClientes.js) ahora escribe ahí
-- el id real del usuario logueado (ver docs/claude_history.md), no el id del Cliente
-- titular. No se toca esta policy.

-- schema_reportes_alertas_01.sql
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

-- schema_calificaciones_asistente.sql
DROP POLICY IF EXISTS "cliente_gestiona_sus_calificaciones" ON calificaciones_asistente;
CREATE POLICY "cliente_gestiona_sus_calificaciones" ON calificaciones_asistente
  FOR ALL USING (
    cliente_id = cliente_id_de_usuario(auth.uid())
    OR EXISTS (
      SELECT 1 FROM pacientes p WHERE p.id = calificaciones_asistente.paciente_id AND p.cliente_id = cliente_id_de_usuario(auth.uid())
    )
  )
  WITH CHECK (cliente_id = cliente_id_de_usuario(auth.uid()));

-- schema_facturacion_clientes_01.sql
DROP POLICY IF EXISTS "cliente_ve_sus_facturas" ON facturas_cliente;
CREATE POLICY "cliente_ve_sus_facturas" ON facturas_cliente
  FOR SELECT USING (cliente_id = cliente_id_de_usuario(auth.uid()));

DROP POLICY IF EXISTS "cliente_ve_items_de_sus_facturas" ON facturas_cliente_items;
CREATE POLICY "cliente_ve_items_de_sus_facturas" ON facturas_cliente_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM facturas_cliente f WHERE f.id = facturas_cliente_items.factura_id AND f.cliente_id = cliente_id_de_usuario(auth.uid()))
  );

NOTIFY pgrst, 'reload schema';
