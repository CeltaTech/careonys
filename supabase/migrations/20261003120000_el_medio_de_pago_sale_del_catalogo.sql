-- El medio de pago sale del catalogo, y cada lado del dinero tiene el suyo.
-- =====================================================================================
--
-- QUÉ FALTABA. Los dos lados del dinero estaban desparejos. Cuando la Familia paga, el medio
-- salía de una lista cerrada escrita adentro de la tabla —un CHECK con seis valores— y copiada
-- otra vez adentro del Panel y del motor. Cuando se le paga al Asistente, en cambio, no había
-- ninguna lista: `liquidaciones_asistente.forma_pago` era texto libre, así que lo mismo se
-- escribía de cinco maneras y después no se podía contar.
--
-- CÓMO ENTRA. Como dos listas del registro de dos pisos que ya existe, una por lado del dinero:
--   · `medios_de_pago_de_la_familia` — con qué se le cobra a la Familia. La Prestadora tiene
--     habilitadas todas las posibilidades de cobranza: transferencia, efectivo, tarjeta, débito
--     automático, cheque y «otro», que son las seis que ya había. Acá no se saca ninguna.
--   · `medios_de_pago_al_asistente` — con qué se le paga al Asistente. De fábrica son tres:
--     transferencia a la cuenta bancaria o billetera virtual que informa cada Asistente, efectivo,
--     y la que se pacte.
--
-- POR QUÉ DOS LISTAS Y NO UNA. Las posibilidades de cobranza son las de un negocio que cobra;
-- pagarle a una persona no es lo mismo, y ofrecerle tarjeta o débito automático a quien va a
-- cobrar su trabajo es ofrecer algo que de ese lado no existe. Para qué lado sirve cada medio es,
-- entonces, de qué lista sale: el registro de dos pisos ya separa por lista, y no hace falta
-- ninguna marca nueva en la opción ni ninguna columna nueva.
--
-- Y EL LADO DEL ASISTENTE NO MIRA LA MODALIDAD. La regla de los tres no es de la modalidad donde
-- paga la Prestadora: es de lo que se le paga al Asistente, lo pague quien lo pague. En prestación
-- directa le paga la Prestadora; en Match le paga la Familia y la Prestadora no toca ese dinero.
-- Los medios son los mismos en los dos casos, y **nada de esto cambia quién paga**: una lista dice
-- con qué, nunca de quién sale la plata.
--
-- POR QUÉ DEL LADO DEL ASISTENTE NO HAY «OTRO». «La que se pacte» es exactamente el segundo piso
-- del registro: la lista admite opciones propias, así que la Prestadora que pacta una forma
-- distinta la carga con su nombre y queda contable. Una opción llamada «otro» haría lo contrario
-- —anotar un pago sin decir con qué se pagó—, que es la enfermedad que esta migración viene a
-- curar. Del lado de la Familia «otro» se conserva porque ya estaba cargado y sacarlo sería perder
-- lo anotado.
--
-- LOS DOS SON VALORES DE FÁBRICA, NO UNA IMPOSICIÓN. Cada Prestadora elige cuál de los medios
-- habilitados usa y puede agregar los suyos; apagar uno es poner `activa` en falso sobre su fila.
--
-- QUÉ PASA CON LO QUE YA ESTABA CARGADO. Nada se pierde.
--   · `cobros_familia.medio` ya guardaba exactamente las seis claves del catálogo, así que las
--     filas quedan como están y lo único que se va es el CHECK.
--   · `liquidaciones_asistente.forma_pago` tenía texto libre. Lo que coincide con una de las dos
--     del Asistente queda apuntando a ella. Lo que no coincide **no se tira ni se aplasta contra
--     «otro»**: se convierte en una opción propia de la Prestadora que lo escribió, con el texto
--     tal cual lo escribió, que es justamente para lo que está el segundo piso del registro. Una
--     liquidación que decía «cheque» queda, entonces, como un medio propio de esa Prestadora: ella
--     lo pactó alguna vez, y eso es un hecho anotado que no se borra.
--
-- QUIÉN LO HACE CUMPLIR. Un disparador por tabla, los dos sobre la misma función, que recibe dos
-- argumentos: de qué columna sale el medio y de qué lista tiene que salir. No es `SECURITY
-- DEFINER`: comprueba con los permisos de quien escribe, y una sesión que no alcanza la opción no
-- puede guardarla. La comprobación mira sólo las opciones del producto y las de la Prestadora de
-- la fila, nunca las de otra.
--
-- CÓMO SE VUELVE ATRÁS.
--   DROP TRIGGER IF EXISTS el_medio_del_cobro_sale_del_catalogo ON public.cobros_familia;
--   DROP TRIGGER IF EXISTS el_medio_del_pago_sale_del_catalogo ON public.liquidaciones_asistente;
--   DROP FUNCTION IF EXISTS interno.el_medio_de_pago_sale_del_catalogo();
--   ALTER TABLE public.cobros_familia ADD CONSTRAINT cobros_familia_medio_check
--     CHECK (medio IN ('transferencia','efectivo','tarjeta','debito_automatico','cheque','otro'));
--   -- Atención: los cobros cargados con un medio propio de una Prestadora no pasan ese CHECK.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Las dos listas
-- ---------------------------------------------------------------------------
--
-- Las dos admiten opciones propias: con qué se paga es una decisión de cada Prestadora y de cada
-- país —una billetera virtual acá no es la de allá—, y la lista general no puede nombrar
-- proveedores. La situación fiscal no lo admite por lo contrario, y esa diferencia es la que marca
-- el criterio.

