-- Los turnos de guardia se asignan a un Asistente por vez, que acepta o rechaza. No se ofrecen a
-- varios ni se publican para que alguien los tome: la tabla de ofrecimientos pasa a ser la de
-- asignaciones, con un estado, y las marcas de «ofrecida» salen de las guardias.
--
-- La tabla estaba vacía y ninguna guardia tenía marca de ofrecida, así que no hay datos que
-- convertir.

-- ---------------------------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------------------------

DROP TRIGGER trg_exigir_matricula_en_oferta ON public.ofertas_guardia;
DROP TRIGGER trg_modalidad_en_oferta ON public.ofertas_guardia;
DROP FUNCTION public.exigir_matricula_en_oferta();
DROP FUNCTION public.fn_modalidad_en_oferta();

DROP POLICY panel_gestiona_ofertas_de_su_prestadora ON public.ofertas_guardia;
DROP POLICY coordinador_gestiona_ofertas_de_su_zona ON public.ofertas_guardia;
DROP POLICY asistente_ve_sus_invitaciones ON public.ofertas_guardia;
DROP POLICY asistente_contesta_su_invitacion ON public.ofertas_guardia;
DROP POLICY trabajo_sin_persona_de_esta_prestadora ON public.ofertas_guardia;

ALTER TABLE public.ofertas_guardia RENAME TO asignaciones_de_turno;
ALTER TABLE public.asignaciones_de_turno RENAME COLUMN invitado_por TO asignado_por;
ALTER TABLE public.asignaciones_de_turno RENAME COLUMN invitado_at TO asignado_at;

DROP INDEX public.idx_ofertas_guardia_sin_responder;

ALTER TABLE public.asignaciones_de_turno
  DROP CONSTRAINT ofertas_guardia_respuesta_check,
  DROP CONSTRAINT ofertas_guardia_respuesta_completa_check,
  DROP CONSTRAINT ofertas_guardia_guardia_id_asistente_id_key,
  DROP COLUMN respuesta,
  DROP COLUMN respuesta_at,
  DROP COLUMN motivo;

ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT ofertas_guardia_pkey TO asignaciones_de_turno_pkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT ofertas_guardia_asistente_id_fkey TO asignaciones_de_turno_asistente_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT ofertas_guardia_invitado_por_fkey TO asignaciones_de_turno_asignado_por_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT ofertas_guardia_prestadora_id_fkey TO asignaciones_de_turno_prestadora_id_fkey;
ALTER TABLE public.asignaciones_de_turno RENAME CONSTRAINT ofertas_guardia_guardia_id_fkey TO asignaciones_de_turno_guardia_id_fkey;

ALTER INDEX public.idx_ofertas_guardia_por_asistente RENAME TO idx_asignaciones_de_turno_por_asistente;

ALTER TABLE public.asignaciones_de_turno
  ADD COLUMN estado text NOT NULL DEFAULT 'sin_responder',
  ADD COLUMN respondida_at timestamptz,
  ADD COLUMN retirada_at timestamptz,
  ADD COLUMN retirada_por uuid REFERENCES public.usuarios(id),
  ADD CONSTRAINT asignaciones_de_turno_estado_check
    CHECK (estado IN ('sin_responder', 'aceptada', 'rechazada', 'retirada')),
  ADD CONSTRAINT asignaciones_de_turno_respondida_check
    CHECK ((respondida_at IS NOT NULL) = (estado IN ('aceptada', 'rechazada'))),
  ADD CONSTRAINT asignaciones_de_turno_retirada_check
    CHECK ((retirada_at IS NOT NULL) = (estado = 'retirada'));

-- Un turno tiene a lo sumo una asignación esperando respuesta: nunca dos personas a la vez.
CREATE UNIQUE INDEX asignaciones_de_turno_una_sin_responder_por_turno
  ON public.asignaciones_de_turno (guardia_id)
  WHERE estado = 'sin_responder';

COMMENT ON TABLE public.asignaciones_de_turno IS 'Cada vez que un turno de guardia se le asigna a un Asistente, y lo que paso despues: si lo acepto, lo rechazo o se le retiro. El motivo de un rechazo vive en resoluciones.';
COMMENT ON COLUMN public.asignaciones_de_turno.estado IS 'sin_responder al asignarse; de ahi pasa una sola vez a aceptada, rechazada o retirada.';

