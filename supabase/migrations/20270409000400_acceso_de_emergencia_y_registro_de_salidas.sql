-- El acceso de emergencia a la información de salud, y lo que el registro de actividad anota
-- de cómo sale la gente y qué datos se llevan.
--
-- Qué hace y por qué:
--
-- 1. Tres acciones nuevas en el registro de actividad. «Fin de sesión»: la persona salió del
--    Panel o de una de las dos aplicaciones, a mano o porque el sistema la sacó por
--    inactividad. «Exportación»: alguien bajó un archivo con datos del sistema. «Acceso de
--    emergencia»: alguien del personal abrió la información de salud de un Paciente que no
--    atiende. Las tres son de una persona, nunca del sistema solo.
--    La exportación no entraba en ninguno de los cinco grupos que admitía el catálogo, así que
--    se suma un sexto: la salida de datos.
--    El fin de sesión dice cómo terminó la sesión: es el único dato nuevo que admite el detalle
--    del registro, y nunca lleva contenido de nadie.
--
-- 2. Cuánto dura un acceso de emergencia. Lo configura cada Prestadora, junto con la
--    restricción de la información de salud. Arranca en 60 minutos, y admite de 5 a 480.
--
-- 3. Los accesos de emergencia. Cada uno dice de qué Prestadora es, quién lo abrió, para qué
--    Paciente, por qué motivo, y desde cuándo hasta cuándo vale. El motivo se guarda acá y no en
--    el registro de actividad, porque puede describir la salud del Paciente: el registro anota
--    sólo que hubo un acceso y cuál fue. La fila no se corrige ni se borra a mano: nadie tiene
--    permiso de escribirla fuera de la función que lo abre. Se va sola si se borra el Paciente,
--    porque el motivo es información de él. Cada uno ve los accesos que abrió, y la
--    administración de la Prestadora ve todos los de su Prestadora.
--
-- 4. La regla de quién alcanza la información de salud suma un caso: quien tiene un acceso de
--    emergencia vigente para ese Paciente, mientras siga siendo personal de la Prestadora. La
--    lectura sigue pasando por las mismas funciones que anotan cada consulta, así que todo lo
--    que lea queda anotado igual que lo de cualquier otra persona.
--
-- 5. La función que abre el acceso. La llama el Panel con la sesión de quien lo pide. Hace todo
--    junto o nada: guarda el acceso y deja la constancia en el registro de actividad. No hay
--    acceso sin constancia. Rechaza a quien no es personal de la Prestadora, al Paciente de otra
--    Prestadora, el motivo vacío y a quien ya alcanza esa información sin necesitar el acceso.
--
-- Cómo se vuelve atrás: otra migración que vuelva a escribir la regla de quién alcanza la
-- información de salud sin el caso nuevo, borre la función que abre el acceso, la que lo
-- comprueba y la tabla de accesos, saque la columna de los minutos y las tres acciones del
-- catálogo con su dato y su grupo. Las filas del registro que ya las usen tienen que irse antes,
-- y eso es borrar historia: se decide aparte.

-- ---------------------------------------------------------------------------------------------
-- 1. Las acciones nuevas del registro de actividad
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.catalogo_acciones_registradas
  DROP CONSTRAINT catalogo_acciones_registradas_grupo_conocido;

ALTER TABLE public.catalogo_acciones_registradas
  ADD CONSTRAINT catalogo_acciones_registradas_grupo_conocido
  CHECK (grupo = ANY (ARRAY['entrada_administrativa', 'permisos_y_membresia', 'borrado_de_datos',
                            'modificacion_critica', 'consecuencia_economica', 'salida_de_datos']));

COMMENT ON COLUMN public.catalogo_acciones_registradas.grupo IS
  'A cual de los casos que pide la regla de la empresa responde esta accion.';

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'fin_de_sesion', 'entrada_administrativa', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'exportacion', 'salida_de_datos', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'acceso_de_emergencia', 'permisos_y_membresia', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas;

-- Cómo terminó la sesión: «a_mano» o «por_inactividad».
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT 'causa', COALESCE(max(orden), 0) + 1
  FROM public.catalogo_datos_del_registro;

-- ---------------------------------------------------------------------------------------------
-- 2. Cuánto dura un acceso de emergencia
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.configuracion_de_hce
  ADD COLUMN minutos_de_acceso_de_emergencia integer DEFAULT 60 NOT NULL,
  ADD CONSTRAINT configuracion_de_hce_minutos_de_acceso_de_emergencia_check
    CHECK (minutos_de_acceso_de_emergencia BETWEEN 5 AND 480);

COMMENT ON COLUMN public.configuracion_de_hce.minutos_de_acceso_de_emergencia IS
  'Cuantos minutos vale un acceso de emergencia a la informacion de salud desde que se abre.';

