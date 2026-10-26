-- La autorización de acceso rige desde que el titular la firma, y cada persona autorizada tiene su
-- Ficha en el Directorio de Personas.
--
-- Hasta ahora los accesos se escribían al cargar la autorización y la firma llegaba después. Ahora
-- la autorización guarda los accesos que pide, y recién al firmarse —con el código en la
-- aplicación o con el documento firmado subido al Panel— pasan a `permisos_personas_autorizadas`.
-- Hasta entonces sigue rigiendo lo anterior.
--
-- La persona autorizada se guarda una sola vez, en su Ficha de Persona, y de ahí sale el DNI que
-- dice el documento. Las dos tablas están vacías, así que las columnas nacen obligatorias.

ALTER TABLE public.instrucciones_acceso_personas_autorizadas
  ADD COLUMN accesos_pedidos jsonb NOT NULL;

ALTER TABLE public.personas_autorizadas
  ADD COLUMN persona_id uuid NOT NULL REFERENCES public.personas (id),
  ADD CONSTRAINT personas_autorizadas_una_vez_por_cliente UNIQUE (cliente_id, persona_id);

-- La Ficha tiene que ser de la misma Prestadora que el Cliente. La tabla no lleva la Prestadora,
-- así que la comparación la hace la base al escribir, y no queda en manos de quien llama.
CREATE FUNCTION interno.la_persona_autorizada_es_de_la_prestadora()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, interno
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.clientes c
      JOIN public.personas p ON p.prestadora_id = c.prestadora_id
     WHERE c.id = NEW.cliente_id
       AND p.id = NEW.persona_id
  ) THEN
    RAISE EXCEPTION 'persona_de_otra_prestadora';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_persona_autorizada_es_de_la_prestadora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.la_persona_autorizada_es_de_la_prestadora() TO authenticated, service_role;

CREATE TRIGGER la_persona_autorizada_es_de_la_prestadora
  BEFORE INSERT OR UPDATE OF cliente_id, persona_id ON public.personas_autorizadas
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_autorizada_es_de_la_prestadora();

NOTIFY pgrst, 'reload schema';
