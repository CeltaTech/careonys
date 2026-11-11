-- La alarma de las cuentas automáticas: avisa y corta.
--
-- Una cuenta automática entra con contraseña sólo cuando el backend arranca o cuando no pudo
-- renovar su pase: unas pocas veces por día. Muchas entradas seguidas quieren decir que alguien
-- más tiene la contraseña. Entonces la base desactiva la cuenta, el pase que pidió sale sin abrir
-- nada, y queda anotada la alarma, que el backend le manda por correo a CeltaTech. La Prestadora
-- no se entera.
--
-- Las contraseñas equivocadas no se cuentan: Supabase sólo las informa en el plan Teams, y el
-- proyecto está en el gratuito. Las contraseñas son al azar y no se adivinan probando.
--
-- La cuenta vuelve a funcionar cuando se le cambia la contraseña y se le quita la desactivación.
--
-- Todo lo cuenta `interno.armar_el_pase`, que Supabase llama cada vez que arma un pase. Corre
-- como `supabase_auth_admin`, y es el único rol con permiso sobre estas tablas.

-- Cuántas entradas se toleran y en cuánto tiempo. Es igual para todas las Prestadoras.
CREATE TABLE interno.alarma_de_las_cuentas_automaticas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entradas_maximas integer NOT NULL CHECK (entradas_maximas > 0),
  ventana          interval NOT NULL CHECK (ventana > interval '0')
);
CREATE UNIQUE INDEX alarma_de_las_cuentas_automaticas_una_sola ON interno.alarma_de_las_cuentas_automaticas ((true));

INSERT INTO interno.alarma_de_las_cuentas_automaticas (entradas_maximas, ventana) VALUES (10, interval '1 hour');

-- Las entradas con contraseña dentro de la ventana. Las anteriores se borran al contar.
CREATE TABLE interno.entradas_de_cuentas_automaticas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL REFERENCES interno.cuentas_automaticas (id) ON DELETE CASCADE,
  prestadora_id uuid REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  creada_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entradas_de_cuentas_automaticas_por_cuenta ON interno.entradas_de_cuentas_automaticas (cuenta_id, creada_en);

-- Cada vez que una cuenta quedó desactivada. Guarda el nombre de la cuenta, para que el aviso
-- salga aunque la cuenta se borre.
CREATE TABLE interno.alarmas_de_cuentas_automaticas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  prestadora_id uuid REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  cuenta        text NOT NULL,
  entradas      integer NOT NULL,
  ventana       interval NOT NULL,
  sono_en       timestamptz NOT NULL DEFAULT now(),
  avisada_en    timestamptz
);

ALTER TABLE interno.alarma_de_las_cuentas_automaticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE interno.entradas_de_cuentas_automaticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE interno.alarmas_de_cuentas_automaticas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON interno.alarma_de_las_cuentas_automaticas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON interno.entradas_de_cuentas_automaticas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON interno.alarmas_de_cuentas_automaticas FROM PUBLIC, anon, authenticated;

GRANT SELECT ON interno.alarma_de_las_cuentas_automaticas TO supabase_auth_admin;
CREATE POLICY la_lee_quien_arma_el_pase ON interno.alarma_de_las_cuentas_automaticas
  FOR SELECT TO supabase_auth_admin USING (true);

GRANT SELECT, INSERT, DELETE ON interno.entradas_de_cuentas_automaticas TO supabase_auth_admin;
CREATE POLICY las_cuenta_quien_arma_el_pase ON interno.entradas_de_cuentas_automaticas
  FOR ALL TO supabase_auth_admin USING (true) WITH CHECK (true);

GRANT INSERT ON interno.alarmas_de_cuentas_automaticas TO supabase_auth_admin;
CREATE POLICY la_anota_quien_arma_el_pase ON interno.alarmas_de_cuentas_automaticas
  FOR INSERT TO supabase_auth_admin WITH CHECK (true);

CREATE OR REPLACE FUNCTION interno.armar_el_pase(event jsonb) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
AS $$
DECLARE
  v_cuenta   interno.cuentas_automaticas;
  v_alarma   interno.alarma_de_las_cuentas_automaticas;
  v_entradas integer;
  v_datos    jsonb;
