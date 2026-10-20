-- El aviso de conviviente hospitalizado sale del producto.
--
-- Al registrar la internación de un Paciente, el Panel anotaba un aviso para cada uno de los demás
-- Pacientes del mismo Cliente. El Desarrollador decidió que no hace falta. La internación misma
-- queda. El código y el esquema de la tabla quedaron en el estante de CeltaTech,
-- `Codigos-utiles/aviso-de-conviviente-hospitalizado/`. La tabla estaba vacía.
--
-- Con la tabla se van su protección por fila, sus índices y sus claves foráneas. No tenía
-- disparadores, y las funciones que usan sus políticas son compartidas con otras tablas y quedan.

BEGIN;

DROP TABLE public.alertas_contingencia_hospitalizacion;

NOTIFY pgrst, 'reload schema';

COMMIT;
