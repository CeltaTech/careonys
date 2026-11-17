-- La Coordinadora ve los Asistentes de su zona y la distancia sin ver el domicilio.
--
-- Qué hace y por qué:
--
-- 1. La distancia de cada Asistente hasta el Paciente la calcula la base. Hasta ahora el Panel
--    la medía con las coordenadas del domicilio del Asistente, y esas coordenadas sólo las lee
--    quien tiene el permiso de ver el domicilio, reservado de fábrica a la administración. Así la
--    Coordinadora sin ese permiso se quedaba sin distancia. Ahora el Panel pide la distancia ya
--    calculada y el domicilio no sale de la base. La distancia va redondeada a cien metros: con
--    distancias exactas a varias casas conocidas se podría reconstruir dónde vive el Asistente.
--
-- 2. El Padrón deja de leerse entero. La Coordinadora lee a los Asistentes de su zona (eso ya lo
--    daba otra política, que sigue), a los que trabajan o trabajaron en los Servicios que
--    coordina o en una guardia cuya alarma tomó (para que cada guardia siga mostrando su nombre),
--    y al Padrón entero sólo mientras tenga a la vista una emergencia abierta: un turno que se
--    quedó sin Asistente, una alerta temprana de un turno o una emergencia en guardia, de sus
--    Servicios o de las que llegaron a todos los Coordinadores. En ese momento tiene que poder
--    cubrir el turno con cualquiera.
--
-- 3. Las calificaciones de los Asistentes dejan de leerlas todo el personal. Las lee la
--    administración, y la Coordinadora sólo las de los Asistentes de su zona o las de una guardia
--    que ella ve. La misma condición rige para cambiar si una calificación se muestra.
--
-- Qué se borra: la política que dejaba a todo Coordinador leer el Padrón entero. Se comprobó
-- antes que la lectura de la zona ya la da otra política, y que ninguna función de asignación
-- depende de leer Asistentes fuera de la zona: la asignación normal ya rechaza a quien no es de
-- su zona, y la reasignación por emergencia queda cubierta por la condición de la emergencia.
-- Cómo se vuelve atrás: otra migración que cree de nuevo esa política con la condición de la
-- Prestadora actual y el rol de Coordinador.

-- ---------------------------------------------------------------------------------------------
-- 1. La distancia
-- ---------------------------------------------------------------------------------------------

-- La distancia en línea recta entre dos puntos, en metros. Es la cuenta de siempre sobre la
-- esfera terrestre, escrita una sola vez.
CREATE OR REPLACE FUNCTION interno.metros_en_linea_recta(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision
  LANGUAGE sql IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
         ));
$$;