-- ---------------------------------------------------------------------------------------------
-- 3. Los accesos de emergencia
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.accesos_de_emergencia (
  id            uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id),
  -- Sin clave foránea a propósito, como en las consultas a la información de salud: la
  -- constancia de quién abrió el acceso no se pierde si su cuenta se da de baja.
  usuario_id    uuid NOT NULL,
  paciente_id   uuid NOT NULL REFERENCES public.pacientes (id) ON DELETE CASCADE,
  motivo        text NOT NULL,
  desde         timestamp with time zone DEFAULT now() NOT NULL,
  hasta         timestamp with time zone NOT NULL,
  CONSTRAINT accesos_de_emergencia_motivo_dice_algo
    CHECK (btrim(motivo) <> '' AND length(motivo) <= 1000),
  CONSTRAINT accesos_de_emergencia_termina_despues_de_empezar
    CHECK (hasta > desde)
);

COMMENT ON TABLE public.accesos_de_emergencia IS
  'Cada vez que alguien del personal abrio la informacion de salud de un Paciente que no atiende, con el motivo que declaro y hasta cuando vale.';

CREATE INDEX idx_accesos_de_emergencia_vigentes
  ON public.accesos_de_emergencia (prestadora_id, usuario_id, paciente_id, hasta);

ALTER TABLE public.accesos_de_emergencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY accesos_de_emergencia_los_ve_quien_abrio_y_la_administracion
  ON public.accesos_de_emergencia FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (usuario_id = interno.usuario_de_la_sesion()
              OR interno.es_la_administracion_de_la_prestadora(prestadora_id)));

REVOKE ALL ON public.accesos_de_emergencia FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.accesos_de_emergencia TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Quién alcanza la información de salud
-- ---------------------------------------------------------------------------------------------

-- Si la sesión tiene un acceso de emergencia vigente para ese Paciente. La usan las políticas a
-- través de la regla de abajo, así que conserva el permiso de quien inició sesión.
CREATE OR REPLACE FUNCTION interno.tiene_acceso_de_emergencia(p_paciente uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT p_paciente IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND interno.es_personal_de_la_prestadora()
     AND EXISTS (SELECT 1 FROM accesos_de_emergencia a
                  WHERE a.prestadora_id = interno.prestadora_actual()
                    AND a.usuario_id = auth.uid()
                    AND a.paciente_id = p_paciente
                    AND a.desde <= now()
                    AND a.hasta > now())
$$;

REVOKE ALL ON FUNCTION interno.tiene_acceso_de_emergencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.tiene_acceso_de_emergencia(uuid) TO authenticated, service_role;

-- La misma regla de siempre, con el caso nuevo al final. Mantiene sus permisos.
CREATE OR REPLACE FUNCTION interno.alcanza_la_informacion_de_salud(p_paciente uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT p_paciente IS NOT NULL
     AND (NOT interno.rige_la_restriccion_de_hce(interno.prestadora_actual())
          OR interno.atiende_al_paciente(p_paciente)
          OR (interno.es_admin_prestadora()
              AND EXISTS (SELECT 1 FROM pacientes p
                           WHERE p.id = p_paciente
                             AND p.prestadora_id = interno.prestadora_actual()))
          OR interno.tiene_acceso_de_emergencia(p_paciente))
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Abrir un acceso de emergencia
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.abrir_acceso_de_emergencia(p_paciente uuid, p_motivo text)
  RETURNS TABLE (id uuid, hasta timestamp with time zone)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_usuario    uuid := auth.uid();
  v_prestadora uuid := interno.prestadora_actual();
  v_minutos    integer;
  v_id         uuid;
  v_hasta      timestamp with time zone;
BEGIN
  IF v_usuario IS NULL OR v_prestadora IS NULL OR NOT interno.es_personal_de_la_prestadora() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'faltan_datos' USING ERRCODE = '22023';
  END IF;

  IF p_paciente IS NULL OR NOT EXISTS (SELECT 1 FROM pacientes p
                                        WHERE p.id = p_paciente
                                          AND p.prestadora_id = v_prestadora) THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Quien ya alcanza esa información no necesita un acceso de emergencia.
  IF interno.alcanza_la_informacion_de_salud(p_paciente) THEN
    RAISE EXCEPTION 'ya_alcanza' USING ERRCODE = 'P0001';
  END IF;

  -- La configuración de la Prestadora, con sus valores de arranque si todavía no tenía.
  INSERT INTO configuracion_de_hce (prestadora_id) VALUES (v_prestadora)
  ON CONFLICT (prestadora_id) DO NOTHING;

  SELECT c.minutos_de_acceso_de_emergencia INTO v_minutos
    FROM configuracion_de_hce c
   WHERE c.prestadora_id = v_prestadora;

  INSERT INTO accesos_de_emergencia AS a (prestadora_id, usuario_id, paciente_id, motivo, desde, hasta)
  VALUES (v_prestadora, v_usuario, p_paciente, btrim(p_motivo), now(),
          now() + make_interval(mins => v_minutos))
  RETURNING a.id, a.hasta INTO v_id, v_hasta;

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id)
  VALUES (v_prestadora, v_usuario, 'acceso_de_emergencia', 'accesos_de_emergencia', v_id);

  RETURN QUERY SELECT v_id, v_hasta;
END;
$$;

REVOKE ALL ON FUNCTION public.abrir_acceso_de_emergencia(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_acceso_de_emergencia(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
