-- El soporte técnico no tiene mesa adentro de Careonys.
--
-- La migración 20261008090000 creó dos tablas para que una Prestadora pidiera soporte técnico
-- desde el Panel y leyera las respuestas. Eso dejaba las dos mitades del canal adentro del
-- producto: la mesa de solicitudes, quién atiende y el estado vivían en la base de Careonys.
--
-- El soporte técnico entra por el lado de CeltaTech (CLAUDE.md §5), así que el canal es de
-- CeltaTech y no de este producto. Las dos tablas se bajan.
--
-- La migración que las creó no se edita ni se borra: queda como historial y esto la corrige
-- adelante (celtatech/CLAUDE.md, «La base de datos: sólo por migraciones»).

BEGIN;

DROP TABLE IF EXISTS public.mensajes_de_soporte_tecnico;
DROP TABLE IF EXISTS public.solicitudes_de_soporte_tecnico;

COMMIT;

NOTIFY pgrst, 'reload schema';
