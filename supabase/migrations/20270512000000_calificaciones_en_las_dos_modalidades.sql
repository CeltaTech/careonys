-- Las calificaciones se ven en las dos modalidades, y sólo en Match la Prestadora elige cuáles ven
-- los Clientes.
--
-- En la prestación directa el Cliente nunca ve las calificaciones que dejaron otros, así que ahí
-- no hay nada que mostrar ni ocultar. En Match, el único que elige cuáles se publican en la
-- vidriera es el Administrador de la Prestadora. Nadie de la Prestadora cambia las estrellas ni el
-- comentario: eso ya lo impedía el permiso por columna, que sólo deja tocar el descargo y la marca
-- de publicada.
--
-- Cada calificación guarda la modalidad del turno de guardia que califica. La completa la base al
-- insertarla, copiada del turno, y nadie la escribe ni la cambia: así la vidriera, el Panel y la
-- aplicación del Asistente leen la misma respuesta sin tener que ver el turno.

ALTER TABLE public.calificaciones_asistente
  ADD COLUMN canal_modalidad text;

UPDATE public.calificaciones_asistente c
   SET canal_modalidad = g.canal_modalidad
  FROM public.turnos_guardia g
 WHERE g.id = c.turno_guardia_id;

ALTER TABLE public.calificaciones_asistente
  ALTER COLUMN canal_modalidad SET NOT NULL,
  ADD CONSTRAINT calificaciones_asistente_canal_modalidad_valida
    CHECK (canal_modalidad IN ('directa', 'intermediacion'));

CREATE OR REPLACE FUNCTION interno.calificacion_toma_la_modalidad_del_turno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  -- Lo que venga en el pedido no cuenta: la modalidad es la del turno de guardia calificado.
  SELECT g.canal_modalidad INTO NEW.canal_modalidad
    FROM public.turnos_guardia g
   WHERE g.id = NEW.turno_guardia_id;
  IF NEW.canal_modalidad IS NULL THEN
    RAISE EXCEPTION 'turno_guardia_inexistente' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.calificacion_toma_la_modalidad_del_turno() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER calificacion_toma_la_modalidad_del_turno
  BEFORE INSERT ON public.calificaciones_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.calificacion_toma_la_modalidad_del_turno();

-- Elegir cuáles se publican: sólo el Administrador de la Prestadora, y sólo las de Match.
DROP POLICY IF EXISTS admin_prestadora_actualiza_visibilidad ON public.calificaciones_asistente;

CREATE POLICY admin_prestadora_elige_las_publicadas_de_match
  ON public.calificaciones_asistente
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_admin_prestadora()
         AND canal_modalidad = 'intermediacion')
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_admin_prestadora()
              AND canal_modalidad = 'intermediacion');

NOTIFY pgrst, 'reload schema';
