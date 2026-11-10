-- «Ficha de Persona» deja de usarse: se habla de los datos de la persona, del Paciente, del
-- Pagador. La palabra retirada sale también de los nombres guardados. Renombrar no cambia nada
-- más: las políticas y los disparadores guardan el identificador interno de la función, y los
-- permisos quedan como estaban.

ALTER FUNCTION interno.el_email_de_la_ficha_pasa_a_la_cuenta()
  RENAME TO el_email_de_la_persona_pasa_a_la_cuenta;

ALTER TRIGGER el_email_de_la_ficha_pasa_a_la_cuenta ON public.personas
  RENAME TO el_email_de_la_persona_pasa_a_la_cuenta;

ALTER FUNCTION interno.lee_al_paciente_de_la_ficha(uuid)
  RENAME TO lee_los_datos_del_paciente;

ALTER FUNCTION public.completar_genero_de_la_ficha(uuid, text)
  RENAME TO completar_genero_de_la_persona;

NOTIFY pgrst, 'reload schema';
