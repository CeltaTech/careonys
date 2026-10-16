-- El trabajo sin persona guarda la configuración de la Prestadora que la base dejó ver a quien pide.
--
-- Lo hace el backend desde Configuración del Panel, con la Prestadora ya resuelta por la
-- credencial de quien pide. Las siete funciones que guardan una clave en la caja fuerte o que
-- reordenan las etapas de incorporación reciben de qué Prestadora es lo que tocan y no lo
-- comprobaban: alcanzaba con que quien las llamara fuera la llave maestra. Ahora comprueban, con
-- la misma función que usa la lectura del token, que esa Prestadora sea la de quien llama; la
-- llave maestra sigue pasando igual, así que nada cambia para quien todavía entra con ella.
--
-- Se le da sólo lo que se usa, y nada de borrar.

CREATE OR REPLACE FUNCTION public.guardar_app_secret_whatsapp(p_prestadora_id uuid, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT app_secret_secret_id INTO v_secret_id
  FROM configuracion_whatsapp_prestadora
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'whatsapp_app_secret_' || p_prestadora_id::text);
    INSERT INTO configuracion_whatsapp_prestadora (prestadora_id, app_secret_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET app_secret_secret_id = EXCLUDED.app_secret_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE configuracion_whatsapp_prestadora SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_conexion_con_software_externo(p_prestadora_id uuid, p_clase text, p_software text, p_credencial text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_software_anterior TEXT;
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT software, credencial_secret_id
    INTO v_software_anterior, v_secret_id
  FROM conexiones_con_software_externo
  WHERE prestadora_id = p_prestadora_id AND clase = p_clase;

  INSERT INTO conexiones_con_software_externo (prestadora_id, clase, software)
  VALUES (p_prestadora_id, p_clase, p_software)
  ON CONFLICT (prestadora_id, clase)
  DO UPDATE SET software = EXCLUDED.software, updated_at = NOW();

  -- Cambiar de software deja sin valor la credencial anterior: es la llave de otra puerta. Se
  -- borra la caja fuerte en vez de dejarla ahi, para que la pantalla no diga que hay una
  -- credencial cargada cuando la que hay no sirve.
  IF v_secret_id IS NOT NULL AND v_software_anterior IS DISTINCT FROM p_software THEN
    UPDATE conexiones_con_software_externo
       SET credencial_secret_id = NULL, updated_at = NOW()
     WHERE prestadora_id = p_prestadora_id AND clase = p_clase;
    DELETE FROM vault.secrets WHERE id = v_secret_id;
    v_secret_id := NULL;
  END IF;

  -- Vacio quiere decir «no se toca la que hay», no «borrala». Para sacarla se cambia de software.
  IF p_credencial IS NULL OR length(btrim(p_credencial)) = 0 THEN
    RETURN v_secret_id;
  END IF;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      p_credencial,
      'software_externo_' || p_clase || '_' || p_prestadora_id::text
    );
    UPDATE conexiones_con_software_externo
       SET credencial_secret_id = v_secret_id, updated_at = NOW()
     WHERE prestadora_id = p_prestadora_id AND clase = p_clase;
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_credencial);
    UPDATE conexiones_con_software_externo SET updated_at = NOW()
     WHERE prestadora_id = p_prestadora_id AND clase = p_clase;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_secreto_del_aviso_de_cobranza(p_prestadora_id uuid, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT secreto_del_aviso_secret_id INTO v_secret_id
  FROM configuracion_facturacion_clientes
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'aviso_de_cobranza_' || p_prestadora_id::text);
    INSERT INTO configuracion_facturacion_clientes (prestadora_id, secreto_del_aviso_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET secreto_del_aviso_secret_id = EXCLUDED.secreto_del_aviso_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE configuracion_facturacion_clientes SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_secreto_del_aviso_de_facturacion(p_prestadora_id uuid, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT secreto_del_aviso_de_facturacion_secret_id INTO v_secret_id
  FROM configuracion_facturacion_clientes
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'aviso_de_facturacion_' || p_prestadora_id::text);
    INSERT INTO configuracion_facturacion_clientes (prestadora_id, secreto_del_aviso_de_facturacion_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET secreto_del_aviso_de_facturacion_secret_id = EXCLUDED.secreto_del_aviso_de_facturacion_secret_id,
                  updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE configuracion_facturacion_clientes SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_token_whatsapp(p_prestadora_id uuid, p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT token_secret_id INTO v_secret_id
  FROM configuracion_whatsapp_prestadora
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_token, 'whatsapp_token_' || p_prestadora_id::text);
    UPDATE configuracion_whatsapp_prestadora
    SET token_secret_id = v_secret_id, updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_token);
    UPDATE configuracion_whatsapp_prestadora SET updated_at = NOW() WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_verify_token_whatsapp(p_prestadora_id uuid, p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT verify_token_secret_id INTO v_secret_id
  FROM configuracion_whatsapp_prestadora
  WHERE prestadora_id = p_prestadora_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_token, 'whatsapp_verify_token_' || p_prestadora_id::text);
    INSERT INTO configuracion_whatsapp_prestadora (prestadora_id, verify_token_secret_id)
    VALUES (p_prestadora_id, v_secret_id)
    ON CONFLICT (prestadora_id)
    DO UPDATE SET verify_token_secret_id = EXCLUDED.verify_token_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_token);
    UPDATE configuracion_whatsapp_prestadora SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id;
  END IF;

  RETURN v_secret_id;
