-- =============================================================================
-- El contacto se abre sólo con un Asistente de la misma Prestadora
-- =============================================================================
--
-- QUÉ HACE
--   `consumir_contacto_intermediacion` anotaba en `contactos_vistos_intermediacion`
--   el Asistente que le pasaran, sin comprobar de qué Prestadora era: la fila
--   quedaba con la Prestadora del acceso y el Asistente de otra. La única barrera
--   era que el backend lo valida antes de llamarla. Ahora la función se defiende
--   sola: si el Asistente no es de la Prestadora del acceso, contesta
--   `no_encontrado` —el mismo motivo que da la ruta— y no anota ni descuenta nada.
--
-- QUÉ NO CAMBIA
--   Los argumentos, lo que devuelve en los demás casos, el orden de anotar antes
--   de descontar y los permisos: `CREATE OR REPLACE` conserva los que tiene.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.consumir_contacto_intermediacion(p_acceso_id uuid, p_asistente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $funcion$
DECLARE
  v_acceso public.accesos_intermediacion%ROWTYPE;
  v_ya_estaba boolean;
  v_saldo integer;
BEGIN
  -- Tomada la fila del acceso, el que llegue segundo espera acá. Sin esto, dos pedidos leen el
  -- mismo saldo y los dos descuentan sobre ese número: de dos contactos se cobra uno.
  SELECT * INTO v_acceso
    FROM public.accesos_intermediacion
   WHERE id = p_acceso_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  -- Falla cerrado: un acceso vencido o dado de baja no abre nada, aunque le haya quedado saldo.
  IF v_acceso.estado <> 'vigente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_no_vigente');
  END IF;

  -- El Asistente tiene que ser de la misma Prestadora que el acceso. Uno de otra, o uno que no
  -- existe, contesta igual: no se distingue cuál de los dos fue.
  IF NOT EXISTS (
    SELECT 1 FROM public.asistentes
     WHERE id = p_asistente_id AND prestadora_id = v_acceso.prestadora_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrado');
  END IF;

  -- Ya abierto antes: se contesta que sí y no se cobra de nuevo. El contacto de un Asistente se
  -- paga una sola vez por Cliente, y mirarlo otra vez no es un contacto nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.contactos_vistos_intermediacion
     WHERE cliente_id = v_acceso.cliente_id AND asistente_id = p_asistente_id
  ) INTO v_ya_estaba;

  IF v_ya_estaba THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END IF;

  IF v_acceso.saldo_contactos IS NOT NULL AND v_acceso.saldo_contactos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'saldo_agotado', 'saldo_contactos', 0);
  END IF;

  -- Se anota primero y se descuenta después, en ese orden y no al revés: así el candado de la
  -- tabla es el que decide, y no queda ninguna forma de descontar sin haber anotado. La misma
  -- Cliente con dos paquetes abriendo el mismo Asistente a la vez llega hasta acá por dos filas
  -- de acceso distintas, que el candado de más arriba no cruza; el segundo choca contra éste.
  BEGIN
    INSERT INTO public.contactos_vistos_intermediacion
      (prestadora_id, cliente_id, asistente_id, acceso_id)
    VALUES
      (v_acceso.prestadora_id, v_acceso.cliente_id, p_asistente_id, p_acceso_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END;

  -- El que se sostiene por fecha no tiene qué descontar: queda anotado y el saldo sigue vacío.
  IF v_acceso.saldo_contactos IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', NULL);
  END IF;

  UPDATE public.accesos_intermediacion
     SET saldo_contactos = saldo_contactos - 1,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', v_saldo);
END;
$funcion$;

COMMENT ON FUNCTION public.consumir_contacto_intermediacion(uuid, uuid) IS 'Anota a qué Asistente se le abrió el contacto y, si el acceso se sostiene por saldo, le descuenta uno, en la misma transacción. Sólo acepta un Asistente de la misma Prestadora que el acceso. Un Asistente ya abierto no vuelve a descontar. El acceso que se sostiene por fecha se anota sin descontar nada. Devuelve ok y el saldo que queda, o el motivo por el que no se pudo.';

COMMIT;

NOTIFY pgrst, 'reload schema';
