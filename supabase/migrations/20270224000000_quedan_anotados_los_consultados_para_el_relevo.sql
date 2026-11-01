-- A QUIÉN SE LE PREGUNTÓ POR UN RELEVO, Y QUÉ CONTESTÓ
--
-- Hasta acá el pedido de relevo salía a todos y no quedaba nada: ni a quiénes se les escribió, ni
-- quién dijo que podía, ni en cuánto llegaba. Una fila por persona consultada, colgada del pedido.
--
-- La respuesta la escribe el Asistente desde su aplicación, sobre su propia fila y sólo mientras el
-- pedido siga abierto. Los minutos que él dice y los que estima el GPS se guardan los dos, para que
-- quien coordina los compare.

CREATE TABLE public.consultas_de_relevo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  incidente_id uuid NOT NULL REFERENCES public.incidentes_relevo(id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes(id),
  rol text NOT NULL CHECK (rol IN ('suplente', 'franquero', 'emergencia')),
  consultado_at timestamptz NOT NULL DEFAULT now(),
  respuesta text CHECK (respuesta IN ('disponible', 'no_disponible')),
  minutos_que_indica integer CHECK (minutos_que_indica >= 0),
  minutos_por_gps integer CHECK (minutos_por_gps >= 0),
  respondido_at timestamptz,
  avisado_del_cierre_at timestamptz,
  UNIQUE (incidente_id, asistente_id),
  -- Quien dice que puede dice en cuánto llega; quien dice que no, no.
  CHECK (respuesta IS DISTINCT FROM 'disponible' OR minutos_que_indica IS NOT NULL),
  CHECK ((respuesta IS NULL) = (respondido_at IS NULL))
);

CREATE INDEX consultas_de_relevo_incidente ON public.consultas_de_relevo (incidente_id);
CREATE INDEX consultas_de_relevo_asistente ON public.consultas_de_relevo (asistente_id);

ALTER TABLE public.consultas_de_relevo ENABLE ROW LEVEL SECURITY;

-- Quien coordina ve las consultas de los pedidos que ve.
CREATE POLICY coordinador_ve_consultas_de_relevo_de_sus_servicios
  ON public.consultas_de_relevo FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (
      SELECT 1 FROM public.incidentes_relevo i
       WHERE i.id = consultas_de_relevo.incidente_id
         AND (interno.coordinador_ve_la_guardia(i.guardia_entrante_id)
              OR interno.coordinador_ve_la_guardia(i.guardia_saliente_id))
    )
  );

CREATE POLICY panel_ve_consultas_de_relevo
  ON public.consultas_de_relevo FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin()
         OR EXISTS (SELECT 1 FROM public.usuarios u
                     WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'admin_prestadora'))
  );

CREATE POLICY asistente_ve_sus_consultas_de_relevo
  ON public.consultas_de_relevo FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND asistente_id = interno.asistente_de_la_sesion());

-- Contesta sólo la suya, una vez, y mientras el pedido esté abierto.
CREATE POLICY asistente_contesta_su_consulta_de_relevo
  ON public.consultas_de_relevo FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND asistente_id = interno.asistente_de_la_sesion()
    AND respuesta IS NULL
    AND EXISTS (SELECT 1 FROM public.incidentes_relevo i
                 WHERE i.id = consultas_de_relevo.incidente_id AND i.resuelto_at IS NULL)
  )
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND asistente_id = interno.asistente_de_la_sesion());

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.consultas_de_relevo FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La hora de la respuesta la pone la base: el teléfono no puede anotarse más rápido de lo que fue.
CREATE FUNCTION interno.la_respuesta_al_relevo_la_fecha_la_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.respuesta := NULL;
    NEW.minutos_que_indica := NULL;
    NEW.minutos_por_gps := NULL;
    NEW.respondido_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.respuesta IS NULL AND NEW.respuesta IS NOT NULL THEN
    NEW.respondido_at := now();
  ELSE
    NEW.respondido_at := OLD.respondido_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_respuesta_al_relevo_la_fecha_la_base() FROM PUBLIC, anon;

CREATE TRIGGER la_respuesta_al_relevo_la_fecha_la_base
  BEFORE INSERT OR UPDATE ON public.consultas_de_relevo
  FOR EACH ROW EXECUTE FUNCTION interno.la_respuesta_al_relevo_la_fecha_la_base();

-- El Asistente escribe qué contesta y en cuánto dice que llega. Los minutos por GPS los calcula el
-- backend con el trabajo sin persona: si los pudiera escribir él, la comparación no compararía nada.
REVOKE ALL ON public.consultas_de_relevo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consultas_de_relevo TO authenticated;
GRANT UPDATE (respuesta, minutos_que_indica) ON public.consultas_de_relevo TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consultas_de_relevo TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
