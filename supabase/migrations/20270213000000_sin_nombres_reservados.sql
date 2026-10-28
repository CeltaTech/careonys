-- El código de la Prestadora lo elige CeltaTech y Careonys sólo lo recibe. Las dos tablas que usaba
-- la elección vieja ya no las lee nadie: `dominios_de_correo_gratuitos` servía para sacar el código
-- del correo de la Prestadora, y `direcciones_reservadas` apartaba nombres de direcciones web bajo
-- el dominio del producto, que no existen ni se construyen. El código sólo va en el nombre de
-- usuario, en la casilla de envío y en `/api/publico/<código>/`, y ahí no choca con nada.
--
-- El disparador conserva lo que sigue valiendo: la forma del código y que no cambie nunca.

CREATE OR REPLACE FUNCTION interno.la_direccion_de_la_prestadora_es_suya()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE nueva text;
BEGIN
  nueva := NULLIF(lower(btrim(COALESCE(NEW.dominio, ''))), '');

  IF TG_OP = 'UPDATE'
     AND OLD.dominio IS NOT NULL
     AND nueva IS DISTINCT FROM lower(btrim(OLD.dominio)) THEN
    RAISE EXCEPTION 'la_direccion_de_la_prestadora_no_cambia';
  END IF;

  NEW.dominio := nueva;

  IF nueva IS NULL THEN
    RETURN NEW;
  END IF;

  -- Letras sin acento, números, guiones y puntos, y ni un guión ni un punto en los extremos.
  IF nueva !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'la_direccion_de_la_prestadora_no_tiene_forma';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION interno.la_direccion_de_la_prestadora_es_suya() IS
  'El código de la Prestadora: en minúsculas, con forma válida, y una vez puesto no cambia.';

DROP TABLE public.direcciones_reservadas;
DROP TABLE public.dominios_de_correo_gratuitos;

NOTIFY pgrst, 'reload schema';
