-- Las calificaciones son comunes a las dos modalidades.
--
-- Cada Asistente tiene un solo Legajo, y sus calificaciones son una sola lista: no hay
-- calificaciones de prestación directa ni de Match. Por eso sale la marca de modalidad que cada
-- calificación copiaba del turno de guardia calificado.
--
-- El Administrador de la Prestadora elige, en cualquier calificación, si la ven los Clientes de
-- Match. Nadie de la Prestadora cambia las estrellas ni el comentario: eso ya lo impide el permiso
-- por columna, que sólo deja tocar el descargo y la marca de visible.

DROP POLICY IF EXISTS admin_prestadora_elige_las_publicadas_de_match ON public.calificaciones_asistente;

DROP TRIGGER IF EXISTS calificacion_toma_la_modalidad_del_turno ON public.calificaciones_asistente;
DROP FUNCTION IF EXISTS interno.calificacion_toma_la_modalidad_del_turno();

ALTER TABLE public.calificaciones_asistente
  DROP CONSTRAINT IF EXISTS calificaciones_asistente_canal_modalidad_valida,
  DROP COLUMN IF EXISTS canal_modalidad;

CREATE POLICY admin_prestadora_elige_las_visibles
  ON public.calificaciones_asistente
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_admin_prestadora())
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_admin_prestadora());

NOTIFY pgrst, 'reload schema';
