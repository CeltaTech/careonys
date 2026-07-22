-- Aviso al Asistente cuando se cierra el servicio de su Paciente por una causa ajena a su
-- desempeño (Fase 6). Diseño acordado con el Desarrollador (2026-07-22): un cierre de
-- servicio es algo nunca agradable para la persona que pierde ese trabajo, así que el
-- Coordinador debe avisarle verbalmente primero, como señal de respeto — el aviso
-- automático por push + WhatsApp es un resguardo para cuando esa llamada no se hizo dentro
-- de un plazo configurable por Prestadora, no el canal preferido.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase, sobre la base ya migrada por
-- schema_cierre_servicio_paciente.sql.

CREATE TABLE IF NOT EXISTS configuracion_aviso_cese_asistente (
  prestadora_id UUID PRIMARY KEY REFERENCES prestadoras(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  horas_plazo_aviso_verbal SMALLINT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE configuracion_aviso_cese_asistente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestiona_configuracion_aviso_cese_asistente" ON configuracion_aviso_cese_asistente
  FOR ALL USING (
    es_superadmin() OR (
      configuracion_aviso_cese_asistente.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

CREATE POLICY "coordinador_lee_configuracion_aviso_cese_asistente" ON configuracion_aviso_cese_asistente
  FOR SELECT USING (
    configuracion_aviso_cese_asistente.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
  );

-- Un registro por Asistente afectado por un cierre — PrestacionesPaciente.jsx ya calcula
-- qué Asistentes tenían guardias/serie vigentes con el Paciente al momento del cierre
-- (handleCerrarServicio); esta tabla guarda esa lista para que el cron sepa a quién avisar
-- y el Coordinador pueda marcar que ya llamó a cada uno.
CREATE TABLE IF NOT EXISTS cierre_servicio_asistentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  cierre_id UUID NOT NULL REFERENCES cierres_servicio_paciente(id),
  asistente_id UUID NOT NULL,
  avisado_verbalmente_at TIMESTAMPTZ,
  avisado_verbalmente_por UUID REFERENCES usuarios(id),
  aviso_automatico_enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cierre_servicio_asistentes_tenant_fk
    FOREIGN KEY (asistente_id, prestadora_id) REFERENCES asistentes (id, prestadora_id)
);

CREATE INDEX IF NOT EXISTS idx_cierre_servicio_asistentes_cierre ON cierre_servicio_asistentes (cierre_id);
CREATE INDEX IF NOT EXISTS idx_cierre_servicio_asistentes_pendientes
  ON cierre_servicio_asistentes (prestadora_id)
  WHERE avisado_verbalmente_at IS NULL AND aviso_automatico_enviado_at IS NULL;

ALTER TABLE cierre_servicio_asistentes ENABLE ROW LEVEL SECURITY;

-- Sin es_superadmin() a propósito, mismo criterio que cierres_servicio_paciente.
CREATE POLICY "coordinador_y_admin_gestionan_cierre_servicio_asistentes" ON cierre_servicio_asistentes
  FOR ALL USING (
    cierre_servicio_asistentes.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol IN ('admin_prestadora', 'coordinador'))
  );

NOTIFY pgrst, 'reload schema';
