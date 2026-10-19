-- Una cuenta con turnos de guardia por delante no se desactiva.
--
-- Primero se le quitan los turnos, que después se asignan a otro Asistente. Cuentan las guardias
-- que no terminaron —ni completadas, ni cerradas, ni canceladas, ni marcadas como ausencia— desde
-- ayer en adelante, y las series vigentes asignadas a esa persona. Desde ayer y no desde hoy porque
-- la Prestadora no guarda su huso horario: el día de más hace que el control falle cerrado.
--
-- Hoy el Panel sólo desactiva cuentas de coordinación, que no tienen turnos: el control queda en la
-- base como resguardo para cualquier baja de un Asistente, y sale como el motivo
-- `desactivacion_con_turnos_por_delante`.

BEGIN;

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

  -- Turnos por delante: se le quitan antes, y la cuenta queda como estaba.
  IF EXISTS (
    SELECT 1
      FROM asistentes a
     WHERE a.usuario_id = p_usuario
       AND a.prestadora_id = v_prestadora
       AND (
         EXISTS (
           SELECT 1 FROM guardias g
            WHERE g.asistente_id = a.id
              AND g.prestadora_id = v_prestadora
              AND g.estado NOT IN ('completada', 'cancelada', 'ausente')
              AND g.cerrada_at IS NULL
              AND g.fecha >= current_date - 1)
         OR EXISTS (
           SELECT 1 FROM series_guardias s
            WHERE s.asistente_id = a.id
              AND s.prestadora_id = v_prestadora
              AND s.estado IN ('activa', 'pausada')
              AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= current_date - 1))
       )
  ) THEN
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

REVOKE ALL ON FUNCTION public.desactivar_la_cuenta(uuid, text) FROM PUBLIC, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