-- ---------------------------------------------------------------------------------------------
-- 2. Los cambios de estado
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION interno.la_asignacion_cambia_de_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF interno.usuario_de_la_sesion() IS NOT NULL THEN
      NEW.asignado_por := interno.usuario_de_la_sesion();
    END IF;
    NEW.asignado_at := now();
    NEW.respondida_at := CASE WHEN NEW.estado IN ('aceptada', 'rechazada') THEN now() END;
    NEW.retirada_at := CASE WHEN NEW.estado = 'retirada' THEN now() END;
    NEW.retirada_por := CASE WHEN NEW.estado = 'retirada' THEN interno.usuario_de_la_sesion() END;
    RETURN NEW;
  END IF;

  IF NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id
     OR NEW.guardia_id IS DISTINCT FROM OLD.guardia_id
     OR NEW.asistente_id IS DISTINCT FROM OLD.asistente_id
     OR NEW.asignado_por IS DISTINCT FROM OLD.asignado_por
     OR NEW.asignado_at IS DISTINCT FROM OLD.asignado_at THEN
    RAISE EXCEPTION 'asignacion_no_se_modifica' USING ERRCODE = '23514';
  END IF;

  NEW.respondida_at := OLD.respondida_at;
  NEW.retirada_at := OLD.retirada_at;
  NEW.retirada_por := OLD.retirada_por;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida' USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IN ('aceptada', 'rechazada') THEN
    NEW.respondida_at := now();
  ELSIF NEW.estado = 'retirada' THEN
    NEW.retirada_at := now();
    NEW.retirada_por := interno.usuario_de_la_sesion();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION interno.exigir_matricula_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_motivo text;
  v_dia    date;
BEGIN
  -- Al asignar se mira contra hoy; al aceptar, contra el final de la guardia.
  IF NEW.estado = 'aceptada'
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'aceptada') THEN
    SELECT public.dia_en_que_termina_guardia(g.fecha, g.hora_inicio, g.hora_fin)
      INTO v_dia
      FROM public.guardias g
     WHERE g.id = NEW.guardia_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_dia := CURRENT_DATE;
  ELSE
    RETURN NEW;
  END IF;

  v_motivo := interno.motivo_bloqueo_matricula(NEW.asistente_id, COALESCE(v_dia, CURRENT_DATE));

  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'matricula_bloquea:%:', v_motivo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION interno.fn_modalidad_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_modalidad text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  SELECT g.canal_modalidad INTO v_modalidad
    FROM public.guardias g
   WHERE g.id = NEW.guardia_id;

  IF v_modalidad IS NOT NULL
     AND NOT interno.asistente_trabaja_en_modalidad(NEW.asistente_id, v_modalidad) THEN
    RAISE EXCEPTION 'modalidad_bloquea:%:', v_modalidad
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.la_asignacion_cambia_de_estado() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.exigir_matricula_en_asignacion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.fn_modalidad_en_asignacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_asignacion_cambia_de_estado() TO authenticated, service_role, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.exigir_matricula_en_asignacion() TO authenticated, service_role, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.fn_modalidad_en_asignacion() TO authenticated, service_role, trabajo_sin_persona;

-- El estado se ordena primero: los otros dos miran el estado ya decidido.
CREATE TRIGGER trg_a_la_asignacion_cambia_de_estado
  BEFORE INSERT OR UPDATE ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.la_asignacion_cambia_de_estado();

CREATE TRIGGER trg_exigir_matricula_en_asignacion
  BEFORE INSERT OR UPDATE ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.exigir_matricula_en_asignacion();

CREATE TRIGGER trg_modalidad_en_asignacion
  BEFORE INSERT OR UPDATE ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.fn_modalidad_en_asignacion();

-- ---------------------------------------------------------------------------------------------
-- 3. Quién ve y quién escribe
-- ---------------------------------------------------------------------------------------------

-- Una asignación no se borra: se retira, y queda.
REVOKE DELETE ON public.asignaciones_de_turno FROM authenticated;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.asignaciones_de_turno
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE POLICY panel_gestiona_asignaciones_de_su_prestadora ON public.asignaciones_de_turno
  FOR ALL
  USING ((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'superadmin'::text]))))))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.rol = ANY (ARRAY['admin_prestadora'::text, 'superadmin'::text]))))));

CREATE POLICY coordinador_gestiona_asignaciones_de_su_zona ON public.asignaciones_de_turno
  FOR ALL
  USING ((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text)))) AND (EXISTS ( SELECT 1
     FROM guardias g
    WHERE ((g.id = asignaciones_de_turno.guardia_id) AND interno.coordinador_alcanza_guardia(g.asistente_id)))))
  WITH CHECK ((prestadora_id = interno.prestadora_actual()) AND (EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.rol = 'coordinador'::text)))));

CREATE POLICY asistente_ve_sus_asignaciones ON public.asignaciones_de_turno
  FOR SELECT
  USING ((prestadora_id = interno.prestadora_actual())
         AND (asistente_id = interno.asistente_de_la_sesion()));