INSERT INTO public.listas_de_opciones (prestadora_id, clave, i18n, admite_opciones_propias, orden)
VALUES
  (NULL, 'medios_de_pago_de_la_familia',
   '{"es-AR": "Medios de pago de la Familia", "en": "Family payment methods", "pt-BR": "Meios de pagamento da Família"}'::jsonb,
   true, 30),
  (NULL, 'medios_de_pago_al_asistente',
   '{"es-AR": "Medios de pago al Asistente", "en": "Assistant payment methods", "pt-BR": "Meios de pagamento ao Assistente"}'::jsonb,
   true, 40)
ON CONFLICT DO NOTHING;

INSERT INTO public.opciones_de_lista (prestadora_id, lista_id, clave, i18n, orden)
SELECT NULL, l.id, v.clave, v.i18n, v.orden
  FROM public.listas_de_opciones l
  JOIN (VALUES
    -- Con qué se le cobra a la Familia. Todas las posibilidades de cobranza, sin sacar ninguna.
    ('medios_de_pago_de_la_familia', 'transferencia',
     '{"es-AR": "Transferencia", "en": "Bank transfer", "pt-BR": "Transferência"}'::jsonb, 10),
    ('medios_de_pago_de_la_familia', 'efectivo',
     '{"es-AR": "Efectivo", "en": "Cash", "pt-BR": "Dinheiro"}'::jsonb, 20),
    ('medios_de_pago_de_la_familia', 'tarjeta',
     '{"es-AR": "Tarjeta", "en": "Card", "pt-BR": "Cartão"}'::jsonb, 30),
    ('medios_de_pago_de_la_familia', 'debito_automatico',
     '{"es-AR": "Débito automático", "en": "Direct debit", "pt-BR": "Débito automático"}'::jsonb, 40),
    ('medios_de_pago_de_la_familia', 'cheque',
     '{"es-AR": "Cheque", "en": "Cheque", "pt-BR": "Cheque"}'::jsonb, 50),
    ('medios_de_pago_de_la_familia', 'otro',
     '{"es-AR": "Otro", "en": "Other", "pt-BR": "Outro"}'::jsonb, 60),
    -- Con qué se le paga al Asistente, en prestación directa y en Match por igual. La
    -- transferencia va a la cuenta bancaria o billetera virtual que informa cada Asistente:
    -- adónde, lo dice `datos_bancarios_asistente`, y por eso acá no hace falta distinguir banco de
    -- billetera. La tercera —la que se pacte— es la puerta de las opciones propias, no una fila.
    ('medios_de_pago_al_asistente', 'transferencia',
     '{"es-AR": "Transferencia", "en": "Bank transfer", "pt-BR": "Transferência"}'::jsonb, 10),
    ('medios_de_pago_al_asistente', 'efectivo',
     '{"es-AR": "Efectivo", "en": "Cash", "pt-BR": "Dinheiro"}'::jsonb, 20)
  ) AS v (lista, clave, i18n, orden) ON v.lista = l.clave
 WHERE l.prestadora_id IS NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Lo que ya estaba escrito a mano en la liquidación
