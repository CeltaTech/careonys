-- Los motivos de resolución en inglés y portugués nombran al Cliente.
--
-- El renombre anterior cambió el texto en castellano de estos motivos, pero sus columnas en
-- inglés y portugués quedaron con la palabra retirada. Se reescriben igual que el castellano:
-- «Desistió» queda sin sujeto, y la baja la da el Cliente.

begin;

update public.motivos_resolucion set nombre_en = 'Withdrew' where nombre_en = 'The Family withdrew';
update public.motivos_resolucion set nombre_pt_br = 'Desistiu' where nombre_pt_br = 'A Família desistiu';
update public.motivos_resolucion set nombre_en = 'The Client cancelled it' where nombre_en = 'The Family cancelled it';
update public.motivos_resolucion set nombre_pt_br = 'O Cliente cancelou' where nombre_pt_br = 'A Família cancelou';

commit;

notify pgrst, 'reload schema';
