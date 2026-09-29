-- El código para firmar la instrucción del titular nombra a «personas autorizadas», no al
-- «personas autorizadas». Sólo se tocan los textos de fábrica: el que una Prestadora escribió por su
-- cuenta es suyo.

BEGIN;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"Código para confirmar los accesos de sus personas autorizadas — {{remite}}","en":"Code to confirm the access of your authorized people — {{remite}}","pt-BR":"Código para confirmar os acessos das suas pessoas autorizadas — {{remite}}"}'::jsonb
WHERE clave = 'codigo_instruccion_personas_autorizadas.asunto' AND prestadora_id IS NULL;

UPDATE public.mensajes_del_sistema
SET i18n = '{"es-AR":"Su código para confirmar la instrucción sobre los accesos de sus personas autorizadas es {{codigo}}. Vence en {{minutos}} minutos. Si no lo pidió usted, no lo use y avise a {{remite}}.","en":"Your code to confirm the instruction about the access of your authorized people is {{codigo}}. It expires in {{minutos}} minutes. If you did not request it, do not use it and let {{remite}} know.","pt-BR":"O seu código para confirmar a instrução sobre os acessos das suas pessoas autorizadas é {{codigo}}. Vence em {{minutos}} minutos. Se não tiver sido solicitado, não o use e avise {{remite}}."}'::jsonb
WHERE clave = 'codigo_instruccion_personas_autorizadas.texto' AND prestadora_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
