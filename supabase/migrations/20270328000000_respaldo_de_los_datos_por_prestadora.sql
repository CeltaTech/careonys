-- La copia de respaldo de los datos, de a una Prestadora por vez.
--
-- La copia la hace la cuenta automática `copia_de_respaldo` de cada Prestadora: cada contraseña
-- abre una sola, y el pase lo arma la base con `interno.armar_el_pase`. Ya no hay ninguna cuenta
-- que copie la base entera.
--
-- Estas dos funciones son lo único que esa cuenta puede llamar. Saltean la protección por fila
-- porque copian todas las tablas, pero el filtro lo ponen ellas y es uno solo: la Prestadora del
-- pase. No reciben ninguna Prestadora, y con cualquier otro pase no devuelven nada.
--
-- Entran todas las tablas de `public` que tienen la columna de la Prestadora —una tabla nueva
-- entra sola—, la fila de la propia Prestadora, y las cuentas de entrada de su gente, para que
-- una restauración no obligue a nadie a pedir contraseña nueva.

CREATE FUNCTION public.tablas_del_respaldo() RETURNS SETOF text
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'copia_de_respaldo' OR interno.prestadora_actual() IS NULL THEN
    RAISE EXCEPTION 'Sin permiso para la copia de respaldo' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT 'public.prestadoras'
    UNION ALL
    (SELECT 'public.' || c.relname::text
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = c.oid AND a.attname = 'prestadora_id' AND NOT a.attisdropped
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      ORDER BY c.relname)
    UNION ALL
    SELECT unnest(ARRAY['auth.users', 'auth.identities', 'auth.mfa_factors']);
END;
$$;

CREATE FUNCTION public.filas_del_respaldo(p_tabla text, p_desde integer, p_cantidad integer) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_nombre     text[];
  v_filtro     text;
  v_orden      text;
  v_filas      jsonb;
BEGIN
  IF auth.jwt() ->> 'role' IS DISTINCT FROM 'copia_de_respaldo' OR v_prestadora IS NULL THEN
    RAISE EXCEPTION 'Sin permiso para la copia de respaldo' USING ERRCODE = '42501';
  END IF;
  IF p_tabla IS NULL OR p_tabla NOT IN (SELECT public.tablas_del_respaldo()) THEN
    RAISE EXCEPTION 'Tabla fuera de la copia de respaldo' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NULL OR p_desde < 0 OR p_cantidad IS NULL OR p_cantidad NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Tramo de la copia de respaldo mal pedido' USING ERRCODE = '22023';
  END IF;

  v_nombre := pg_catalog.parse_ident(p_tabla);

  v_filtro := CASE p_tabla
    WHEN 'public.prestadoras'  THEN 't.id = $1'
    WHEN 'auth.users'          THEN 't.id IN (SELECT u.id FROM public.usuarios u WHERE u.prestadora_id = $1)'
    WHEN 'auth.identities'     THEN 't.user_id IN (SELECT u.id FROM public.usuarios u WHERE u.prestadora_id = $1)'
    WHEN 'auth.mfa_factors'    THEN 't.user_id IN (SELECT u.id FROM public.usuarios u WHERE u.prestadora_id = $1)'
    ELSE 't.prestadora_id = $1'
  END;

  -- Siempre el mismo orden, el de la clave primaria, para que los tramos no se pisen.
  SELECT string_agg(format('t.%I', a.attname), ', ' ORDER BY array_position(i.indkey::int2[], a.attnum))
    INTO v_orden
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = format('%I.%I', v_nombre[1], v_nombre[2])::regclass AND i.indisprimary;
  IF v_orden IS NULL THEN
    RAISE EXCEPTION 'La tabla % no tiene clave primaria', p_tabla;
  END IF;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(x.fila), ''[]''::jsonb) FROM (SELECT to_jsonb(t) AS fila FROM %I.%I t WHERE %s ORDER BY %s OFFSET $2 LIMIT $3) x',
    v_nombre[1], v_nombre[2], v_filtro, v_orden)
    INTO v_filas
    USING v_prestadora, p_desde, p_cantidad;

  RETURN v_filas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tablas_del_respaldo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.filas_del_respaldo(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tablas_del_respaldo() TO copia_de_respaldo;
GRANT EXECUTE ON FUNCTION public.filas_del_respaldo(text, integer, integer) TO copia_de_respaldo;

NOTIFY pgrst, 'reload schema';
