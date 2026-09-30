-- Quien toma una alarma atiende esa guardia mientras la tenga tomada.
--
-- Cuando una alarma llega a todos los Coordinadores, cualquiera puede hacerse cargo. El que la toma
-- está atendiendo esa guardia de manera interina: decide sobre ella durante ese período para
-- resolver lo que pasó. Por eso, mientras dure la toma, cuenta como alguien que atiende a los
-- Pacientes de la guardia, y la reserva de la historia clínica lo deja ver lo que haga falta para
-- resolverla. Cuando la suelta, la resuelve o se le vence, deja de atenderla.
--
-- Antes de tomarla, la emergencia que llegó a todos la lee cualquier Coordinador, como las demás
-- alarmas; la reserva de la historia clínica la deja pasar mientras esté en ese escalón.

CREATE OR REPLACE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  WITH yo AS (
    SELECT auth.uid()                       AS uid,
           interno.current_tenant()         AS tenant,
           interno.asistente_de_la_sesion() AS asistente
  ),
  pac AS (
    SELECT p.id, p.familia_id
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
         pac.familia_id = interno.familia_id_de_usuario(yo.uid)

         -- Quien la Prestadora sumó al equipo.
         OR EXISTS (
           SELECT 1 FROM equipo_paciente e
            WHERE e.paciente_id = pac.id
              AND e.prestadora_id = yo.tenant
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
              AND (g.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM guardia_pacientes gp
                               WHERE gp.guardia_id = g.id AND gp.paciente_id = pac.id))
              AND ((yo.asistente IS NOT NULL AND g.asistente_id = yo.asistente)
                   OR g.coordinador_id = yo.uid
                   OR (g.asistente_id IS NOT NULL
                       AND interno.coordinador_alcanza_asistente(g.asistente_id)))
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
              AND (sg.paciente_id = pac.id
                   OR EXISTS (SELECT 1 FROM series_guardias_pacientes sp
                               WHERE sp.serie_id = sg.id AND sp.paciente_id = pac.id))
              AND ((yo.asistente IS NOT NULL AND sg.asistente_id = yo.asistente)
                   OR (sg.asistente_id IS NOT NULL
                       AND interno.coordinador_alcanza_asistente(sg.asistente_id)))
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

-- La emergencia que llegó a todos los Coordinadores la lee cualquiera de ellos mientras esté en ese
-- escalón, igual que las demás alarmas: para hacerse cargo hay que saber qué pasó.
DROP POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.emergencias_guardia;
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende ON public.emergencias_guardia
  AS RESTRICTIVE FOR SELECT
  USING (
    EXISTS (SELECT 1
              FROM interno.pacientes_de_la_guardia(emergencias_guardia.guardia_id) pg(paciente_id)
             WHERE interno.alcanza_la_informacion_de_salud(pg.paciente_id))
    OR id = ANY ((SELECT interno.alarmas_a_la_vista_del_coordinador('emergencia_guardia'))::uuid[])
  );

NOTIFY pgrst, 'reload schema';
