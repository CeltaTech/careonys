-- La Prestadora elige cómo se toma la ubicación del Asistente.
--
-- Son dos formas, y en las dos el viaje hacia el domicilio se sigue de forma continua:
--   - Viaje y turno: además, un control cada tantos minutos mientras dura la guardia.
--   - Sólo viaje: durante la guardia, sólo la ubicación al escanear la entrada y la salida.
--
-- Reemplaza el interruptor «Compartir su ubicación durante la guardia» de Configuración, que
-- era un sí o un no y además sonaba a que lo decidía el Asistente.

BEGIN;

ALTER TABLE public.prestadoras
  ADD COLUMN control_de_ubicacion_en_el_turno boolean DEFAULT true NOT NULL,
  ADD COLUMN minutos_entre_controles_de_ubicacion integer DEFAULT 5 NOT NULL,
  ADD CONSTRAINT prestadoras_minutos_entre_controles_de_ubicacion_check
    CHECK (minutos_entre_controles_de_ubicacion >= 1 AND minutos_entre_controles_de_ubicacion <= 60);

COMMENT ON COLUMN public.prestadoras.control_de_ubicacion_en_el_turno IS 'Verdadero: viaje y turno. Falso: sólo viaje. De fábrica, viaje y turno.';
COMMENT ON COLUMN public.prestadoras.minutos_entre_controles_de_ubicacion IS 'Cada cuántos minutos se controla la ubicación durante la guardia, cuando la Prestadora eligió viaje y turno. De fábrica, 5.';

-- Se guardan desde Configuración, igual que el resto de las columnas de la Prestadora.
GRANT UPDATE (control_de_ubicacion_en_el_turno, minutos_entre_controles_de_ubicacion)
  ON public.prestadoras TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
