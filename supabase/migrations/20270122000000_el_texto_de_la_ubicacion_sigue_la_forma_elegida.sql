-- El texto de consentimiento de la ubicación depende de la forma que eligió la Prestadora.
--
-- Con «Viaje y turno» se registra la ubicación durante el viaje y durante la guardia; con «Sólo
-- viaje», durante el viaje y al registrar la entrada y la salida. Son dos alcances distintos, así
-- que son dos textos, y el Asistente ve el que corresponde a su Prestadora.
--
-- La columna lleva el mismo nombre que la de `prestadoras`, porque guarda lo mismo: a qué forma
-- corresponde el texto. Para los textos que no dependen de la forma queda vacía.

BEGIN;

ALTER TABLE public.textos_consentimiento
  ADD COLUMN control_de_ubicacion_en_el_turno boolean;

-- La unicidad pasa a incluir la forma: dos textos de la misma versión, uno por forma.
ALTER TABLE public.textos_consentimiento
  DROP CONSTRAINT textos_consentimiento_jurisdiccion_clave_modalidad_version__key;
ALTER TABLE public.textos_consentimiento
  ADD CONSTRAINT textos_consentimiento_unico_por_forma
  UNIQUE NULLS NOT DISTINCT (jurisdiccion, clave, modalidad, version, idioma, control_de_ubicacion_en_el_turno);

-- El texto anterior deja de estar vigente. No se borra: hay decisiones que lo citan.
UPDATE public.textos_consentimiento
   SET vigente_hasta = now(), updated_at = now()
 WHERE jurisdiccion = 'AR'
   AND clave = 'seguimiento_ubicacion'
   AND modalidad = 'autonomo'
   AND vigente_hasta IS NULL;

INSERT INTO public.textos_consentimiento
  (jurisdiccion, clave, modalidad, version, idioma, titulo, cuerpo, puntos_clave, es_borrador,
   control_de_ubicacion_en_el_turno)
VALUES
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'es-AR', 'Ubicación',
   'Registramos su ubicación durante el viaje al domicilio y durante su turno de guardia.',
   '{}', false, true),
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'es-AR', 'Ubicación',
   'Registramos su ubicación durante el viaje al domicilio y al registrar la entrada y la salida.',
   '{}', false, false),
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'en', 'Location',
   'We record your location during the trip to the home and during your shift.',
   '{}', false, true),
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'en', 'Location',
   'We record your location during the trip to the home and when you check in and check out.',
   '{}', false, false),
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'pt-BR', 'Localização',
   'Registramos sua localização durante o trajeto até o domicílio e durante seu turno de plantão.',
   '{}', false, true),
  ('AR', 'seguimiento_ubicacion', 'autonomo', 2, 'pt-BR', 'Localização',
   'Registramos sua localização durante o trajeto até o domicílio e ao registrar a entrada e a saída.',
   '{}', false, false);

-- El consentimiento vale sólo si el texto que se aceptó es el de la forma que la Prestadora tiene
-- hoy. Si la Prestadora cambia de forma, el alcance cambió y el sí anterior no lo cubre.
CREATE OR REPLACE FUNCTION public.consentimiento_seguimiento_vigente(p_asistente_id uuid, p_clave text DEFAULT 'seguimiento_ubicacion'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM consentimientos_asistente c
    JOIN textos_consentimiento tx ON tx.id = c.texto_consentimiento_id
    JOIN prestadoras p ON p.id = c.prestadora_id
    WHERE c.asistente_id = p_asistente_id
      AND c.clave = p_clave
      AND c.retirado_at IS NULL
      AND c.decision = 'otorgado'
      AND tx.es_borrador = FALSE
      AND tx.vigente_hasta IS NULL
      AND (tx.control_de_ubicacion_en_el_turno IS NULL
           OR tx.control_de_ubicacion_en_el_turno = p.control_de_ubicacion_en_el_turno)
      AND interno.le_corresponde(c.prestadora_id)
  );
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
