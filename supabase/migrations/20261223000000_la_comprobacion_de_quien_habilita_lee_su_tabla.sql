-- La comprobación de quién habilita a quién lee la columna de la tabla en la que está.
--
-- Las dos tablas comparten el disparador, y cada una nombra distinto a quien habilita:
-- `habilitado_por` en una y `confirmado_por` en la otra. Leer las dos en una sola expresión hace
-- que la base busque en la fila una columna que esa tabla no tiene, y el alta falla siempre. Cada
-- tabla lee ahora la suya.

CREATE OR REPLACE FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
DECLARE
  v_destinatario record;
  v_quien record;
  v_quien_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'cambios_de_clave_habilitados' THEN
    v_quien_id := NEW.habilitado_por;
  ELSE
    v_quien_id := NEW.confirmado_por;
  END IF;

  SELECT rol, prestadora_id INTO v_destinatario FROM public.usuarios WHERE id = NEW.usuario_id;
  SELECT rol, prestadora_id INTO v_quien FROM public.usuarios WHERE id = v_quien_id;

  -- Falla cerrado ante cualquier cosa que no se pudo resolver.
  IF v_destinatario IS NULL OR v_quien IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver quién habilita a quién';
  END IF;

  -- Las dos cuentas son de la Prestadora de la fila, y de ninguna otra. El rol técnico de la
  -- empresa no tiene Prestadora propia, y por eso queda exceptuado del lado de quien habilita.
  IF v_destinatario.prestadora_id IS DISTINCT FROM NEW.prestadora_id THEN
    RAISE EXCEPTION 'La cuenta no es de esa Prestadora';
  END IF;
  IF v_quien.rol <> 'superadmin' AND v_quien.prestadora_id IS DISTINCT FROM NEW.prestadora_id THEN
    RAISE EXCEPTION 'Quien habilita no es de esa Prestadora';
  END IF;

  IF NOT interno.puede_habilitar(v_quien.rol, v_destinatario.rol) THEN
    RAISE EXCEPTION 'Nadie habilita a su propio escalón ni a uno de más arriba';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
