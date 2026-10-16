-- El trabajo sin persona lee los dos registros de auditoría de su Prestadora.
--
-- La administración del Panel los lee con la credencial del trabajo de la Prestadora sobre la que
-- está parada: con la suya, cada renglón saldría sin el nombre de quien lo hizo, porque de
-- `usuarios` cada persona lee sólo su propia fila. Las políticas del trabajo ya existen y lo
-- acotan a `interno.prestadora_actual()`; faltaba el permiso de tabla, que hasta acá era sólo de
-- escritura. Lectura y nada más: el registro no se cambia.

GRANT SELECT ON public.auditoria_de_accesos TO trabajo_sin_persona;
GRANT SELECT ON public.registro_actividad TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
