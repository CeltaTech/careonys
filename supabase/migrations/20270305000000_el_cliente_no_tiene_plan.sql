-- El Cliente de la Prestadora no tiene «plan».
--
-- Era texto libre que entraba con la importación de Clientes y se mostraba en la aplicación del
-- Cliente. Ningún cálculo lo usaba, y lo que guardaba repetía otros datos: quién paga lo dice el
-- Responsable de pagos, y cómo se presta el Servicio lo dice la modalidad. «Plan» es además lo que
-- cada Prestadora contrata con CeltaTech, y en el Cliente confundía.

BEGIN;

ALTER TABLE public.clientes DROP COLUMN plan;

NOTIFY pgrst, 'reload schema';

COMMIT;
