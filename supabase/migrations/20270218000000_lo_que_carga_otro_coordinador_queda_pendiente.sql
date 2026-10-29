-- Lo que carga un Coordinador sobre un Paciente que no coordina queda pendiente.
--
-- Cada Servicio tiene su Coordinador (20270217000000). Si otro Coordinador cambia la información
-- de salud o un domicilio temporal de un Paciente que no le toca, el cambio no se aplica: queda
-- guardado aparte hasta que lo acepte el Coordinador asignado o la administración. Mientras
-- tanto rige lo que estaba, y queda anotado quién cargó qué y quién lo revisó.
--
-- Los rangos de signos vitales no entran: hoy sólo los escribe la administración, que nunca
-- queda pendiente.

CREATE TABLE public.cargas_sujetas_a_aprobacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES prestadoras(id),
  paciente_id   uuid NOT NULL,
  tabla         text NOT NULL CHECK (tabla IN ('informacion_de_salud_del_paciente', 'domicilios_temporales_paciente')),
  operacion     text NOT NULL CHECK (operacion IN ('alta', 'modificacion')),
  -- La fila que se modifica. La información de salud es una por Paciente y se ubica por él.
  registro_id   uuid,
  datos         jsonb NOT NULL,
  cargado_por   uuid NOT NULL REFERENCES usuarios(id),
  cargado_en    timestamptz NOT NULL DEFAULT now(),
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  motivo_rechazo text,
  revisado_por  uuid REFERENCES usuarios(id),
  revisado_en   timestamptz,
  CONSTRAINT cargas_sujetas_a_aprobacion_del_paciente
    FOREIGN KEY (paciente_id, prestadora_id) REFERENCES pacientes(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT la_modificacion_de_un_domicilio_dice_cual
    CHECK (tabla <> 'domicilios_temporales_paciente' OR operacion = 'alta' OR registro_id IS NOT NULL),
  CONSTRAINT el_rechazo_lleva_motivo
    CHECK (estado <> 'rechazada' OR nullif(btrim(motivo_rechazo), '') IS NOT NULL),
  CONSTRAINT la_revision_dice_quien_y_cuando
    CHECK ((estado = 'pendiente') = (revisado_por IS NULL AND revisado_en IS NULL))
);

CREATE INDEX cargas_sujetas_a_aprobacion_pendientes_idx
  ON public.cargas_sujetas_a_aprobacion (prestadora_id, paciente_id)
  WHERE estado = 'pendiente';

ALTER TABLE public.cargas_sujetas_a_aprobacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cargas_sujetas_a_aprobacion FROM PUBLIC, anon, authenticated;
-- Se lee y se propone con la sesión de cada uno. Se revisa sólo por `revisar_carga`.
GRANT SELECT, INSERT ON public.cargas_sujetas_a_aprobacion TO authenticated;

-- La ve quien la revisa —la administración o quien coordina al Paciente— y quien la cargó. La de
-- información de salud, además, sólo si la regla de salud le alcanza a ese Paciente.
CREATE POLICY ven_la_carga_quien_la_revisa_y_quien_la_cargo
  ON public.cargas_sujetas_a_aprobacion FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin()
         OR interno.es_admin_prestadora()
         OR interno.coordina_al_paciente(paciente_id)
         OR cargado_por = interno.usuario_de_la_sesion())
    AND (tabla <> 'informacion_de_salud_del_paciente'
         OR interno.alcanza_la_informacion_de_salud(paciente_id))
  );

-- La propone un Coordinador, a su nombre, sin revisar, y sólo lo que podría haber escrito él.
CREATE POLICY el_coordinador_propone_la_carga
  ON public.cargas_sujetas_a_aprobacion FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND cargado_por = interno.usuario_de_la_sesion()
    AND estado = 'pendiente'
    AND (tabla <> 'informacion_de_salud_del_paciente'
         OR interno.tiene_permiso('editar_datos_paciente'))
  );

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR UPDATE OR DELETE ON public.cargas_sujetas_a_aprobacion
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_de_acceso_mutacion();

-- ¿Lo que cargue quien inició sesión sobre este Paciente queda pendiente? Lo pregunta el Panel
-- antes de guardar, para avisar. Corre con los permisos de quien llama.
CREATE FUNCTION interno.la_carga_queda_pendiente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, interno
AS $$
  SELECT interno.es_coordinador() AND NOT interno.coordina_al_paciente(p_paciente);
$$;

CREATE FUNCTION public.la_carga_queda_pendiente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, interno
AS $$
  SELECT interno.la_carga_queda_pendiente(p_paciente);
$$;

