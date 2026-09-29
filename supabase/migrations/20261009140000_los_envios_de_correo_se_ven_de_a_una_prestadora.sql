-- Los envíos de correo se ven de a una Prestadora
--
-- QUÉ HABÍA
-- Además de la política de cada Prestadora, `envios_de_correo` tenía una que dejaba ver
-- todos los renglones, de todas las Prestadoras, a quien tuviera el rol técnico. Era una
-- puerta que alcanzaba a todas las Organizaciones (`celtatech/CLAUDE.md` §5).
--
-- QUÉ HACE
-- La saca. Queda sólo la política que muestra lo de la Prestadora en curso.
--
-- QUÉ NO SE PIERDE
-- Ninguna pantalla lee esta tabla con la sesión de una persona: la cuenta contra el tope
-- del despachante la hace el backend, que devuelve dos totales y ningún renglón.
--
-- CÓMO SE VUELVE ATRÁS
-- Volviendo a crear la política. No se toca ningún dato.

DROP POLICY IF EXISTS "superadmin_ve_todos_los_envios_de_correo" ON "public"."envios_de_correo";

NOTIFY pgrst, 'reload schema';
