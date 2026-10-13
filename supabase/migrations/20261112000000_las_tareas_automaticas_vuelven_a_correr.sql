-- Dos tareas automáticas no corrían con la credencial del trabajo sin persona.
BEGIN;

-- El aviso de emergencias no podía leerlas. El control de quién ve información de salud estaba
-- puesto sobre todos los roles, y el trabajo sin persona no puede ejecutar la función que lo
-- decide. En las otras siete tablas de salud ese control mira sólo a las personas con sesión; el
-- trabajo sin persona ya queda acotado a una Prestadora por su propia política.
ALTER POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.emergencias_guardia
  TO authenticated;

-- La ausencia automática no podía marcar una guardia. Seis disparadores preguntaban quién inició
-- sesión con `auth.uid()`, y un disparador corre con el rol de quien escribe: el trabajo sin
-- persona no tiene uso del esquema `auth`, que es de Supabase y no se reparte desde acá, así que
-- la pregunta fallaba en vez de contestar que no hay persona. La pregunta pasa a una sola función
-- interna, que la hace con permiso propio y devuelve lo mismo.
CREATE FUNCTION interno.usuario_de_la_sesion()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT auth.uid()
$function$;

REVOKE ALL ON FUNCTION interno.usuario_de_la_sesion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.usuario_de_la_sesion() TO authenticated, service_role, trabajo_sin_persona;

CREATE OR REPLACE FUNCTION public.bloquear_edicion_laboral_coordinador()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rol_actual TEXT;
BEGIN
  SELECT rol INTO rol_actual FROM usuarios WHERE id = interno.usuario_de_la_sesion();

  IF rol_actual = 'coordinador' THEN
    IF NEW.tipo_vinculo IS DISTINCT FROM OLD.tipo_vinculo
      OR NEW.horas_semanales IS DISTINCT FROM OLD.horas_semanales
      OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    THEN
      RAISE EXCEPTION 'Coordinador no puede modificar datos laborales internos del Asistente (regla 8 de CLAUDE.md)';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id THEN
    RAISE EXCEPTION 'El interruptor no cambia de Prestadora';
  END IF;

  IF NOT NEW.restriccion_de_hce THEN
    IF interno.el_pais_exige_la_restriccion_de_hce(NEW.prestadora_id) THEN
      RAISE EXCEPTION 'En el país de esta Prestadora la ley no permite apagarlo'
        USING ERRCODE = 'check_violation';
    END IF;
    IF interno.usuario_de_la_sesion() IS NULL THEN
      RAISE EXCEPTION 'Apagarlo exige una persona con sesión, para que quede registrado quién lo hizo'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

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

  -- La emergencia se atiende todavía con la llave maestra, así que la zona no la mira ninguna
  -- política: se mira acá. Fuera de su zona, el Coordinador la atiende sólo si la tomó.
  IF TG_TABLE_NAME = 'emergencias_guardia' AND v_quien IS NULL AND interno.es_coordinador_de(v_actor) THEN
    SELECT g.asistente_id INTO v_asistente FROM guardias g WHERE g.id = NEW.guardia_id;
    IF NOT interno.coordinador_alcanza_asistente_de(v_actor, v_asistente) THEN
      RAISE EXCEPTION 'alarma_fuera_de_la_zona' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_resolucion_dice_quien_la_firmo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_pide_detalle boolean;
BEGIN
  -- Quién firma no viene en el pedido: sale de la sesión, y pisa lo que haya llegado.
  IF interno.usuario_de_la_sesion() IS NOT NULL THEN
    NEW.resuelto_por := interno.usuario_de_la_sesion();
  END IF;

  NEW.detalle := nullif(btrim(coalesce(NEW.detalle, '')), '');

  -- Y el detalle lo exige la base, no la pantalla. Acá y no adentro de `resolver`, para que valga
  -- también si alguien escribe la fila por su cuenta.
  SELECT m.pide_detalle INTO v_pide_detalle
    FROM motivos_resolucion m
   WHERE m.id = NEW.motivo_id;

  IF coalesce(v_pide_detalle, false) AND NEW.detalle IS NULL THEN
    RAISE EXCEPTION 'resolucion_sin_detalle';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_toma_la_suelta_quien_la_tomo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF interno.usuario_de_la_sesion() IS NOT NULL AND interno.usuario_de_la_sesion() IS DISTINCT FROM OLD.tomada_por THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '42501';
  END IF;
  IF OLD.soltada_at IS NOT NULL THEN
    RAISE EXCEPTION 'toma_ya_soltada' USING ERRCODE = '23514';
  END IF;

  NEW.id := OLD.id;
  NEW.prestadora_id := OLD.prestadora_id;
  NEW.tipo := OLD.tipo;
  NEW.referencia_id := OLD.referencia_id;
  NEW.tomada_por := OLD.tomada_por;
  NEW.tomada_at := OLD.tomada_at;
  NEW.vence_at := OLD.vence_at;
  IF NEW.soltada_at IS NOT NULL THEN
    NEW.soltada_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.una_sola_toma_por_alarma()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_la_ve boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tipo || ':' || NEW.referencia_id::text, 0));

  IF interno.usuario_de_la_sesion() IS NOT NULL THEN
    NEW.tomada_por := interno.usuario_de_la_sesion();

    IF interno.es_coordinador() THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)',
                     CASE NEW.tipo
                       WHEN 'alerta_temprana_guardia' THEN 'alertas_tempranas_guardia'
                       WHEN 'incidente_relevo' THEN 'incidentes_relevo'
                       WHEN 'incidente_turno_sin_cubrir' THEN 'incidentes_turno_sin_cubrir'
                       WHEN 'emergencia_guardia' THEN 'emergencias_guardia'
                       WHEN 'guardia_sin_cerrar' THEN 'guardias'
                     END)
        INTO v_la_ve USING NEW.referencia_id;
      IF NOT v_la_ve THEN
        RAISE EXCEPTION 'la_alarma_no_le_llega' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  NEW.tomada_at := now();
  NEW.vence_at := now() + make_interval(mins => interno.minutos_que_dura_la_toma(NEW.prestadora_id));
  NEW.soltada_at := NULL;

  IF interno.quien_tiene_la_alarma(NEW.prestadora_id, NEW.tipo, NEW.referencia_id) IS NOT NULL THEN
    RAISE EXCEPTION 'alarma_tomada_por_otra_persona' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';