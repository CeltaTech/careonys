-- El glosario retiró dos palabras para hablar de un documento, y una palabra retirada sale también
-- de lo guardado. Esta migración cambia los nombres de funciones y políticas, los valores permitidos
-- y los comentarios de la base. Ninguna fila guarda esos valores: se comprobó antes de escribirla.

-- Los valores permitidos.
ALTER TABLE autorizaciones_monitoreo_paciente
  DROP CONSTRAINT autorizaciones_monitoreo_paciente_metodo_check,
  ADD CONSTRAINT autorizaciones_monitoreo_paciente_metodo_check
    CHECK (metodo = ANY (ARRAY['aplicacion'::text, 'documento_firmado_panel'::text, 'documento_firmado_cliente'::text]));

ALTER TABLE consentimientos_medicacion
  DROP CONSTRAINT consentimientos_medicacion_cerrado_como_check,
  ADD CONSTRAINT consentimientos_medicacion_cerrado_como_check
    CHECK (cerrado_como IS NULL OR cerrado_como = ANY (ARRAY['documento_firmado'::text, 'confirmado_en_la_app'::text]));

ALTER TABLE consentimientos_pagador
  DROP CONSTRAINT consentimientos_pagador_cerrado_como_conocido,
  ADD CONSTRAINT consentimientos_pagador_cerrado_como_conocido
    CHECK (cerrado_como IS NULL OR cerrado_como = ANY (ARRAY['documento_firmado'::text, 'confirmado_en_la_app'::text]));

ALTER TABLE instrucciones_acceso_personas_autorizadas
  DROP CONSTRAINT instrucciones_acceso_personas_autorizadas_cerrada_como_check,
  ADD CONSTRAINT instrucciones_acceso_personas_autorizadas_cerrada_como_check
    CHECK (cerrada_como = ANY (ARRAY['confirmada_en_la_app'::text, 'documento_firmado'::text]));

-- Las funciones. Renombrar conserva los permisos y lo que las políticas ya llaman.
ALTER FUNCTION interno.es_un_papel_firmado(text) RENAME TO es_un_documento_firmado;
ALTER FUNCTION public.cerrar_firma_medicacion_en_papel(uuid, text)
  RENAME TO cerrar_firma_medicacion_con_documento_firmado;
ALTER FUNCTION public.cerrar_autorizacion_signos_vitales_en_papel(uuid, text, text)
  RENAME TO cerrar_autorizacion_signos_vitales_con_documento_firmado;

