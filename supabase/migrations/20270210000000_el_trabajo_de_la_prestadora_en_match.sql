-- Lo que el Panel de Match hacía con la llave maestra pasa al trabajo de la Prestadora, de a una
-- Prestadora por vez. Cuatro cosas le faltaban a ese trabajo:
--
-- 1. Guardar en la caja fuerte la credencial de cobro y el secreto de firma de una pasarela. Las
--    dos funciones reciben la Prestadora como parámetro y no la comparaban con nada: quien podía
--    ejecutarlas escribía en cualquiera. Ahora la comparan con la Prestadora de quien llama, y si
--    no coincide —o no hay ninguna— no guardan.
-- 2. Canjear el QR de cobro en efectivo: leerlo y marcarlo usado.
-- 3. Cambiar si una calificación se ve en público, que es lo único de ella que se toca.
-- 4. Leer la auditoría de advertencias legales.

CREATE OR REPLACE FUNCTION public.guardar_credencial_pasarela_pago(p_prestadora_id uuid, p_proveedor text, p_credencial text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_prestadora_id IS NULL OR p_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'La Prestadora no es la de quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT credencial_secret_id INTO v_secret_id
  FROM credenciales_pasarela_pago
  WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_credencial, 'pasarela_' || p_proveedor || '_' || p_prestadora_id::text);
    INSERT INTO credenciales_pasarela_pago (prestadora_id, proveedor, credencial_secret_id)
    VALUES (p_prestadora_id, p_proveedor, v_secret_id)
    ON CONFLICT (prestadora_id, proveedor)
    DO UPDATE SET credencial_secret_id = EXCLUDED.credencial_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_credencial);
    UPDATE credenciales_pasarela_pago SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;
  END IF;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_secreto_firma_pasarela_pago(p_prestadora_id uuid, p_proveedor text, p_secreto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_prestadora_id IS NULL OR p_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'La Prestadora no es la de quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT secreto_firma_secret_id INTO v_secret_id
  FROM credenciales_pasarela_pago
  WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secreto, 'pasarela_firma_' || p_proveedor || '_' || p_prestadora_id::text);
    INSERT INTO credenciales_pasarela_pago (prestadora_id, proveedor, secreto_firma_secret_id)
    VALUES (p_prestadora_id, p_proveedor, v_secret_id)
    ON CONFLICT (prestadora_id, proveedor)
    DO UPDATE SET secreto_firma_secret_id = EXCLUDED.secreto_firma_secret_id, updated_at = NOW();
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secreto);
    UPDATE credenciales_pasarela_pago SET updated_at = NOW()
    WHERE prestadora_id = p_prestadora_id AND proveedor = p_proveedor;
  END IF;

  RETURN v_secret_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_credencial_pasarela_pago(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_secreto_firma_pasarela_pago(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_credencial_pasarela_pago(uuid, text, text) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.guardar_secreto_firma_pasarela_pago(uuid, text, text) TO trabajo_sin_persona;

-- El QR: se lee por su token y se marca usado. La Prestadora sale del acceso al que pertenece.
GRANT SELECT (id, acceso_id, monto, periodo, expira_en, usado_en),
      UPDATE (usado_en, usado_por, cobro_id)
  ON public.qr_cobro_efectivo TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.qr_cobro_efectivo
  FOR ALL TO trabajo_sin_persona
  USING (EXISTS (
    SELECT 1 FROM public.accesos_intermediacion a
     WHERE a.id = qr_cobro_efectivo.acceso_id
       AND a.prestadora_id = interno.prestadora_actual()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.accesos_intermediacion a
     WHERE a.id = qr_cobro_efectivo.acceso_id
       AND a.prestadora_id = interno.prestadora_actual()));

-- La calificación: sólo la columna de la visibilidad.
GRANT UPDATE (visible_publica) ON public.calificaciones_asistente TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.calificaciones_asistente
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La auditoría legal: leerla. Escribirla ya podía.
GRANT SELECT (id, prestadora_id, usuario_id, funcion_clave, jurisdiccion, texto_mostrado, created_at)
  ON public.auditoria_advertencias_legales TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_lee_la_auditoria_legal ON public.auditoria_advertencias_legales
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
