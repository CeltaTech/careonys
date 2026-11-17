-- La fecha de nacimiento de la postulación dice lo que es.
--
-- El comentario de la columna afirmaba que con ella se comprueba la mayoría de edad contra la
-- escala legal de cada jurisdicción. Ningún control lo hace: ni la base ni el backend miran la
-- edad de quien se postula. Un comentario de la base que describe un control que no existe hace
-- creer que el control está. Se reemplaza por lo que la columna guarda.
--
-- No cambia ningún dato ni ningún permiso. Para volver atrás, se escribe el comentario anterior.

BEGIN;

COMMENT ON COLUMN public.postulaciones.fecha_nacimiento IS 'Fecha de nacimiento que declara quien se postula.';

COMMIT;

NOTIFY pgrst, 'reload schema';
