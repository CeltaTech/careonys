-- La medicación se revisa en el Panel con la credencial de quien revisa (paso 9 de «Los
-- cimientos»).
--
-- Hasta acá la bandeja iba con la llave maestra por tres motivos. Uno: la base deja modificar una
-- indicación sólo a la administración, y en el Panel también la acepta o la rechaza el
-- Coordinador. Dos: el bloqueo por la vía pregunta quién tiene guardia con el Paciente, y el
-- Coordinador sólo ve las guardias de su zona. Tres: el depósito no le deja al Coordinador subir el
-- documento firmado en papel, ni la base cerrar la firma. Las tres cosas se resuelven acá sin
-- abrirle al Coordinador la indicación entera: cada operación toca sólo lo suyo.

-- Quiénes tienen guardia, de hoy en adelante, con un Paciente de la Prestadora de quien pregunta.
-- Devuelve sólo los Asistentes: el bloqueo necesita saber si alguno puede dar la vía, y para eso
-- tiene que mirar todas las zonas.
CREATE FUNCTION public.asistentes_asignados_al_paciente(p_paciente uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT DISTINCT g.asistente_id
    FROM guardia_pacientes gp
    JOIN guardias g ON g.id = gp.guardia_id AND g.prestadora_id = gp.prestadora_id
   WHERE gp.paciente_id = p_paciente
     AND gp.prestadora_id = interno.prestadora_actual()
     AND interno.es_personal_de_la_prestadora()
     AND g.asistente_id IS NOT NULL
     AND g.fecha >= current_date;
$function$;

REVOKE ALL ON FUNCTION public.asistentes_asignados_al_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistentes_asignados_al_paciente(uuid) TO authenticated;

-- Aceptar o rechazar una indicación pendiente. La revisa quien es del Panel de esa Prestadora y
-- alcanza la información de salud del Paciente; quién revisó sale de la sesión. Toca sólo el
-- estado, el motivo y quién y cuándo: el medicamento, la dosis y la vía no los cambia nadie desde
-- acá. Devuelve falso si la indicación ya no estaba pendiente. El disparador que exige la firma
-- sigue mandando.
CREATE FUNCTION public.revisar_indicacion_medicacion(
  p_indicacion uuid,
  p_estado text,
  p_motivo text,
  p_motivo_clave text
)
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
  IF p_estado = 'rechazada' AND v_motivo IS NULL AND p_motivo_clave IS NULL THEN
    RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = '22023';
  END IF;

  UPDATE indicaciones_medicacion i
     SET estado = p_estado,
         motivo_rechazo = CASE WHEN p_estado = 'rechazada' AND p_motivo_clave IS NULL THEN v_motivo END,
         motivo_rechazo_clave = CASE WHEN p_estado = 'rechazada' THEN p_motivo_clave END,
         revisado_por = v_quien,
         revisado_en = now()
   WHERE i.id = p_indicacion
     AND i.prestadora_id = interno.prestadora_actual()
     AND i.estado = 'pendiente'
     AND interno.alcanza_la_informacion_de_salud(i.paciente_id);
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.revisar_indicacion_medicacion(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_indicacion_medicacion(uuid, text, text, text) TO authenticated;

-- Cerrar una firma pendiente con el documento firmado en papel. El archivo tiene que estar en el
-- lugar de esa firma, el que fija el backend (utils/archivosSubidos.js, rutaDelPapelFirmado). Toca
-- sólo el cierre: el texto que se firmó no lo cambia nadie. Devuelve falso si la firma ya no estaba
-- pendiente.
CREATE FUNCTION public.cerrar_firma_medicacion_en_papel(p_firma uuid, p_archivo text)
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
         cerrado_como = 'papel_firmado',
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

REVOKE ALL ON FUNCTION public.cerrar_firma_medicacion_en_papel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_firma_medicacion_en_papel(uuid, text) TO authenticated;

-- ¿Ese archivo ya es el documento de una firma cerrada? Mira con los permisos de su dueño para no
-- depender de lo que quien pregunta puede ver.
CREATE FUNCTION interno.es_un_papel_firmado(p_archivo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM consentimientos_medicacion c
     WHERE c.archivo_firmado_url = p_archivo
  );
$function$;

-- La usan las políticas: conserva `authenticated`.
REVOKE ALL ON FUNCTION interno.es_un_papel_firmado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.es_un_papel_firmado(text) TO authenticated;

-- El personal del Panel sube el documento firmado a la carpeta de las firmas de su Prestadora, y
-- puede reemplazar o borrar el que subió mientras no haya quedado en ninguna firma. El que ya
-- quedó es historia clínica: ése sólo lo toca la administración.
CREATE POLICY prescripciones_el_panel_sube_el_papel_firmado
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.es_personal_de_la_prestadora()
  );

CREATE POLICY prescripciones_el_panel_reemplaza_el_papel_sin_firma
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.es_personal_de_la_prestadora()
    AND NOT interno.es_un_papel_firmado(name)
  )
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.es_personal_de_la_prestadora()
  );

CREATE POLICY prescripciones_el_panel_borra_el_papel_sin_firma
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
    AND (storage.foldername(name))[2] = 'firmas-medicacion'
    AND interno.es_personal_de_la_prestadora()
    AND NOT interno.es_un_papel_firmado(name)
  );

NOTIFY pgrst, 'reload schema';
