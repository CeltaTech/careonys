-- Un rol que no se entiende no habilita a nadie
-- =====================================================================================
--
-- QUÉ ESTABA MAL. La regla de quién le puede habilitar un cambio de clave a quién está escrita dos
-- veces a propósito —en el motor y en un disparador de la base—, y las dos copias decían cosas
-- distintas. El motor ya quedó corregido: un rol que no está en la lista no habilita a nadie. La
-- base no: `interno.escalon_del_rol` le daba a cualquier rol desconocido el número más alto, con lo
-- cual quedaba por encima de todos y habilitaba a todos.
--
-- POR QUÉ UN SOLO NÚMERO NO ALCANZA. Son dos cosas al mismo tiempo: a ese rol no lo habilita nadie,
-- y él no habilita a nadie. El número más alto resuelve la primera y rompe la segunda; el más bajo
-- haría lo contrario. La salida no es elegir un número sino sacar la respuesta del número: el rol
-- que no se entiende **no tiene escalón**, y la comparación con lo que no existe no deja pasar
-- nada.
--
-- CÓMO QUEDA. `interno.escalon_del_rol` devuelve nulo para el rol que no conoce, y la comparación
-- se muda a una función nueva, `interno.puede_habilitar`, que es la gemela exacta de `puedeHabilitar`
-- del motor: contesta que no ante cualquier lado que no se pudo resolver. Esa función es ahora el
-- punto único de verdad de la regla del lado de la base, y el disparador la llama en vez de comparar
-- por su cuenta. Comparar con nulo da nulo, y un `IF` con nulo adentro no entra: por eso la
-- respuesta se envuelve en `COALESCE(..., false)` y no se deja librada a la comparación
-- (`celtatech\CLAUDE.md` §5, todo control de acceso falla cerrado).
--
-- HOY ESTO NO ALCANZA A NINGÚN CASO CARGADO, y se escribe igual. Que no haya ningún rol fuera de la
-- lista es una foto de hoy, no una garantía: el día que se agregue un rol al producto y alguien se
-- olvide de esta función, la base estaría habilitando de más sin que nadie lo note.
--
-- NADA DE ESTO CAMBIA LO QUE PUEDE HACER UN ROL CONOCIDO. Los cinco escalones son los mismos y en
-- el mismo orden.
--
-- NINGUNA FUNCIÓN NUEVA VIVE EN `public` Y NINGÚN DISPARADOR ES `SECURITY DEFINER`
-- (CLAUDE.md del producto §6).
-- =====================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El rol que no se entiende no tiene escalón
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.escalon_del_rol(p_rol text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_rol
    WHEN 'superadmin' THEN 4::smallint
    WHEN 'admin_prestadora' THEN 3::smallint
    WHEN 'coordinador' THEN 2::smallint
    WHEN 'asistente' THEN 1::smallint
    WHEN 'familia' THEN 1::smallint
    -- Sin escalón. No es el más alto ni el más bajo: no hay ninguno, y por eso no se lo puede
    -- comparar con nadie.
    ELSE NULL::smallint
  END
$$;

COMMENT ON FUNCTION interno.escalon_del_rol(text) IS
  'En qué escalón está un rol, para la regla de quién habilita a quién. El rol que no está en la lista no tiene escalón: devuelve nulo, y quien compare tiene que resolver ese nulo negando.';

REVOKE ALL ON FUNCTION interno.escalon_del_rol(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.escalon_del_rol(text) FROM anon;
GRANT EXECUTE ON FUNCTION interno.escalon_del_rol(text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.escalon_del_rol(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. La comparación, en un solo lugar y fallando cerrado
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.puede_habilitar(
  p_rol_de_quien text,
  p_rol_del_destinatario text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'interno', 'public'
AS $$
  SELECT COALESCE(
    interno.escalon_del_rol(p_rol_de_quien) > interno.escalon_del_rol(p_rol_del_destinatario),
    false
  )
$$;

COMMENT ON FUNCTION interno.puede_habilitar(text, text) IS
  'Se habilita hacia abajo, y nunca a uno mismo ni a su propio escalón. Un rol que no se entiende —de cualquiera de los dos lados— no habilita y no es habilitado. Es la gemela de puedeHabilitar() del motor.';

REVOKE ALL ON FUNCTION interno.puede_habilitar(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.puede_habilitar(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION interno.puede_habilitar(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.puede_habilitar(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. El disparador deja de comparar por su cuenta
-- ---------------------------------------------------------------------------
--
-- Lo demás queda exactamente como estaba. NO ES `SECURITY DEFINER` y no lo necesita: corre con el
-- rol de quien escribe, y quien escribe es el motor con la llave de servicio.

CREATE OR REPLACE FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_destinatario record;
  v_quien record;
  v_quien_id uuid;
BEGIN
  v_quien_id := CASE TG_TABLE_NAME
    WHEN 'cambios_de_clave_habilitados' THEN NEW.habilitado_por
    ELSE NEW.confirmado_por
  END;

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

REVOKE ALL ON FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo() FROM anon;
GRANT EXECUTE ON FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo() TO service_role;

-- Los disparadores siguen siendo los mismos y apuntan a la misma función; no se recrean.

-- ---------------------------------------------------------------------------
-- 4. La comprobación, con el control roto a propósito
-- ---------------------------------------------------------------------------
--
-- No alcanza con preguntar que el rol desconocido no habilite: eso también daría bien si la función
-- contestara que no siempre. Por eso se pregunta además que los casos conocidos sigan dando lo que
-- daban.

DO $comprobacion$
DECLARE
  v_faltan text := '';
BEGIN
  IF interno.escalon_del_rol('lo_que_sea') IS NOT NULL THEN
    v_faltan := v_faltan || ' el rol desconocido sigue teniendo escalon;';
  END IF;

  IF interno.puede_habilitar('lo_que_sea', 'asistente') THEN
    v_faltan := v_faltan || ' un rol que no se entiende habilita;';
  END IF;
  IF interno.puede_habilitar('admin_prestadora', 'lo_que_sea') THEN
    v_faltan := v_faltan || ' se habilita a un rol que no se entiende;';
  END IF;
  IF interno.puede_habilitar('coordinador', 'coordinador') THEN
    v_faltan := v_faltan || ' se habilita al propio escalon;';
  END IF;
  IF interno.puede_habilitar('coordinador', 'admin_prestadora') THEN
    v_faltan := v_faltan || ' se habilita hacia arriba;';
  END IF;

  -- El control roto: los mismos casos, con roles que sí se entienden, tienen que seguir dando que
  -- sí. Sin esto, una función que contestara siempre que no pasaría todo lo de arriba.
  IF NOT interno.puede_habilitar('coordinador', 'asistente') THEN
    v_faltan := v_faltan || ' la coordinacion dejo de habilitar a un Asistente;';
  END IF;
  IF NOT interno.puede_habilitar('coordinador', 'familia') THEN
    v_faltan := v_faltan || ' la coordinacion dejo de habilitar a una Familia;';
  END IF;
  IF NOT interno.puede_habilitar('admin_prestadora', 'coordinador') THEN
    v_faltan := v_faltan || ' la administracion dejo de habilitar a quien coordina;';
  END IF;
  IF NOT interno.puede_habilitar('superadmin', 'admin_prestadora') THEN
    v_faltan := v_faltan || ' el rol tecnico dejo de habilitar a la administracion;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion del rol que no se entiende no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