-- El Asistente sólo rechaza desde acá. Aceptar es además quedarse con el turno, y eso lo hace el
-- backend en un solo paso.
CREATE POLICY asistente_rechaza_su_asignacion ON public.asignaciones_de_turno
  FOR UPDATE
  USING ((prestadora_id = interno.prestadora_actual())
         AND (asistente_id = interno.asistente_de_la_sesion())
         AND (estado = 'sin_responder'))
  WITH CHECK ((prestadora_id = interno.prestadora_actual())
              AND (asistente_id = interno.asistente_de_la_sesion())
              AND (estado = 'rechazada'));

-- El turno que se le asignó lo ve mientras decide. Se pregunta por una función que se saltea la
-- protección por fila: la política de la asignación del Coordinador ya consulta guardias, y una
-- consulta directa desde acá cerraría la vuelta.
CREATE FUNCTION interno.turno_asignado_a_la_sesion(p_guardia_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM asignaciones_de_turno a
     WHERE a.guardia_id = p_guardia_id
       AND a.prestadora_id = interno.prestadora_actual()
       AND a.asistente_id = interno.asistente_de_la_sesion()
       AND a.estado = 'sin_responder'
  )
$function$;

REVOKE ALL ON FUNCTION interno.turno_asignado_a_la_sesion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.turno_asignado_a_la_sesion(uuid) TO authenticated, service_role, trabajo_sin_persona;

DROP POLICY asistente_ve_guardias_ofrecidas ON public.guardias;

CREATE POLICY asistente_ve_turnos_que_se_le_asignaron ON public.guardias
  FOR SELECT
  USING ((prestadora_id = interno.prestadora_actual())
         AND interno.turno_asignado_a_la_sesion(id));

-- El motivo del rechazo: el Asistente lee la lista de su Prestadora y deja su resolución.
CREATE POLICY asistente_lee_motivos_de_rechazo ON public.motivos_resolucion
  FOR SELECT
  USING ((prestadora_id = interno.prestadora_actual())
         AND (tabla = 'asignaciones_de_turno')
         AND interno.es_asistente());

CREATE POLICY asistente_resuelve_su_asignacion ON public.resoluciones
  FOR INSERT
  WITH CHECK ((prestadora_id = interno.prestadora_actual())
              AND (tabla = 'asignaciones_de_turno')
              AND (EXISTS ( SELECT 1
                     FROM asignaciones_de_turno a
                    WHERE ((a.id)::text = resoluciones.fila_id)
                      AND (a.asistente_id = interno.asistente_de_la_sesion()))));

CREATE POLICY asistente_lee_sus_resoluciones ON public.resoluciones
  FOR SELECT
  USING ((prestadora_id = interno.prestadora_actual())
         AND (tabla = 'asignaciones_de_turno')
         AND (EXISTS ( SELECT 1
                FROM asignaciones_de_turno a
               WHERE ((a.id)::text = resoluciones.fila_id)
                 AND (a.asistente_id = interno.asistente_de_la_sesion()))));

-- ---------------------------------------------------------------------------------------------
-- 4. La lista de motivos de rechazo
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sembrar_motivos_resolucion(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into motivos_resolucion
    (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
  values
    -- Postulaciones.
    (p_prestadora_id, 'postulaciones', 'en_revision',
     'Pasa a revisión', 'Moves to review', 'Passa para análise', false, 10),
    (p_prestadora_id, 'postulaciones', 'aprobado',
     'Reúne lo que el puesto pide', 'Meets what the role requires', 'Atende ao que a vaga exige', false, 20),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No reúne la experiencia pedida', 'Does not have the required experience', 'Não tem a experiência exigida', false, 30),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Queda fuera de las zonas cubiertas', 'Outside the areas covered', 'Fora das áreas atendidas', false, 40),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No se presentó a la entrevista', 'Did not attend the interview', 'Não compareceu à entrevista', false, 50),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Pidió retirar su postulación', 'Asked to withdraw the application', 'Pediu para retirar a candidatura', false, 60),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Guardias. Por ahora sólo las canceladas: es la decisión que se toma mirando la Guardia y que
    -- hasta hoy no dejaba rastro. La llegada y la salida las escribe el motor cuando pasan, y no
    -- se resuelven con un motivo porque no son una decisión sino un hecho.
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Cliente la dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Paciente quedó internado', 'The Patient was admitted to hospital', 'O Paciente ficou internado', false, 20),
    (p_prestadora_id, 'guardias', 'cancelada',
     'No se consiguió quién la cubriera', 'Nobody could be found to cover it', 'Não foi possível encontrar quem cobrisse', false, 30),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Terminó el Servicio', 'The Service ended', 'O Serviço terminou', false, 40),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 50),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Por qué un Asistente rechaza el turno que se le asignó.
    (p_prestadora_id, 'asignaciones_de_turno', 'rechazada',
     'Problema de salud', 'Health problem', 'Problema de saúde', false, 10),
    (p_prestadora_id, 'asignaciones_de_turno', 'rechazada',
     'Compromiso personal o familiar', 'Personal or family commitment', 'Compromisso pessoal ou familiar', false, 20),
    (p_prestadora_id, 'asignaciones_de_turno', 'rechazada',
     'Viaje o ausencia', 'Travel or absence', 'Viagem ou ausência', false, 30),
    (p_prestadora_id, 'asignaciones_de_turno', 'rechazada',
     'Distancia al domicilio', 'Distance to the home', 'Distância até o domicílio', false, 40),
    (p_prestadora_id, 'asignaciones_de_turno', 'rechazada',
     'Otro', 'Other', 'Outro', true, 99)
  on conflict do nothing;
