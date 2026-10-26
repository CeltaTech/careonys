-- El aviso de vencimiento que no salió se vuelve a intentar al día siguiente.
--
-- La tarea de vencimientos anota el aviso antes de mandarlo, para que dos corridas cruzadas no
-- avisen dos veces. Si después el envío falla, la anotación queda y el aviso no sale nunca. Para
-- sacar esa anotación, la tarea necesita permiso de borrar en la tabla; la política que ya tiene
-- la limita a la Prestadora con la que está trabajando.

GRANT DELETE ON public.avisos_de_documento_enviados TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
