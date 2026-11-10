-- Antes de borrar un año del registro de accesos a la información de salud, la Prestadora recibe
-- dos correos: un preaviso y una notificación. Cada envío queda anotado en el registro de
-- actividad, que es la constancia de que se avisó y lo que impide mandar dos veces el mismo.
--
-- Cuántos días antes sale cada uno es un dato de la regla de conservación de cada país, no un
-- número del código. La franja y la descarga de Auditoría se abren con el preaviso.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Los días de aviso, en la regla de cada país. Una regla que borra los tiene que tener.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.reglas_de_conservacion
  ADD COLUMN dias_de_preaviso     smallint,
  ADD COLUMN dias_de_notificacion smallint;

UPDATE public.reglas_de_conservacion
   SET dias_de_preaviso = 60, dias_de_notificacion = 30
 WHERE jurisdiccion = 'AR' AND clase_de_registro = 'consultas_a_hce' AND al_vencer = 'borrar';

ALTER TABLE public.reglas_de_conservacion
  ADD CONSTRAINT reglas_de_conservacion_dias_de_aviso_en_orden
    CHECK ((dias_de_preaviso IS NULL AND dias_de_notificacion IS NULL)
           OR (dias_de_notificacion >= 1 AND dias_de_preaviso > dias_de_notificacion)),
  ADD CONSTRAINT reglas_de_conservacion_lo_que_se_borra_se_avisa
    CHECK (al_vencer <> 'borrar' OR (dias_de_preaviso IS NOT NULL AND dias_de_notificacion IS NOT NULL));

-- ---------------------------------------------------------------------------------------------
-- 2. El próximo año por borrar dice también cuándo sale cada aviso.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION public.consultas_a_hce_por_vencer();
DROP FUNCTION interno.consultas_a_hce_por_vencer(uuid);

CREATE FUNCTION interno.consultas_a_hce_por_vencer(p_prestadora uuid)
RETURNS TABLE(anio integer, desde timestamptz, hasta timestamptz, se_borra_el date,
              preaviso_el date, notificacion_el date)
LANGUAGE sql
STABLE
SET search_path = public, interno
AS $$
  WITH regla AS (
    SELECT r.plazo_meses, r.dias_de_preaviso, r.dias_de_notificacion
      FROM reglas_de_conservacion r
      JOIN prestadoras p ON p.id = p_prestadora AND p.pais = r.jurisdiccion
     WHERE r.clase_de_registro = 'consultas_a_hce'
       AND r.al_vencer = 'borrar'
       AND r.tramo = 1
       AND r.vigencia_desde <= current_date
       AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= current_date)
     ORDER BY r.vigencia_desde DESC
     LIMIT 1
  ), primero AS (
    SELECT extract(year FROM min(a.momento) AT TIME ZONE 'UTC')::integer AS anio
      FROM consultas_a_hce a
     WHERE a.prestadora_id = p_prestadora
  ), fecha AS (
    SELECT pr.anio,
           (make_date(pr.anio + 1, 1, 1) + make_interval(months => rg.plazo_meses))::date AS se_borra_el,
           rg.dias_de_preaviso, rg.dias_de_notificacion
      FROM primero pr, regla rg
     WHERE pr.anio IS NOT NULL
  )
  SELECT f.anio,
         make_timestamptz(f.anio, 1, 1, 0, 0, 0, 'UTC'),
         make_timestamptz(f.anio + 1, 1, 1, 0, 0, 0, 'UTC'),
         f.se_borra_el,
         f.se_borra_el - f.dias_de_preaviso,
         f.se_borra_el - f.dias_de_notificacion
    FROM fecha f;
