-- La emergencia se atiende con la credencial de quien pide (paso 9 de «Los cimientos»).
--
-- Hasta acá el Panel la marcaba atendida con la llave maestra, porque sólo la Administración
-- tenía política para modificarla. El Coordinador la atendía igual, y la zona la miraba el
-- disparador. Ahora el Coordinador tiene su propia política: atiende las de su zona y las que
-- tiene tomadas. Las que llegaron a todos los Coordinadores las ve, pero para atenderlas fuera de
-- su zona primero las toma, como ya exigía el disparador.

CREATE POLICY coordinador_atiende_una_emergencia_de_su_zona_o_tomada
  ON public.emergencias_guardia
  FOR UPDATE
  TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND atendida_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM guardias g
         WHERE g.id = emergencias_guardia.guardia_id
           AND interno.coordinador_alcanza_asistente(g.asistente_id)
      )
      OR id = ANY ((SELECT interno.alarmas_que_tengo_tomadas('emergencia_guardia'))::uuid[])
    )
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_coordinador()
    AND atendida_at IS NOT NULL
    AND atendida_por = auth.uid()
  );

-- El comentario del disparador decía que la emergencia se atendía con la llave maestra. La
-- comprobación de zona queda: cubre también el trabajo sin persona, que entra por otra política.
CREATE OR REPLACE FUNCTION interno.la_alarma_la_resuelve_quien_la_tomo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo text;
  v_resuelve boolean;
  v_actor uuid := interno.usuario_de_la_sesion();
  v_quien uuid;
  v_asistente uuid;
BEGIN
  IF TG_TABLE_NAME = 'alertas_tempranas_guardia' THEN
    v_tipo := 'alerta_temprana_guardia';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_relevo' THEN
    v_tipo := 'incidente_relevo';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'incidentes_turno_sin_cubrir' THEN
    v_tipo := 'incidente_turno_sin_cubrir';
    v_resuelve := OLD.resuelto_at IS NULL AND NEW.resuelto_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'emergencias_guardia' THEN
    v_tipo := 'emergencia_guardia';
    v_resuelve := OLD.atendida_at IS NULL AND NEW.atendida_at IS NOT NULL;
    v_actor := coalesce(v_actor, NEW.atendida_por);
  ELSIF TG_TABLE_NAME = 'guardias' THEN
    v_tipo := 'guardia_sin_cerrar';
    v_resuelve := OLD.estado = 'activa' AND NEW.estado IS DISTINCT FROM 'activa';
  END IF;

  IF NOT coalesce(v_resuelve, false) OR v_actor IS NULL OR NOT interno.es_usuario_del_panel(v_actor) THEN
    RETURN NEW;
  END IF;

  v_quien := interno.quien_tiene_la_alarma(NEW.prestadora_id, v_tipo, NEW.id);
  IF v_quien IS NOT NULL AND v_quien <> v_actor THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;

  -- Fuera de su zona, el Coordinador atiende la emergencia sólo si la tomó. Con sesión lo exige
  -- también la política; acá queda para lo que entra sin persona, que la política no mira.
  IF TG_TABLE_NAME = 'emergencias_guardia' AND v_quien IS NULL AND interno.es_coordinador_de(v_actor) THEN
    SELECT g.asistente_id INTO v_asistente FROM guardias g WHERE g.id = NEW.guardia_id;
    IF NOT interno.coordinador_alcanza_asistente_de(v_actor, v_asistente) THEN
      RAISE EXCEPTION 'alarma_fuera_de_la_zona' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
