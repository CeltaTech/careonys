-- La información de salud de un paciente la ve quien lo atiende.
--
-- Es el segundo nivel de aislamiento. El primero separa a una Prestadora de otra. Éste separa,
-- adentro de una misma Prestadora, a quien atiende a un paciente de quien no
-- lo está: con el interruptor encendido, la historia clínica, las indicaciones y los registros de lo
-- hecho los lee sólo quien recibe el Servicio o quien lo presta. Ningún rol queda afuera de la
-- regla por ser el más alto: el Administrador también tiene que atenderlo.
--
-- Quién atiende sale de lo que la base ya tiene —quién recibe el Servicio y quién lo presta—, no de
-- una lista aparte que alguien tenga que mantener. Las correcciones del equipo que la Prestadora ya
-- carga (una persona sumada a mano) también cuentan, porque son parte de quién presta.
--
-- El interruptor es por Prestadora y nace encendido. Donde la ley del país lo exige no se puede
-- apagar, y eso no lo decide el código: sale de la tabla de requerimientos legales de HCE por país.
--
-- Qué NO cubre, y queda anotado en el plan:
--   · El backend todavía entra con la llave de servicio, que no pasa por RLS. Hasta que cada
--     pedido corra con la credencial de la persona, esta regla protege lo que se lee con sesión
--     propia y nada más.
--   · Las columnas de salud que viven adentro de la ficha del paciente (patologías, medicación
--     habitual, nivel de complejidad). RLS filtra filas, no columnas.
--   · El trabajo sin persona: no es una persona que mire, y sus políticas no cambian.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Qué exige la ley de cada país
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Un renglón dice que en esa jurisdicción rige ese requerimiento. Si el país no tiene renglón, no
-- rige nada: no se deduce por parecido con otro país. Se carga por migración, como el resto de la
-- configuración por país; ninguna pantalla la escribe.

CREATE TABLE public.requerimientos_legales_de_hce_por_pais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiccion text NOT NULL,
  requerimiento text NOT NULL,
  fuente       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requerimientos_legales_de_hce_por_pais_una_vez UNIQUE (jurisdiccion, requerimiento)
);

COMMENT ON TABLE public.requerimientos_legales_de_hce_por_pais IS
  'Lo que la ley de cada país obliga a hacer al producto. Un renglón por país y requerimiento; sin renglón, no rige.';
COMMENT ON COLUMN public.requerimientos_legales_de_hce_por_pais.fuente IS
  'La norma de donde sale el requerimiento, para que se pueda ir a leerla.';

ALTER TABLE public.requerimientos_legales_de_hce_por_pais ENABLE ROW LEVEL SECURITY;

-- Es información legal pública, igual para todas las Prestadoras: la lee cualquiera con sesión.
CREATE POLICY requerimientos_legales_de_hce_por_pais_se_leen
  ON public.requerimientos_legales_de_hce_por_pais FOR SELECT TO authenticated, trabajo_sin_persona
  USING (true);

REVOKE ALL ON public.requerimientos_legales_de_hce_por_pais FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.requerimientos_legales_de_hce_por_pais TO authenticated, trabajo_sin_persona;
GRANT ALL ON public.requerimientos_legales_de_hce_por_pais TO service_role;

INSERT INTO public.requerimientos_legales_de_hce_por_pais (jurisdiccion, requerimiento, fuente) VALUES
  ('CL', 'restriccion_de_hce', 'Ley 20.584 art. 13; Decreto 41/2012 art. 9');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. El interruptor de cada Prestadora
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Una Prestadora sin renglón tiene el interruptor encendido: si falta el dato, se cierra.

