-- El uso de la IA se anota por la parte del producto que la llamó, y la base sólo acepta las que
-- conoce. Faltaban cuatro que el backend ya usa —las localidades de la importación, las plantillas
-- de WhatsApp y el motivo del aviso previo— y la que lee el género de una planilla: esos usos no
-- quedaban anotados.

alter table public.uso_ia drop constraint uso_ia_modulo_check;

alter table public.uso_ia add constraint uso_ia_modulo_check check (modulo in (
  'alertas',
  'reporte',
  'importacion',
  'importacion_viabilidad',
  'importacion_localidades',
  'importacion_generos',
  'whatsapp',
  'plantillas_whatsapp',
  'motivo_aviso_previo',
  'asignacion'
));

notify pgrst, 'reload schema';
