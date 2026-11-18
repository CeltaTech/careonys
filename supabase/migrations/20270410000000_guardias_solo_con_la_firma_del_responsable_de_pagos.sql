-- Cada Prestadora decide si un Servicio puede programar guardias sin la firma del Responsable de
-- pagos.
--
-- Qué hace y por qué:
--
-- 1. Una opción nueva de la Prestadora: «programar guardias sólo con la firma del Responsable de
--    pagos». De fábrica está apagada, así que ninguna Prestadora cambia de comportamiento con
--    esta migración. La decide la administración de cada Prestadora en la Configuración.
--
-- 2. Una sola función dice si la firma del Responsable de pagos de un Servicio está firmada y
--    vigente. Vale cuando el Servicio tiene un Responsable de pagos elegido y hay un consentimiento
--    cerrado de esa misma persona. Si el consentimiento cerrado es de otra persona, porque después
--    se cambió el Responsable de pagos, la firma no vale. Es el mismo criterio que usa el Panel
--    para mostrar el estado de la firma.
--
-- 3. Otra función dice si a un Servicio le falta esa firma para programar guardias: la opción de
--    su Prestadora está encendida y la firma no está vigente. La usan la base, para rechazar, y el
--    Panel, para avisar. Así las dos contestan siempre lo mismo.
--
-- 4. La base rechaza programar una guardia o una serie de guardias en un Servicio al que le falta
--    esa firma. Se revisan los mismos casos que ya se revisan para el Coordinador: una guardia
--    nueva, una serie nueva, o una guardia o una serie que pasa a otro Servicio. No se revisan las
--    guardias que genera una serie, porque la serie ya se revisó al crearse. Por eso lo que ya
--    estaba programado sigue igual aunque la Prestadora encienda la opción. Los casos que se
--    revisan quedan escritos en una sola función que usan los dos controles.
--
-- 5. El Panel pregunta con la sesión de quien mira el Servicio. La función pública contesta sólo
--    al personal de la Prestadora y sólo por Servicios de su propia Prestadora. A cualquier otro le
--    contesta vacío.
--
-- Cómo se vuelve atrás: otra migración que borre los dos disparadores nuevos, la función pública,
-- las tres funciones internas nuevas y la columna, y que vuelva a escribir el control del
-- Coordinador con sus condiciones adentro. No se pierde ningún dato: la columna sólo guarda la
-- decisión de cada Prestadora.

-- ---------------------------------------------------------------------------------------------
-- 1. La opción de la Prestadora
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.prestadoras
  ADD COLUMN guardias_solo_con_firma_del_pagador boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.prestadoras.guardias_solo_con_firma_del_pagador IS
  'Verdadero: un Servicio programa guardias sólo con la firma vigente del Responsable de pagos. De fábrica, falso.';

-- La administración la cambia con el trabajo de la Prestadora, como las otras opciones de la fila.
GRANT UPDATE (guardias_solo_con_firma_del_pagador) ON TABLE public.prestadoras TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 2. La firma del Responsable de pagos, firmada y vigente
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.firma_del_pagador_vigente(p_servicio uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM condiciones_comerciales_servicio c
      JOIN consentimientos_pagador k
        ON k.servicio_id = c.servicio_id
       AND k.prestadora_id = c.prestadora_id
       AND k.pagador_persona_id = c.pagador_persona_id
     WHERE c.servicio_id = p_servicio
       AND c.pagador_persona_id IS NOT NULL
       AND k.estado = 'cerrado'
  );
$$;