end;
$function$;

-- Y a las Prestadoras que ya están, la misma lista.
INSERT INTO public.motivos_resolucion
  (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
SELECT p.id, 'asignaciones_de_turno', 'rechazada', v.es, v.en, v.pt, v.detalle, v.orden
  FROM public.prestadoras p
 CROSS JOIN (VALUES
   ('Problema de salud', 'Health problem', 'Problema de saúde', false, 10),
   ('Compromiso personal o familiar', 'Personal or family commitment', 'Compromisso pessoal ou familiar', false, 20),
   ('Viaje o ausencia', 'Travel or absence', 'Viagem ou ausência', false, 30),
   ('Distancia al domicilio', 'Distance to the home', 'Distância até o domicílio', false, 40),
   ('Otro', 'Other', 'Outro', true, 99)
 ) AS v(es, en, pt, detalle, orden)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.motivos_resolucion m
    WHERE m.prestadora_id = p.id
      AND m.tabla = 'asignaciones_de_turno'
 );

-- ---------------------------------------------------------------------------------------------
-- 5. Las guardias dejan de estar «ofrecidas»
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.guardias
  DROP CONSTRAINT guardias_limite_solo_si_ofrecida_check,
  DROP CONSTRAINT guardias_ofrecida_solo_sin_cubrir_check,
  DROP CONSTRAINT guardias_ofrecida_por_fkey,
  DROP COLUMN oferta_limite_at,
  DROP COLUMN ofrecida_at,
  DROP COLUMN ofrecida_por;

-- ---------------------------------------------------------------------------------------------
-- 6. El mensaje al Coordinador por una guardia sin cubrir cuenta asignaciones, no invitaciones
-- ---------------------------------------------------------------------------------------------
-- Lo arma `backend/src/i18n/avisos.js`. Las frases viejas hablaban de ofrecer e invitar a varios a
-- la vez, y eso ya no existe.

DELETE FROM public.mensajes_del_sistema
 WHERE clave IN (
   'guardia_sin_cubrir.sin_ofrecer',
   'guardia_sin_cubrir.publicada_sin_invitar',
   'guardia_sin_cubrir.sin_contestar_uno',
   'guardia_sin_cubrir.sin_contestar_varios',
   'guardia_sin_cubrir.aceptaron_uno',
   'guardia_sin_cubrir.aceptaron_varios',
   'guardia_sin_cubrir.rechazaron_uno',
   'guardia_sin_cubrir.rechazaron_varios'
 );

insert into public.mensajes_del_sistema (clave, i18n)
values ('guardia_sin_cubrir.sin_asignar', '{"es-AR": "Sin Asistente asignado.", "en": "No care worker assigned.", "pt-BR": "Sem Assistente atribuído."}'::jsonb),
       ('guardia_sin_cubrir.sin_responder', '{"es-AR": "Asignada a un Asistente. Pendiente de respuesta.", "en": "Assigned to a care worker. Pending response.", "pt-BR": "Atribuída a um Assistente. Pendente de resposta."}'::jsonb),
       ('guardia_sin_cubrir.rechazada_una_vez', '{"es-AR": "Asignada a {{asistente}} (rechazada).", "en": "Assigned to {{asistente}} (declined).", "pt-BR": "Atribuída a {{asistente}} (recusada)."}'::jsonb),
       ('guardia_sin_cubrir.rechazada_varias_veces', '{"es-AR": "Asignada de forma secuencial a {{rechazos}}. Todos la rechazaron.", "en": "Sequentially assigned to {{rechazos}}. All declined it.", "pt-BR": "Atribuída de forma sequencial a {{rechazos}}. Todos a recusaram."}'::jsonb);

NOTIFY pgrst, 'reload schema';
