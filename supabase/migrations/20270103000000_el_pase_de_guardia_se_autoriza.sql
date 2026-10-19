-- El pase de guardia se autoriza, ya no se dicta un número.
--
-- Cuando el Asistente que llega no puede leer el código QR, pide autorización. Quien coordina
-- hace las verificaciones que acostumbre y aprieta «Autorizar ingreso»: la llegada queda
-- comprobada, con quién la autorizó y a qué hora, y la salida del Asistente que se va queda
-- autorizada también. Desaparece el número de un solo uso que la Prestadora le dictaba por
-- teléfono, con su vencimiento, su cuenta de intentos y el texto que el Asistente escribía.
--
-- La tabla no tiene filas en ningún ambiente: se renombran los valores sin convertir datos.

BEGIN;

-- 1. Las reglas que nombran los valores viejos salen antes de renombrarlos.
ALTER TABLE public.guardia_comprobaciones
  DROP CONSTRAINT guardia_comprobaciones_estado_check,
  DROP CONSTRAINT guardia_comprobaciones_coherencia_check,
  DROP CONSTRAINT guardia_comprobaciones_medio_check,
  DROP CONSTRAINT guardia_comprobaciones_sujeto_coherencia_check;

DROP INDEX IF EXISTS public.idx_guardia_comprobaciones_pendientes;

-- 2. Lo que sólo servía para el número dictado.
ALTER TABLE public.guardia_comprobaciones
  DROP COLUMN pedido_texto,
  DROP COLUMN codigo_verificador,
  DROP COLUMN codigo_expira_en,
  DROP COLUMN codigo_intentos,
  DROP COLUMN codigo_emitido_por,
  DROP COLUMN codigo_emitido_en;

-- 3. Quién autorizó. La hora es `comprobada_en`, la misma que tiene cualquier comprobación.
ALTER TABLE public.guardia_comprobaciones
  ADD COLUMN autorizada_por uuid REFERENCES public.usuarios(id);

UPDATE public.guardia_comprobaciones SET estado = 'pendiente_de_autorizacion' WHERE estado = 'pendiente_de_codigo';
UPDATE public.guardia_comprobaciones SET medio = 'autorizacion_prestadora' WHERE medio = 'codigo_prestadora';

ALTER TABLE public.guardia_comprobaciones
  ADD CONSTRAINT guardia_comprobaciones_estado_check
    CHECK (estado = ANY (ARRAY['pendiente_de_autorizacion', 'comprobada', 'sin_comprobar'])),
  ADD CONSTRAINT guardia_comprobaciones_medio_check
    CHECK (medio IS NULL OR medio = ANY (ARRAY['codigo_cliente', 'codigo_asistente_saliente', 'autorizacion_prestadora'])),
  ADD CONSTRAINT guardia_comprobaciones_coherencia_check
    CHECK (
      (estado = 'comprobada' AND medio IS NOT NULL AND comprobada_en IS NOT NULL AND motivo_sin_comprobar IS NULL)
      OR (estado = 'sin_comprobar' AND motivo_sin_comprobar IS NOT NULL AND medio IS NULL)
      OR (estado = 'pendiente_de_autorizacion' AND medio IS NULL AND motivo_sin_comprobar IS NULL AND pedido_en IS NOT NULL)
    ),
  ADD CONSTRAINT guardia_comprobaciones_sujeto_coherencia_check
    CHECK (
      (medio = ANY (ARRAY['codigo_cliente', 'codigo_asistente_saliente']) AND sujeto_tipo IS NOT NULL AND sujeto_id IS NOT NULL)
      OR (medio = 'autorizacion_prestadora' AND sujeto_tipo IS NULL AND sujeto_id IS NULL)
      OR medio IS NULL
    ),
  -- Una autorización dice siempre quién la dio, y sólo una autorización lo dice.
  ADD CONSTRAINT guardia_comprobaciones_autorizacion_check
    CHECK ((medio = 'autorizacion_prestadora') = (autorizada_por IS NOT NULL));

CREATE INDEX idx_guardia_comprobaciones_pendientes
  ON public.guardia_comprobaciones (prestadora_id, pedido_en)
  WHERE estado = 'pendiente_de_autorizacion';

-- 4. La cuenta de intentos ya no tiene nada que contar en esta tabla.
CREATE OR REPLACE FUNCTION public.sumar_intento_de_codigo(p_tabla text, p_id uuid, p_prestadora_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intentos integer;
BEGIN
  -- Falla cerrado: sin Prestadora no se cuenta nada.
  IF p_prestadora_id IS NULL THEN
    RAISE EXCEPTION 'sumar_intento_de_codigo: falta la Prestadora';
  END IF;

  IF p_tabla = 'instrucciones_acceso_personas_autorizadas' THEN
    UPDATE public.instrucciones_acceso_personas_autorizadas
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSIF p_tabla = 'codigos_al_telefono' THEN
    UPDATE public.codigos_al_telefono
       SET codigo_intentos = codigo_intentos + 1
     WHERE id = p_id
       AND prestadora_id = p_prestadora_id
    RETURNING codigo_intentos INTO v_intentos;

  ELSE
    RAISE EXCEPTION 'sumar_intento_de_codigo: esa tabla no lleva cuenta de intentos';
  END IF;

  -- Si no se actualizó ninguna fila, `v_intentos` queda nulo. Se devuelve así a propósito: quien
  -- llama trata el nulo como "se agotaron", que es lo que corresponde cuando no se pudo contar.
  RETURN v_intentos;
END;
$function$;

-- CREATE OR REPLACE conserva los permisos que tenía; se repite el corte por las dudas.
REVOKE ALL ON FUNCTION public.sumar_intento_de_codigo(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5. Los minutos de vigencia del número dictado.
ALTER TABLE public.configuracion_ausencia_automatica
  DROP CONSTRAINT IF EXISTS minutos_codigo_de_la_prestadora_razonable,
  DROP COLUMN minutos_codigo_de_la_prestadora;

COMMIT;

NOTIFY pgrst, 'reload schema';
