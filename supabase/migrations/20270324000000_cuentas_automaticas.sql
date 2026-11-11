-- Las cuentas automáticas: el backend deja de fabricar sus pases.
--
-- Cada Prestadora tiene su cuenta automática, con su propia contraseña. El backend entra con ella
-- como entra una persona, y el pase lo arma Supabase: esta función le pone el rol del trabajo y la
-- Prestadora. Nadie fuera de Supabase puede armar un pase que alcance a otra Prestadora.
--
-- La cuenta sin Prestadora es la que sólo pregunta la lista a recorrer.
--
-- La importación de planillas tiene su propia cuenta en cada Prestadora: es el único trabajo que
-- ve lo importado sin confirmar (`interno.es_la_importacion`), y lo reconoce por el trabajo que
-- dice el pase. Ese dato lo pone esta función, no el backend.

CREATE TABLE interno.cuentas_automaticas (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  prestadora_id uuid REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  rol           text NOT NULL CHECK (rol IN ('trabajo_sin_persona', 'copia_de_respaldo')),
  trabajo       text CHECK (trabajo IN ('importación de planillas')),
  CHECK (rol = 'trabajo_sin_persona' OR prestadora_id IS NOT NULL),
  CHECK (trabajo IS NULL OR (rol = 'trabajo_sin_persona' AND prestadora_id IS NOT NULL))
);

CREATE UNIQUE INDEX cuentas_automaticas_una_por_prestadora_y_rol
  ON interno.cuentas_automaticas (coalesce(prestadora_id, '00000000-0000-0000-0000-000000000000'::uuid), rol, coalesce(trabajo, ''));

ALTER TABLE interno.cuentas_automaticas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON interno.cuentas_automaticas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON interno.cuentas_automaticas TO supabase_auth_admin;
CREATE POLICY la_lee_quien_arma_el_pase ON interno.cuentas_automaticas
  FOR SELECT TO supabase_auth_admin USING (true);

CREATE FUNCTION interno.armar_el_pase(event jsonb) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path TO ''
AS $$
DECLARE
  v_cuenta interno.cuentas_automaticas;
  v_datos  jsonb;
BEGIN
  SELECT * INTO v_cuenta FROM interno.cuentas_automaticas
   WHERE id = (event ->> 'user_id')::uuid;

  -- Una persona: el pase sale como siempre.
  IF NOT FOUND THEN
    RETURN event;
  END IF;

  v_datos := (event -> 'claims') || jsonb_build_object('role', v_cuenta.rol);
  IF v_cuenta.prestadora_id IS NOT NULL THEN
    v_datos := v_datos || jsonb_build_object('prestadora_id', v_cuenta.prestadora_id);
  END IF;
  IF v_cuenta.trabajo IS NOT NULL THEN
    v_datos := v_datos || jsonb_build_object('trabajo', v_cuenta.trabajo);
  ELSE
    v_datos := v_datos - 'trabajo';
  END IF;
  RETURN jsonb_build_object('claims', v_datos);
END;
$$;

REVOKE EXECUTE ON FUNCTION interno.armar_el_pase(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION interno.armar_el_pase(jsonb) TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';
