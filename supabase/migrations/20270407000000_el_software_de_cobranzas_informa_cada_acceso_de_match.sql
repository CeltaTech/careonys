-- El software de créditos y cobranzas informa cómo está cada acceso de Match.
--
-- Qué hace y por qué:
--
-- El software de cobranzas de la Prestadora cobra cada acceso de Match y le avisa a Careonys por
-- una entrada firmada. Cada aviso nombra un acceso y dice una de cuatro cosas: pagó el período,
-- está en período de gracia, quedó suspendido o se dio de baja. Lleva el período, el importe con
-- su moneda y su propio número de aviso. Esta migración prepara la base para anotarlo.
--
-- 1. Dos estados nuevos del acceso. «En gracia»: el cobro fue rechazado y el software reintenta
--    hasta una fecha fija y conocida; mientras tanto el acceso sigue abriendo contactos. Desde
--    esa fecha queda suspendido sin que nadie tenga que avisarlo. «Suspendida»: no abre nada
--    hasta que entra el pago. La fecha de la suspensión se guarda en el acceso.
--
-- 2. El número del aviso no se repite. El aviso se anota en los cobros del acceso con su número
--    como referencia, y ese número pasa a ser único dentro de cada Prestadora. Así el mismo aviso
--    mandado dos veces se anota una sola. La tabla de cobros está vacía, así que el cambio de
--    índice no choca con nada guardado.
--
-- 3. Una sola regla dice si un acceso abre contactos. La usa la función que descuenta un
--    contacto. Abre el acceso vigente; el que está en gracia, hasta el día anterior a su
--    suspensión; y el dado de baja, hasta el último día que pagó. El suspendido y el vencido no
--    abren nada.
--
-- 4. La función que anota el aviso. Hace todo junto o nada: anota el cobro, cambia el estado del
--    acceso, suma los contactos del paquete pagado y deja la constancia en el registro de
--    actividad. Si algo falla, no queda nada a medias, y el software reintenta el aviso entero.
--    Corre con los permisos de quien la llama, que es el trabajo de esa Prestadora: la base la
--    acota a sus propias filas.
--
-- Los permisos de fila de las dos tablas no cambian: ya acotan cada fila a la Prestadora del
-- trabajo que la toca, y siguen igual.
--
-- Cómo se vuelve atrás: otra migración que borre la función del aviso, vuelva a escribir la
-- función que descuenta un contacto con la condición «sólo el vigente», devuelva el índice de la
-- referencia a no único y saque la columna de la suspensión y los dos estados nuevos.

-- ---------------------------------------------------------------------------------------------
-- 1. Los estados del acceso y la fecha de la suspensión
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.accesos_intermediacion
  DROP CONSTRAINT accesos_intermediacion_estado_check;

ALTER TABLE public.accesos_intermediacion
  ADD CONSTRAINT accesos_intermediacion_estado_check
  CHECK (estado = ANY (ARRAY['vigente', 'en_gracia', 'suspendida', 'vencida', 'cancelada']));

-- El día en que el acceso en gracia queda suspendido. Lo fija el software de cobranzas al
-- informar la gracia. Vacío en todo acceso que no está en gracia ni suspendido.
ALTER TABLE public.accesos_intermediacion
  ADD COLUMN suspension_desde date;

-- El acceso en gracia sigue saliendo en la lista de lo que hay para facturar: su período corre
-- igual. El índice de esa lista pasa a cubrir los dos estados.
DROP INDEX public.idx_accesos_intermediacion_por_cobrar;

CREATE INDEX idx_accesos_intermediacion_por_cobrar
  ON public.accesos_intermediacion (prestadora_id, proximo_cobro)
  WHERE estado = ANY (ARRAY['vigente', 'en_gracia']) AND proximo_cobro IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 2. El número del aviso no se repite dentro de una Prestadora
-- ---------------------------------------------------------------------------------------------

DROP INDEX public.idx_cobros_intermediacion_referencia;