-- ---------------------------------------------------------------------------
--
-- Primero lo que está en blanco: un texto vacío no dice con qué se pagó, y guardado como cadena
-- vacía obligaría a todos los que lo lean a distinguir dos formas de «no se sabe».

UPDATE public.liquidaciones_asistente
   SET forma_pago = NULL
 WHERE forma_pago IS NOT NULL
   AND btrim(forma_pago) = '';

-- Cada texto distinto, convertido a clave con la misma regla que usa el Panel: sin acentos, en
-- minúsculas, y todo lo que no sea letra o número pasa a ser un guion bajo.
CREATE TEMPORARY TABLE lo_que_habia_escrito ON COMMIT DROP AS
SELECT DISTINCT
       l.prestadora_id,
       btrim(l.forma_pago) AS texto,
       left(
         btrim(
           regexp_replace(
             lower(translate(btrim(l.forma_pago),
               'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
               'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc')),
             '[^a-z0-9]+', '_', 'g'),
           '_'),
         60) AS clave
  FROM public.liquidaciones_asistente l
 WHERE l.forma_pago IS NOT NULL;

-- Lo que no da ninguna clave utilizable —alguien escribió sólo signos— tampoco dice con qué se
-- pagó, y se va por el mismo camino que el blanco.
UPDATE public.liquidaciones_asistente l
   SET forma_pago = NULL
  FROM lo_que_habia_escrito h
 WHERE h.prestadora_id = l.prestadora_id
   AND btrim(l.forma_pago) = h.texto
   AND h.clave = '';

DELETE FROM lo_que_habia_escrito WHERE clave = '';

-- Lo que no coincide con las dos del Asistente pasa a ser una opción de esa Prestadora, con el
-- texto tal cual lo escribió. El número de orden lo pone el disparador de `opciones_de_lista`.
--
-- Se agrupa por clave y no por texto: dos escrituras que sólo se diferencian en mayúsculas dan la
-- misma clave, y sin agrupar serían dos filas con la misma clave para la misma Prestadora.
INSERT INTO public.opciones_de_lista (prestadora_id, lista_id, clave, i18n)
SELECT h.prestadora_id,
       l.id,
       h.clave,
       jsonb_build_object('es-AR', min(h.texto))
  FROM lo_que_habia_escrito h
  JOIN public.listas_de_opciones l
    ON l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
 WHERE NOT EXISTS (
         SELECT 1 FROM public.opciones_de_lista o
          WHERE o.lista_id = l.id AND o.prestadora_id IS NULL AND o.clave = h.clave
       )
   AND NOT EXISTS (
         SELECT 1 FROM public.opciones_de_lista o
          WHERE o.lista_id = l.id AND o.prestadora_id = h.prestadora_id AND o.clave = h.clave
       )
 GROUP BY h.prestadora_id, l.id, h.clave;

-- Y recién ahora la columna pasa a guardar la clave.
UPDATE public.liquidaciones_asistente l
   SET forma_pago = h.clave
  FROM lo_que_habia_escrito h
 WHERE h.prestadora_id = l.prestadora_id
   AND btrim(l.forma_pago) = h.texto
   AND l.forma_pago <> h.clave;

-- ---------------------------------------------------------------------------
-- 3. Se va el CHECK escrito adentro de la tabla
-- ---------------------------------------------------------------------------

ALTER TABLE public.cobros_familia
  DROP CONSTRAINT IF EXISTS cobros_familia_medio_check;