BEGIN
  SELECT * INTO v_cuenta FROM interno.cuentas_automaticas
   WHERE id = (event ->> 'user_id')::uuid;

  -- Una persona: el pase sale como siempre.
  IF NOT FOUND THEN
    RETURN event;
  END IF;

  -- Sólo se cuentan las entradas con contraseña: renovar el pase no es entrar.
  IF event ->> 'authentication_method' = 'password' THEN
    SELECT * INTO v_alarma FROM interno.alarma_de_las_cuentas_automaticas;
    -- Sin la regla no se sabe cuántas son demasiadas: no entra nadie.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falta la regla de la alarma de las cuentas automáticas';
    END IF;

    DELETE FROM interno.entradas_de_cuentas_automaticas
     WHERE cuenta_id = v_cuenta.id AND creada_en < now() - v_alarma.ventana;
    INSERT INTO interno.entradas_de_cuentas_automaticas (cuenta_id, prestadora_id)
      VALUES (v_cuenta.id, v_cuenta.prestadora_id);
    SELECT count(*) INTO v_entradas FROM interno.entradas_de_cuentas_automaticas
     WHERE cuenta_id = v_cuenta.id;

    IF v_entradas > v_alarma.entradas_maximas THEN
      -- Desactivada: Supabase no la deja entrar ni renovar. Se reactiva al cambiarle la contraseña.
      UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = v_cuenta.id;
      INSERT INTO interno.alarmas_de_cuentas_automaticas (cuenta_id, prestadora_id, cuenta, entradas, ventana)
        SELECT v_cuenta.id, v_cuenta.prestadora_id, split_part(u.email, '@', 1), v_entradas, v_alarma.ventana
          FROM auth.users u WHERE u.id = v_cuenta.id;
      -- El pase de esta entrada sale igual, porque si no Supabase deshace todo lo anterior. Pero
      -- sale sin rol de trabajo y sin Prestadora: no abre nada.
      RETURN jsonb_build_object('claims',
        ((event -> 'claims') - 'prestadora_id' - 'trabajo') || jsonb_build_object('role', 'anon'));
    END IF;
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

-- Lo que el backend lee para mandar el correo, y con lo que anota que ya lo mandó. Sólo la cuenta
-- que pide la lista, que no es de ninguna Prestadora, las alcanza.
CREATE FUNCTION public.alarmas_de_cuentas_automaticas_a_avisar()
  RETURNS TABLE (id uuid, cuenta text, entradas integer, minutos integer, sono_en timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT a.id, a.cuenta, a.entradas, (extract(epoch FROM a.ventana) / 60)::integer, a.sono_en
    FROM interno.alarmas_de_cuentas_automaticas a
   WHERE a.avisada_en IS NULL
     AND auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND auth.jwt() ->> 'prestadora_id' IS NULL
   ORDER BY a.sono_en
$$;

CREATE FUNCTION public.alarma_de_cuenta_automatica_avisada(p_alarma uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO ''
AS $$
  UPDATE interno.alarmas_de_cuentas_automaticas SET avisada_en = now()
   WHERE id = p_alarma AND avisada_en IS NULL
     AND auth.jwt() ->> 'role' = 'trabajo_sin_persona'
     AND auth.jwt() ->> 'prestadora_id' IS NULL
$$;

REVOKE EXECUTE ON FUNCTION public.alarmas_de_cuentas_automaticas_a_avisar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alarma_de_cuenta_automatica_avisada(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alarmas_de_cuentas_automaticas_a_avisar() TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.alarma_de_cuenta_automatica_avisada(uuid) TO trabajo_sin_persona;

-- El correo de la alarma. Es de CeltaTech: ninguna Prestadora lo cambia.
INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('alarma_de_cuenta_automatica.asunto', '{"es-AR": "Cuenta automática desactivada", "en": "Automatic account deactivated", "pt-BR": "Conta automática desativada"}'::jsonb, false, true),
  ('alarma_de_cuenta_automatica.cuerpo', '{"es-AR": "La cuenta automática {{cuenta}} entró {{entradas}} veces en {{minutos}} minutos y quedó desactivada. Para volver a activarla, cámbiele la contraseña.", "en": "The automatic account {{cuenta}} signed in {{entradas}} times in {{minutos}} minutes and was deactivated. To reactivate it, change its password.", "pt-BR": "A conta automática {{cuenta}} entrou {{entradas}} vezes em {{minutos}} minutos e foi desativada. Para reativá-la, altere a senha."}'::jsonb, false, true);

-- El esquema interno ya no guarda sólo funciones.
COMMENT ON SCHEMA interno IS 'Lo interno de la base: las funciones que usan las políticas de RLS y las cuentas automáticas. Está fuera de la lista de esquemas publicados de supabase/config.toml a propósito, para que nada de acá sea una dirección web.';

NOTIFY pgrst, 'reload schema';
