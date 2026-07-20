-- Etapa 3 (PWA Asistentes) — Fase 1 del plan aprobado 2026-07-20. Crea `reportes` (Reporte
-- Diario, IA Nivel 1) y `alertas` (IA Nivel 2), diseñadas en docs/DATA_MODEL.md líneas
-- 466-498 pero nunca aplicadas contra Supabase (confirmado con mcp__supabase__list_tables
-- antes de escribir este archivo: no existían). Sigue el mismo patrón de Módulo 6
-- (schema_modulo6_guardias.sql): prestadora_id NOT NULL desde el origen, FK compuesta
-- contra `guardias`/`pacientes` para que el aislamiento de tenant sea estructural, no solo
-- de aplicación. Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- Incluye además una policy que falta en `guardias` desde que se creó (Módulo 6): ninguna
-- policy le da al rol `asistente` acceso a sus propias guardias (solo panel_gestiona_guardias
-- y coordinador_gestiona_guardias_de_su_zona existen, ambas para admin_prestadora/coordinador).
-- Sin esto, la PWA de Asistentes no puede leer "Mis Guardias" ni por RLS directo ni por
-- ningún otro medio salvo el backend con service role — que sí puede, pero el aislamiento
-- de RLS es una garantía obligatoria (CLAUDE.md §6), no algo que dependa solo del backend.
-- El check-in/checkout en sí (mutación) se hace vía backend Express (valida distancia GPS
-- contra pacientes.lat/lng antes de escribir) — esta policy de acá es de SELECT/UPDATE
-- acotada, coherente con ese flujo, no un atajo para saltear esa validación de servidor.

-- ============================================================================
-- 0. GUARDIAS — política faltante para el rol `asistente`
-- ============================================================================

CREATE POLICY "asistente_ve_sus_guardias" ON guardias
  FOR SELECT USING (
    guardias.prestadora_id = current_tenant()
    AND asistente_id = auth.uid()
  );

-- UPDATE acotado: en la práctica el check-in/checkout pasa por el backend (service role,
-- que no pasa por RLS), pero esta policy queda como defensa en profundidad para el caso de
-- acceso directo con la anon key — no se puede restringir por columna con RLS estándar, así
-- que la validación de "solo puede tocar sus propios campos de checkin/checkout, nunca
-- fecha/hora/asistente_id/paciente_id" se aplica en el backend, no acá.
CREATE POLICY "asistente_actualiza_su_guardia" ON guardias
  FOR UPDATE USING (
    guardias.prestadora_id = current_tenant()
    AND asistente_id = auth.uid()
  );

-- ============================================================================
-- 1. REPORTES — Reporte Diario (IA Nivel 1). guardia_id es la única FK; prestadora_id y el
--    resto del contexto (asistente, paciente) se derivan siempre a través de `guardias`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  guardia_id UUID NOT NULL,
  texto_libre TEXT,
  alimentacion JSONB,
  medicacion JSONB,
  signos_vitales JSONB,
  estado_animo TEXT,
  incidentes TEXT,
  observaciones TEXT,
  foto_url TEXT,
  ia_procesado BOOLEAN NOT NULL DEFAULT FALSE,
  confirmado_asistente BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reportes_guardia_tenant_fk
    FOREIGN KEY (guardia_id, prestadora_id) REFERENCES guardias (id, prestadora_id)
);

CREATE INDEX IF NOT EXISTS idx_reportes_guardia ON reportes (guardia_id);

ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_gestiona_reportes" ON reportes
  FOR ALL USING (
    es_superadmin() OR (
      reportes.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

CREATE POLICY "coordinador_gestiona_reportes_de_su_zona" ON reportes
  FOR ALL USING (
    reportes.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM usuarios u
      JOIN guardias g ON g.id = reportes.guardia_id
      JOIN asistentes a ON a.id = g.asistente_id
      WHERE u.id = auth.uid() AND u.rol = 'coordinador' AND u.zonas && a.zonas
    )
  );

-- El Asistente crea y edita el reporte de su propia guardia (antes de confirmar; después de
-- confirmado, el backend es quien decide si sigue editable — no se restringe acá por RLS).
CREATE POLICY "asistente_gestiona_reportes_de_su_guardia" ON reportes
  FOR ALL USING (
    reportes.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM guardias g
      WHERE g.id = reportes.guardia_id AND g.asistente_id = auth.uid()
    )
  );

-- El Cliente solo lee los reportes de sus propios Pacientes (glosario CLAUDE.md — nunca
-- escribe, nunca ve reportes de otro Paciente).
CREATE POLICY "cliente_ve_reportes_de_sus_pacientes" ON reportes
  FOR SELECT USING (
    reportes.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM guardias g
      JOIN pacientes p ON p.id = g.paciente_id
      WHERE g.id = reportes.guardia_id AND p.cliente_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. ALERTAS — salida de IA Nivel 2. Solo se persisten niveles distintos de 'verde' (regla
--    de aplicación, ver docs/AI_PROMPTS.md), la tabla en sí no restringe el CHECK a eso.
-- ============================================================================

CREATE TABLE IF NOT EXISTS alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  paciente_id UUID NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('verde', 'amarilla', 'roja')),
  descripcion TEXT,
  detalle_coordinador TEXT,
  campos_preocupantes TEXT[],
  resuelta BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta_por UUID REFERENCES usuarios(id),
  resuelta_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT alertas_paciente_tenant_fk
    FOREIGN KEY (paciente_id, prestadora_id) REFERENCES pacientes (id, prestadora_id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_paciente ON alertas (paciente_id);

ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_gestiona_alertas" ON alertas
  FOR ALL USING (
    es_superadmin() OR (
      alertas.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

-- Sin filtro de zona a propósito: `pacientes` no tiene zona modelada como código real
-- (deuda técnica ya documentada en SECURITY.md/DATA_MODEL.md) — Coordinador ve todas las
-- alertas del tenant, mismo gap ya aceptado que domicilios_temporales_paciente.
CREATE POLICY "coordinador_gestiona_alertas" ON alertas
  FOR ALL USING (
    alertas.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'coordinador')
  );

-- El Cliente solo lee las alertas de sus propios Pacientes — nunca roja/amarilla de otro.
CREATE POLICY "cliente_ve_alertas_de_sus_pacientes" ON alertas
  FOR SELECT USING (
    alertas.prestadora_id = current_tenant()
    AND EXISTS (
      SELECT 1 FROM pacientes p WHERE p.id = alertas.paciente_id AND p.cliente_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
