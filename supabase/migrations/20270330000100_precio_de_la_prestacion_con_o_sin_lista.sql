-- La Lista de Precios es una orientación, no obliga. El precio de cada Prestación se arma de una
-- de dos formas, y cada Prestación dice cuál usó:
--
--   'lista'   — sale de un renglón de la Lista de Precios, con un ajuste optativo: un descuento o
--               un recargo, cada uno por porcentaje o por monto fijo. Se guarda, como hasta ahora,
--               la copia del precio de la lista de ese día (`precio_lista_snapshot`), para que un
--               cambio posterior de la lista no altere lo pactado.
--   'directo' — lo escribe quien carga, el precio que negoció con el Cliente, sin pasar por la
--               lista. No apunta a ningún renglón y no lleva ajuste.
--
-- Los dos valores son los mismos que `configuracion_facturacion_clientes.regla.forma_de_precio`,
-- que dice cuál de las dos ofrece la pantalla de fábrica. El valor por omisión de la columna es
-- 'directo', que es también el de fábrica del producto.
--
-- El ajuste reutiliza las dos columnas que ya existían (`tipo_descuento`: 'porcentaje' o
-- 'monto_fijo'; `valor_descuento`: cuánto) y suma `sentido_del_ajuste`, que dice si ese ajuste
-- baja el precio ('descuento') o lo sube ('recargo'). Las dos columnas viejas no se renombran:
-- son nombre guardado. Las tres van juntas: o están las tres o no está ninguna.
--
-- Cambio de precio desde una fecha, sin pisar el anterior. El precio nuevo es otra Prestación,
-- que dice a cuál reemplaza en `prestacion_anterior_id` y arranca en su `vigente_desde`. Al
-- guardarla, la base le pone a la anterior `vigente_hasta` = el día antes, en la misma operación:
-- si algo no cierra, no se guarda ninguna de las dos. Cada Prestación se reemplaza una sola vez.
--
-- Y `marcar_prestaciones_a_revisar`, que marca «a revisar» las Prestaciones de un renglón de la
-- lista cuando ese renglón cambia de precio, deja de marcar las que ya terminaron: una Prestación
-- reemplazada por un precio nuevo ya no se cobra y no hay nada que revisar en ella.

BEGIN;

-- ---------------------------------------------------------------------------
-- Las columnas nuevas
-- ---------------------------------------------------------------------------

ALTER TABLE public.prestaciones
  ADD COLUMN forma_de_precio text NOT NULL DEFAULT 'directo',
  ADD COLUMN sentido_del_ajuste text,
  ADD COLUMN prestacion_anterior_id bigint REFERENCES public.prestaciones(id);

-- Lo que ya estaba cargado y apuntaba a un renglón de la lista salió de la lista.
UPDATE public.prestaciones SET forma_de_precio = 'lista' WHERE precio_lista_id IS NOT NULL;

-- Lo que ya estaba cargado con un tipo de ajuste era un descuento: era lo único que había.
UPDATE public.prestaciones SET sentido_del_ajuste = 'descuento' WHERE tipo_descuento IS NOT NULL;

COMMENT ON COLUMN public.prestaciones.forma_de_precio IS
  'Cómo se llegó al precio: lista (de un renglón de la Lista de Precios, con ajuste optativo) o directo (escrito por quien cargó).';
COMMENT ON COLUMN public.prestaciones.sentido_del_ajuste IS
  'Si el ajuste sobre el precio de la lista lo baja (descuento) o lo sube (recargo). Va con tipo_descuento y valor_descuento.';
COMMENT ON COLUMN public.prestaciones.tipo_descuento IS
  'Cómo se mide el ajuste sobre el precio de la lista: porcentaje o monto_fijo. El nombre es de antes, y vale para el descuento y para el recargo.';
COMMENT ON COLUMN public.prestaciones.valor_descuento IS
  'Cuánto es el ajuste sobre el precio de la lista, siempre positivo: el sentido lo dice sentido_del_ajuste.';
COMMENT ON COLUMN public.prestaciones.prestacion_anterior_id IS
  'La Prestación cuyo precio ésta reemplaza desde su vigente_desde. Al guardarla, la base cierra la anterior el día antes.';

-- ---------------------------------------------------------------------------
-- Las reglas de la tabla
-- ---------------------------------------------------------------------------

