-- EL ASISTENTE Y EL CLIENTE ESCRIBEN SÓLO LO SUYO.
--
-- Sigue a 20270220000012. En estas cinco tablas la política alcanzaba la fila, y con eso la persona
-- podía reescribir cualquier columna de ella:
--
--  · la guardia: el Asistente marca la salida, la llegada, el cierre y el punto del viaje. Con la
--    política sola podía cambiarse la fecha, el horario, el Paciente, cancelarla, reabrirla o
--    escribir a mano la hora de llegada.
--  · la asignación de un turno: el Asistente la rechaza, y nada más.
--  · la calificación: el Asistente carga su descargo, una vez. Podía cambiar las estrellas. Y el
--    Cliente podía escribir el descargo, borrar calificaciones y calificar a un Asistente que no
--    tuvo nunca.
--  · el reporte: el Asistente lo carga y lo lee. Podía reescribirlo y borrarlo.
--  · la suscripción a las notificaciones: la guarda el trabajo sin persona; la persona sólo la da
--    de baja.
--
-- En la guardia y en la asignación el permiso por columna no alcanza, porque el Panel escribe
-- casi todas con el mismo rol. Lo resuelve un disparador que mira quién escribe: si no es personal
-- de la Prestadora, sólo pasan las columnas de la persona. Corre con el rol de quien escribe, como
-- manda la regla de los disparadores, y el trabajo sin persona sigue igual porque es otro rol.
-- Las funciones que el Asistente llama con privilegio de dueño —aceptar una asignación— tampoco
-- cambian: ahí el rol que escribe es el dueño.
--
-- Los nombres de los disparadores empiezan antes que los demás de cada tabla a propósito: se
-- disparan en orden alfabético, y éste tiene que ver lo que mandó la persona, no lo que otro
-- disparador completó después.

-- ---- El control genérico: sólo cambian las columnas que se nombran ----
CREATE FUNCTION interno.la_persona_cambia_solo_estas_columnas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF interno.es_personal_de_la_prestadora() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_persona_cambia_solo_estas_columnas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_persona_cambia_solo_estas_columnas()
  TO authenticated, trabajo_sin_persona, service_role;