CREATE OR REPLACE FUNCTION public.cerrar_firma_medicacion_con_documento_firmado(p_firma uuid, p_archivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT interno.es_personal_de_la_prestadora() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  UPDATE consentimientos_medicacion c
     SET estado = 'cerrado',
         cerrado_como = 'documento_firmado',
         cerrado_en = now(),
         cerrado_desde = 'panel',
         archivo_firmado_url = p_archivo
    FROM indicaciones_medicacion i
   WHERE c.id = p_firma
     AND c.prestadora_id = interno.prestadora_actual()
     AND c.estado = 'pendiente_firma'
     AND i.id = c.indicacion_id
     AND i.prestadora_id = c.prestadora_id
     AND interno.alcanza_la_informacion_de_salud(i.paciente_id)
     AND p_archivo LIKE c.prestadora_id::text || '/firmas-medicacion/' || i.paciente_id::text || '/firma-' || c.id::text || '.%';
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_autorizacion_signos_vitales_del_titular(p_usuario uuid, p_paciente uuid, p_idioma text, p_verificador text, p_archivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_doc record;
  v_id uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' OR v_prestadora IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pacientes pa JOIN clientes c ON c.id = pa.cliente_id
     WHERE pa.id = p_paciente AND pa.prestadora_id = v_prestadora AND c.usuario_id = p_usuario
  ) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM autorizaciones_monitoreo_paciente
              WHERE paciente_id = p_paciente AND estado IN ('aceptada', 'pendiente')) THEN
    RAISE EXCEPTION 'ya_hay_una_autorizacion' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_doc FROM interno.documento_autorizacion_signos_vitales(p_paciente, p_idioma);
  IF v_doc.texto IS NULL THEN
    RAISE EXCEPTION 'sin_texto' USING ERRCODE = '22023';
  END IF;

  IF p_archivo IS NULL THEN
    IF p_verificador IS DISTINCT FROM v_doc.verificador THEN
      RAISE EXCEPTION 'el_texto_cambio' USING ERRCODE = '22023';
    END IF;
    INSERT INTO autorizaciones_monitoreo_paciente
      (prestadora_id, paciente_id, metodo, estado, documento_texto, documento_verificador, documento_idioma,
       firmante_persona_id, cargado_por, revisado_en)
    VALUES
      (v_prestadora, p_paciente, 'aplicacion', 'aceptada', v_doc.texto, v_doc.verificador, p_idioma,
       interno.firmante_autorizacion_signos_vitales(p_paciente), p_usuario, now())
    RETURNING id INTO v_id;
  ELSE
    IF p_archivo NOT LIKE v_prestadora::text || '/' || p_paciente::text || '/autorizacion-%' THEN
      RAISE EXCEPTION 'archivo_invalido' USING ERRCODE = '22023';
    END IF;
    INSERT INTO autorizaciones_monitoreo_paciente
      (prestadora_id, paciente_id, metodo, estado, documento_texto, documento_verificador, documento_idioma,
       firmante_persona_id, archivo_url, cargado_por)
    VALUES
      (v_prestadora, p_paciente, 'documento_firmado_cliente', 'pendiente', v_doc.texto, v_doc.verificador, p_idioma,
       interno.firmante_autorizacion_signos_vitales(p_paciente), p_archivo, p_usuario)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_autorizacion_signos_vitales_con_documento_firmado(p_paciente uuid, p_archivo text, p_idioma text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid := auth.uid();
  v_prestadora uuid := interno.prestadora_actual();
  v_doc record;
  v_id uuid;
BEGIN
  IF v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pacientes WHERE id = p_paciente AND prestadora_id = v_prestadora)
     OR NOT interno.alcanza_la_informacion_de_salud(p_paciente) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_archivo NOT LIKE v_prestadora::text || '/' || p_paciente::text || '/autorizacion-%' THEN
    RAISE EXCEPTION 'archivo_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM autorizaciones_monitoreo_paciente
              WHERE paciente_id = p_paciente AND estado IN ('aceptada', 'pendiente')) THEN
    RAISE EXCEPTION 'ya_hay_una_autorizacion' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_doc FROM interno.documento_autorizacion_signos_vitales(p_paciente, p_idioma);
  IF v_doc.texto IS NULL THEN
    RAISE EXCEPTION 'sin_texto' USING ERRCODE = '22023';
  END IF;

  INSERT INTO autorizaciones_monitoreo_paciente
    (prestadora_id, paciente_id, metodo, estado, documento_texto, documento_verificador, documento_idioma,
     firmante_persona_id, archivo_url, cargado_por, revisado_por, revisado_en)
  VALUES
    (v_prestadora, p_paciente, 'documento_firmado_panel', 'aceptada', v_doc.texto, v_doc.verificador, p_idioma,
     interno.firmante_autorizacion_signos_vitales(p_paciente), p_archivo, v_quien, v_quien, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Las políticas del depósito. La tabla es de Supabase: se pueden borrar y crear, no renombrar.
DROP POLICY autorizaciones_monitoreo_el_panel_borra_el_papel_sin_cargar ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_panel_borra_documento_sin_cargar ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'autorizaciones-monitoreo'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND interno.es_personal_de_la_prestadora() AND interno.alcanza_el_archivo_del_paciente(name) AND (NOT interno.es_una_autorizacion_cargada(name))));

