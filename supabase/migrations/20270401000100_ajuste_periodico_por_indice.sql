-- =============================================================================
-- Ajuste periódico del precio de las prestaciones por índice
-- =============================================================================
--
-- QUÉ HACE
--   1. Agrega al catálogo de acciones registradas las tres del ajuste por índice:
--      aplicado (lo hace el sistema), aceptado y rechazado. Las tres tienen
--      consecuencia económica.
--   2. Crea `public.propuestas_de_ajuste_por_indice`: cada ajuste que tocó a una
--      prestación, con el precio actual y el propuesto, su moneda, el mes desde el
--      que corresponde que rija, el estado y quién lo revisó y cuándo. Clave uuid,
--      `prestadora_id` y RLS: la lee sólo la administración de la Prestadora. Nadie
--      escribe directo: escriben las tres funciones de abajo.
--   3. `interno.condiciones_del_ajuste_por_indice`: el índice, los meses entre
--      actualizaciones y la forma de ajuste que rigen para un Servicio, con las tres
--      capas —fábrica, Prestadora, Servicio— igual que `condicionDe` de
--      `panel/src/lib/condicionesDelCliente.js`.
--   4. `interno.valor_del_indice_de_la_prestadora`: el valor de un índice en un mes,
--      filtrando por la Prestadora que se le pasa. `public.valor_del_indice` no
--      sirve adentro de una función que se saltea la RLS: no filtra por Prestadora y
--      vería los valores propios de todas.
--   5. `public.ajustar_precios_por_indice()`: la tarea diaria. Sólo la llama el
--      trabajo sin persona, de a una Prestadora por vez. Por cada prestación vigente
--      de un Servicio con índice, cuando ya pasaron los meses y está publicado el
--      valor del índice: si el ajuste es automático, versiona la prestación y deja
--      la propuesta como aplicada; si es con revisión previa, deja la propuesta
--      pendiente y el precio anterior sigue rigiendo.
--   6. `public.aceptar_propuesta_de_ajuste(uuid)` y
--      `public.rechazar_propuesta_de_ajuste(uuid)`: sólo la administración de la
--      Prestadora. Aceptar versiona la prestación desde el mes que correspondía,
--      aunque ya haya pasado. Las dos dejan constancia en el registro de actividad.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO (2026-11-13)
--   · `catalogo_acciones_registradas` tiene 23 acciones, con orden máximo 23, y
--     columnas (accion, grupo, orden smallint, creado_en, la_hace_el_sistema).
--   · `registro_actividad.registro_id` es uuid y `usuario_id` apunta a `usuarios`.
--     El trabajo sin persona tiene INSERT y SELECT sobre esa tabla.
--   · `prestaciones` tiene 0 filas. Su id es bigint. El disparador AFTER INSERT
--     `cerrar_la_prestacion_anterior` cierra la anterior cuando la nueva trae
--     `prestacion_anterior_id`, y exige misma Prestadora, Paciente y Servicio,
--     estado 'vigente' y `vigente_desde` posterior. El índice único
--     `prestaciones_un_solo_reemplazo` impide reemplazar dos veces la misma.
--   · `interno.copiar_renglon(regclass, bigint, jsonb)` existe y es INVOKER.
--   · `public.valor_del_indice(text, date)` es INVOKER y no filtra por Prestadora.
--   · `servicios` tiene UNIQUE (id, prestadora_id).
--   · El trabajo sin persona puede ejecutar `interno.prestadora_actual()` y usar el
--     esquema `interno`. `public.borrar_consultas_a_hce_vencidas()` es el molde de
--     la tarea: SECURITY DEFINER, rechaza si el rol no es trabajo_sin_persona.
--   · `condiciones_comerciales_servicio` todavía no tiene
--     `meses_entre_actualizaciones` ni `ajuste_por_indice`: las agrega
--     `20270401000000_condiciones_del_cliente_medicion_e_indice.sql`, que corre
--     antes que ésta.
--   · No existen todavía `propuestas_de_ajuste_por_indice` ni
--     `ajustar_precios_por_indice()`.
--
-- CÓMO SE VUELVE ATRÁS
--   Con otra migración que borre las tres funciones públicas, las dos de `interno`,
--   la tabla de propuestas y las tres acciones del catálogo (antes, los renglones
--   del registro de actividad que las usan). Las prestaciones versionadas por un
--   ajuste quedan: son precios que rigieron.
-- =============================================================================