COMMENT ON COLUMN public.cobros_familia.medio IS
  'Con que medio pago la Familia. Es una opcion de la lista «medios_de_pago_de_la_familia»: las que trae el producto y las que agrego esta Prestadora.';
COMMENT ON COLUMN public.liquidaciones_asistente.forma_pago IS
  'Con que medio se le pago al Asistente. Es una opcion de la lista «medios_de_pago_al_asistente», que es otra que la del cobro de la Familia porque no son los mismos medios.';

-- ---------------------------------------------------------------------------
-- 4. Quien lo hace cumplir
-- ---------------------------------------------------------------------------
--
-- Una sola función para las dos tablas: el nombre de la columna que trae el medio y la clave de la
-- lista de la que tiene que salir vienen como argumentos del disparador. Escrita dos veces, el día
-- que cambie el criterio cambiaría en una sola de las dos.
--
-- No es `SECURITY DEFINER` —el `CLAUDE.md` del producto lo prohíbe expresamente—, así que la
-- consulta de adentro corre con los permisos de quien escribe y falla cerrada. Y mira sólo las
-- opciones del producto y las de la Prestadora de la fila: la llave del motor ve todas las
-- Prestadoras, y sin ese filtro una Prestadora podría guardar una opción de otra.

CREATE OR REPLACE FUNCTION interno.el_medio_de_pago_sale_del_catalogo()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_columna text := TG_ARGV[0];
  v_lista text := TG_ARGV[1];
  v_medio text := to_jsonb(NEW) ->> TG_ARGV[0];
BEGIN
  -- Vacío quiere decir «no se anotó», y eso se guarda como nulo o no se guarda.
  IF v_medio IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL
       AND l.clave = v_lista
       AND o.clave = v_medio
       AND o.activa
       AND (o.prestadora_id IS NULL OR o.prestadora_id = NEW.prestadora_id)
  ) THEN
    RAISE EXCEPTION 'medio_de_pago_inexistente:%', v_columna
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION interno.el_medio_de_pago_sale_del_catalogo() IS
  'El medio guardado en una fila tiene que ser una opcion viva de la lista que le corresponde a ese lado del dinero, del producto o de esa misma Prestadora.';

ALTER FUNCTION interno.el_medio_de_pago_sale_del_catalogo() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_medio_de_pago_sale_del_catalogo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_medio_de_pago_sale_del_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.el_medio_de_pago_sale_del_catalogo() TO service_role;

DROP TRIGGER IF EXISTS el_medio_del_cobro_sale_del_catalogo ON public.cobros_familia;
CREATE TRIGGER el_medio_del_cobro_sale_del_catalogo
  BEFORE INSERT OR UPDATE OF medio ON public.cobros_familia
  FOR EACH ROW EXECUTE FUNCTION interno.el_medio_de_pago_sale_del_catalogo('medio', 'medios_de_pago_de_la_familia');

DROP TRIGGER IF EXISTS el_medio_del_pago_sale_del_catalogo ON public.liquidaciones_asistente;
CREATE TRIGGER el_medio_del_pago_sale_del_catalogo
  BEFORE INSERT OR UPDATE OF forma_pago ON public.liquidaciones_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.el_medio_de_pago_sale_del_catalogo('forma_pago', 'medios_de_pago_al_asistente');

-- ---------------------------------------------------------------------------
-- Que lo de arriba haya quedado como dice
-- ---------------------------------------------------------------------------

DO $comprobacion$
DECLARE
  v_faltan text := '';
  v_sueltos integer;
