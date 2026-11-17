-- El formulario del Apoderado del Panel dice qué falta en cada casillero.
--
-- Al nombrar un Apoderado desde el Panel, cada casillero vacío muestra al pie su propio aviso, el
-- mismo que ya muestra la aplicación del Cliente. Al observar el poder, el casillero del motivo
-- muestra el suyo, que es nuevo.
--
-- El aviso general que todos compartían ya no lo muestra nadie, y sale. Ninguna Prestadora había
-- escrito una versión propia de ese aviso.

BEGIN;

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('apoderado.falta.motivo',
   '{"es-AR": "Ingrese el motivo.", "en": "Enter the reason.", "pt-BR": "Informe o motivo."}'::jsonb, true, true);

-- Un texto que escribió una Prestadora no se borra: si apareció alguno, la migración no corre.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mensajes_del_sistema
              WHERE clave = 'apoderado.campo_obligatorio' AND prestadora_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Una Prestadora tiene su propia versión del aviso general del Apoderado';
  END IF;
END $$;

DELETE FROM public.mensajes_del_sistema WHERE clave = 'apoderado.campo_obligatorio';

-- Si el aviso del motivo no quedó o el aviso general sigue, la migración entera se deshace.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.mensajes_del_sistema
       WHERE prestadora_id IS NULL AND clave = 'apoderado.falta.motivo') <> 1 THEN
    RAISE EXCEPTION 'No quedó el aviso del motivo del formulario del Apoderado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mensajes_del_sistema WHERE clave = 'apoderado.campo_obligatorio') THEN
    RAISE EXCEPTION 'Sigue el aviso general del formulario del Apoderado';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