BEGIN;

-- 1. Las acciones del registro de actividad.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema) VALUES
  ('ajuste_por_indice_aplicado', 'consecuencia_economica', 24, true),
  ('ajuste_por_indice_aceptado', 'consecuencia_economica', 25, false),
  ('ajuste_por_indice_rechazado', 'consecuencia_economica', 26, false);

-- 2. Las propuestas.
CREATE TABLE public.propuestas_de_ajuste_por_indice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id       uuid NOT NULL REFERENCES public.prestadoras(id),
  prestacion_id       bigint NOT NULL REFERENCES public.prestaciones(id) ON DELETE CASCADE,
  servicio_id         uuid NOT NULL,
  indice              text NOT NULL,
  periodo_base        date NOT NULL,
  periodo_nuevo       date NOT NULL,
  precio_actual       numeric NOT NULL CHECK (precio_actual > 0),
  precio_propuesto    numeric NOT NULL CHECK (precio_propuesto >= 0),
  moneda              text NOT NULL,
  rige_desde          date NOT NULL CHECK (rige_desde = date_trunc('month', rige_desde)::date),
  estado              text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'aplicada', 'sin_efecto')),
  prestacion_nueva_id bigint REFERENCES public.prestaciones(id),
  revisada_por        uuid REFERENCES public.usuarios(id),
  revisada_en         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT propuestas_de_ajuste_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios(id, prestadora_id),
  CONSTRAINT propuestas_de_ajuste_periodos_en_orden
    CHECK (periodo_nuevo > periodo_base),
  CONSTRAINT propuestas_de_ajuste_revision_completa
    CHECK ((estado IN ('aceptada', 'rechazada')) = (revisada_en IS NOT NULL)),
  CONSTRAINT propuestas_de_ajuste_version_nueva
    CHECK ((estado IN ('aceptada', 'aplicada')) = (prestacion_nueva_id IS NOT NULL))
);

-- Una sola pendiente por prestación, y un solo ajuste por prestación y mes.
CREATE UNIQUE INDEX propuestas_de_ajuste_una_pendiente
  ON public.propuestas_de_ajuste_por_indice (prestacion_id) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX propuestas_de_ajuste_una_por_mes
  ON public.propuestas_de_ajuste_por_indice (prestacion_id, rige_desde) WHERE estado <> 'sin_efecto';
CREATE INDEX propuestas_de_ajuste_por_prestadora
  ON public.propuestas_de_ajuste_por_indice (prestadora_id, estado);

ALTER TABLE public.propuestas_de_ajuste_por_indice ENABLE ROW LEVEL SECURITY;

CREATE POLICY la_administracion_lee_las_propuestas
  ON public.propuestas_de_ajuste_por_indice
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_la_administracion_de_la_prestadora(prestadora_id));

REVOKE ALL ON public.propuestas_de_ajuste_por_indice FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.propuestas_de_ajuste_por_indice TO authenticated;

-- 3. Lo que rige para un Servicio. Refleja `condicionDe`: gana la última capa con un valor
--    válido, y el índice 'ninguno' quiere decir «sin índice».
CREATE FUNCTION interno.condiciones_del_ajuste_por_indice(
  p_regla jsonb, p_indice_del_servicio text, p_meses_del_servicio integer, p_ajuste_del_servicio text
) RETURNS TABLE (indice text, meses integer, ajuste text)
  LANGUAGE sql IMMUTABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT
    NULLIF(coalesce(
      NULLIF(btrim(coalesce(p_indice_del_servicio, '')), ''),
      CASE WHEN jsonb_typeof(p_regla -> 'indice_de_actualizacion') = 'string'
           THEN NULLIF(btrim(p_regla ->> 'indice_de_actualizacion'), '') END
    ), 'ninguno'),
    coalesce(
      CASE WHEN p_meses_del_servicio BETWEEN 1 AND 24 THEN p_meses_del_servicio END,
      CASE WHEN jsonb_typeof(p_regla -> 'meses_entre_actualizaciones') = 'number'
            AND (p_regla ->> 'meses_entre_actualizaciones')::numeric
                = trunc((p_regla ->> 'meses_entre_actualizaciones')::numeric)
            AND (p_regla ->> 'meses_entre_actualizaciones')::numeric BETWEEN 1 AND 24
           THEN (p_regla ->> 'meses_entre_actualizaciones')::integer END,
      1),
    coalesce(
      CASE WHEN p_ajuste_del_servicio IN ('automatico', 'revision_previa') THEN p_ajuste_del_servicio END,
      CASE WHEN jsonb_typeof(p_regla -> 'ajuste_por_indice') = 'string'
            AND p_regla ->> 'ajuste_por_indice' IN ('automatico', 'revision_previa')
           THEN p_regla ->> 'ajuste_por_indice' END,
      'revision_previa');