CREATE UNIQUE INDEX uq_cobros_intermediacion_referencia
  ON public.cobros_intermediacion (prestadora_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 3. Cuándo un acceso abre contactos
-- ---------------------------------------------------------------------------------------------

-- Es la única regla. La función que descuenta un contacto la usa, y el backend la repite con el
-- mismo texto en un solo lugar del código.
CREATE OR REPLACE FUNCTION interno.el_acceso_abre_contactos(
  p_estado text, p_suspension_desde date, p_vigente_hasta date
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_estado
    WHEN 'vigente' THEN true
    -- En gracia abre hasta el día anterior a la suspensión. Sin fecha de suspensión no hay
    -- fecha conocida y se niega: falla cerrado.
    WHEN 'en_gracia' THEN p_suspension_desde IS NOT NULL AND p_suspension_desde > current_date
    -- Dado de baja, abre hasta el último día del período pagado, ese día incluido.
    WHEN 'cancelada' THEN p_vigente_hasta IS NOT NULL AND p_vigente_hasta >= current_date
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION interno.el_acceso_abre_contactos(text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION interno.el_acceso_abre_contactos(text, date, date) TO trabajo_sin_persona;

-- La función que descuenta un contacto. Es la misma de antes; cambia sólo la condición del estado,
-- que ahora pregunta a la regla de arriba.
CREATE OR REPLACE FUNCTION public.consumir_contacto_intermediacion(p_acceso_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Falla cerrado: un acceso suspendido, vencido o dado de baja con el período pagado ya
  -- terminado no abre nada, aunque le haya quedado saldo.
  IF NOT interno.el_acceso_abre_contactos(v_acceso.estado, v_acceso.suspension_desde, v_acceso.vigente_hasta) THEN
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
$function$;

REVOKE ALL ON FUNCTION public.consumir_contacto_intermediacion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_contacto_intermediacion(uuid, uuid) TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 4. La función que anota el aviso
-- ---------------------------------------------------------------------------------------------

-- La acción en el registro de actividad. La hace el sistema: no hay una persona detrás, hay un
-- software de la Prestadora que avisa.
INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'aviso_de_acceso_de_match', 'consecuencia_economica', COALESCE(max(orden), 0) + 1, true
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

-- Los dos datos que la constancia lleva además de qué columnas cambiaron: de qué estado a qué
-- estado pasó el acceso. Ningún importe entra en el registro.
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'estado_anterior', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'estado_nuevo', COALESCE(max(orden), 0) + 1 FROM public.catalogo_datos_del_registro
ON CONFLICT (clave) DO NOTHING;

-- Qué contesta, siempre como objeto:
--   { ok: true, estado, saldo_contactos }               el aviso quedó anotado
--   { ok: true, repetido: true, estado, saldo_contactos } ese aviso ya estaba anotado
--   { ok: false, motivo: 'acceso_inexistente' }          el acceso no es de esta Prestadora
--   { ok: false, motivo: 'no_se_renueva' }               baja de un acceso que no se renueva solo
--   { ok: false, motivo: 'aviso_incompleto', dato }      falta un dato que ese estado exige
CREATE OR REPLACE FUNCTION public.anotar_aviso_de_acceso_de_match(
  p_acceso_id uuid,
  p_estado text,
  p_periodo date,
  p_monto numeric,
  p_moneda text,
  p_numero_del_aviso text,
  p_fecha_cobro date DEFAULT NULL,
  p_suspende_el date DEFAULT NULL,
  p_vigente_hasta date DEFAULT NULL,
  p_medio text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_acceso public.accesos_intermediacion%ROWTYPE;
  v_renueva_sola boolean;
  v_contactos integer;
  v_hay_uno_posterior boolean;
  v_estado_nuevo text;
  v_campos text[];
BEGIN
  -- Falla cerrado: sin Prestadora del trabajo no se anota nada.
  IF v_prestadora IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  IF p_estado IS NULL OR p_estado NOT IN ('pagado', 'gracia', 'suspendido', 'baja') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'estado');
  END IF;
  IF p_periodo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'periodo');
  END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'monto');
  END IF;
  IF p_moneda IS NULL OR p_moneda !~ '^[A-Z]{3}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'moneda');
  END IF;
  IF p_numero_del_aviso IS NULL OR btrim(p_numero_del_aviso) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'numero_del_aviso');
  END IF;
  IF p_estado = 'gracia' AND p_suspende_el IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'suspende_el');
  END IF;
  IF p_estado = 'baja' AND p_vigente_hasta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'aviso_incompleto', 'dato', 'vigente_hasta');
  END IF;

  -- La fila del acceso tomada: dos avisos del mismo acceso que llegan juntos se anotan de a uno.
  -- El filtro por la Prestadora está escrito además de la política de fila: un acceso de otra
  -- Prestadora contesta igual que uno que no existe.
  SELECT * INTO v_acceso
    FROM public.accesos_intermediacion
   WHERE id = p_acceso_id AND prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acceso_inexistente');
  END IF;

  SELECT f.renueva_sola, f.contactos_incluidos
    INTO v_renueva_sola, v_contactos
    FROM public.formas_de_cobro_intermediacion f
   WHERE f.id = v_acceso.forma_de_cobro_id AND f.prestadora_id = v_prestadora;

  -- Sólo se da de baja lo que se renueva solo. Lo que no se renueva termina por sí mismo.
  IF p_estado = 'baja' AND v_renueva_sola IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_se_renueva');
  END IF;

  -- Un aviso de un período anterior al último cobro anotado llegó tarde: se anota el cobro, pero
  -- no cambia el estado, que ya lo fijó un aviso más nuevo.
  SELECT EXISTS (
    SELECT 1 FROM public.cobros_intermediacion
     WHERE acceso_id = p_acceso_id AND periodo > p_periodo
  ) INTO v_hay_uno_posterior;

  IF p_estado = 'baja' THEN
    -- La baja no es un cobro, así que no deja fila en los cobros. Repetida es la que encuentra el
    -- acceso ya dado de baja con la misma fecha.
    IF v_acceso.estado = 'cancelada' AND v_acceso.vigente_hasta = p_vigente_hasta THEN
      RETURN jsonb_build_object('ok', true, 'repetido', true,
        'estado', v_acceso.estado, 'saldo_contactos', v_acceso.saldo_contactos);
    END IF;
  ELSE
    -- El cobro se anota con el número del aviso como referencia. El índice único de la
    -- referencia es lo que hace que el mismo aviso mandado dos veces se anote una sola.
    BEGIN
      INSERT INTO public.cobros_intermediacion
        (acceso_id, prestadora_id, medio, monto, moneda, periodo, estado_cobro,
         referencia_externa, fecha_cobro)
      VALUES
        (p_acceso_id, v_prestadora,
         COALESCE(NULLIF(btrim(p_medio), ''), 'otro'),
         round(p_monto, 2), p_moneda, p_periodo,
         CASE WHEN p_estado = 'pagado' THEN 'exitoso' ELSE 'fallido' END,
         btrim(p_numero_del_aviso),
         COALESCE(p_fecha_cobro, current_date));
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', true, 'repetido', true,
        'estado', v_acceso.estado, 'saldo_contactos', v_acceso.saldo_contactos);
    END;

    -- El paquete pagado suma sus contactos en la misma operación que anota el cobro. Si algo
    -- falla después, no queda un cobro anotado sin sus contactos ni contactos sin su cobro.
    IF p_estado = 'pagado' AND COALESCE(v_contactos, 0) > 0 THEN
      PERFORM public.sumar_contactos_al_saldo(p_acceso_id, v_contactos);
    END IF;
  END IF;

  v_estado_nuevo := v_acceso.estado;

  IF NOT v_hay_uno_posterior THEN
    IF p_estado = 'pagado' THEN
      -- El pago levanta la gracia, la suspensión y la baja, sin que nadie intervenga.
      UPDATE public.accesos_intermediacion
         SET estado = 'vigente', suspension_desde = NULL, cancelada_en = NULL,
             vigente_hasta = NULL, updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'vigente';
      v_campos := ARRAY['estado', 'suspension_desde', 'cancelada_en', 'vigente_hasta'];
    ELSIF p_estado = 'gracia' THEN
      UPDATE public.accesos_intermediacion
         SET estado = 'en_gracia', suspension_desde = p_suspende_el, updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'en_gracia';
      v_campos := ARRAY['estado', 'suspension_desde'];
    ELSIF p_estado = 'suspendido' THEN
      UPDATE public.accesos_intermediacion
         SET estado = 'suspendida',
             suspension_desde = COALESCE(p_suspende_el, v_acceso.suspension_desde, current_date),
             updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'suspendida';
      v_campos := ARRAY['estado', 'suspension_desde'];
    ELSE
      UPDATE public.accesos_intermediacion
         SET estado = 'cancelada', cancelada_en = now(), vigente_hasta = p_vigente_hasta,
             updated_at = now()
       WHERE id = p_acceso_id;
      v_estado_nuevo := 'cancelada';
      v_campos := ARRAY['estado', 'cancelada_en', 'vigente_hasta'];
    END IF;
  END IF;

  IF p_estado = 'pagado' AND COALESCE(v_contactos, 0) > 0 THEN
    v_campos := array_append(COALESCE(v_campos, ARRAY[]::text[]), 'saldo_contactos'::text);
  END IF;

  -- La constancia: quién (el sistema), cuándo, sobre qué acceso y qué cambió. Sin importes.
  INSERT INTO public.registro_actividad
    (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle)
  VALUES
    (v_prestadora, NULL, 'aviso_de_acceso_de_match', 'accesos_intermediacion', p_acceso_id,
     v_campos,
     jsonb_build_object('estado_anterior', v_acceso.estado, 'estado_nuevo', v_estado_nuevo));

  RETURN jsonb_build_object('ok', true, 'estado', v_estado_nuevo,
    'saldo_contactos', (SELECT saldo_contactos FROM public.accesos_intermediacion WHERE id = p_acceso_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.anotar_aviso_de_acceso_de_match(uuid, text, date, numeric, text, text, date, date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anotar_aviso_de_acceso_de_match(uuid, text, date, numeric, text, text, date, date, date, text)
  TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
