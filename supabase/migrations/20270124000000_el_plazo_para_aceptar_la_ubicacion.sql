-- El plazo para aceptar la ubicación durante el turno.
--
-- Cuando la Prestadora pasa de «Sólo viaje» a «Viaje y turno», el Asistente tiene que aceptar el
-- texto nuevo, y tiene un plazo en días para hacerlo. Si el plazo vence sin aceptación, se le avisa
-- a la Prestadora, una vez por Asistente, y ella decide. El paso inverso no pide nada: lo ya
-- aceptado cubre lo menos.
--
-- El plazo corre desde el día del cambio, o desde el alta del Legajo si el Asistente entró después.

BEGIN;

ALTER TABLE public.prestadoras
  ADD COLUMN dias_para_aceptar_la_ubicacion integer DEFAULT 30 NOT NULL,
  ADD COLUMN control_de_ubicacion_en_el_turno_desde timestamptz,
  ADD CONSTRAINT prestadoras_dias_para_aceptar_la_ubicacion_check
    CHECK (dias_para_aceptar_la_ubicacion >= 1 AND dias_para_aceptar_la_ubicacion <= 365);

COMMENT ON COLUMN public.prestadoras.dias_para_aceptar_la_ubicacion IS 'Días que tiene el Asistente para aceptar el registro de su ubicación durante el turno, desde que la Prestadora eligió viaje y turno. De fábrica, 30.';
COMMENT ON COLUMN public.prestadoras.control_de_ubicacion_en_el_turno_desde IS 'Desde cuándo la Prestadora tiene viaje y turno. Vacía con sólo viaje. La pone la base.';

-- Las que ya tienen «Viaje y turno» empiezan a contar hoy.
UPDATE public.prestadoras
   SET control_de_ubicacion_en_el_turno_desde = now()
 WHERE control_de_ubicacion_en_el_turno;

-- La fecha la pone la base, no quien escribe: así no hay forma de cambiar de forma sin que el plazo
-- empiece a correr.
CREATE FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT NEW.control_de_ubicacion_en_el_turno THEN
    NEW.control_de_ubicacion_en_el_turno_desde := NULL;
  ELSIF TG_OP = 'INSERT' OR NOT OLD.control_de_ubicacion_en_el_turno THEN
    NEW.control_de_ubicacion_en_el_turno_desde := now();
  ELSE
    NEW.control_de_ubicacion_en_el_turno_desde := OLD.control_de_ubicacion_en_el_turno_desde;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER anotar_desde_cuando_se_controla_en_el_turno
  BEFORE INSERT OR UPDATE ON public.prestadoras
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_desde_cuando_se_controla_en_el_turno();

-- Se guarda desde Configuración, igual que la forma.
GRANT UPDATE (dias_para_aceptar_la_ubicacion, control_de_ubicacion_en_el_turno_desde)
  ON public.prestadoras TO trabajo_sin_persona;

-- Qué plazos vencidos ya se avisaron. Uno por Asistente y por cambio de forma: si la Prestadora
-- vuelve a pasar a «Viaje y turno», el plazo nuevo se avisa de nuevo.
CREATE TABLE public.plazos_de_ubicacion_avisados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes(id),
  control_en_el_turno_desde timestamptz NOT NULL,
  avisado_en timestamptz DEFAULT now() NOT NULL,
  UNIQUE (asistente_id, control_en_el_turno_desde)
);

COMMENT ON TABLE public.plazos_de_ubicacion_avisados IS 'Asistentes cuyo plazo para aceptar la ubicación durante el turno venció y ya se le avisó a la Prestadora.';

ALTER TABLE public.plazos_de_ubicacion_avisados ENABLE ROW LEVEL SECURITY;

-- Sólo lo usa la tarea automatizada, de a una Prestadora por vez.
GRANT SELECT, INSERT ON public.plazos_de_ubicacion_avisados TO trabajo_sin_persona;

CREATE POLICY plazos_de_ubicacion_los_anota_el_trabajo
  ON public.plazos_de_ubicacion_avisados
  FOR ALL
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- Para saber quién aceptó, la tarea lee las decisiones de su Prestadora y el texto que se aceptó.
GRANT SELECT ON public.consentimientos_asistente TO trabajo_sin_persona;

CREATE POLICY consentimientos_los_lee_el_trabajo
  ON public.consentimientos_asistente
  FOR SELECT
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- Los textos son un catálogo común, sin datos de ninguna Prestadora.
GRANT SELECT ON public.textos_consentimiento TO trabajo_sin_persona;

CREATE POLICY textos_consentimiento_los_lee_el_trabajo
  ON public.textos_consentimiento
  FOR SELECT
  TO trabajo_sin_persona
  USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