END;
$function$;

-- Las dos etapas tienen que ser de la Prestadora de quien llama; si alguna no lo es, no se toca
-- ninguna.
CREATE OR REPLACE FUNCTION public.intercambiar_orden_etapas_incorporacion(p_id_a uuid, p_orden_a smallint, p_id_b uuid, p_orden_b smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT count(*) FROM etapas_incorporacion_asistente
       WHERE id IN (p_id_a, p_id_b) AND interno.le_corresponde(prestadora_id)) <> 2 THEN
    RAISE EXCEPTION 'las etapas no corresponden a quien llama' USING ERRCODE = '42501';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  UPDATE etapas_incorporacion_asistente SET orden = p_orden_a WHERE id = p_id_a;
  UPDATE etapas_incorporacion_asistente SET orden = p_orden_b WHERE id = p_id_b;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.guardar_app_secret_whatsapp(uuid, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_secreto_del_aviso_de_cobranza(uuid, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_secreto_del_aviso_de_facturacion(uuid, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_token_whatsapp(uuid, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_verify_token_whatsapp(uuid, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.intercambiar_orden_etapas_incorporacion(uuid, smallint, uuid, smallint) TO trabajo_sin_persona;

-- La fila de la Prestadora ya tiene la política del trabajo para cambiarla; faltaban las columnas
-- que se guardan desde Configuración.
GRANT UPDATE (
  moneda,
  minutos_aviso_previo_guardia,
  dias_aviso_vencimiento_documentos,
  modo_control_matricula,
  dias_generacion_series_guardia,
  politica_verificacion_alta_manual,
  cierre_por_inactividad_activo,
  cierre_por_inactividad_minutos
) ON public.prestadoras TO trabajo_sin_persona;

-- La revisión con IA de los reportes ya tiene la política y la lectura; faltaba guardarla.
GRANT INSERT (prestadora_id, palabras_clave, reportes_a_analizar, roja_avisa_cliente, amarilla_avisa_cliente, amarilla_avisa_coordinador, updated_at)
  ON public.configuracion_alertas_ia TO trabajo_sin_persona;
GRANT UPDATE (prestadora_id, palabras_clave, reportes_a_analizar, roja_avisa_cliente, amarilla_avisa_cliente, amarilla_avisa_coordinador, updated_at)
  ON public.configuracion_alertas_ia TO trabajo_sin_persona;

-- Qué muestran las aplicaciones de teléfono.
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.configuracion_visibilidad_app
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());
GRANT SELECT (prestadora_id, clave, visible) ON public.configuracion_visibilidad_app TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, clave, visible, updated_at) ON public.configuracion_visibilidad_app TO trabajo_sin_persona;
GRANT UPDATE (prestadora_id, clave, visible, updated_at) ON public.configuracion_visibilidad_app TO trabajo_sin_persona;

-- Cómo se les paga a los Asistentes.
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.configuracion_pago_asistentes
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());
GRANT SELECT (prestadora_id) ON public.configuracion_pago_asistentes TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, regla, frecuencia_pago, updated_at) ON public.configuracion_pago_asistentes TO trabajo_sin_persona;
GRANT UPDATE (prestadora_id, regla, frecuencia_pago, updated_at) ON public.configuracion_pago_asistentes TO trabajo_sin_persona;

-- Con qué software de facturación y de cobranzas está conectada. Sólo se lee: lo que se guarda
-- pasa por la función de arriba.
CREATE POLICY trabajo_sin_persona_lee_las_de_esta_prestadora ON public.conexiones_con_software_externo
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());
GRANT SELECT (prestadora_id, clase, software, credencial_secret_id)
  ON public.conexiones_con_software_externo TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
