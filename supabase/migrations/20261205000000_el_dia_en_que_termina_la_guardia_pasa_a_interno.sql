-- `dia_en_que_termina_guardia` la llaman el disparador `trg_exigir_matricula_en_guardia`, el de
-- las asignaciones de turno y `asignar_turno`, y los tres corren con los permisos de quien escribe.
-- En `public` la podía ejecutar `authenticated` y no la credencial del trabajo, así que todo turno
-- que el trabajo creara o reasignara fallaba. Además, en `public` era una dirección web, y no la
-- llama ningún navegador.
--
-- Pasa a `interno`, con permiso para las dos credenciales que escriben turnos, y los tres que la
-- llaman se reescriben desde su definición vigente cambiando sólo el esquema.

ALTER FUNCTION public.dia_en_que_termina_guardia(date, time, time, smallint) SET SCHEMA interno;

REVOKE ALL ON FUNCTION interno.dia_en_que_termina_guardia(date, time, time, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.dia_en_que_termina_guardia(date, time, time, smallint)
  TO authenticated, trabajo_sin_persona;

DO $$
DECLARE
  v_funcion    regprocedure;
  v_definicion text;
BEGIN
  FOREACH v_funcion IN ARRAY ARRAY[
    'public.exigir_matricula_en_guardia()',
    'interno.exigir_matricula_en_asignacion()',
    'public.asignar_turno(uuid, uuid)'
  ]::regprocedure[] LOOP
    v_definicion := pg_get_functiondef(v_funcion);
    IF position('public.dia_en_que_termina_guardia(' IN v_definicion) = 0 THEN
      RAISE EXCEPTION '% no llama a public.dia_en_que_termina_guardia', v_funcion;
    END IF;
    EXECUTE replace(v_definicion, 'public.dia_en_que_termina_guardia(', 'interno.dia_en_que_termina_guardia(');
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