$$;
REVOKE ALL ON FUNCTION interno.consultas_a_hce_por_vencer(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.consultas_a_hce_por_vencer()
RETURNS TABLE(anio integer, desde timestamptz, hasta timestamptz, se_borra_el date,
              preaviso_el date, notificacion_el date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL
     OR NOT (interno.es_superadmin()
             OR interno.es_admin_prestadora()
             OR COALESCE(auth.jwt() ->> 'role', '') = 'trabajo_sin_persona') THEN
    RAISE EXCEPTION 'sin_permiso_para_ver_el_vencimiento_de_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.consultas_a_hce_por_vencer(v_prest);
END;
$$;
REVOKE ALL ON FUNCTION public.consultas_a_hce_por_vencer() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consultas_a_hce_por_vencer() TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 3. Los dos avisos, como acciones que hace el sistema.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema) VALUES
  ('preaviso_de_borrado',     'borrado_de_datos', 22, true),
  ('notificacion_de_borrado', 'borrado_de_datos', 23, true);

-- Qué aviso le toca hoy a la Prestadora de la sesión, si le toca alguno. La notificación gana: si el
-- preaviso no salió a tiempo, ya no sale. El día del borrado no queda nada por avisar.
CREATE FUNCTION interno.aviso_de_borrado_de_consultas_a_hce_pendiente(p_prestadora uuid)
RETURNS TABLE(anio integer, se_borra_el date, aviso text, dias integer)
LANGUAGE sql
STABLE
SET search_path = public, interno
AS $$
  WITH v AS (
    SELECT * FROM interno.consultas_a_hce_por_vencer(p_prestadora)
  ), ya AS (
    SELECT ra.accion
      FROM registro_actividad ra, v
     WHERE ra.prestadora_id = p_prestadora
       AND ra.accion IN ('preaviso_de_borrado', 'notificacion_de_borrado')
       AND ra.detalle ->> 'anio' = v.anio::text
  )
  SELECT v.anio, v.se_borra_el,
         CASE
           WHEN current_date >= v.notificacion_el THEN 'notificacion'
           ELSE 'preaviso'
         END,
         v.se_borra_el - current_date
    FROM v
   WHERE current_date < v.se_borra_el
     AND current_date >= v.preaviso_el
     AND NOT EXISTS (SELECT 1 FROM ya WHERE ya.accion = 'notificacion_de_borrado')
     AND (current_date >= v.notificacion_el
          OR NOT EXISTS (SELECT 1 FROM ya WHERE ya.accion = 'preaviso_de_borrado'));
$$;
REVOKE ALL ON FUNCTION interno.aviso_de_borrado_de_consultas_a_hce_pendiente(uuid) FROM PUBLIC, anon, authenticated;

-- La pregunta, sólo para el trabajo sin persona de una Prestadora.
CREATE FUNCTION public.aviso_de_borrado_de_consultas_a_hce_pendiente()
RETURNS TABLE(anio integer, se_borra_el date, aviso text, dias integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_avisar_el_borrado_de_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.aviso_de_borrado_de_consultas_a_hce_pendiente(v_prest);
END;
$$;
REVOKE ALL ON FUNCTION public.aviso_de_borrado_de_consultas_a_hce_pendiente() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aviso_de_borrado_de_consultas_a_hce_pendiente() TO trabajo_sin_persona;

-- La constancia, una vez que el correo salió. Sólo anota el aviso que de verdad tocaba hoy: así no
-- queda constancia de un aviso que no correspondía, ni dos del mismo.
CREATE FUNCTION public.anotar_aviso_de_borrado_de_consultas_a_hce(p_anio integer, p_aviso text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_avisar_el_borrado_de_las_consultas_a_hce' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aviso_de_borrado:' || v_prest::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM interno.aviso_de_borrado_de_consultas_a_hce_pendiente(v_prest) p
     WHERE p.anio = p_anio AND p.aviso = p_aviso) THEN
    RETURN false;
  END IF;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, NULL, p_aviso || '_de_borrado', 'consultas_a_hce', NULL, jsonb_build_object('anio', p_anio));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.anotar_aviso_de_borrado_de_consultas_a_hce(integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.anotar_aviso_de_borrado_de_consultas_a_hce(integer, text) TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 4. Los textos de los dos correos. Son avisos del sistema: ninguna Prestadora los reescribe.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('borrado_del_registro_de_accesos_preaviso.asunto',
   '{"es-AR": "Próximo borrado del registro de accesos de {{anio}}", "en": "Upcoming deletion of the {{anio}} access record", "pt-BR": "Próxima exclusão do registro de acessos de {{anio}}"}'::jsonb,
   false, true),
  ('borrado_del_registro_de_accesos_preaviso.texto',
   '{"es-AR": "El {{fecha}} el sistema borrará el registro de accesos a la información de salud del año {{anio}}. Puede descargarlo antes desde Auditoría, en el Panel.", "en": "On {{fecha}} the system will delete the {{anio}} record of access to health information. You can download it beforehand from Audit, in the Panel.", "pt-BR": "Em {{fecha}} o sistema excluirá o registro de acessos às informações de saúde do ano {{anio}}. Você pode baixá-lo antes em Auditoria, no Painel."}'::jsonb,
   false, true),
  ('borrado_del_registro_de_accesos_notificacion.asunto',
   '{"es-AR": "Borrado del registro de accesos de {{anio}} en {{dias}} días", "en": "Deletion of the {{anio}} access record in {{dias}} days", "pt-BR": "Exclusão do registro de acessos de {{anio}} em {{dias}} dias"}'::jsonb,
   false, true),
  ('borrado_del_registro_de_accesos_notificacion.texto',
   '{"es-AR": "El {{fecha}} el sistema borrará el registro de accesos a la información de salud del año {{anio}}. Puede descargarlo antes desde Auditoría, en el Panel.", "en": "On {{fecha}} the system will delete the {{anio}} record of access to health information. You can download it beforehand from Audit, in the Panel.", "pt-BR": "Em {{fecha}} o sistema excluirá o registro de acessos às informações de saúde do ano {{anio}}. Você pode baixá-lo antes em Auditoria, no Painel."}'::jsonb,
   false, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
