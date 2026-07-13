-- Bucket privado de Supabase Storage para el certificado médico que respalda una
-- ausencia (ausencias.certificado_url, columna reservada desde schema_etapa2b.sql:186
-- pero nunca implementada del lado de subida de archivo — pendiente #15/roadmap de
-- continuidad de proveedores, punto 1, docs/PLAN_CONTINUIDAD_PROVEEDORES.md).
--
-- Distinto del "Certificado de Aptitud" (tabla `certificados`, schema_etapa2f.sql) que
-- es solo un QR generado, sin archivo — no confundir los dos conceptos.
--
-- Dato sensible (CLAUDE.md Regla 7: "certificados médicos" está explícitamente en la
-- lista de datos que nunca se loguean ni exponen en URLs/GET). Por eso:
--   - Bucket privado (public = false) — nunca una URL pública directa.
--   - Todo el acceso (subida y lectura vía enlace temporal de corta duración) pasa por el
--     backend propio (Service Role Key, bypassea RLS) con su propio chequeo de rol y
--     prestadora_id — ver backend/src/middleware/requiereRolPanel.js y
--     backend/src/routes/panelAusencias.js.
--   - RLS en storage.objects queda habilitada sin ninguna policy para roles no-Service
--     Role (deny-by-default) — es la misma defensa en profundidad que ya aplica Regla 8
--     a cualquier tabla nueva, aunque acá el control real vive en el backend.

INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados-medicos', 'certificados-medicos', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
