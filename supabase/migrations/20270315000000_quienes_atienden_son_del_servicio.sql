-- Quiénes atienden son del Servicio, no de cada Paciente.
--
-- Un Servicio puede tener varios Pacientes y lo atiende un solo equipo. La tabla que guardaba
-- las correcciones a mano por Paciente se reemplaza por una que las guarda por Servicio. La
-- vieja no tiene filas: si las tuviera, la migración se detiene antes de borrar nada.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipo_paciente) THEN
    RAISE EXCEPTION 'equipo_paciente tiene filas: hay que pasarlas al Servicio antes de borrarla';
  END IF;
END
$$;

-- 1. La tabla nueva, con las mismas reglas que la vieja.
CREATE TABLE public.equipo_servicio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  servicio_id   uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  asistente_id  uuid REFERENCES public.asistentes(id) ON DELETE CASCADE,
  usuario_id    uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  situacion     text NOT NULL CHECK (situacion IN ('sumada', 'sacada')),
  cubre_francos boolean NOT NULL DEFAULT false,
  motivo        text,
  decidido_por  uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipo_servicio_una_persona CHECK (num_nonnulls(asistente_id, usuario_id) = 1),
  CONSTRAINT equipo_servicio_sacada_no_cubre_francos CHECK (NOT (situacion = 'sacada' AND cubre_francos))
);

CREATE UNIQUE INDEX equipo_servicio_un_asistente_por_servicio
  ON public.equipo_servicio (servicio_id, asistente_id) WHERE asistente_id IS NOT NULL;
CREATE UNIQUE INDEX equipo_servicio_un_usuario_por_servicio
  ON public.equipo_servicio (servicio_id, usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX equipo_servicio_por_prestadora
  ON public.equipo_servicio (prestadora_id, servicio_id);

CREATE OR REPLACE FUNCTION interno.equipo_servicio_marca_el_cambio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipo_servicio_marca_el_cambio
  BEFORE UPDATE ON public.equipo_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.equipo_servicio_marca_el_cambio();

CREATE TRIGGER no_se_asigna_un_asistente_desactivado
  BEFORE INSERT OR UPDATE OF asistente_id ON public.equipo_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.no_se_asigna_un_asistente_desactivado();

-- 2. Quién la lee y quién la corrige.
ALTER TABLE public.equipo_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY panel_lee_el_equipo_del_servicio ON public.equipo_servicio
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.coordina_el_servicio(servicio_id))
  );

-- El Servicio tiene que ser de la misma Prestadora: sin eso se podría colgar una fila propia de
-- un Servicio ajeno.
CREATE POLICY coordinacion_corrige_el_equipo_del_servicio ON public.equipo_servicio
  FOR ALL TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_admin_prestadora()
         OR (interno.coordina_el_servicio(servicio_id) AND interno.tiene_permiso('modificar_asistentes_del_servicio')))
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM public.servicios s WHERE s.id = servicio_id AND s.prestadora_id = interno.prestadora_actual())
    AND (interno.es_admin_prestadora()
         OR (interno.coordina_el_servicio(servicio_id) AND interno.tiene_permiso('modificar_asistentes_del_servicio')))
  );

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.equipo_servicio
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON public.equipo_servicio FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipo_servicio TO authenticated;
GRANT SELECT ON public.equipo_servicio TO trabajo_sin_persona;

-- 3. Quien la Prestadora sumó al equipo de un Servicio vigente atiende a todos sus Pacientes.
CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT auth.uid()                       AS uid,
           interno.prestadora_actual()         AS tenant,
           interno.asistente_de_la_sesion() AS asistente
  ),
  pac AS (
    SELECT p.id, p.cliente_id
      FROM pacientes p, yo
     WHERE p.id = p_paciente
       AND p.prestadora_id = yo.tenant
  )
  SELECT EXISTS (
    SELECT 1
      FROM pac, yo
     WHERE yo.uid IS NOT NULL
       AND (
         -- Quien recibe el Servicio.
         pac.cliente_id = interno.cliente_id_de_usuario(yo.uid)

         -- Quien coordina uno de sus Servicios.
         OR interno.coordina_al_paciente(pac.id)

         -- Quien la Prestadora sumó al equipo de uno de sus Servicios.
         OR EXISTS (
           SELECT 1
             FROM equipo_servicio e
             JOIN servicios s ON s.id = e.servicio_id
                             AND s.prestadora_id = e.prestadora_id
                             AND s.cliente_id = pac.cliente_id
                             AND s.estado = 'vigente'
            WHERE e.prestadora_id = yo.tenant
              AND e.situacion = 'sumada'
              AND (e.usuario_id = yo.uid
                   OR (yo.asistente IS NOT NULL AND e.asistente_id = yo.asistente))
         )

         -- Quien lo presta, guardia por guardia.
         OR EXISTS (
           SELECT 1
             FROM guardias g
             JOIN servicios s ON s.id = g.servicio_id
                             AND s.prestadora_id = g.prestadora_id
                             AND s.estado = 'vigente'
            WHERE g.prestadora_id = yo.tenant
              AND g.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND g.asistente_id = yo.asistente
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
         )

         -- Quien lo presta por una serie que sigue en pie.
         OR EXISTS (
           SELECT 1
             FROM series_guardias sg
             JOIN servicios s ON s.id = sg.servicio_id
                             AND s.prestadora_id = sg.prestadora_id
                             AND s.estado = 'vigente'
            WHERE sg.prestadora_id = yo.tenant
              AND sg.estado <> 'cancelada'
              AND yo.asistente IS NOT NULL
              AND sg.asistente_id = yo.asistente
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_guardias_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
         )

         -- Quien tiene tomada una alarma de una de sus guardias, mientras la tenga.
         OR EXISTS (
           SELECT 1
             FROM guardias g
            WHERE g.prestadora_id = yo.tenant
              AND g.id = ANY (interno.guardias_a_la_vista_por_una_alarma(true))
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
         )
       )
  )
$function$;

-- 4. La tabla vieja sale, con su función de disparador.
DROP TABLE public.equipo_paciente;
DROP FUNCTION interno.equipo_paciente_marca_el_cambio();

NOTIFY pgrst, 'reload schema';