ALTER TABLE public.prestaciones
  ADD CONSTRAINT prestaciones_forma_de_precio_valida
    CHECK (forma_de_precio IN ('lista', 'directo')),
  ADD CONSTRAINT prestaciones_sentido_del_ajuste_valido
    CHECK (sentido_del_ajuste IS NULL OR sentido_del_ajuste IN ('descuento', 'recargo')),
  -- El ajuste va entero o no va: tipo, valor y sentido juntos.
  ADD CONSTRAINT prestaciones_ajuste_completo
    CHECK (
      (tipo_descuento IS NULL AND valor_descuento IS NULL AND sentido_del_ajuste IS NULL)
      OR (tipo_descuento IS NOT NULL AND valor_descuento IS NOT NULL AND sentido_del_ajuste IS NOT NULL)
    ),
  ADD CONSTRAINT prestaciones_ajuste_no_negativo
    CHECK (valor_descuento IS NULL OR valor_descuento >= 0),
  -- Un precio que sale de la lista dice de qué renglón y guarda el precio de ese día. Uno escrito
  -- no apunta a ningún renglón y no lleva ajuste, porque no hay precio de lista que ajustar.
  ADD CONSTRAINT prestaciones_precio_coherente_con_su_forma
    CHECK (
      (forma_de_precio = 'lista' AND precio_lista_id IS NOT NULL AND precio_lista_snapshot IS NOT NULL)
      OR (forma_de_precio = 'directo' AND precio_lista_id IS NULL AND tipo_descuento IS NULL)
    ),
  ADD CONSTRAINT prestaciones_precio_final_no_negativo
    CHECK (precio_final >= 0),
  ADD CONSTRAINT prestaciones_no_se_reemplaza_a_si_misma
    CHECK (prestacion_anterior_id IS NULL OR prestacion_anterior_id <> id);

-- Cada Prestación se reemplaza una sola vez: dos precios nuevos para la misma serían dos verdades.
CREATE UNIQUE INDEX prestaciones_un_solo_reemplazo
  ON public.prestaciones (prestacion_anterior_id)
  WHERE prestacion_anterior_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- El cierre de la anterior al cambiar el precio
-- ---------------------------------------------------------------------------
--
-- Corre con los permisos de quien guarda (no es SECURITY DEFINER): lee y cierra la anterior a
-- través de la protección por fila, así que sólo alcanza una Prestación que esa persona ya podía
-- ver y modificar. Si no la ve, falla: no hay forma de cerrar una ajena.
--
-- Las condiciones: la anterior es de la misma Prestadora, del mismo Paciente y del mismo
-- Servicio, sigue en pie, arranca antes que la nueva, y la nueva arranca dentro de su período.

CREATE FUNCTION interno.cerrar_la_prestacion_anterior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  anterior record;
  cerradas integer;
BEGIN
  IF NEW.prestacion_anterior_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, prestadora_id, paciente_id, servicio_id, estado, vigente_desde, vigente_hasta
    INTO anterior
    FROM prestaciones
   WHERE id = NEW.prestacion_anterior_id
   FOR UPDATE;

  IF NOT FOUND
     OR anterior.prestadora_id <> NEW.prestadora_id
     OR anterior.paciente_id <> NEW.paciente_id
     OR anterior.servicio_id IS DISTINCT FROM NEW.servicio_id
     OR anterior.estado <> 'vigente' THEN
    RAISE EXCEPTION 'prestacion_anterior_no_corresponde' USING ERRCODE = '23514';
  END IF;

  IF NEW.vigente_desde <= anterior.vigente_desde
     OR (anterior.vigente_hasta IS NOT NULL AND NEW.vigente_desde > anterior.vigente_hasta) THEN
    RAISE EXCEPTION 'cambio_de_precio_fuera_del_periodo' USING ERRCODE = '23514';
  END IF;

  UPDATE prestaciones
     SET vigente_hasta = NEW.vigente_desde - 1,
         updated_at = now()
   WHERE id = anterior.id;

  GET DIAGNOSTICS cerradas = ROW_COUNT;
  IF cerradas <> 1 THEN
    RAISE EXCEPTION 'prestacion_anterior_no_corresponde' USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION interno.cerrar_la_prestacion_anterior() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.cerrar_la_prestacion_anterior() FROM anon;
GRANT EXECUTE ON FUNCTION interno.cerrar_la_prestacion_anterior() TO authenticated, trabajo_sin_persona;

CREATE TRIGGER cerrar_la_prestacion_anterior
  AFTER INSERT ON public.prestaciones
  FOR EACH ROW
  WHEN (NEW.prestacion_anterior_id IS NOT NULL)
  EXECUTE FUNCTION interno.cerrar_la_prestacion_anterior();

-- ---------------------------------------------------------------------------
-- «A revisar» sólo para lo que todavía se cobra
-- ---------------------------------------------------------------------------
--
-- Misma firma, mismo dueño y mismos permisos que la que reemplaza: sólo se agrega que la
-- Prestación no haya terminado.

CREATE OR REPLACE FUNCTION public.marcar_prestaciones_a_revisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.precio IS DISTINCT FROM OLD.precio THEN
    UPDATE prestaciones
    SET requiere_revision = true
    WHERE precio_lista_id = NEW.id
      AND estado = 'vigente'
      AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
