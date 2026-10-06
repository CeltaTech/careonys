-- La subcontratación no es modalidad de trabajo.
--
-- Las modalidades de trabajo de una Prestadora son dos: prestación directa (guardada como
-- 'directa') e intermediación (guardada como 'match', su nombre comercial). Encargarle una
-- prestación a una empresa subcontratada o tercerizada es un recurso dentro de la prestación
-- directa, como el plantel propio, y no una tercera modalidad.
--
-- Las cuatro restricciones que admitían 'subcontratacion' se rehacen con los dos valores. Antes
-- de escribir esto se consultó la base: ninguna fila usa ese valor, así que nada queda afuera.

ALTER TABLE public.guardias DROP CONSTRAINT guardias_canal_modalidad_check;
ALTER TABLE public.guardias ADD CONSTRAINT guardias_canal_modalidad_check
  CHECK (canal_modalidad = ANY (ARRAY['directa'::text, 'match'::text]));

ALTER TABLE public.series_guardias DROP CONSTRAINT series_guardias_canal_modalidad_check;
ALTER TABLE public.series_guardias ADD CONSTRAINT series_guardias_canal_modalidad_check
  CHECK (canal_modalidad = ANY (ARRAY['directa'::text, 'match'::text]));

ALTER TABLE public.prestadora_modalidades DROP CONSTRAINT prestadora_modalidades_modalidad_check;
ALTER TABLE public.prestadora_modalidades ADD CONSTRAINT prestadora_modalidades_modalidad_check
  CHECK (modalidad = ANY (ARRAY['directa'::text, 'match'::text]));

ALTER TABLE public.opciones_de_lista DROP CONSTRAINT opciones_de_lista_modalidades_check;
ALTER TABLE public.opciones_de_lista ADD CONSTRAINT opciones_de_lista_modalidades_check
  CHECK (modalidades IS NULL
         OR (array_length(modalidades, 1) >= 1
             AND modalidades <@ ARRAY['directa'::text, 'match'::text]));

COMMENT ON COLUMN public.asistentes.canales IS 'En qué modalidades de trabajo está este Asistente: directa, match, o las dos. Tiene que estar dentro de lo que la Prestadora tenga habilitado. El nombre de la columna quedó de antes y no se renombra; la palabra del producto es modalidad de trabajo.';

NOTIFY pgrst, 'reload schema';
