-- ---------------------------------------------------------------------------------------
-- El paquete de contactos: el saldo se descuenta de a uno, y de a uno de verdad
--
-- QUÉ FALTABA. Una Prestadora ya puede armar un paquete de contactos —importe, sin período, y
-- tantos contactos incluidos (`formas_de_cobro_match.contactos_incluidos`)— y el acceso ya
-- tiene dónde guardar lo que le queda (`accesos_match.saldo_contactos`). Pero esa columna
-- no la escribía ni la leía nadie: el paquete se vendía y el saldo quedaba en blanco para
-- siempre. Faltan las dos puntas, y son las dos de acá:
--
--   1. **Cargarlo cuando entra la plata.** El paquete se paga una vez; ahí es cuando el saldo
--      existe. `sumar_contactos_al_saldo` lo suma.
--   2. **Descontarlo cuando el Cliente abre un contacto**, y anotar cuál abrió.
--      `consumir_contacto_match` hace las dos cosas juntas.
--
-- POR QUÉ HACE FALTA UNA TABLA Y NO ALCANZA EL NÚMERO. Sin anotar a quién se le abrió el
-- contacto, volver a mirar la ficha del mismo Asistente descuenta otro. El Cliente pagó cinco
-- contactos y se queda sin saldo mirando tres veces al mismo. La tabla es la que hace que
-- «de a uno» signifique un Asistente y no una mirada.
--
-- POR QUÉ EL SALDO SE SUMA Y NO SE PISA. El paquete no vence por calendario
-- (`docs/PRD_07_Modalidad_Match.md` §3.3), así que lo que quedó sin usar no se pierde:
-- quien compra un paquete nuevo teniendo dos contactos sin abrir termina con los dos más los
-- que compró. Pisar el saldo sería vencerlo, que es justo lo que esa forma no hace.
--
-- POR QUÉ EL DESCUENTO VIVE EN LA BASE Y NO EN EL MOTOR. Leer el saldo, restarle uno y volver a
-- escribirlo son dos viajes, y entre uno y otro entra otro pedido: dos ventanas abiertas a la vez
-- descuentan una sola vez y el paquete se estira solo. Acá el descuento y la anotación pasan en
-- la misma transacción, con la fila del acceso tomada, así que el segundo espera al primero.
--
-- POR QUÉ VIVEN EN `public` Y NO SON `SECURITY DEFINER`. En `interno` van las funciones que usan
-- las políticas de RLS (`CLAUDE.md` del producto §6); éstas no son de ésas: las llama el motor
-- por la API, y `supabase/config.toml` publica únicamente `public` y `graphql_public`. Y no
-- necesitan saltearse nada, porque el motor entra con la llave de servicio. Quedan en `public`
-- con el permiso mínimo: revocadas para todos y devueltas nada más que al motor.
-- ---------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A quién se le abrió el contacto
-- ---------------------------------------------------------------------------

CREATE TABLE public.contactos_vistos_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes(id),
  -- Con qué acceso se pagó. Es el recibo: el día que un Cliente pregunte en qué se le fue el
  -- saldo, la respuesta sale de acá y no de rehacer la cuenta.
  acceso_id uuid NOT NULL REFERENCES public.accesos_match(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Un contacto abierto no se vuelve a cobrar, ni siquiera con otro paquete: la llave es la
  -- Cliente y el Asistente, no el acceso con el que se pagó aquella vez.
  CONSTRAINT contactos_vistos_mkt_una_vez_por_asistente UNIQUE (cliente_id, asistente_id)
);

CREATE INDEX idx_contactos_vistos_mkt_prestadora
  ON public.contactos_vistos_match (prestadora_id);
CREATE INDEX idx_contactos_vistos_mkt_acceso
  ON public.contactos_vistos_match (acceso_id);

COMMENT ON TABLE public.contactos_vistos_match IS
  'Qué Asistentes tiene ya abiertos un Cliente, y con qué acceso los pagó. Es lo que hace que el saldo del paquete se descuente de a un Asistente y no de a una mirada. docs/PRD_07_Modalidad_Match.md §3.3.';

ALTER TABLE public.contactos_vistos_match ENABLE ROW LEVEL SECURITY;

-- Las dos políticas son de lectura y nada más. Nadie escribe acá desde una pantalla: la fila la
-- pone el descuento, en la misma transacción que resta el saldo. Una fila puesta por fuera sería
-- un contacto abierto que nadie pagó.

-- El Cliente ve los suyos, con el mismo candado que su acceso: en qué se gastó el saldo es plata.
CREATE POLICY cliente_ve_los_contactos_que_abrio
  ON public.contactos_vistos_match
  FOR SELECT
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

