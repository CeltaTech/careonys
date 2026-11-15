-- =============================================================================
-- Los restos del cálculo de sueldos e indemnizaciones salen de la base
-- =============================================================================
--
-- QUÉ HACE
--   Borra lo que quedó de un cálculo de cese laboral que nunca se terminó:
--     - la tabla de ceses y la de fórmulas de cese;
--     - el depósito de documentos de cese y sus dos políticas;
--     - de los datos reservados del Asistente, la causa de la baja, el puntaje
--       de riesgo de reclasificación y los indicadores de ese riesgo;
--     - de la remuneración del Asistente, el sueldo básico y la categoría del
--       convenio colectivo, y el sueldo básico como base de una liquidación;
--     - las escalas legales de indemnización, preaviso, período de prueba,
--       licencia paga y riesgo de dependencia.
--
-- POR QUÉ
--   Una Prestadora puede tener a la vez Asistentes independientes y empleados
--   en relación de dependencia, y eso ya lo resuelve la lista de relaciones
--   laborales de cada Prestadora. El sueldo, la indemnización y el cese de un
--   empleado son de un módulo de liquidación de sueldos que todavía no existe:
--   estos restos no los usaba ningún código.
--
-- QUÉ SE COMPROBÓ ANTES DE BORRAR (base en vivo y código)
--   - ceses: 0 filas. formulas_cese: 9 filas de fábrica, sin uso.
--   - Depósito documentos-cese: 0 archivos.
--   - liquidaciones_asistente: 0 filas, ninguna con base sueldo_basico.
--   - Ningún archivo del backend, del Panel ni de las aplicaciones lee o
--     escribe estas tablas, columnas o escalas.
--
-- QUÉ QUEDA
--   La tabla de escalas legales, con la edad mínima para trabajar, y los
--   textos del consentimiento de seguimiento de ubicación para empleados.
--
-- CÓMO SE DESHACE
--   Con otra migración adelante que vuelva a crear lo borrado tal como está en
--   20270323000000_foto_de_la_base.sql. Las filas de fórmulas y escalas están
--   en esa misma migración.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS documentos_cese_los_alcanza_el_trabajo ON storage.objects;
DROP POLICY IF EXISTS documentos_cese_los_alcanza_quien_ve_el_cese ON storage.objects;
-- Supabase no deja borrar filas de storage salvo que se lo pida esta variable,
-- para no dejar archivos huérfanos. El depósito tiene 0 archivos.
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.buckets WHERE id = 'documentos-cese';

ALTER TABLE public.datos_reservados_asistente DROP COLUMN causal_baja;
ALTER TABLE public.datos_reservados_asistente DROP COLUMN indicadores_riesgo;
ALTER TABLE public.remuneraciones_asistente DROP COLUMN categoria_cct;
ALTER TABLE public.datos_reservados_asistente DROP CONSTRAINT datos_reservados_asistente_score_riesgo_reclasificacion_check;
ALTER TABLE public.datos_reservados_asistente DROP COLUMN score_riesgo_reclasificacion;
ALTER TABLE public.liquidaciones_asistente DROP CONSTRAINT liquidaciones_asistente_base_unidad_check;
ALTER TABLE public.remuneraciones_asistente DROP CONSTRAINT remuneraciones_asistente_valores_no_negativos;
ALTER TABLE public.remuneraciones_asistente DROP COLUMN sueldo_basico;
DROP TRIGGER trg_auditoria_acceso ON public.ceses;
DROP TRIGGER trg_completar_moneda ON public.ceses;
DROP POLICY admin_gestiona_ceses ON public.ceses;
DROP POLICY ceses_los_lee_y_anota_el_trabajo ON public.ceses;
DROP TABLE public.ceses;
DROP POLICY panel_lee_formulas_cese ON public.formulas_cese;
DROP POLICY superadmin_gestiona_formulas_cese ON public.formulas_cese;
DROP TABLE public.formulas_cese;
ALTER TABLE public.liquidaciones_asistente ADD CONSTRAINT liquidaciones_asistente_base_unidad_check CHECK (base_unidad = ANY (ARRAY['valor_hora'::text, 'valor_guardia'::text, 'valor_semana'::text]));
ALTER TABLE public.remuneraciones_asistente ADD CONSTRAINT remuneraciones_asistente_valores_no_negativos CHECK (COALESCE(valor_hora, 0::numeric) >= 0::numeric AND COALESCE(valor_guardia, 0::numeric) >= 0::numeric AND COALESCE(valor_semana, 0::numeric) >= 0::numeric AND COALESCE(valor_hora_extra, 0::numeric) >= 0::numeric);

DELETE FROM public.escalas_legales WHERE tipo IN (
  'indemnizacion_antiguedad', 'fraccion_computable_antiguedad', 'multiplicador_agravado',
  'tope_indemnizatorio', 'preaviso_dias', 'indicador_riesgo_dependencia',
  'umbral_riesgo_dependencia', 'periodo_prueba_dias', 'tope_licencia_paga_dias'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
