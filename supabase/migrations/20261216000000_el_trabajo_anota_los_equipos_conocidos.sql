-- El trabajo sin persona anota y revoca los equipos conocidos de su Prestadora.
--
-- La fila de un equipo conocido decide si a quien entra se le pide el segundo factor. Por eso no
-- la escribe la persona con su propia credencial: con la clave sola ya tiene sesión, y si pudiera
-- anotarse un equipo se ahorraría el código. La escribe el backend, con el trabajo de la
-- Prestadora de esa persona, después de comprobar lo que haya que comprobar. Leerla sí la lee la
-- persona, que ya podía.
--
-- Se le da sólo lo que usan el alta y la revocación —anotar el equipo, volver a anotarlo si ya
-- estaba y marcarlo revocado— y nada de borrar.

GRANT SELECT (id, prestadora_id, usuario_id, marca_verificador, revocado_en)
  ON public.equipos_conocidos TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, usuario_id, marca_verificador, ultima_entrada_en, revocado_en)
  ON public.equipos_conocidos TO trabajo_sin_persona;
GRANT UPDATE (prestadora_id, usuario_id, marca_verificador, ultima_entrada_en, revocado_en)
  ON public.equipos_conocidos TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_ve_los_equipos ON public.equipos_conocidos
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_anota_los_equipos ON public.equipos_conocidos
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_actualiza_los_equipos ON public.equipos_conocidos
  FOR UPDATE TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
