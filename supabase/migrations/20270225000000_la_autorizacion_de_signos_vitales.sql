-- La autorización para controlar los signos vitales (paso 9 de «Los cimientos»).
--
-- Un Asistente cuyo tipo no tiene habilitado el monitoreo biométrico no ve ningún signo vital
-- del Paciente hasta que el Contratante —o su apoderado, si el Contratante es una persona
-- jurídica— firma la autorización. La glucemia no entra: se mide pinchando el dedo, y sólo la toma
-- quien tiene el monitoreo habilitado por su tipo.
--
-- Se firma de tres maneras: en la aplicación del Cliente con el acceso guardado del teléfono, que
-- cierra en el acto; en papel desde el Panel, que también cierra en el acto; o en papel subido por
-- el Cliente desde la aplicación, que queda pendiente hasta que el Panel lo acepta o lo rechaza.
--
-- La tabla anterior guardaba un nombre tecleado y no tiene ninguna fila: se reemplaza.

-- 1. El texto de fábrica, por país y por idioma. Vive con los demás textos que se firman; esta
--    clave no distingue modalidad, así que la columna deja de ser obligatoria.
ALTER TABLE textos_consentimiento ALTER COLUMN modalidad DROP NOT NULL;

INSERT INTO textos_consentimiento (jurisdiccion, clave, modalidad, version, idioma, titulo, cuerpo, puntos_clave, es_borrador)
VALUES
  ('AR', 'autorizacion_signos_vitales', NULL, 1, 'es-AR',
   'Autorización control de signos vitales',
   E'Por medio de la presente, en mi carácter de contratante del servicio, autorizo a {{prestadora}} y al personal asistente que asigne a {{paciente}}, tanto para el momento actual como para futuras asistencias, a realizar el control y registro de su presión arterial, temperatura corporal y saturación de oxígeno.\n\nLa presente autorización se limita exclusivamente a prácticas no invasivas y no comprende procedimientos que requieran punción (tales como la medición de glucemia), salvo que el asistente designado cuente expresamente con la matrícula profesional habilitante para tal fin.',
   '{}', false),
  ('AR', 'autorizacion_signos_vitales', NULL, 1, 'en',
   'Vital signs monitoring authorization',
   E'By means of this document, in my capacity as the contracting party of the service, I authorize {{prestadora}} and the assistant staff it assigns to {{paciente}}, both at present and for future assistance, to monitor and record their blood pressure, body temperature and oxygen saturation.\n\nThis authorization is limited exclusively to non-invasive practices and does not include procedures that require a puncture (such as blood glucose measurement), unless the designated assistant expressly holds the professional license required for that purpose.',
   '{}', false),
  ('AR', 'autorizacion_signos_vitales', NULL, 1, 'pt-BR',
   'Autorização de controle de sinais vitais',
   E'Por meio da presente, na qualidade de contratante do serviço, autorizo {{prestadora}} e o pessoal assistente que designar para {{paciente}}, tanto no momento atual quanto em futuros atendimentos, a realizar o controle e o registro de sua pressão arterial, temperatura corporal e saturação de oxigênio.\n\nA presente autorização limita-se exclusivamente a práticas não invasivas e não abrange procedimentos que exijam punção (tais como a medição de glicemia), salvo se o assistente designado possuir expressamente o registro profissional habilitante para tal fim.',
   '{}', false);

-- 2. El texto que la Prestadora escribió en Configuración, por idioma. Sin fila, rige el de
--    fábrica de su país.
CREATE TABLE textos_autorizacion_signos_vitales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES prestadoras(id) ON DELETE CASCADE,
  idioma text NOT NULL CHECK (idioma IN ('es-AR', 'en', 'pt-BR')),
  cuerpo text NOT NULL CHECK (length(btrim(cuerpo)) > 0),
  actualizado_por uuid REFERENCES usuarios(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prestadora_id, idioma)
);

