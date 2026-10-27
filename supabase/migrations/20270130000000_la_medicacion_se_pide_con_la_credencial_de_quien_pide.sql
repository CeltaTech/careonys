-- La medicación que pide el Cliente entra con la credencial de quien pide (paso 9 de «Los
-- cimientos»).
--
-- Hasta acá el alta, la firma y el archivo iban con la llave maestra, por dos motivos. Uno: a una
-- persona autorizada a pedir medicación pero no a verla, la base no le devolvía la fila recién
-- creada, y la política de la firma buscaba la indicación con sus mismos ojos. Dos: si la firma no
-- entraba, la indicación había que borrarla a mano, y el Cliente no puede borrar. Las dos cosas se
-- resuelven acá: la indicación y su firma entran juntas en una sola operación de la base, sin
-- devolver la fila, y la política de la firma pregunta por la indicación sin depender de lo que
-- quien firma puede ver.

-- La indicación es de un Paciente del Cliente que inició sesión. Mira la indicación con los
-- permisos de su dueño para no depender del permiso de verla, y no recibe a nadie más que la
-- indicación: el Cliente sale de la sesión.
CREATE FUNCTION interno.indicacion_de_un_paciente_del_cliente(p_indicacion uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM indicaciones_medicacion i
     WHERE i.id = p_indicacion
       AND i.paciente_id IN (SELECT interno.pacientes_del_cliente())
  );
$function$;

-- La usa una política: conserva `authenticated`.
REVOKE ALL ON FUNCTION interno.indicacion_de_un_paciente_del_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.indicacion_de_un_paciente_del_cliente(uuid) TO authenticated;

DROP POLICY consentimientos_medicacion_los_firma_la_familia ON public.consentimientos_medicacion;
CREATE POLICY consentimientos_medicacion_los_firma_la_familia
  ON public.consentimientos_medicacion
  FOR INSERT
  TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_pide_medicacion')
    AND interno.indicacion_de_un_paciente_del_cliente(indicacion_id)
    AND cargado_por = auth.uid()
  );

-- Pedir una medicación: la indicación y, si la Prestadora pide firma, lo firmado, en una sola
-- operación. Corre con los permisos de quien llama, así que cada fila pasa por su política. La
-- Prestadora y el Cliente salen del Paciente que la base le deja ver; quién pide, de la sesión.
CREATE FUNCTION public.pedir_medicacion(
  p_paciente uuid,
  p_medicamento text,
  p_dosis text,
  p_frecuencia text,
  p_via uuid,
  p_prescripcion text,
  p_desde date,
  p_hasta date,
  p_documento jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_quien uuid := auth.uid();
  v_prestadora uuid;
  v_cliente uuid;
  v_en_la_app boolean;
BEGIN
  SELECT p.prestadora_id, p.cliente_id INTO v_prestadora, v_cliente
    FROM pacientes p
   WHERE p.id = p_paciente;
  IF v_prestadora IS NULL OR v_quien IS NULL THEN
    RAISE EXCEPTION 'paciente_no_encontrado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO indicaciones_medicacion
    (id, prestadora_id, paciente_id, cliente_id, medicamento, dosis, frecuencia,
     via_administracion_id, prescripcion_archivo_url, fecha_desde, fecha_hasta, solicitado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, v_cliente, p_medicamento, p_dosis, p_frecuencia,
     p_via, p_prescripcion, p_desde, p_hasta, v_quien);

  IF p_documento IS NOT NULL THEN
    v_en_la_app := coalesce((p_documento ->> 'en_la_app')::boolean, false);
    INSERT INTO consentimientos_medicacion
      (prestadora_id, indicacion_id, documento_texto, documento_verificador, documento_idioma,
       estado, cerrado_como, cerrado_en, cerrado_desde, cargado_por)
    VALUES
      (v_prestadora, v_id, p_documento ->> 'texto', p_documento ->> 'verificador', p_documento ->> 'idioma',
       CASE WHEN v_en_la_app THEN 'cerrado' ELSE 'pendiente_firma' END,
       CASE WHEN v_en_la_app THEN 'confirmado_en_la_app' END,
       CASE WHEN v_en_la_app THEN now() END,
       CASE WHEN v_en_la_app THEN 'app_clientes' END,
       v_quien);
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pedir_medicacion(uuid, text, text, text, uuid, text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_medicacion(uuid, text, text, text, uuid, text, date, date, jsonb) TO authenticated;

-- El documento firmado en papel vive fuera de la carpeta del Paciente, para que el Asistente no lo
-- alcance. Lo lee quien puede leer el consentimiento que lo cita: la consulta de adentro pasa por
-- la política de los consentimientos.
CREATE POLICY prescripciones_el_papel_firmado_lo_lee_quien_lee_la_firma
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND name IN (
      SELECT c.archivo_firmado_url FROM public.consentimientos_medicacion c
       WHERE c.cerrado_como = 'papel_firmado' AND c.archivo_firmado_url IS NOT NULL
    )
  );

NOTIFY pgrst, 'reload schema';