BEGIN
  IF (
    SELECT count(*) FROM public.listas_de_opciones
     WHERE prestadora_id IS NULL
       AND clave IN ('medios_de_pago_de_la_familia', 'medios_de_pago_al_asistente')
       AND admite_opciones_propias
  ) <> 2 THEN
    v_faltan := v_faltan || ' las dos listas del producto, con opciones propias admitidas;';
  END IF;

  IF (
    SELECT count(*)
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_de_la_familia'
       AND o.prestadora_id IS NULL
  ) <> 6 THEN
    v_faltan := v_faltan || ' las seis posibilidades de cobranza;';
  END IF;

  IF (
    SELECT count(*)
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
       AND o.prestadora_id IS NULL
  ) <> 2 THEN
    v_faltan := v_faltan || ' las dos con las que se le paga al Asistente;';
  END IF;

  -- Del lado del Asistente no puede haber «otro»: anotaria un pago sin decir con que se pago.
  IF EXISTS (
    SELECT 1
      FROM public.opciones_de_lista o
      JOIN public.listas_de_opciones l ON l.id = o.lista_id
     WHERE l.prestadora_id IS NULL AND l.clave = 'medios_de_pago_al_asistente'
       AND o.prestadora_id IS NULL AND o.clave = 'otro'
  ) THEN
    v_faltan := v_faltan || ' quedo un «otro» del lado del Asistente, y ahi no va;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cobros_familia'::regclass AND conname = 'cobros_familia_medio_check'
  ) THEN
    v_faltan := v_faltan || ' el CHECK escrito adentro de la tabla, que tenia que irse;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cobros_familia'::regclass
       AND tgname = 'el_medio_del_cobro_sale_del_catalogo'
  ) THEN
    v_faltan := v_faltan || ' el disparador del cobro de la Familia;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.liquidaciones_asistente'::regclass
       AND tgname = 'el_medio_del_pago_sale_del_catalogo'
  ) THEN
    v_faltan := v_faltan || ' el disparador del pago al Asistente;';
  END IF;

  -- Y que cada disparador mire la lista de su lado: cruzados, dejarian elegir tarjeta para
  -- pagarle al Asistente, que es justo lo que esta migracion separa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.liquidaciones_asistente'::regclass
       AND tgname = 'el_medio_del_pago_sale_del_catalogo'
       AND encode(tgargs, 'escape') LIKE '%medios\_de\_pago\_al\_asistente%'
  ) THEN
    v_faltan := v_faltan || ' el disparador del pago al Asistente no mira la lista del Asistente;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cobros_familia'::regclass
       AND tgname = 'el_medio_del_cobro_sale_del_catalogo'
       AND encode(tgargs, 'escape') LIKE '%medios\_de\_pago\_de\_la\_familia%'
  ) THEN
    v_faltan := v_faltan || ' el disparador del cobro no mira la lista de la Familia;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'interno' AND p.proname = 'el_medio_de_pago_sale_del_catalogo'
       AND p.prosecdef
  ) THEN
    v_faltan := v_faltan || ' la funcion quedo SECURITY DEFINER, y no puede serlo;';
  END IF;

  -- Y lo que importa de verdad: que no haya quedado ni una liquidacion con un medio que el
  -- catalogo no nombre. Si esto suma, la conversion perdio un dato.
  SELECT count(*) INTO v_sueltos
    FROM public.liquidaciones_asistente li
   WHERE li.forma_pago IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.opciones_de_lista o
         JOIN public.listas_de_opciones l ON l.id = o.lista_id
        WHERE l.prestadora_id IS NULL
          AND l.clave = 'medios_de_pago_al_asistente'
          AND o.clave = li.forma_pago
          AND (o.prestadora_id IS NULL OR o.prestadora_id = li.prestadora_id)
     );
  IF v_sueltos > 0 THEN
    v_faltan := v_faltan || ' quedaron liquidaciones con un medio que el catalogo no nombra;';
  END IF;

  SELECT count(*) INTO v_sueltos
    FROM public.cobros_familia c
   WHERE NOT EXISTS (
       SELECT 1
         FROM public.opciones_de_lista o
         JOIN public.listas_de_opciones l ON l.id = o.lista_id
        WHERE l.prestadora_id IS NULL
          AND l.clave = 'medios_de_pago_de_la_familia'
          AND o.clave = c.medio
          AND (o.prestadora_id IS NULL OR o.prestadora_id = c.prestadora_id)
     );
  IF v_sueltos > 0 THEN
    v_faltan := v_faltan || ' quedaron cobros con un medio que el catalogo no nombra;';
  END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'La migracion del medio de pago no quedo completa:%', v_faltan;
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
