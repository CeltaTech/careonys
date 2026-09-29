-- El texto del producto lo lee cada Prestadora
--
-- QUÉ FALTABA
-- El backend carga los mensajes del sistema al arrancar, y lo hacía con la llave maestra
-- porque los textos del producto —los que salen cuando una Prestadora no escribió el
-- suyo— no son de ninguna Prestadora, y la credencial del trabajo sin persona sólo ve
-- los renglones de la suya.
--
-- QUÉ HACE
-- Le deja leer también los textos del producto, igual que a una persona con sesión, y
-- sólo con una Prestadora resuelta, como las demás listas que son iguales para todas.
-- Los textos propios de otra Prestadora siguen sin verse.
--
-- CÓMO SE VUELVE ATRÁS
-- Borrando la política. No se toca ningún dato.

DROP POLICY IF EXISTS trabajo_sin_persona_lee_el_texto_del_producto ON public.mensajes_del_sistema;
CREATE POLICY trabajo_sin_persona_lee_el_texto_del_producto ON public.mensajes_del_sistema
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id IS NULL AND interno.current_tenant() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
