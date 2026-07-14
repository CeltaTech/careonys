-- Cierre de servicio a nivel Paciente + renovación automática del horizonte de generación de
-- guardias de series abiertas (pendiente #18 punto 2, docs/PENDIENTES.md). Diseño discutido y
-- aprobado por el Desarrollador en la sesión del 2026-07-14 — ver docs/PROGRESS.md.
--
-- Contexto del problema que resuelve este archivo:
--   1) `NuevaGuardiaModal.jsx` genera las guardias concretas de una serie sin `vigente_hasta`
--      (esquema abierto, el que usan todas las prestadoras) una sola vez, cubriendo 90 días
--      desde la creación. Sin un proceso que extienda ese horizonte, la serie deja de producir
--      guardias nuevas en silencio al día 91. Este archivo agrega el valor de configuración
--      (`prestadoras.dias_generacion_series_guardia`, con default 90 pero editable por
--      prestadora desde Configuración) que usa el cron nuevo (`backend/src/utils/
--      generacionSeriesGuardia.js`, no incluido en este archivo SQL) para mantener siempre
--      ese horizonte de guardias generadas por delante de "hoy" — proceso 100% interno, nunca
--      visible para ningún usuario del sistema.
--   2) El cierre real de un servicio no tiene fecha de vencimiento técnica: ocurre cuando deja
--      de haber demanda del Cliente (fin de la relación comercial) o por una causa ajena
--      (fallecimiento del Paciente). "Cierre de servicio" es la acción de negocio que cierra
--      TODAS las Prestaciones, Paquetes y Guardias futuras de un Paciente de una vez —
--      distinto de cancelar una guardia o Prestación puntual, que puede convivir con otras
--      prestaciones vigentes del mismo Paciente. Motivo obligatorio, sin borrado de registros
--      (soft state, mismo patrón que `ceses` para Asistentes). Habilitado únicamente para
--      Coordinador y Admin_prestadora (instrucción explícita del Desarrollador) — a diferencia
--      del resto de las policies de este proyecto, esta tabla NO incluye `es_superadmin()`
--      como bypass: Superadmin no está entre los roles autorizados a cerrar un servicio.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase, sobre la base ya migrada por
-- schema_multitenant_02.sql (current_tenant() ya tiene que existir) y schema_modulo6_guardias.sql
-- (pacientes_id_prestadora_unique ya tiene que existir).

-- ============================================================================
-- 1. Horizonte de generación de guardias, configurable por prestadora
-- ============================================================================

ALTER TABLE prestadoras ADD COLUMN IF NOT EXISTS dias_generacion_series_guardia SMALLINT NOT NULL DEFAULT 90;

-- ============================================================================
-- 2. CIERRES_SERVICIO_PACIENTE — un registro por cada cierre ejecutado (no se borra, no se
--    reabre desde acá; si el Cliente vuelve a pedir servicio se arma una Prestación nueva).
-- ============================================================================

CREATE TABLE IF NOT EXISTS cierres_servicio_paciente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  paciente_id UUID NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('fin_demanda', 'fallecimiento', 'otro')),
  motivo_detalle TEXT,
  cerrado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cierres_servicio_paciente_tenant_fk
    FOREIGN KEY (paciente_id, prestadora_id) REFERENCES pacientes (id, prestadora_id),
  CONSTRAINT cierres_servicio_paciente_motivo_detalle_check
    CHECK (motivo <> 'otro' OR motivo_detalle IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cierres_servicio_paciente_paciente ON cierres_servicio_paciente (paciente_id);

ALTER TABLE cierres_servicio_paciente ENABLE ROW LEVEL SECURITY;

-- Sin es_superadmin() a propósito — ver nota de contexto arriba.
CREATE POLICY "coordinador_y_admin_gestionan_cierres_servicio_paciente" ON cierres_servicio_paciente
  FOR ALL USING (
    cierres_servicio_paciente.prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol IN ('admin_prestadora', 'coordinador'))
  );

NOTIFY pgrst, 'reload schema';