$$;
REVOKE EXECUTE ON FUNCTION interno.condiciones_del_ajuste_por_indice(jsonb, text, integer, text) FROM PUBLIC, anon;

-- 4. El valor de un índice en un mes, para una Prestadora: el propio gana al general.
CREATE FUNCTION interno.valor_del_indice_de_la_prestadora(
  p_prestadora uuid, p_indice text, p_periodo date
) RETURNS numeric
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT v.valor
    FROM public.valores_de_indice v
    JOIN public.indices_de_actualizacion i ON i.id = v.indice_id
   WHERE i.codigo = p_indice
     AND v.periodo = date_trunc('month', p_periodo)::date
     AND (v.prestadora_id IS NULL OR v.prestadora_id = p_prestadora)
   ORDER BY (v.prestadora_id IS NULL)
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION interno.valor_del_indice_de_la_prestadora(uuid, text, date) FROM PUBLIC, anon;

-- 5. La tarea diaria.
--
-- Las fechas, con un ejemplo: una prestación vigente desde el 10 de marzo, con 3 meses entre
-- actualizaciones. Su mes ancla es marzo, y el ajuste rige desde el 1 de junio. Compara el
-- índice de febrero (el último publicado cuando se fijó el precio) contra el de mayo (el último
-- publicado antes de que rija el nuevo). Desde el 1 de junio, cada día se fija si mayo ya está
-- publicado. Si una propuesta se rechaza, el mes ancla pasa a ser el de esa propuesta: la
-- siguiente llega 3 meses después.
CREATE FUNCTION public.ajustar_precios_por_indice()
RETURNS TABLE (aplicados integer, propuestos integer, sin_efecto integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_precio     numeric;
  v_propuesta  uuid;
  v_nueva      bigint;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_por_indice:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prest;

  -- Las pendientes que ya no corresponden: la prestación dejó de ser la vigente, cambió su
  -- precio, o el Servicio cambió de índice o lo sacó.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_por_indice pr
       SET estado = 'sin_efecto'
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND p.id = pr.prestacion_id
       AND (p.estado <> 'vigente'
            OR p.vigente_hasta IS NOT NULL
            OR p.precio_final <> pr.precio_actual
            OR (SELECT x.indice FROM interno.condiciones_del_ajuste_por_indice(
                  v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x)
               IS DISTINCT FROM pr.indice)
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  FOR v IN
    SELECT p.id, p.servicio_id, p.vigente_desde, p.precio_final, p.precio_lista_snapshot, p.moneda,
           x.indice, x.meses, x.ajuste
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     CROSS JOIN LATERAL interno.condiciones_del_ajuste_por_indice(
           v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x
     WHERE p.prestadora_id = v_prest
       AND p.estado = 'vigente'
       AND p.vigente_hasta IS NULL
       AND p.servicio_id IS NOT NULL
       AND p.vigente_desde <= current_date
       AND p.precio_final > 0
       AND x.indice IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                        WHERE pr.prestacion_id = p.id AND pr.estado = 'pendiente')
     ORDER BY p.id
  LOOP
    SELECT greatest(date_trunc('month', v.vigente_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_por_indice pr
     WHERE pr.prestacion_id = v.id AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v.meses))::date;
    CONTINUE WHEN current_date < v_rige;

    v_base := (date_trunc('month', v.vigente_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_precio := round(v.precio_final * v_factor, 2);
    CONTINUE WHEN v_precio = v.precio_final;

    -- Ya hubo un ajuste para ese mes (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                           WHERE pr.prestacion_id = v.id AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    IF v.ajuste = 'automatico' THEN
      v_nueva := interno.copiar_renglon('public.prestaciones', v.id, jsonb_build_object(
        'precio_final', v_precio,
        'precio_lista_snapshot', CASE WHEN v.precio_lista_snapshot IS NULL THEN NULL
                                      ELSE round(v.precio_lista_snapshot * v_factor, 2) END,
        'vigente_desde', v_rige,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', v.id
      ));

      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde, estado, prestacion_nueva_id)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige, 'aplicada', v_nueva)
      RETURNING id INTO v_propuesta;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_por_indice_aplicado', 'propuestas_de_ajuste_por_indice', v_propuesta,
              jsonb_build_object('prestacion_id', v.id, 'prestacion_nueva_id', v_nueva,
                                 'servicio_id', v.servicio_id, 'indice', v.indice,
                                 'precio_anterior', v.precio_final, 'precio_nuevo', v_precio,
                                 'moneda', v.moneda, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige);
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ajustar_precios_por_indice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_precios_por_indice() TO trabajo_sin_persona;

-- 6. La revisión.
CREATE FUNCTION public.aceptar_propuesta_de_ajuste(p_propuesta uuid)
RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_quien   uuid := interno.usuario_de_la_sesion();
  pr        public.propuestas_de_ajuste_por_indice;
  p         public.prestaciones;
  v_nueva   bigint;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_por_indice
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ya_revisada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO p FROM public.prestaciones
   WHERE id = pr.prestacion_id AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND OR p.estado <> 'vigente' OR p.vigente_hasta IS NOT NULL
     OR p.precio_final <> pr.precio_actual THEN
    RAISE EXCEPTION 'ya_reemplazado' USING ERRCODE = 'P0001';
  END IF;

  -- Rige desde el mes que correspondía, aunque ya haya pasado.
  v_nueva := interno.copiar_renglon('public.prestaciones', p.id, jsonb_build_object(
    'precio_final', pr.precio_propuesto,
    'precio_lista_snapshot', CASE WHEN p.precio_lista_snapshot IS NULL THEN NULL
                                  ELSE round(p.precio_lista_snapshot * pr.precio_propuesto / pr.precio_actual, 2) END,
    'vigente_desde', pr.rige_desde,
    'vigente_hasta', NULL,
    'requiere_revision', false,
    'prestacion_anterior_id', p.id
  ));

  UPDATE public.propuestas_de_ajuste_por_indice
     SET estado = 'aceptada', revisada_por = v_quien, revisada_en = now(), prestacion_nueva_id = v_nueva
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_por_indice_aceptado', 'propuestas_de_ajuste_por_indice', pr.id,
          jsonb_build_object('prestacion_id', p.id, 'prestacion_nueva_id', v_nueva,
                             'servicio_id', pr.servicio_id, 'indice', pr.indice,
                             'precio_anterior', pr.precio_actual, 'precio_nuevo', pr.precio_propuesto,
                             'moneda', pr.moneda, 'rige_desde', pr.rige_desde));
  RETURN v_nueva;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.aceptar_propuesta_de_ajuste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_propuesta_de_ajuste(uuid) TO authenticated;

CREATE FUNCTION public.rechazar_propuesta_de_ajuste(p_propuesta uuid)
RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest   uuid := interno.prestadora_actual();
  v_quien   uuid := interno.usuario_de_la_sesion();
  pr        public.propuestas_de_ajuste_por_indice;
BEGIN
  IF v_prest IS NULL OR v_quien IS NULL
     OR NOT interno.es_la_administracion_de_la_prestadora(v_prest) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pr FROM public.propuestas_de_ajuste_por_indice
   WHERE id = p_propuesta AND prestadora_id = v_prest
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF pr.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'ya_revisada' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.propuestas_de_ajuste_por_indice
     SET estado = 'rechazada', revisada_por = v_quien, revisada_en = now()
   WHERE id = pr.id;

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'ajuste_por_indice_rechazado', 'propuestas_de_ajuste_por_indice', pr.id,
          jsonb_build_object('prestacion_id', pr.prestacion_id, 'servicio_id', pr.servicio_id,
                             'indice', pr.indice, 'precio_actual', pr.precio_actual,
                             'precio_propuesto', pr.precio_propuesto, 'moneda', pr.moneda,
                             'rige_desde', pr.rige_desde));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rechazar_propuesta_de_ajuste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rechazar_propuesta_de_ajuste(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
