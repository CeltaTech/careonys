-- Contar un intento también dice de qué Prestadora es.
--
-- `sumar_intento_de_codigo` recibía la tabla y el identificador de la fila, y nada más. Que el
-- identificador sea imposible de adivinar no es aislamiento: es que nadie lo adivinó todavía. La
-- regla es que toda escritura nombre la Prestadora, y ésta no la nombraba.
--
-- La versión de dos parámetros se borra. Dejarla al lado sería dejar abierta justo la puerta que
-- esto viene a cerrar.

DROP FUNCTION IF EXISTS public.sumar_intento_de_codigo(text, uuid);

CREATE OR REPLACE FUNCTION public.sumar_intento_de_codigo(
  p_tabla text,
  p_id uuid,
  p_prestadora_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intentos integer;
BEGIN
  -- Falla cerrado: sin Prestadora no se cuenta nada.
  IF p_prestadora_id IS NULL THEN
    RAISE EXCEPTION 'sumar_intento_de_codigo: falta la Prestadora';
  END IF;

  IF p_tabla = 'instrucciones_acceso_circulo' THEN
    UPDATE public.instrucciones_acceso_circulo
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSIF p_tabla = 'guardia_comprobaciones' THEN
    UPDATE public.guardia_comprobaciones
       SET codigo_intentos = codigo_intentos + 1,
           updated_at = now()
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSIF p_tabla = 'codigos_al_telefono' THEN
    UPDATE public.codigos_al_telefono
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSE
    RAISE EXCEPTION 'sumar_intento_de_codigo: esa tabla no lleva cuenta de intentos';
  END IF;

  -- Si no se actualizó ninguna fila, `v_intentos` queda nulo. Se devuelve así a propósito: quien
  -- llama trata el nulo como "se agotaron", que es lo que corresponde cuando no se pudo contar.
  RETURN v_intentos;
END;
$$;

REVOKE ALL ON FUNCTION public.sumar_intento_de_codigo(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sumar_intento_de_codigo(text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sumar_intento_de_codigo(text, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sumar_intento_de_codigo(text, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
