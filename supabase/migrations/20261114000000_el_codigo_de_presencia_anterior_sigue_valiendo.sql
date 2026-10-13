-- El código de presencia se renueva cada tantos segundos, y quien lo lee justo en el cambio lo
-- mandaba ya vencido. Ahora, al renovarse, el código anterior sigue valiendo mientras valga el
-- nuevo: alcanza para que una lectura hecha en el cambio pase, y una foto deja de servir enseguida.
--
-- El anterior se guarda sólo si estaba vigente o venció hace menos de un período: un código que
-- se mostró hace rato no revive porque alguien vuelva a abrir la pantalla.
BEGIN;

ALTER TABLE public.codigos_de_presencia
  ADD COLUMN codigo_verificador_anterior text,
  ADD COLUMN anterior_expira_en timestamptz;

CREATE FUNCTION interno.guardar_codigo_de_presencia_anterior() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'interno'
    AS $$
BEGIN
  IF NEW.codigo_verificador IS DISTINCT FROM OLD.codigo_verificador THEN
    IF OLD.expira_en > now() - (NEW.expira_en - now()) THEN
      NEW.codigo_verificador_anterior := OLD.codigo_verificador;
      NEW.anterior_expira_en := NEW.expira_en;
    ELSE
      NEW.codigo_verificador_anterior := NULL;
      NEW.anterior_expira_en := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guardar_codigo_de_presencia_anterior
  BEFORE UPDATE ON public.codigos_de_presencia
  FOR EACH ROW EXECUTE FUNCTION interno.guardar_codigo_de_presencia_anterior();

COMMIT;

NOTIFY pgrst, 'reload schema';
