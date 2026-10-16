-- El trabajo sin persona agenda, mueve, cancela y cierra la entrevista de una postulación.
--
-- Lo hace el backend después de comprobar lo que la base no comprueba —que la fecha no haya
-- pasado, que no haya otra entrevista viva, cuál es el cierre—, y le avisa al postulante con lo
-- que él mismo dejó al postularse. Las dos tablas ya tienen la política del trabajo acotada a la
-- Prestadora actual; faltaba el permiso sobre las columnas que usa.
--
-- Se le da sólo lo que se usa, y nada de borrar.

GRANT SELECT (id, prestadora_id, nombre, email, idioma)
  ON public.postulaciones TO trabajo_sin_persona;

GRANT INSERT (prestadora_id, postulacion_id, agendada_para, llave_publica, sala_videollamada, agendada_por)
  ON public.entrevistas_postulacion TO trabajo_sin_persona;
GRANT UPDATE (agendada_para, estado, sala_videollamada, cerrada_por, cerrada_at, observaciones)
  ON public.entrevistas_postulacion TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