REVOKE ALL ON FUNCTION interno.la_carga_queda_pendiente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_carga_queda_pendiente(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.la_carga_queda_pendiente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.la_carga_queda_pendiente(uuid) TO authenticated;

-- El desvío. Corre con el rol de quien escribe: lo que guarda en la tabla de cargas lo vuelve a
-- controlar la protección por fila de esa tabla.
CREATE FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE
  v_fila      jsonb := to_jsonb(NEW);
  v_datos     jsonb;
  v_operacion text;
BEGIN
  IF NOT interno.la_carga_queda_pendiente(NEW.paciente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Sólo lo que cambió: al aceptarlo se aplica sobre lo que esté vigente ese día.
    SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) INTO v_datos
      FROM jsonb_each(v_fila) n
     WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key;
    v_operacion := 'modificacion';
  ELSE
    v_datos := v_fila;
    -- La información de salud es una por Paciente: si ya está, guardarla es modificarla.
    v_operacion := CASE
      WHEN TG_TABLE_NAME = 'informacion_de_salud_del_paciente'
       AND EXISTS (SELECT 1 FROM informacion_de_salud_del_paciente s WHERE s.paciente_id = NEW.paciente_id)
      THEN 'modificacion' ELSE 'alta' END;
  END IF;

  v_datos := v_datos - 'id' - 'prestadora_id' - 'paciente_id' - 'created_at' - 'updated_at';
  IF v_datos = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO cargas_sujetas_a_aprobacion
    (prestadora_id, paciente_id, tabla, operacion, registro_id, datos, cargado_por)
  VALUES
    (NEW.prestadora_id, NEW.paciente_id, TG_TABLE_NAME, v_operacion,
     CASE WHEN TG_OP = 'UPDATE' THEN NEW.id END, v_datos, interno.usuario_de_la_sesion());

  -- Lo vigente no cambia.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente() TO authenticated;

-- Va después de los que validan o arreglan la fila (el orden de los disparadores es alfabético).
CREATE TRIGGER trg_lo_que_carga_otro_coordinador_queda_pendiente
  BEFORE INSERT OR UPDATE ON public.informacion_de_salud_del_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente();

CREATE TRIGGER trg_lo_que_carga_otro_coordinador_queda_pendiente
  BEFORE INSERT OR UPDATE ON public.domicilios_temporales_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente();

-- Aceptar o rechazar. Como `revisar_indicacion_medicacion`: corre como dueña, así que cada
-- control de quién puede está escrito acá. Al aceptar, el cambio lo escribe quien lo revisa, y la
-- versión clínica queda a su nombre; quién lo cargó queda en la carga.
CREATE FUNCTION public.revisar_carga(p_carga uuid, p_acepta boolean, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, interno
AS $$
DECLARE
  v_quien  uuid := auth.uid();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_carga  cargas_sujetas_a_aprobacion;
  v_admin  boolean := interno.es_superadmin() OR interno.es_admin_prestadora();
BEGIN
  IF v_quien IS NULL OR p_acepta IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_carga
    FROM cargas_sujetas_a_aprobacion c
   WHERE c.id = p_carga
     AND c.prestadora_id = interno.prestadora_actual()
     AND c.estado = 'pendiente'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT (v_admin OR interno.coordina_al_paciente(v_carga.paciente_id)) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF v_carga.tabla = 'informacion_de_salud_del_paciente'
     AND (NOT interno.alcanza_la_informacion_de_salud(v_carga.paciente_id)
          OR NOT (v_admin OR interno.tiene_permiso('editar_datos_paciente'))) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF NOT p_acepta THEN
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = 'P0001';
    END IF;
    UPDATE cargas_sujetas_a_aprobacion
       SET estado = 'rechazada', motivo_rechazo = v_motivo, revisado_por = v_quien, revisado_en = now()
     WHERE id = v_carga.id;
    RETURN true;
  END IF;

  IF v_carga.tabla = 'informacion_de_salud_del_paciente' THEN
    IF EXISTS (SELECT 1 FROM informacion_de_salud_del_paciente s WHERE s.paciente_id = v_carga.paciente_id) THEN
      UPDATE informacion_de_salud_del_paciente t
         SET (patologias, nivel_complejidad, nota_aclaratoria, updated_at) =
             (SELECT r.patologias, r.nivel_complejidad, r.nota_aclaratoria, now()
                FROM jsonb_populate_record(t, v_carga.datos) r)
       WHERE t.paciente_id = v_carga.paciente_id;
    ELSE
      INSERT INTO informacion_de_salud_del_paciente (prestadora_id, paciente_id, patologias, nivel_complejidad, nota_aclaratoria)
      SELECT v_carga.prestadora_id, v_carga.paciente_id, coalesce(r.patologias, '{}'), r.nivel_complejidad, r.nota_aclaratoria
        FROM jsonb_populate_record(NULL::informacion_de_salud_del_paciente, v_carga.datos) r;
    END IF;
  ELSIF v_carga.operacion = 'alta' THEN
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, domicilio, lat, lng, motivo, fecha_inicio, fecha_fin,
       calle, numero, piso, unidad, lugar_id, codigo_postal)
    SELECT v_carga.prestadora_id, v_carga.paciente_id, r.domicilio, r.lat, r.lng, r.motivo, r.fecha_inicio,
           r.fecha_fin, r.calle, r.numero, r.piso, r.unidad, r.lugar_id, r.codigo_postal
      FROM jsonb_populate_record(NULL::domicilios_temporales_paciente, v_carga.datos) r;
  ELSE
    UPDATE domicilios_temporales_paciente t
       SET (domicilio, lat, lng, motivo, fecha_inicio, fecha_fin, calle, numero, piso, unidad, lugar_id, codigo_postal) =
           (SELECT r.domicilio, r.lat, r.lng, r.motivo, r.fecha_inicio, r.fecha_fin, r.calle, r.numero,
                   r.piso, r.unidad, r.lugar_id, r.codigo_postal
              FROM jsonb_populate_record(t, v_carga.datos) r)
     WHERE t.id = v_carga.registro_id
       AND t.paciente_id = v_carga.paciente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'la_fila_ya_no_existe' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE cargas_sujetas_a_aprobacion
     SET estado = 'aceptada', revisado_por = v_quien, revisado_en = now()
   WHERE id = v_carga.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_carga(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_carga(uuid, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
