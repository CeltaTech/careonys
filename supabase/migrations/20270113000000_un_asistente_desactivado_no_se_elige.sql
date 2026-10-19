-- Un Asistente desactivado no se elige, y no se desactiva con turnos sin terminar.
--
-- 1. Qué turnos traban la desactivación. Un turno cuenta como terminado si tiene registrado el
--    fin del turno (el Asistente se fue) o si tiene un cierre hecho desde el Panel. Traba el que no
--    tiene ninguna de las dos cosas, salvo que esté cancelado o marcado como ausencia. Traban
--    también las series vigentes asignadas a esa persona, activas o pausadas. La lista la arma una
--    sola función, que usan la desactivación y el Backend para decir cuáles son.
--
-- 2. Quién está desactivado. Lo dice la cuenta de ingreso del Asistente, que vive en `usuarios`.
--    Esa fila no la ve la administración ni la coordinación, así que la pregunta la contesta una
--    función que se saltea la RLS y devuelve sólo sí o no, y nunca sobre otra Prestadora.
--
-- 3. Un Asistente desactivado no recibe turnos. Lo hace cumplir la base, en cada tabla donde se
--    asigna a alguien: turnos, guardias, series, personal de emergencia y equipo del Cliente.
--
-- 4. El Padrón de la coordinación no lo muestra. Su historia sigue entera: lo que se oculta es la
--    vista del Padrón, no la tabla.
--
-- 5. La reactivación alcanza también a los Asistentes.

BEGIN;

-- 2. ¿Está desactivado este Asistente? ----------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.asistente_desactivado(p_asistente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM asistentes a
      JOIN usuarios u ON u.id = a.usuario_id AND u.prestadora_id = a.prestadora_id
     WHERE a.id = p_asistente
       AND u.desactivada_en IS NOT NULL);
$function$;

REVOKE ALL ON FUNCTION interno.asistente_desactivado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.asistente_desactivado(uuid) TO authenticated, service_role, trabajo_sin_persona;

-- El mismo dato como columna calculada de `asistentes`, para filtrar desde la interfaz y desde el
-- Backend. Sobre un Asistente de otra Prestadora contesta siempre que no: no informa nada.
CREATE OR REPLACE FUNCTION public.cuenta_desactivada(a public.asistentes)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN interno.prestadora_actual() IS NOT NULL
         AND interno.prestadora_actual() IS DISTINCT FROM a.prestadora_id THEN false
    ELSE interno.asistente_desactivado(a.id)
  END;
$function$;

REVOKE ALL ON FUNCTION public.cuenta_desactivada(public.asistentes) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cuenta_desactivada(public.asistentes) TO authenticated, service_role, trabajo_sin_persona;

-- 1. Los turnos que traban la desactivación -----------------------------------------------------
CREATE OR REPLACE FUNCTION interno.turnos_que_traban_la_desactivacion(p_usuario uuid, p_prestadora uuid)
 RETURNS TABLE (
   tipo text,
   id uuid,
   fecha date,
   hora_inicio time,
   hora_fin time,
   dias_hasta_el_fin smallint,
   checkin_at timestamptz,
   cliente text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT 'guardia'::text, g.id, g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin,
         g.checkin_at, pe.nombre_visible
    FROM asistentes a
    JOIN guardias g ON g.asistente_id = a.id AND g.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = g.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND g.estado NOT IN ('cancelada', 'ausente')
     AND g.checkout_at IS NULL
     AND g.cerrada_at IS NULL
  UNION ALL
  SELECT 'serie'::text, s.id, s.vigente_desde, s.hora_inicio, s.hora_fin, s.dias_hasta_el_fin,
         NULL::timestamptz, pe.nombre_visible
    FROM asistentes a
    JOIN series_guardias s ON s.asistente_id = a.id AND s.prestadora_id = p_prestadora
    LEFT JOIN pacientes p ON p.id = s.paciente_id
    LEFT JOIN personas pe ON pe.id = p.persona_id
   WHERE a.usuario_id = p_usuario
     AND a.prestadora_id = p_prestadora
     AND s.estado IN ('activa', 'pausada')
     AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= current_date - 1)
   ORDER BY 3, 4;
$function$;

REVOKE ALL ON FUNCTION interno.turnos_que_traban_la_desactivacion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION interno.turnos_que_traban_la_desactivacion(uuid, uuid) TO service_role, trabajo_sin_persona;

