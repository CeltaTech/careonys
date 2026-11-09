-- Lo comercial del Cliente queda sólo en el Servicio.
--
-- El Responsable de pagos y el plazo de pago ya se cargan por Servicio. Acá se recopia lo que
-- pudiera quedar en `clientes`, se borran esas columnas, y el Servicio pasa a decir de qué Cliente
-- es con `cliente_id`. `tipo_contratante` se va: el único tipo que existió fue `cliente`.
-- `clientes.contratante_persona_id` queda: es quién es el Cliente.

BEGIN;

-- 1. Recopia. Sólo completa lo que el Servicio tiene vacío; no pisa nada.
UPDATE public.servicios s
   SET pagador_persona_id = COALESCE(s.pagador_persona_id, c.pagador_persona_id),
       pagador_tipo = COALESCE(s.pagador_tipo, c.pagador_tipo),
       dias_hasta_el_vencimiento = COALESCE(s.dias_hasta_el_vencimiento, c.dias_hasta_el_vencimiento)
  FROM public.clientes c
 WHERE c.id = s.contratante_id
   AND s.tipo_contratante = 'cliente'
   AND (c.pagador_persona_id IS NOT NULL OR c.pagador_tipo IS NOT NULL OR c.dias_hasta_el_vencimiento IS NOT NULL);

-- 2. Lo que depende de las columnas que se van.
DROP POLICY IF EXISTS cliente_ve_sus_servicios ON public.servicios;
DROP TRIGGER IF EXISTS el_contratante_lo_fija_la_administracion ON public.servicios;
DROP INDEX IF EXISTS public.idx_servicios_contratante;

-- 3. Columnas.
ALTER TABLE public.clientes
  DROP COLUMN pagador_tipo,
  DROP COLUMN pagador_persona_id,
  DROP COLUMN dias_hasta_el_vencimiento;

ALTER TABLE public.servicios RENAME COLUMN contratante_id TO cliente_id;
ALTER TABLE public.servicios DROP COLUMN tipo_contratante;

CREATE INDEX idx_servicios_cliente ON public.servicios (cliente_id);

-- 4. Funciones, con el nombre nuevo. `CREATE OR REPLACE` conserva los permisos de cada una.
CREATE OR REPLACE FUNCTION interno.coordina_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_paciente IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM pacientes p
         JOIN servicios s ON s.prestadora_id = p.prestadora_id
                         AND s.cliente_id = p.cliente_id
        WHERE p.id = p_paciente
          AND p.prestadora_id = interno.prestadora_actual()
          AND s.estado = 'vigente'
          AND s.coordinador_id = ANY (interno.coordinadores_que_represento())
     );
$function$;

CREATE OR REPLACE FUNCTION interno.coordina_un_servicio_del_cliente(p_cliente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_cliente IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM servicios s
        WHERE s.prestadora_id = interno.prestadora_actual()
          AND s.cliente_id = p_cliente
          AND s.coordinador_id = ANY (interno.coordinadores_que_represento())
     );
$function$;

CREATE OR REPLACE FUNCTION interno.el_contratante_lo_fija_la_administracion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     AND COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
     AND NOT (interno.es_admin_prestadora() OR interno.es_superadmin()) THEN
    RAISE EXCEPTION 'el_contratante_lo_fija_la_administracion';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER el_contratante_lo_fija_la_administracion
  BEFORE UPDATE OF cliente_id ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION interno.el_contratante_lo_fija_la_administracion();

CREATE OR REPLACE FUNCTION interno.exigir_contratante_del_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
declare
  prestadora_del_cliente uuid;
begin
  select prestadora_id into prestadora_del_cliente
    from clientes where id = new.cliente_id;

  if prestadora_del_cliente is null then
    raise exception 'contratante_inexistente:%', new.cliente_id;
  end if;

  if prestadora_del_cliente <> new.prestadora_id then
    raise exception 'contratante_de_otra_prestadora:%', new.cliente_id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION interno.exigir_paciente_y_servicio_del_mismo_contratante(p_paciente_id uuid, p_servicio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  cliente_servicio uuid;
  prestadora_servicio uuid;
  cliente_paciente uuid;
  prestadora_paciente uuid;
BEGIN
  -- Sin Servicio no hay nada que comparar.
  IF p_servicio_id IS NULL THEN
    RETURN;
  END IF;

  SELECT cliente_id, prestadora_id
    INTO cliente_servicio, prestadora_servicio
    FROM servicios WHERE id = p_servicio_id;

  IF prestadora_servicio IS NULL THEN
    RAISE EXCEPTION 'servicio_inexistente:%', p_servicio_id;
  END IF;

  SELECT cliente_id, prestadora_id
    INTO cliente_paciente, prestadora_paciente
    FROM pacientes WHERE id = p_paciente_id;

  IF prestadora_paciente IS NULL THEN
    RAISE EXCEPTION 'paciente_inexistente:%', p_paciente_id;
  END IF;

  IF prestadora_paciente <> prestadora_servicio THEN
    RAISE EXCEPTION 'paciente_de_otra_prestadora:%', p_paciente_id;
  END IF;

  IF cliente_paciente IS NULL OR cliente_paciente <> cliente_servicio THEN
    RAISE EXCEPTION 'paciente_fuera_del_contratante:%:%', p_paciente_id, p_servicio_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE c.contratante_persona_id = p_persona
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR EXISTS (SELECT 1 FROM servicios s
                WHERE (s.contratante_persona_id = p_persona OR s.pagador_persona_id = p_persona)
                  AND s.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(s.cliente_id))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
    OR EXISTS (SELECT 1 FROM consentimientos_pagador cp
                WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                  AND cp.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(cp.cliente_id))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_la_guardia(e.guardia_id))
  );
$function$;

-- 5. La política del Cliente, sobre la columna nueva.
CREATE POLICY cliente_ve_sus_servicios ON public.servicios
  FOR SELECT
  USING (prestadora_id = interno.prestadora_actual()
         AND cliente_id = interno.cliente_id_de_usuario(auth.uid()));

COMMIT;

NOTIFY pgrst, 'reload schema';