DROP POLICY autorizaciones_monitoreo_el_panel_reemplaza_el_papel_sin_cargar ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_panel_reemplaza_documento_sin_cargar ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'autorizaciones-monitoreo'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND interno.es_personal_de_la_prestadora() AND interno.alcanza_el_archivo_del_paciente(name) AND (NOT interno.es_una_autorizacion_cargada(name))))
  WITH CHECK (((bucket_id = 'autorizaciones-monitoreo'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND interno.es_personal_de_la_prestadora() AND interno.alcanza_el_archivo_del_paciente(name)));

DROP POLICY autorizaciones_monitoreo_el_panel_sube_el_papel ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_panel_sube_documento ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'autorizaciones-monitoreo'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND interno.es_personal_de_la_prestadora() AND interno.alcanza_el_archivo_del_paciente(name)));

DROP POLICY autorizaciones_monitoreo_el_trabajo_borra_el_papel_sin_cargar ON storage.objects;
CREATE POLICY autorizaciones_monitoreo_trabajo_borra_documento_sin_cargar ON storage.objects
  FOR DELETE TO trabajo_sin_persona
  USING (((bucket_id = 'autorizaciones-monitoreo'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND (NOT interno.es_una_autorizacion_cargada(name))));

DROP POLICY prescripciones_el_panel_borra_el_papel_sin_firma ON storage.objects;
CREATE POLICY prescripciones_panel_borra_documento_sin_firma ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND ((storage.foldername(name))[2] = 'firmas-medicacion'::text) AND interno.alcanza_el_archivo_del_paciente(name) AND (NOT interno.es_un_documento_firmado(name))));

DROP POLICY prescripciones_el_panel_reemplaza_el_papel_sin_firma ON storage.objects;
CREATE POLICY prescripciones_panel_reemplaza_documento_sin_firma ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND ((storage.foldername(name))[2] = 'firmas-medicacion'::text) AND interno.alcanza_el_archivo_del_paciente(name) AND (NOT interno.es_un_documento_firmado(name))))
  WITH CHECK (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND ((storage.foldername(name))[2] = 'firmas-medicacion'::text) AND interno.alcanza_el_archivo_del_paciente(name)));

DROP POLICY prescripciones_el_panel_sube_el_papel_firmado ON storage.objects;
CREATE POLICY prescripciones_panel_sube_documento_firmado ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND ((storage.foldername(name))[2] = 'firmas-medicacion'::text) AND interno.alcanza_el_archivo_del_paciente(name)));

DROP POLICY prescripciones_el_papel_firmado_lo_lee_quien_lee_la_firma ON storage.objects;
CREATE POLICY prescripciones_documento_firmado_lo_lee_quien_lee_la_firma ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'prescripciones-medicacion'::text) AND ((storage.foldername(name))[1] = (interno.prestadora_actual())::text) AND (name IN ( SELECT c.archivo_firmado_url
   FROM consentimientos_medicacion c
  WHERE ((c.cerrado_como = 'documento_firmado'::text) AND (c.archivo_firmado_url IS NOT NULL))))));

-- Los comentarios.
COMMENT ON COLUMN consentimientos_pagador.firmante_nombre IS
  'Cómo se llamaba el Apoderado el día que firmó. Si mañana la entidad cambia de Apoderado, el documento sigue diciendo quién lo firmó.';
COMMENT ON COLUMN documentos_asistente.ruta_archivo IS
  'Dónde está el documento dentro del depósito «documentos-asistente». Es la ruta, no un enlace: lo que hay en este depósito se abre sólo con enlace temporal.';
COMMENT ON TABLE documentos_pagador IS
  'Los documentos que el Pagador exigió para esta contratación, cargados. Uno por Cliente y por tipo.';
COMMENT ON COLUMN personas.clase IS
  'física (una persona) o jurídica (una obra social, una prepaga, una empresa). Las dos cumplen los mismos roles.';
COMMENT ON TABLE tipos_documento_pagador IS
  'Qué documentos exige cada Pagador para aceptar la obligación de pagar. Lo arma cada Prestadora; el producto no siembra ninguno.';
COMMENT ON FUNCTION interno.el_numero_de_cliente_no_cambia() IS
  'El número de cliente es con lo que se nombra a ese Cliente en documentos que ya salieron de acá.';

NOTIFY pgrst, 'reload schema';
