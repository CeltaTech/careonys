-- ============================================================================
-- El Asistente ve y acepta un turno asignado con su propia sesión.
--
-- Mientras no respondió, el Asistente ve del turno lo necesario para decidir: el día, el horario,
-- el barrio y el nivel de complejidad. El nombre del Paciente y el domicilio exacto, recién al
-- aceptar, cuando el turno ya es suyo y lo alcanzan las políticas de siempre.
--
-- Las dos cosas pasan por funciones de la base y no por consultas sueltas:
--
--   * `turnos_asignados_sin_responder` devuelve sólo esos datos. La política que le dejaba leer la
--     fila entera del turno se va: con ella podía ver más de lo que necesita para decidir.
--   * `aceptar_asignacion` toma el turno y anota la respuesta en un solo paso. O quedan las dos
--     cosas, o ninguna. Los disparadores de la Matrícula y de la modalidad corren igual que antes.
--
-- La Prestadora y el Asistente salen de la sesión, nunca del pedido. Sin sesión de Asistente no
-- hay nada que ver ni que aceptar: falla cerrado.
-- ============================================================================

CREATE FUNCTION public.turnos_asignados_sin_responder()
 RETURNS TABLE(
   asignacion_id uuid,
   asignado_at timestamptz,
   guardia_id uuid,
   fecha date,
   hora_inicio time,
   hora_fin time,
   dias_hasta_el_fin smallint,
   modalidad text,
   barrios text[],
   niveles_de_complejidad text[]
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT a.id,
         a.asignado_at,
         g.id,
         g.fecha,
         g.hora_inicio,
         g.hora_fin,
         g.dias_hasta_el_fin,
         g.modalidad,
         (SELECT array_agg(DISTINCT d.lugar ORDER BY d.lugar)
            FROM public.domicilios_de_pacientes_en(quienes.ids, g.fecha) d
           WHERE d.lugar IS NOT NULL),
         (SELECT array_agg(DISTINCT p.nivel_complejidad ORDER BY p.nivel_complejidad)
            FROM public.pacientes p
           WHERE p.id = ANY (quienes.ids)
             AND p.prestadora_id = g.prestadora_id
             AND p.nivel_complejidad IS NOT NULL)
    FROM asignaciones_de_turno a
    JOIN guardias g
      ON g.id = a.guardia_id
     AND g.prestadora_id = a.prestadora_id
   -- A quiénes atiende el turno: la lista de la guardia, o el Paciente de la columna vieja si la
   -- lista está vacía (la misma red que `pacientesDeGuardias` del backend).
   CROSS JOIN LATERAL (
     SELECT CASE WHEN count(gp.paciente_id) > 0
                 THEN array_agg(gp.paciente_id)
                 ELSE array_remove(ARRAY[g.paciente_id], NULL)
            END AS ids
       FROM guardia_pacientes gp
      WHERE gp.guardia_id = g.id
        AND gp.prestadora_id = g.prestadora_id
   ) quienes
   WHERE a.prestadora_id = interno.prestadora_actual()
     AND a.asistente_id = interno.asistente_de_la_sesion()
     AND a.estado = 'sin_responder'
     AND g.estado = 'programada'
     AND g.asistente_id IS NULL
   ORDER BY a.asignado_at DESC
   LIMIT 50
$function$;

REVOKE ALL ON FUNCTION public.turnos_asignados_sin_responder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.turnos_asignados_sin_responder() TO authenticated;

CREATE FUNCTION public.aceptar_asignacion(p_asignacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_asistente  uuid := interno.asistente_de_la_sesion();
  v_asignacion public.asignaciones_de_turno;
  v_tomadas    integer;
BEGIN
  IF v_prestadora IS NULL OR v_asistente IS NULL THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  -- Si no es suya, para el Asistente no existe: se contesta lo mismo que a un número mal escrito.
  SELECT * INTO v_asignacion
    FROM asignaciones_de_turno
   WHERE id = p_asignacion_id
     AND prestadora_id = v_prestadora
     AND asistente_id = v_asistente
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada';
  END IF;

  IF v_asignacion.estado <> 'sin_responder' THEN
    RAISE EXCEPTION 'asignacion_ya_respondida';
  END IF;

  -- Primero se toma el turno y después se anota la respuesta. Si el turno ya no está libre, no
  -- queda anotado que aceptó uno que no tiene.
  UPDATE guardias
     SET asistente_id = v_asistente
   WHERE id = v_asignacion.guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'programada'
     AND asistente_id IS NULL;

  GET DIAGNOSTICS v_tomadas = ROW_COUNT;
  IF v_tomadas = 0 THEN
    RAISE EXCEPTION 'guardia_ya_cubierta';
  END IF;

  UPDATE asignaciones_de_turno
     SET estado = 'aceptada'
   WHERE id = v_asignacion.id;

  RETURN v_asignacion.guardia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.aceptar_asignacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_asignacion(uuid) TO authenticated;

DROP POLICY asistente_ve_turnos_que_se_le_asignaron ON public.guardias;
DROP FUNCTION interno.turno_asignado_a_la_sesion(uuid);

NOTIFY pgrst, 'reload schema';
