-- Salen las Ramas de los tipos de Asistente.
--
-- Una Rama agrupaba tipos de Asistente, y su único uso era un filtro del Padrón. El filtro por
-- tipo ya hace eso mismo, así que la Rama no agregaba nada. El catálogo queda en dos niveles:
-- Tipo y Especialidad.
--
-- Antes de borrar se comprobó en la base en vivo: ninguna función ni vista usa estas tablas, y
-- había una sola Rama («Cuidados») con un solo tipo asignado, de datos inventados.
--
-- Para volver atrás: las tablas, sus políticas y el disparador están en el commit 8c3a7438 y en
-- la foto de la base, 20270323000000_foto_de_la_base.sql.

BEGIN;

DROP TABLE public.tipos_asistente_agrupados;
DROP TABLE public.agrupaciones_tipos_asistente;
DROP FUNCTION interno.el_tipo_agrupado_es_visible();

COMMIT;

NOTIFY pgrst, 'reload schema';