-- La entrada del Backend: sólo para el trabajo de una Prestadora, y sólo sobre ella.
CREATE OR REPLACE FUNCTION public.turnos_que_traban_la_desactivacion(p_usuario uuid)
 RETURNS TABLE (
   tipo text,
   id uuid,
   fecha date,
   hora_inicio time,
   hora_fin time,
   dias_hasta_el_fin smallint,
   checkin_at timestamptz,
   cliente text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM interno.turnos_que_traban_la_desactivacion(p_usuario, v_prestadora);
END;
$function$;

REVOKE ALL ON FUNCTION public.turnos_que_traban_la_desactivacion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.turnos_que_traban_la_desactivacion(uuid) TO service_role, trabajo_sin_persona;

-- La desactivación usa la misma lista -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desactivar_la_cuenta(p_usuario uuid, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''), E' \t\r\n');
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'trabajo_sin_persona' THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL OR p_usuario IS NULL OR v_motivo = '' THEN RETURN false; END IF;

  -- Turnos sin terminar: se reasignan o se cierran antes, y la cuenta queda como estaba.
  IF EXISTS (SELECT 1 FROM interno.turnos_que_traban_la_desactivacion(p_usuario, v_prestadora)) THEN
    RAISE EXCEPTION 'desactivacion_con_turnos_por_delante';
  END IF;

  UPDATE usuarios
     SET desactivada_en = now(),
         motivo_de_la_desactivacion = v_motivo
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente', 'cliente')
     AND desactivada_en IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  -- La cuenta de ingreso queda bloqueada: no entra con la clave, no renueva la sesión y no canjea
  -- ningún enlace. El bloqueo no lo levanta un cambio de clave.
  UPDATE auth.users
     SET banned_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_usuario;

  -- Las sesiones abiertas se cierran ahora y no cuando venzan.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;

  -- Lo que tenía pendiente para entrar o cambiar la clave deja de servir.
  UPDATE tokens_activacion_cuenta SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE tokens_recuperacion_clave SET usado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL;
  UPDATE cambios_de_clave_habilitados SET anulado_en = now()
   WHERE usuario_id = p_usuario AND usado_en IS NULL AND anulado_en IS NULL;
  UPDATE codigos_al_telefono SET anulado_en = now()
   WHERE usuario_id = p_usuario AND verificado_en IS NULL AND anulado_en IS NULL;
  UPDATE equipos_conocidos SET revocado_en = now()
   WHERE usuario_id = p_usuario AND revocado_en IS NULL;

  -- La responsabilidad del reclutamiento queda libre, como quedaba al borrar la cuenta.
  UPDATE configuracion_reclutamiento SET responsable_id = NULL
   WHERE responsable_id = p_usuario AND prestadora_id = v_prestadora;

  RETURN true;
END;
$function$;

-- 5. La reactivación alcanza a los Asistentes ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivar_la_cuenta(p_usuario uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_quien uuid := auth.uid();
  v_rol text;
  v_email text;
  v_nombre_de_usuario text;
BEGIN
  IF v_quien IS NULL OR p_usuario IS NULL THEN RETURN false; END IF;
  IF NOT coalesce(interno.es_admin_prestadora(), false) THEN RETURN false; END IF;
  v_prestadora := interno.prestadora_actual();
  IF v_prestadora IS NULL THEN RETURN false; END IF;

  SELECT rol, lower(email), lower(nombre_de_usuario)
    INTO v_rol, v_email, v_nombre_de_usuario
    FROM usuarios
   WHERE id = p_usuario
     AND prestadora_id = v_prestadora
     AND rol IN ('coordinador', 'asistente')
     AND desactivada_en IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_nombre_de_usuario IS NOT NULL AND EXISTS (
    SELECT 1 FROM usuarios
     WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
       AND desactivada_en IS NULL AND id <> p_usuario) THEN
    RAISE EXCEPTION 'reactivacion_usuario_en_uso';
  END IF;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM usuarios
     WHERE prestadora_id = v_prestadora AND lower(email) = v_email
       AND desactivada_en IS NULL AND id <> p_usuario) THEN
    RAISE EXCEPTION 'reactivacion_correo_en_uso';
  END IF;

  BEGIN
    UPDATE usuarios
       SET desactivada_en = NULL,
           motivo_de_la_desactivacion = NULL
     WHERE id = p_usuario;
  EXCEPTION WHEN unique_violation THEN
    -- Otra cuenta tomó el nombre o el email entre la comprobación y la escritura: el índice decide.
    IF v_nombre_de_usuario IS NOT NULL AND EXISTS (
      SELECT 1 FROM usuarios
       WHERE lower(nombre_de_usuario) = v_nombre_de_usuario
         AND desactivada_en IS NULL AND id <> p_usuario) THEN
      RAISE EXCEPTION 'reactivacion_usuario_en_uso';
    END IF;
    RAISE EXCEPTION 'reactivacion_correo_en_uso';
  END;

  -- La cuenta de ingreso vuelve a entrar con la clave que tenía.
  UPDATE auth.users
     SET banned_until = NULL,
         updated_at = now()
   WHERE id = p_usuario;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prestadora, v_quien, 'reactivacion_de_cuenta', 'usuarios', p_usuario,
          jsonb_build_object('rol_nuevo', v_rol));

  RETURN true;
END;
$function$;

-- 3. Un Asistente desactivado no recibe turnos --------------------------------------------------
CREATE OR REPLACE FUNCTION interno.no_se_asigna_un_asistente_desactivado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.asistente_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id THEN RETURN NEW; END IF;
  IF interno.asistente_desactivado(NEW.asistente_id) THEN
    RAISE EXCEPTION 'asistente_no_encontrado';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.no_se_asigna_un_asistente_desactivado() FROM PUBLIC, anon;

CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();
CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();
CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.series_guardias
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();
CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.personal_emergencia
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();
CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.equipo_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();

-- 4. El Padrón de la coordinación no muestra a los desactivados ---------------------------------
CREATE OR REPLACE VIEW public.asistentes_coordinador WITH (security_invoker = true) AS
 SELECT id,
    nombre,
    telefono,
    email,
    foto_url,
    disponibilidad,
    estado,
    qr_token,
    fecha_alta,
    created_at,
    updated_at,
    deleted_at,
    dni,
    tipo_asistente_id,
    numero_legajo,
    documento_tipo,
    documento_numero,
    documento_pais,
    genero
   FROM asistentes
  WHERE NOT public.cuenta_desactivada(asistentes);

COMMIT;

NOTIFY pgrst, 'reload schema';