-- ---- La guardia ----
-- Además de qué columnas, cómo: cada marca se hace una vez, la hora la pone la base, y el estado
-- sólo pasa a empezada al llegar y a terminada al cerrar.
CREATE FUNCTION interno.el_asistente_marca_solo_su_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE
  v_suyas constant text[] := ARRAY[
    'salida_checkin_at', 'salida_lat', 'salida_lng', 'medio_transporte',
    'checkin_at', 'checkin_lat', 'checkin_lng',
    'checkout_at', 'checkout_lat', 'checkout_lng',
    'estado',
    'ubicacion_actual_lat', 'ubicacion_actual_lng', 'ubicacion_actual_at',
    'push_llegada_enviado_at', 'push_reporte_enviado_at'
  ];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF interno.es_personal_de_la_prestadora() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_suyas) IS DISTINCT FROM (to_jsonb(OLD) - v_suyas) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La salida, la llegada y el cierre: se marcan una vez, con todo lo suyo, y no se reescriben.
  IF (NEW.salida_checkin_at, NEW.salida_lat, NEW.salida_lng, NEW.medio_transporte)
       IS DISTINCT FROM (OLD.salida_checkin_at, OLD.salida_lat, OLD.salida_lng, OLD.medio_transporte)
     AND (OLD.salida_checkin_at IS NOT NULL OR NEW.salida_checkin_at IS NULL) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkin_at, NEW.checkin_lat, NEW.checkin_lng)
       IS DISTINCT FROM (OLD.checkin_at, OLD.checkin_lat, OLD.checkin_lng)
     AND (OLD.checkin_at IS NOT NULL OR NEW.checkin_at IS NULL OR NEW.estado IS DISTINCT FROM 'activa') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkout_at, NEW.checkout_lat, NEW.checkout_lng)
       IS DISTINCT FROM (OLD.checkout_at, OLD.checkout_lat, OLD.checkout_lng)
     AND (OLD.checkout_at IS NOT NULL OR NEW.checkout_at IS NULL OR NEW.estado IS DISTINCT FROM 'completada') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- El estado: a empezada al llegar, desde una guardia que todavía no empezó y no se canceló; a
  -- terminada al cerrar, desde una empezada. Ningún otro cambio es del Asistente.
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (
       (NEW.estado = 'activa' AND OLD.estado IN ('programada', 'ausente', 'pausada')
          AND OLD.checkin_at IS NULL AND NEW.checkin_at IS NOT NULL)
       OR
       (NEW.estado = 'completada' AND OLD.estado = 'activa'
          AND OLD.checkout_at IS NULL AND NEW.checkout_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- Los avisos ya mandados no se desmarcan: desmarcarlos los volvería a mandar.
  IF (OLD.push_llegada_enviado_at IS NOT NULL AND NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at)
     OR (OLD.push_reporte_enviado_at IS NOT NULL AND NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La hora de cada marca es la de la base, no la que mande el teléfono.
  IF NEW.salida_checkin_at IS DISTINCT FROM OLD.salida_checkin_at THEN NEW.salida_checkin_at := now(); END IF;
  IF NEW.checkin_at IS DISTINCT FROM OLD.checkin_at THEN NEW.checkin_at := now(); END IF;
  IF NEW.checkout_at IS DISTINCT FROM OLD.checkout_at THEN NEW.checkout_at := now(); END IF;
  IF NEW.ubicacion_actual_at IS NOT NULL AND NEW.ubicacion_actual_at IS DISTINCT FROM OLD.ubicacion_actual_at THEN
    NEW.ubicacion_actual_at := now();
  END IF;
  IF NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at THEN NEW.push_llegada_enviado_at := now(); END IF;
  IF NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at THEN NEW.push_reporte_enviado_at := now(); END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.el_asistente_marca_solo_su_guardia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_asistente_marca_solo_su_guardia()
  TO authenticated, trabajo_sin_persona, service_role;

CREATE TRIGGER asistente_marca_solo_su_guardia
  BEFORE UPDATE ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.el_asistente_marca_solo_su_guardia();

-- ---- La asignación de un turno: el Asistente sólo cambia el estado ----
-- Qué estado, lo dice la política: de sin responder a rechazada. La fecha de la respuesta la
-- completa el disparador de la tabla, que corre después.
CREATE TRIGGER asistente_responde_solo_el_estado
  BEFORE UPDATE ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_cambia_solo_estas_columnas('estado');

-- ---- La calificación ----
-- El Asistente carga el descargo, una sola vez y no vacío.
CREATE TRIGGER asistente_carga_solo_su_descargo
  BEFORE UPDATE ON public.calificaciones_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_cambia_solo_estas_columnas('descargo_asistente', 'descargo_en');

DROP POLICY IF EXISTS asistente_carga_su_descargo ON public.calificaciones_asistente;
CREATE POLICY asistente_carga_su_descargo ON public.calificaciones_asistente
  FOR UPDATE TO authenticated
  USING (asistente_id = interno.asistente_de_la_sesion() AND descargo_asistente IS NULL)
  WITH CHECK (asistente_id = interno.asistente_de_la_sesion() AND descargo_asistente IS NOT NULL);

-- El Cliente califica y ve lo que calificó. No modifica ni borra, y califica solamente al
-- Asistente de una guardia de un Paciente suyo, por ese Paciente. El Cliente no lee la tabla de
-- guardias, así que quién la hizo se lo dice una función, y sólo de la Prestadora de la sesión.
CREATE FUNCTION interno.asistente_de_la_guardia(p_guardia uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT g.asistente_id FROM public.guardias g
   WHERE g.id = p_guardia AND g.prestadora_id = interno.prestadora_actual();
$$;

REVOKE ALL ON FUNCTION interno.asistente_de_la_guardia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.asistente_de_la_guardia(uuid) TO authenticated;

DROP POLICY IF EXISTS cliente_gestiona_sus_calificaciones ON public.calificaciones_asistente;
CREATE POLICY cliente_ve_sus_calificaciones ON public.calificaciones_asistente
  FOR SELECT TO authenticated
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente')
  );
CREATE POLICY cliente_califica_al_asistente ON public.calificaciones_asistente
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente')
    AND prestadora_id = interno.prestadora_actual()
    AND paciente_id IN (SELECT interno.pacientes_del_cliente())
    AND paciente_id IN (SELECT interno.pacientes_de_la_guardia(guardia_id))
    AND asistente_id = interno.asistente_de_la_guardia(guardia_id)
  );

REVOKE INSERT ON public.calificaciones_asistente FROM authenticated;
GRANT INSERT (asistente_id, paciente_id, cliente_id, guardia_id, prestadora_id, estrellas, comentario)
  ON public.calificaciones_asistente TO authenticated;
-- El Panel cambia la visibilidad; el Asistente, su descargo.
REVOKE UPDATE ON public.calificaciones_asistente FROM authenticated;
GRANT UPDATE (visible_publica, descargo_asistente, descargo_en) ON public.calificaciones_asistente TO authenticated;

-- ---- El reporte: el Asistente lo carga y lo lee ----
DROP POLICY IF EXISTS asistente_gestiona_reportes_de_su_guardia ON public.reportes;
CREATE POLICY asistente_lee_reportes_de_su_guardia ON public.reportes
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = reportes.guardia_id AND g.asistente_id = interno.asistente_de_la_sesion())
  );
CREATE POLICY asistente_carga_reportes_de_su_guardia ON public.reportes
  FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = reportes.guardia_id AND g.asistente_id = interno.asistente_de_la_sesion())
  );

-- ---- La suscripción a las notificaciones: la persona sólo la ve y la da de baja ----
DROP POLICY IF EXISTS asistente_gestiona_sus_push_subscriptions ON public.push_subscriptions;
CREATE POLICY asistente_ve_sus_push_subscriptions ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (asistente_id = interno.asistente_de_la_sesion());
CREATE POLICY asistente_borra_sus_push_subscriptions ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (asistente_id = interno.asistente_de_la_sesion());

DROP POLICY IF EXISTS cliente_gestiona_sus_push_subscriptions ON public.push_subscriptions;
CREATE POLICY cliente_ve_sus_push_subscriptions ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (cliente_id = interno.cliente_id_de_usuario(auth.uid()));
CREATE POLICY cliente_borra_sus_push_subscriptions ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (cliente_id = interno.cliente_id_de_usuario(auth.uid()));

REVOKE INSERT, UPDATE ON public.push_subscriptions FROM authenticated;

NOTIFY pgrst, 'reload schema';
