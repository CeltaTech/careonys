-- El formulario del Apoderado dice qué falta en cada casillero.
--
-- Al nombrar o reemplazar un Apoderado desde la aplicación del Cliente, cada casillero vacío muestra
-- al pie su propio aviso, que dice qué dato falta: el nombre, el apellido, el CUIL o el poder. Hasta
-- ahora todos mostraban el mismo aviso general.
--
-- Son textos de fábrica, en los tres idiomas, y cada Prestadora puede escribir los suyos.

BEGIN;

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('apoderado.falta.nombre',
   '{"es-AR": "Ingrese el nombre.", "en": "Enter the first name.", "pt-BR": "Informe o nome."}'::jsonb, true, true),
  ('apoderado.falta.apellido',
   '{"es-AR": "Ingrese el apellido.", "en": "Enter the last name.", "pt-BR": "Informe o sobrenome."}'::jsonb, true, true),
  ('apoderado.falta.cuil',
   '{"es-AR": "Ingrese el CUIL.", "en": "Enter the CUIL.", "pt-BR": "Informe o CUIL."}'::jsonb, true, true),
  ('apoderado.falta.archivo',
   '{"es-AR": "Elija el poder.", "en": "Select the power of attorney.", "pt-BR": "Escolha a procuração."}'::jsonb, true, true);

-- Si alguno no quedó, la migración entera se deshace.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.mensajes_del_sistema
       WHERE prestadora_id IS NULL
         AND clave IN ('apoderado.falta.nombre', 'apoderado.falta.apellido',
                       'apoderado.falta.cuil', 'apoderado.falta.archivo')) <> 4 THEN
    RAISE EXCEPTION 'No quedaron los cuatro avisos del formulario del Apoderado';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