REVOKE ALL ON FUNCTION interno.metros_en_linea_recta(double precision, double precision, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.metros_en_linea_recta(double precision, double precision, double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION interno.metros_en_linea_recta(double precision, double precision, double precision, double precision) TO authenticated;

-- Lee el domicilio de cada Asistente con los permisos del dueño y devuelve sólo la distancia al
-- Paciente más cercano, redondeada a cien metros. No recibe coordenadas: recibe Asistentes y
-- Pacientes, y sólo de la Prestadora de la sesión. Qué Asistentes y qué Pacientes puede pedir
-- quien llama lo decide la función pública de abajo, con los permisos de esa persona.
CREATE OR REPLACE FUNCTION interno.distancias_de_asistentes_a_pacientes(
  p_asistentes uuid[], p_pacientes uuid[], p_fecha date
) RETURNS TABLE (asistente_id uuid, metros integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  WITH prestadora AS (
    SELECT interno.prestadora_actual() AS id
  ),
  casas AS (
    SELECT d.lat, d.lng
      FROM public.domicilios_de_pacientes_en(p_pacientes, p_fecha) d
      JOIN pacientes p ON p.id = d.paciente_id
     WHERE p.prestadora_id = (SELECT id FROM prestadora)
       AND d.lat IS NOT NULL AND d.lng IS NOT NULL
  )
  SELECT da.asistente_id,
         (round(min(interno.metros_en_linea_recta(da.lat, da.lng, c.lat, c.lng)) / 100.0) * 100)::integer
    FROM domicilio_asistente da
    CROSS JOIN casas c
   WHERE (SELECT id FROM prestadora) IS NOT NULL
     AND da.prestadora_id = (SELECT id FROM prestadora)
     AND da.asistente_id = ANY (p_asistentes)
     AND da.lat IS NOT NULL AND da.lng IS NOT NULL
   GROUP BY da.asistente_id;
$$;

REVOKE ALL ON FUNCTION interno.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) FROM anon;
GRANT EXECUTE ON FUNCTION interno.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) TO authenticated;

-- La que llama el Panel. Corre con los permisos de quien llama: los Asistentes salen de lo que la
-- protección por fila le deja ver del Padrón, y los Pacientes de lo que le deja ver de sus
-- domicilios. Sólo contesta al personal de la Prestadora; a cualquier otro, nada.
CREATE OR REPLACE FUNCTION public.distancias_de_asistentes_a_pacientes(
  p_asistentes uuid[], p_pacientes uuid[], p_fecha date
) RETURNS TABLE (asistente_id uuid, metros integer)
  LANGUAGE sql STABLE
  SET search_path TO 'public', 'interno'
AS $$
  SELECT x.asistente_id, x.metros
    FROM interno.distancias_de_asistentes_a_pacientes(
           ARRAY(SELECT a.id FROM public.asistentes a
                  WHERE a.id = ANY (p_asistentes)
                    AND a.prestadora_id = interno.prestadora_actual()),
           ARRAY(SELECT d.paciente_id FROM public.domicilios_de_pacientes_en(p_pacientes, p_fecha) d),
           p_fecha
         ) x
   WHERE interno.es_personal_de_la_prestadora();
$$;

REVOKE ALL ON FUNCTION public.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) FROM anon;
GRANT EXECUTE ON FUNCTION public.distancias_de_asistentes_a_pacientes(uuid[], uuid[], date) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. El Padrón
-- ---------------------------------------------------------------------------------------------

-- Los Asistentes que trabajan o trabajaron con la Coordinadora de la sesión: los de las guardias,
-- las series y los turnos ofrecidos de los Servicios que coordina (o, en una guardia sin
-- Servicio, de los Pacientes que ve), y los de las guardias cuya alarma tomó.
CREATE OR REPLACE FUNCTION interno.asistentes_que_trabajan_con_el_coordinador()
  RETURNS uuid[]
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_servicios uuid[];
  v_tomadas uuid[];
  v_asistentes uuid[];
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN '{}';
  END IF;

  SELECT coalesce(array_agg(s.id), '{}') INTO v_servicios
    FROM servicios s
   WHERE s.prestadora_id = v_prestadora
     AND s.coordinador_id = ANY (interno.coordinadores_que_represento());

  v_tomadas := interno.guardias_a_la_vista_por_una_alarma(true);

  SELECT coalesce(array_agg(DISTINCT x.asistente_id), '{}') INTO v_asistentes
    FROM (
      SELECT g.asistente_id
        FROM guardias g
       WHERE g.prestadora_id = v_prestadora
         AND g.asistente_id IS NOT NULL
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_la_guardia_de(NULL, g.paciente_id, g.id)))
      UNION
      SELECT sg.asistente_id
        FROM series_guardias sg
       WHERE sg.prestadora_id = v_prestadora
         AND sg.asistente_id IS NOT NULL
         AND (sg.servicio_id = ANY (v_servicios)
              OR (sg.servicio_id IS NULL
                  AND interno.coordinador_alcanza_la_serie_de(NULL, sg.paciente_id, sg.id)))
      UNION
      SELECT t.asistente_id
        FROM asignaciones_de_turno t
        JOIN guardias g ON g.id = t.guardia_id AND g.prestadora_id = t.prestadora_id
       WHERE t.prestadora_id = v_prestadora
         AND (g.servicio_id = ANY (v_servicios)
              OR g.id = ANY (v_tomadas)
              OR (g.servicio_id IS NULL
                  AND interno.coordinador_alcanza_la_guardia_de(NULL, g.paciente_id, g.id)))
    ) x;

  RETURN v_asistentes;
END;
$$;