-- Y la Prestadora los de su gente, igual que los accesos de los que cuelgan.
CREATE POLICY prestadora_ve_los_contactos_vistos
  ON public.contactos_vistos_match
  FOR SELECT
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.rol IN ('admin_prestadora', 'coordinador')
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Cargar el saldo cuando entra la plata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sumar_contactos_al_saldo(p_acceso_id uuid, p_cuantos integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo integer;
BEGIN
  IF p_cuantos IS NULL OR p_cuantos <= 0 THEN
    RAISE EXCEPTION 'sumar_contactos_al_saldo: se suman contactos, no cero ni menos';
  END IF;

  -- En una sola sentencia. Un saldo vacío es un acceso que todavía no se sostenía por saldo: la
  -- primera carga lo estrena, y de ahí en más se le suma lo de cada compra.
  UPDATE public.accesos_match
     SET saldo_contactos = COALESCE(saldo_contactos, 0) + p_cuantos,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  -- Sin fila, queda nulo. Se devuelve así: quien llama tiene que poder distinguir «no había qué
  -- cargar» de «quedó en cero», que no son lo mismo.
  RETURN v_saldo;
END;
$$;

REVOKE ALL ON FUNCTION public.sumar_contactos_al_saldo(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sumar_contactos_al_saldo(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.sumar_contactos_al_saldo(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sumar_contactos_al_saldo(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.sumar_contactos_al_saldo(uuid, integer) IS
  'Le suma contactos al saldo de un acceso y devuelve con cuántos queda. Se llama cuando entra la plata de un paquete. Suma y no pisa: el paquete no vence por calendario, así que lo que quedó sin usar sigue estando.';

-- ---------------------------------------------------------------------------
-- 3. Descontar uno al abrir un contacto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consumir_contacto_match(p_acceso_id uuid, p_asistente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acceso public.accesos_match%ROWTYPE;
  v_ya_estaba boolean;
  v_saldo integer;
BEGIN
  -- Tomada la fila del acceso, el que llegue segundo espera acá. Sin esto, dos pedidos leen el
  -- mismo saldo y los dos descuentan sobre ese número: de dos contactos se cobra uno.
  SELECT * INTO v_acceso
    FROM public.accesos_match
   WHERE id = p_acceso_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  -- Falla cerrado: un acceso vencido o dado de baja no abre nada, aunque le haya quedado saldo.
  IF v_acceso.estado <> 'vigente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_no_vigente');
  END IF;

  -- Ya abierto antes: se contesta que sí y no se cobra de nuevo. El contacto de un Asistente se
  -- paga una sola vez por Cliente, y mirarlo otra vez no es un contacto nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.contactos_vistos_match
     WHERE cliente_id = v_acceso.cliente_id AND asistente_id = p_asistente_id
  ) INTO v_ya_estaba;

  IF v_ya_estaba THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END IF;

  -- Sin saldo cargado, este acceso no se sostiene por saldo sino por una fecha. No es un error de
  -- el Cliente y no se resuelve comprando: lo decide quien llama, con su propia regla.
  IF v_acceso.saldo_contactos IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_sin_saldo');
  END IF;

  IF v_acceso.saldo_contactos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'saldo_agotado', 'saldo_contactos', 0);
  END IF;

  -- Se anota primero y se descuenta después, en ese orden y no al revés: así el candado de la
  -- tabla es el que decide, y no queda ninguna forma de descontar sin haber anotado. La misma
  -- Cliente con dos paquetes abriendo el mismo Asistente a la vez llega hasta acá por dos filas
  -- de acceso distintas, que el candado de más arriba no cruza; el segundo choca contra éste.
  BEGIN
    INSERT INTO public.contactos_vistos_match
      (prestadora_id, cliente_id, asistente_id, acceso_id)
    VALUES
      (v_acceso.prestadora_id, v_acceso.cliente_id, p_asistente_id, p_acceso_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true, 'ya_estaba', true, 'saldo_contactos', v_acceso.saldo_contactos
    );
  END;

  UPDATE public.accesos_match
     SET saldo_contactos = saldo_contactos - 1,
         updated_at = now()
   WHERE id = p_acceso_id
  RETURNING saldo_contactos INTO v_saldo;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'saldo_contactos', v_saldo);
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_contacto_match(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consumir_contacto_match(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consumir_contacto_match(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_contacto_match(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.consumir_contacto_match(uuid, uuid) IS
  'Descuenta un contacto del saldo de un acceso y anota a qué Asistente se le abrió, en la misma transacción. Un Asistente ya abierto no vuelve a descontar. Devuelve ok y el saldo que queda, o el motivo por el que no se pudo.';

COMMENT ON COLUMN public.accesos_match.saldo_contactos IS
  'Cuántos contactos le quedan por abrir a este acceso. Vacío: este acceso no se sostiene por saldo. Lo carga el cobro del paquete y lo descuenta abrir un contacto; nadie lo escribe a mano.';

NOTIFY pgrst, 'reload schema';
