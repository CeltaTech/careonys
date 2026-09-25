-- «Su Coordinador», no «el Coordinador».
--
-- Cinco textos dirigidos a la Familia la mandaban a comunicarse con «el Coordinador», como si
-- hubiera uno solo y ella tuviera que saber cuál. El que le corresponde es el suyo, y así se le
-- dice. Corregido en los tres idiomas.
--
-- Se corrige con una migración adelante porque la que sembró estos textos ya está aplicada.
--
-- Sólo pisa el texto que trae el producto, que es la fila sin Prestadora. Lo que escribió una
-- Prestadora para su gente es otra fila, con su Prestadora puesta, y no se toca: es suyo.
-- Y el texto del producto es el único que viene en los tres idiomas, así que rearmar los tres
-- juntos sólo es correcto sobre esa fila.

UPDATE public.mensajes_del_sistema
SET i18n = jsonb_build_object(
      'es-AR', replace(i18n ->> 'es-AR', 'con el Coordinador', 'con su Coordinador'),
      'en', replace(i18n ->> 'en', 'the coordinator', 'your coordinator'),
      'pt-BR', replace(i18n ->> 'pt-BR', 'com o Coordenador', 'com o seu Coordenador')
    )
WHERE prestadora_id IS NULL
  AND clave IN (
  'guardia_sin_cerrar_familia.cuerpo',
  'guardia_sin_cerrar_grave_familia.cuerpo',
  'alerta_temprana_guardia_familia.cuerpo',
  'incidente_relevo_familia.cuerpo',
  'cese_de_servicio.cuerpo'
);

NOTIFY pgrst, 'reload schema';