REVOKE ALL ON FUNCTION interno.firma_del_pagador_vigente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.firma_del_pagador_vigente(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Si al Servicio le falta esa firma para programar guardias
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.falta_la_firma_del_pagador(p_servicio uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM servicios s
      JOIN prestadoras p ON p.id = s.prestadora_id
     WHERE s.id = p_servicio
       AND p.guardias_solo_con_firma_del_pagador
  ) AND NOT interno.firma_del_pagador_vigente(p_servicio);
$$;

REVOKE ALL ON FUNCTION interno.falta_la_firma_del_pagador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.falta_la_firma_del_pagador(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Qué guardias y qué series se revisan, en un solo lugar
-- ---------------------------------------------------------------------------------------------

-- Devuelve el Servicio a revisar, o vacío si el cambio no se revisa. Recibe el registro entero
-- porque las series no tienen `serie_id`, y así la misma función sirve a las dos tablas.
CREATE OR REPLACE FUNCTION interno.servicio_a_revisar_al_programar(p_nuevo jsonb, p_viejo jsonb, p_operacion text)
  RETURNS uuid
  LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'interno'
AS $$
  SELECT CASE
    -- Una guardia que genera una serie: la serie ya se revisó al crearse.
    WHEN p_nuevo ->> 'serie_id' IS NOT NULL THEN NULL
    WHEN p_nuevo ->> 'servicio_id' IS NULL THEN NULL
    -- Un cambio que no la pasa a otro Servicio.
    WHEN p_operacion = 'UPDATE'
         AND (p_nuevo ->> 'servicio_id') IS NOT DISTINCT FROM (p_viejo ->> 'servicio_id') THEN NULL
    ELSE (p_nuevo ->> 'servicio_id')::uuid
  END;
$$;

REVOKE ALL ON FUNCTION interno.servicio_a_revisar_al_programar(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.servicio_a_revisar_al_programar(jsonb, jsonb, text) TO service_role;

-- El control del Coordinador pasa a usar esos mismos casos. Lo que rechaza no cambia.
CREATE OR REPLACE FUNCTION interno.sin_coordinador_no_hay_guardias() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM servicios s
     WHERE s.id = v_servicio
       AND s.prestadora_id = NEW.prestadora_id
       AND s.coordinador_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'servicio_sin_coordinador:%', v_servicio;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. El control nuevo: sin la firma, no se programan guardias
-- ---------------------------------------------------------------------------------------------

-- El mensaje es el código solo, para que el Panel lo traduzca. El Servicio va en el detalle.
CREATE OR REPLACE FUNCTION interno.sin_firma_del_pagador_no_hay_guardias() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_servicio uuid := interno.servicio_a_revisar_al_programar(
    to_jsonb(NEW), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, TG_OP);
BEGIN
  IF v_servicio IS NULL THEN
    RETURN NEW;
  END IF;
  IF interno.falta_la_firma_del_pagador(v_servicio) THEN
    RAISE EXCEPTION 'servicio_sin_firma_del_pagador' USING DETAIL = v_servicio::text;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.sin_firma_del_pagador_no_hay_guardias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.sin_firma_del_pagador_no_hay_guardias() TO service_role;

-- Los disparadores corren en orden alfabético: primero el del Coordinador, después éste.
CREATE TRIGGER sin_firma_del_pagador_no_hay_guardias
  BEFORE INSERT OR UPDATE OF servicio_id ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.sin_firma_del_pagador_no_hay_guardias();

CREATE TRIGGER sin_firma_del_pagador_no_hay_guardias
  BEFORE INSERT OR UPDATE OF servicio_id ON public.series_guardias
  FOR EACH ROW EXECUTE FUNCTION interno.sin_firma_del_pagador_no_hay_guardias();

-- ---------------------------------------------------------------------------------------------
-- 6. La pregunta del Panel
-- ---------------------------------------------------------------------------------------------

-- Verdadero si al Servicio le falta la firma para programar guardias. Contesta sólo al personal
-- de la Prestadora y sólo por un Servicio de su propia Prestadora; a cualquier otro, vacío.
CREATE OR REPLACE FUNCTION public.falta_la_firma_del_pagador(p_servicio uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT interno.falta_la_firma_del_pagador(s.id)
    FROM servicios s
   WHERE s.id = p_servicio
     AND s.prestadora_id = interno.prestadora_actual()
     AND interno.es_personal_de_la_prestadora();
$$;

REVOKE ALL ON FUNCTION public.falta_la_firma_del_pagador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.falta_la_firma_del_pagador(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
