-- Una carga pendiente sobre información de salud que ya existe guarda sólo lo que cambia.
--
-- El Panel guarda la información de salud con un alta que, si ya existe, la modifica. Al
-- disparador le llega como alta, con la fila entera: las columnas que el Panel no manda vienen
-- vacías, y al aceptar la carga habrían vaciado lo vigente. Ahora se compara contra la fila
-- vigente, igual que una modificación.

CREATE OR REPLACE FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE
  v_fila      jsonb := to_jsonb(NEW);
  v_vigente   jsonb;
  v_datos     jsonb;
  v_operacion text;
BEGIN
  IF NOT interno.la_carga_queda_pendiente(NEW.paciente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_vigente := to_jsonb(OLD);
  ELSIF TG_TABLE_NAME = 'informacion_de_salud_del_paciente' THEN
    -- La información de salud es una por Paciente: si ya está, guardarla es modificarla.
    SELECT to_jsonb(s) INTO v_vigente
      FROM informacion_de_salud_del_paciente s
     WHERE s.paciente_id = NEW.paciente_id;
  END IF;

  IF v_vigente IS NULL THEN
    v_datos := v_fila;
    v_operacion := 'alta';
  ELSE
    -- Sólo lo que cambió: al aceptarlo se aplica sobre lo que esté vigente ese día.
    -- En un alta sobre una fila que ya existe, lo que llega vacío es lo que no se mandó: no se
    -- sabe qué quiso decir, y vaciar lo vigente no puede ser lo que se pidió.
    SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) INTO v_datos
      FROM jsonb_each(v_fila) n
     WHERE n.value IS DISTINCT FROM v_vigente -> n.key
       AND (TG_OP = 'UPDATE' OR n.value <> 'null'::jsonb);
    v_operacion := 'modificacion';
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

NOTIFY pgrst, 'reload schema';