REVOKE ALL ON FUNCTION interno.asistentes_que_trabajan_con_el_coordinador() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.asistentes_que_trabajan_con_el_coordinador() FROM anon;
GRANT EXECUTE ON FUNCTION interno.asistentes_que_trabajan_con_el_coordinador() TO authenticated;

-- Verdadero mientras la Coordinadora de la sesión tenga a la vista una emergencia abierta: un
-- turno que se quedó sin Asistente, una alerta temprana de un turno o una emergencia en guardia,
-- de un Servicio suyo o de las que llegaron a todos los Coordinadores o ella tomó.
CREATE OR REPLACE FUNCTION interno.coordinador_tiene_una_emergencia_abierta()
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_coordinador() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM emergencias_guardia e
             JOIN guardias g ON g.id = e.guardia_id AND g.prestadora_id = e.prestadora_id
            WHERE e.prestadora_id = v_prestadora
              AND e.atendida_at IS NULL
              AND (e.id = ANY (interno.alarmas_a_la_vista_del_coordinador('emergencia_guardia'))
                   OR interno.coordinador_alcanza_la_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM incidentes_turno_sin_cubrir i
             JOIN guardias g ON g.id = i.guardia_id AND g.prestadora_id = i.prestadora_id
            WHERE i.prestadora_id = v_prestadora
              AND i.resuelto_at IS NULL
              AND (i.id = ANY (interno.alarmas_a_la_vista_del_coordinador('incidente_turno_sin_cubrir'))
                   OR interno.coordinador_alcanza_la_guardia_de(g.servicio_id, g.paciente_id, g.id)))
      OR EXISTS (
           SELECT 1 FROM alertas_tempranas_guardia a
             JOIN guardias g ON g.id = a.guardia_id AND g.prestadora_id = a.prestadora_id
            WHERE a.prestadora_id = v_prestadora
              AND a.resuelto_at IS NULL
              AND (a.id = ANY (interno.alarmas_a_la_vista_del_coordinador('alerta_temprana_guardia'))
                   OR interno.coordinador_alcanza_la_guardia_de(g.servicio_id, g.paciente_id, g.id)));
END;
$$;

REVOKE ALL ON FUNCTION interno.coordinador_tiene_una_emergencia_abierta() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.coordinador_tiene_una_emergencia_abierta() FROM anon;
GRANT EXECUTE ON FUNCTION interno.coordinador_tiene_una_emergencia_abierta() TO authenticated;

DROP POLICY IF EXISTS coordinador_lee_el_padron_de_asistentes ON public.asistentes;

-- Las dos funciones van entre paréntesis con SELECT para que la base las calcule una sola vez por
-- consulta y no una vez por cada Asistente.
CREATE POLICY coordinador_lee_asistentes_de_sus_servicios ON public.asistentes
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      id = ANY ((SELECT interno.asistentes_que_trabajan_con_el_coordinador())::uuid[])
      OR (SELECT interno.coordinador_tiene_una_emergencia_abierta())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- 3. Las calificaciones
-- ---------------------------------------------------------------------------------------------

-- Quién del personal ve una calificación: la administración, todas; la Coordinadora, las de los
-- Asistentes de su zona y las de una guardia que ella ve.
CREATE OR REPLACE FUNCTION interno.personal_ve_la_calificacion(p_asistente uuid, p_guardia uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR (interno.es_coordinador()
          AND ((p_asistente IS NOT NULL AND interno.coordinador_alcanza_asistente(p_asistente))
               OR (p_guardia IS NOT NULL AND interno.coordinador_ve_la_guardia(p_guardia))));
$$;

REVOKE ALL ON FUNCTION interno.personal_ve_la_calificacion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.personal_ve_la_calificacion(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION interno.personal_ve_la_calificacion(uuid, uuid) TO authenticated;

ALTER POLICY prestadora_ve_calificaciones ON public.calificaciones_asistente
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.personal_ve_la_calificacion(asistente_id, guardia_id)
  );

ALTER POLICY admin_prestadora_actualiza_visibilidad ON public.calificaciones_asistente
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.personal_ve_la_calificacion(asistente_id, guardia_id)
  );

NOTIFY pgrst, 'reload schema';