ALTER TABLE textos_autorizacion_signos_vitales ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON textos_autorizacion_signos_vitales TO authenticated;
GRANT SELECT ON textos_autorizacion_signos_vitales TO trabajo_sin_persona;

CREATE POLICY textos_autorizacion_signos_vitales_los_escribe_la_administracion
  ON textos_autorizacion_signos_vitales FOR ALL TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY textos_autorizacion_signos_vitales_los_lee_su_prestadora
  ON textos_autorizacion_signos_vitales FOR SELECT TO authenticated
  USING (interno.lee_la_configuracion(prestadora_id));

CREATE POLICY textos_autorizacion_signos_vitales_los_lee_el_trabajo
  ON textos_autorizacion_signos_vitales FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON textos_autorizacion_signos_vitales
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_de_acceso_mutacion();

-- 3. Las autorizaciones. Quién firma queda como Ficha de Persona; el texto, tal como se leyó, con
--    su identificador de verificación. No se escribe directo: sólo por las funciones de abajo.
DROP TABLE autorizaciones_monitoreo_paciente;

CREATE TABLE autorizaciones_monitoreo_paciente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES prestadoras(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES pacientes(id),
  metodo text NOT NULL CHECK (metodo IN ('aplicacion', 'papel_panel', 'papel_cliente')),
  estado text NOT NULL CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  documento_texto text NOT NULL,
  documento_verificador text NOT NULL,
  documento_idioma text NOT NULL CHECK (documento_idioma IN ('es-AR', 'en', 'pt-BR')),
  firmante_persona_id uuid REFERENCES personas(id),
  archivo_url text,
  motivo_rechazo text,
  cargado_por uuid NOT NULL REFERENCES usuarios(id),
  revisado_por uuid REFERENCES usuarios(id),
  revisado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (metodo = 'aplicacion' OR archivo_url IS NOT NULL),
  CHECK (estado <> 'rechazada' OR length(btrim(coalesce(motivo_rechazo, ''))) > 0)
);

CREATE UNIQUE INDEX autorizaciones_monitoreo_una_aceptada
  ON autorizaciones_monitoreo_paciente (paciente_id) WHERE estado = 'aceptada';
CREATE UNIQUE INDEX autorizaciones_monitoreo_una_pendiente
  ON autorizaciones_monitoreo_paciente (paciente_id) WHERE estado = 'pendiente';
CREATE INDEX autorizaciones_monitoreo_prestadora ON autorizaciones_monitoreo_paciente (prestadora_id);

ALTER TABLE autorizaciones_monitoreo_paciente ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON autorizaciones_monitoreo_paciente FROM authenticated, anon;
GRANT SELECT ON autorizaciones_monitoreo_paciente TO authenticated;
GRANT SELECT ON autorizaciones_monitoreo_paciente TO trabajo_sin_persona;

CREATE POLICY autorizaciones_monitoreo_las_ve_la_administracion
  ON autorizaciones_monitoreo_paciente FOR SELECT TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY autorizaciones_monitoreo_las_ve_el_coordinador
  ON autorizaciones_monitoreo_paciente FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.coordinador_ve_al_paciente(paciente_id));

CREATE POLICY autorizaciones_monitoreo_las_ve_el_cliente
  ON autorizaciones_monitoreo_paciente FOR SELECT TO authenticated
  USING (
    paciente_id IN (SELECT interno.pacientes_del_cliente())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_ficha_del_paciente')
  );

CREATE POLICY autorizaciones_monitoreo_las_lee_el_trabajo
  ON autorizaciones_monitoreo_paciente FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON autorizaciones_monitoreo_paciente
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_de_acceso_mutacion();

