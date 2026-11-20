-- Carga en cada Prestadora los motivos de fábrica para pausar, suspender y cancelar la cobertura.
-- ==================================================================================
--
-- Qué hace: a cada Prestadora que ya existe le agrega, en los tres idiomas, los motivos de fábrica
-- de las pausas, las suspensiones y las cancelaciones de la cobertura. Los toma de la misma
-- función que siembra los motivos de una Prestadora nueva, así la lista vive en un solo lugar.
--
-- Por qué: las Prestadoras nuevas ya los reciben al darse de alta; las que ya existían no.
--
-- Cuidado con lo que la Prestadora ya cambió: la función siembra también los motivos de las otras
-- listas. Si una Prestadora había borrado alguno de esos, volvería a aparecer. Por eso se borra
-- enseguida todo lo que la siembra agregó fuera de la lista de la cobertura. Las filas que se
-- borran nacieron en esta misma migración, así que nada las cita.

BEGIN;

CREATE TEMP TABLE motivos_que_ya_estaban ON COMMIT DROP AS
  SELECT id FROM public.motivos_resolucion;

SELECT public.sembrar_motivos_resolucion(p.id) FROM public.prestadoras p;

DELETE FROM public.motivos_resolucion m
 WHERE m.tabla <> 'interrupciones_de_cobertura'
   AND NOT EXISTS (SELECT 1 FROM motivos_que_ya_estaban y WHERE y.id = m.id);

COMMIT;

NOTIFY pgrst, 'reload schema';
