-- El medio de pago no se ata a una modalidad de trabajo.
--
-- La base en vivo ya no tiene la columna `opciones_de_lista.modalidades` ni el control que la
-- usaba al anotar una liquidación, pero la foto inicial sí los crea, y dos migraciones
-- posteriores los tocan. Esta migración los saca adelante, así la base armada desde cero queda
-- igual que la que está en vivo. En vivo no cambia nada.

DROP TRIGGER IF EXISTS el_medio_del_pago_alcanza_la_modalidad ON public.liquidaciones_asistente;
DROP FUNCTION IF EXISTS interno.el_medio_de_pago_alcanza_la_modalidad();
DROP FUNCTION IF EXISTS interno.las_modalidades_de_la_liquidacion(uuid, uuid, date, date);
ALTER TABLE public.opciones_de_lista DROP CONSTRAINT IF EXISTS opciones_de_lista_modalidades_check;
ALTER TABLE public.opciones_de_lista DROP COLUMN IF EXISTS modalidades;

NOTIFY pgrst, 'reload schema';