-- 4. El documento de un Paciente, con los nombres puestos. Primero el texto de la Prestadora en
--    ese idioma; si no escribió ninguno, el de fábrica de su país. Sin texto, no devuelve nada:
--    en ese país la autorización se firma sólo en papel propio.
CREATE FUNCTION interno.documento_autorizacion_signos_vitales(p_paciente uuid, p_idioma text)
 RETURNS TABLE (titulo text, texto text, verificador text, idioma text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH datos AS (
    SELECT pa.prestadora_id, pr.pais, pr.nombre_fantasia,
           btrim(coalesce(pe.nombre, '') || ' ' || coalesce(pe.apellido, '')) AS paciente
      FROM pacientes pa
      JOIN prestadoras pr ON pr.id = pa.prestadora_id
      JOIN personas pe ON pe.id = pa.persona_id
     WHERE pa.id = p_paciente
  ),
  fabrica AS (
    SELECT t.titulo, t.cuerpo
      FROM textos_consentimiento t, datos d
     WHERE t.clave = 'autorizacion_signos_vitales'
       AND t.jurisdiccion = d.pais
       AND t.idioma = p_idioma
       AND NOT t.es_borrador
       AND t.vigente_hasta IS NULL
     ORDER BY t.version DESC
     LIMIT 1
  ),
  armado AS (
    SELECT f.titulo,
           replace(replace(coalesce(o.cuerpo, f.cuerpo), '{{prestadora}}', d.nombre_fantasia), '{{paciente}}', d.paciente) AS texto
      FROM datos d
      JOIN fabrica f ON true
      LEFT JOIN textos_autorizacion_signos_vitales o ON o.prestadora_id = d.prestadora_id AND o.idioma = p_idioma
  )
  SELECT a.titulo, a.texto, encode(sha256(convert_to(a.texto, 'UTF8')), 'hex'), p_idioma
    FROM armado a;
$function$;

REVOKE ALL ON FUNCTION interno.documento_autorizacion_signos_vitales(uuid, text) FROM PUBLIC, anon, authenticated;

-- Quién firma: el Contratante del Cliente del Paciente, o su apoderado si es persona jurídica.
CREATE FUNCTION interno.firmante_autorizacion_signos_vitales(p_paciente uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE WHEN pe.clase = 'juridica' THEN pe.apoderado_persona_id ELSE pe.id END
    FROM pacientes pa
    JOIN clientes c ON c.id = pa.cliente_id
    JOIN personas pe ON pe.id = c.contratante_persona_id
   WHERE pa.id = p_paciente;
$function$;

REVOKE ALL ON FUNCTION interno.firmante_autorizacion_signos_vitales(uuid) FROM PUBLIC, anon, authenticated;

-- El documento para mostrar o imprimir. Lo pide quien alcanza al Paciente: el personal del Panel
-- que alcanza su información de salud, el Cliente con permiso de ver la Ficha del Paciente, o el
-- trabajo sin persona de esa misma Prestadora.
CREATE FUNCTION public.documento_autorizacion_signos_vitales(p_paciente uuid, p_idioma text)
 RETURNS TABLE (titulo text, texto text, verificador text, idioma text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  SELECT pa.prestadora_id INTO v_prestadora FROM pacientes pa WHERE pa.id = p_paciente;
  IF v_prestadora IS NULL OR v_prestadora <> interno.prestadora_actual() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona'
     AND NOT (interno.es_personal_de_la_prestadora() AND interno.alcanza_la_informacion_de_salud(p_paciente))
     AND NOT (p_paciente IN (SELECT interno.pacientes_del_cliente())
              AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_ficha_del_paciente')) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.documento_autorizacion_signos_vitales(p_paciente, p_idioma);
END;
$function$;

REVOKE ALL ON FUNCTION public.documento_autorizacion_signos_vitales(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documento_autorizacion_signos_vitales(uuid, text) TO authenticated, trabajo_sin_persona;

-- 5. El Panel cierra la autorización con el documento firmado en papel. El archivo tiene que estar
--    en la carpeta del Paciente. Si el Cliente subió uno que espera revisión, primero se revisa ése.
CREATE FUNCTION public.cerrar_autorizacion_signos_vitales_en_papel(p_paciente uuid, p_archivo text, p_idioma text)
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
    (v_prestadora, p_paciente, 'papel_panel', 'aceptada', v_doc.texto, v_doc.verificador, p_idioma,
     interno.firmante_autorizacion_signos_vitales(p_paciente), p_archivo, v_quien, v_quien, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cerrar_autorizacion_signos_vitales_en_papel(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_autorizacion_signos_vitales_en_papel(uuid, text, text) TO authenticated;

-- 6. El titular firma en la aplicación o sube el papel firmado. Lo llama el backend con el trabajo
--    sin persona, después de comprobar el acceso guardado del teléfono, porque el titular no puede
--    escribir en la tabla ni en el depósito. Sin archivo, firmó en la aplicación y queda aceptada
--    si el texto que firmó es el vigente; con archivo, queda pendiente de revisión.
CREATE FUNCTION public.registrar_autorizacion_signos_vitales_del_titular(
  p_usuario uuid,
  p_paciente uuid,
  p_idioma text,
  p_verificador text,
  p_archivo text
)
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
      (v_prestadora, p_paciente, 'papel_cliente', 'pendiente', v_doc.texto, v_doc.verificador, p_idioma,
       interno.firmante_autorizacion_signos_vitales(p_paciente), p_archivo, p_usuario)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_autorizacion_signos_vitales_del_titular(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_autorizacion_signos_vitales_del_titular(uuid, uuid, text, text, text) TO trabajo_sin_persona;

-- 7. El Panel acepta o rechaza el papel que subió el Cliente. Rechazar pide motivo. Devuelve falso
--    si ya no estaba pendiente.
CREATE FUNCTION public.revisar_autorizacion_signos_vitales(p_autorizacion uuid, p_estado text, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid := auth.uid();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF v_quien IS NULL OR NOT interno.es_personal_de_la_prestadora() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('aceptada', 'rechazada') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_estado = 'rechazada' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = '22023';
  END IF;

  UPDATE autorizaciones_monitoreo_paciente a
     SET estado = p_estado,
         motivo_rechazo = CASE WHEN p_estado = 'rechazada' THEN v_motivo END,
         revisado_por = v_quien,
         revisado_en = now()
   WHERE a.id = p_autorizacion
     AND a.prestadora_id = interno.prestadora_actual()
     AND a.estado = 'pendiente'
     AND interno.alcanza_la_informacion_de_salud(a.paciente_id);
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.revisar_autorizacion_signos_vitales(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_autorizacion_signos_vitales(uuid, text, text) TO authenticated;

-- 8. El depósito. El personal que alcanza el archivo del Paciente sube el documento firmado, y puede
--    reemplazar o borrar el que subió mientras no haya quedado en ninguna autorización.
CREATE FUNCTION interno.es_una_autorizacion_cargada(p_archivo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (SELECT 1 FROM autorizaciones_monitoreo_paciente a WHERE a.archivo_url = p_archivo);
$function$;

-- La usan las políticas: conserva `authenticated`.
REVOKE ALL ON FUNCTION interno.es_una_autorizacion_cargada(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.es_una_autorizacion_cargada(text) TO authenticated;

CREATE POLICY autorizaciones_monitoreo_el_panel_sube_el_papel
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND interno.es_personal_de_la_prestadora()
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

CREATE POLICY autorizaciones_monitoreo_el_panel_reemplaza_el_papel_sin_cargar
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND interno.es_personal_de_la_prestadora()
    AND interno.alcanza_el_archivo_del_paciente(name)
    AND NOT interno.es_una_autorizacion_cargada(name)
  )
  WITH CHECK (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND interno.es_personal_de_la_prestadora()
    AND interno.alcanza_el_archivo_del_paciente(name)
  );

CREATE POLICY autorizaciones_monitoreo_el_panel_borra_el_papel_sin_cargar
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND interno.es_personal_de_la_prestadora()
    AND interno.alcanza_el_archivo_del_paciente(name)
    AND NOT interno.es_una_autorizacion_cargada(name)
  );

NOTIFY pgrst, 'reload schema';