CREATE TABLE public.configuracion_de_hce (
  prestadora_id    uuid PRIMARY KEY REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  restriccion_de_hce boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.configuracion_de_hce IS
  'Si rige la restricción de HCE: la información de salud de un paciente la ve sólo quien lo atiende. Sin renglón, rige.';

ALTER TABLE public.configuracion_de_hce ENABLE ROW LEVEL SECURITY;

CREATE POLICY configuracion_de_hce_la_escribe_la_administracion
  ON public.configuracion_de_hce FOR ALL TO authenticated
  USING (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY configuracion_de_hce_la_lee_su_prestadora
  ON public.configuracion_de_hce FOR SELECT TO authenticated
  USING (interno.lee_la_configuracion(prestadora_id));

-- El trabajo sin persona la lee y no la cambia: apagarla exige saber quién lo hizo.
CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.configuracion_de_hce FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.current_tenant());

REVOKE ALL ON public.configuracion_de_hce FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT, INSERT, UPDATE ON public.configuracion_de_hce TO authenticated;
GRANT SELECT ON public.configuracion_de_hce TO trabajo_sin_persona;
GRANT ALL ON public.configuracion_de_hce TO service_role;

-- Si el país de la Prestadora lo exige. Sale de la tabla, nunca de un país escrito en el código.
CREATE FUNCTION interno.el_pais_exige_la_restriccion_de_hce(p_prestadora uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM prestadoras p
      JOIN requerimientos_legales_de_hce_por_pais e ON e.jurisdiccion = p.pais
     WHERE p.id = p_prestadora
       AND e.requerimiento = 'restriccion_de_hce'
  )
$$;

-- Antes de guardar: donde la ley lo exige no se apaga, y apagarlo exige una persona con sesión.
CREATE FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.prestadora_id IS DISTINCT FROM OLD.prestadora_id THEN
    RAISE EXCEPTION 'El interruptor no cambia de Prestadora';
  END IF;

  IF NOT NEW.restriccion_de_hce THEN
    IF interno.el_pais_exige_la_restriccion_de_hce(NEW.prestadora_id) THEN
      RAISE EXCEPTION 'En el país de esta Prestadora la ley no permite apagarlo'
        USING ERRCODE = 'check_violation';
    END IF;
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Apagarlo exige una persona con sesión, para que quede registrado quién lo hizo'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_el_interruptor_de_salud_se_apaga_donde_se_puede
  BEFORE INSERT OR UPDATE ON public.configuracion_de_hce
  FOR EACH ROW EXECUTE FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede();

-- Después de guardar: todo cambio hecho por una persona queda en el registro de actividad. Es un
-- cambio de permisos adentro de la Prestadora, y usa la acción que ya existe para eso.
-- SECURITY DEFINER por el mismo motivo que anotar_version_clinica: quien cambia el interruptor
-- no tiene permiso para escribir el registro, y no debe tenerlo.
CREATE FUNCTION interno.anotar_cambio_del_interruptor_de_salud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_antes boolean := CASE WHEN TG_OP = 'UPDATE' THEN OLD.restriccion_de_hce ELSE true END;
BEGIN
  IF v_antes IS NOT DISTINCT FROM NEW.restriccion_de_hce OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO registro_actividad
    (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle)
  VALUES
    (NEW.prestadora_id, auth.uid(), 'cambio_de_permisos_de_la_prestadora',
     TG_TABLE_NAME, NEW.prestadora_id, ARRAY['restriccion_de_hce'],
     jsonb_build_object('alcance_anterior', v_antes, 'alcance_nuevo', NEW.restriccion_de_hce));

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION interno.anotar_cambio_del_interruptor_de_salud() FROM PUBLIC, anon;

CREATE TRIGGER trg_anotar_cambio_del_interruptor_de_salud
  AFTER INSERT OR UPDATE ON public.configuracion_de_hce
  FOR EACH ROW EXECUTE FUNCTION interno.anotar_cambio_del_interruptor_de_salud();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Las funciones que deciden
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Si en esta Prestadora rige la regla. Sin Prestadora, o sin renglón, rige: se cierra.
-- El país se mira cada vez, así que un renglón apagado de antes deja de valer si la Prestadora
-- pasa a un país que lo exige.
CREATE FUNCTION interno.rige_la_restriccion_de_hce(p_prestadora uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_prestadora IS NULL
      OR interno.el_pais_exige_la_restriccion_de_hce(p_prestadora)
      OR COALESCE(
           (SELECT c.restriccion_de_hce FROM configuracion_de_hce c
             WHERE c.prestadora_id = p_prestadora),
           true)
$$;

-- Si quien consulta atiende al paciente, en la Prestadora en la que entró.
-- Es el único lugar donde se decide quién lo atiende. Lo atiende:
--   · quien recibe el Servicio: la Familia del paciente (la cuenta de la Familia o un miembro);
--   · quien lo presta: el Asistente de una guardia o de una serie del paciente, no cancelada, en un
--     Servicio vigente;
--   · quien coordina a ese Asistente (por los lugares que cubre) o figura como coordinador de la
--     guardia;
--   · quien la Prestadora sumó a mano al equipo del paciente.
-- Nadie más, sea cual sea su rol.
CREATE FUNCTION interno.atiende_al_paciente(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
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
       )
  )
$$;

-- La puerta que usan las políticas: con el interruptor apagado deja pasar y decide el rol; con el
-- interruptor encendido, sólo pasa quien atiende al paciente. Un paciente nulo no pasa.
CREATE FUNCTION interno.alcanza_la_informacion_de_salud(p_paciente uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT p_paciente IS NOT NULL
     AND (NOT interno.rige_la_restriccion_de_hce(interno.current_tenant())
          OR interno.atiende_al_paciente(p_paciente))
$$;

-- Las llaman las políticas, así que conservan authenticated. Nadie sin sesión las alcanza.
REVOKE ALL ON FUNCTION interno.el_pais_exige_la_restriccion_de_hce(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.rige_la_restriccion_de_hce(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.atiende_al_paciente(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.alcanza_la_informacion_de_salud(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_pais_exige_la_restriccion_de_hce(uuid)        TO authenticated, service_role, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.rige_la_restriccion_de_hce(uuid)                TO authenticated, service_role, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.atiende_al_paciente(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.alcanza_la_informacion_de_salud(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION interno.el_interruptor_de_salud_se_apaga_donde_se_puede() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Las tablas de información de salud
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Una política RESTRICTIVE se suma con Y a las que ya tiene cada tabla: no le da a nadie nada que
-- su rol no le diera, sólo le saca lo que no le corresponde. Todas llaman a la misma puerta.

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.reportes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.indicaciones_medicacion AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

-- Un rango sin paciente es el valor de la Prestadora, no información de nadie: ése no se toca.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.rangos_referencia_vitales AS RESTRICTIVE FOR SELECT TO authenticated
  USING (paciente_id IS NULL OR interno.alcanza_la_informacion_de_salud(paciente_id));

-- La historia de versiones: su propia política deja pasar a la administración sin mirar el
-- paciente. Ésta la alcanza igual. Las versiones de un rango de la Prestadora no tienen paciente.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.versiones_registro_clinico AS RESTRICTIVE FOR SELECT TO authenticated
  USING (paciente_id IS NULL OR interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.alertas AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.hospitalizaciones_paciente AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.informes_obra_social AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

-- El aviso de emergencia cuelga de la guardia: lo ve quien alcanza a alguno de sus pacientes.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.emergencias_guardia AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM interno.pacientes_de_la_guardia(guardia_id) AS pg(paciente_id)
     WHERE interno.alcanza_la_informacion_de_salud(pg.paciente_id)
  ));

-- La alerta de contingencia existe para que el equipo del conviviente se entere de la
-- internación: la ve quien alcanza a cualquiera de los dos.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.alertas_contingencia_hospitalizacion AS RESTRICTIVE FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_hospitalizado_id)
      OR interno.alcanza_la_informacion_de_salud(paciente_conviviente_id));

NOTIFY pgrst, 'reload schema';

COMMIT;
