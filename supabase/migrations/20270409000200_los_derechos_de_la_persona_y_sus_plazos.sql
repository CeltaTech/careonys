-- Los derechos de la persona sobre sus datos, y el plazo que tiene la Prestadora para responder.
--
-- QUÉ HACE
--
--   1. EL CALENDARIO DE FERIADOS DE CADA PAÍS (`feriados_por_pais`): el país, con su código de dos
--      letras, y la fecha. Nace vacío. Con él, `interno.sumar_dias_habiles(país, desde, días)`
--      cuenta días hábiles: saltea sábados, domingos y los feriados de ese país. Cuenta desde el
--      día siguiente al de partida y conserva la hora. El día de cada momento es el de la zona
--      horaria de la Prestadora de la sesión (`prestadoras.zona_horaria`, que agrega la migración
--      20270409000100); sin Prestadora en la sesión, el de la hora universal. La migración
--      20270409000300 usa esta función con esta misma firma.
--
--   2. LOS DERECHOS QUE UNA PERSONA PUEDE PEDIR (`catalogo_derechos_de_la_persona`): acceso a sus
--      datos, copia de la historia clínica, rectificación, supresión, portabilidad y oposición.
--
--   3. EL PLAZO DE RESPUESTA DE CADA DERECHO EN CADA PAÍS (`plazos_de_respuesta_de_derechos`):
--      cantidad, unidad (horas, días corridos o días hábiles), la norma que lo fija con su
--      artículo, desde y hasta cuándo rige, y cuántos días antes del vencimiento se avisa. Nace
--      VACÍO: se cargan sólo los plazos que el documento legal del país escribe con su artículo, y
--      hoy ninguno de los documentos de `docs/legal/` lo hace. El de la copia de la historia
--      clínica de la Argentina (48 horas, Ley 26.529) está escrito sin artículo.
--
--   4. LAS SOLICITUDES DE UNA PERSONA SOBRE SUS DATOS (`solicitudes_de_derechos`). Las carga y las
--      lee sólo la administración de la Prestadora. El vencimiento lo calcula la base al cargarla:
--      el plazo que rige en el país de la Prestadora el día en que se recibió. Si el país no tiene
--      plazo cargado para ese derecho, la solicitud queda sin vencimiento. Una solicitud no se
--      edita ni se borra: lo único que cambia es que se marca respondida —la base anota quién y
--      cuándo— y que el trabajo sin persona deja la constancia de que avisó.
--
--   5. EL AVISO DE VENCIMIENTO. `public.derechos_por_vencer()` contesta, al trabajo sin persona y
--      de a una Prestadora, qué solicitudes pendientes entraron en los días de aviso de su plazo y
--      todavía no se avisaron. `public.anotar_aviso_de_derecho_por_vencer(solicitud)` deja la
--      constancia después de mandar el correo.
--
--   6. QUIÉN ACCEDIÓ A LA INFORMACIÓN DE SALUD DE UN PACIENTE, PARA SU FAMILIA.
--      `public.accesos_a_la_informacion_de_salud_del_paciente(paciente)` contesta sólo al titular
--      del Cliente de ese Paciente y a la persona autorizada a la que le dieron ver los datos del
--      Paciente. El registro de accesos sólo lo lee la administración; por eso es una función.
--
--   7. LAS FRASES DEL CORREO DE AVISO, en es-AR, en y pt-BR.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO
--
--   No existen `interno.sumar_dias_habiles` ni ninguna de las cuatro tablas. Existen
--   `interno.es_la_administracion_de_la_prestadora(uuid)`, `interno.persona_autorizada_puede(uuid,
--   text)`, `interno.cliente_id_de_usuario(uuid)`, `interno.usuario_de_la_sesion()` y
--   `public.fn_auditoria_de_acceso_mutacion()`. `personas` y `usuarios` tienen la restricción única
--   (id, prestadora_id). La exportación de los datos de una persona se anota con la acción
--   «exportacion» del registro de actividad, que agrega la migración 20270409000400: ésta no
--   toca el catálogo de acciones.
--
-- CÓMO SE VUELVE ATRÁS
--
--   Otra migración que borre las cinco funciones públicas, las funciones de `interno` que crea ésta,
--   las cuatro tablas y las frases nuevas.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. El calendario de feriados y los días hábiles.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.feriados_por_pais (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pais   text NOT NULL,
  fecha  date NOT NULL,

  CONSTRAINT feriados_por_pais_pais_escrito CHECK (pais ~ '^[A-Z]{2}$'),
  CONSTRAINT feriados_por_pais_unico UNIQUE (pais, fecha)
);

COMMENT ON TABLE public.feriados_por_pais IS
  'Los feriados de cada país. Es catálogo del producto: lo carga una migración, y lo leen todos.';

ALTER TABLE public.feriados_por_pais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feriados_por_pais FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.feriados_por_pais TO authenticated, trabajo_sin_persona;

CREATE POLICY feriados_los_lee_quien_tiene_sesion ON public.feriados_por_pais
  FOR SELECT TO authenticated, trabajo_sin_persona
  USING (true);

-- La zona horaria de una Prestadora. Sin Prestadora, la hora universal.
CREATE FUNCTION interno.zona_horaria_de_la_prestadora(p_prestadora uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT COALESCE((SELECT p.zona_horaria FROM prestadoras p WHERE p.id = p_prestadora), 'UTC')
$$;
REVOKE EXECUTE ON FUNCTION interno.zona_horaria_de_la_prestadora(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.zona_horaria_de_la_prestadora(uuid) TO authenticated, trabajo_sin_persona;

-- Suma días hábiles: cuenta desde el día siguiente, saltea sábados, domingos y los feriados del
-- país, y conserva la hora del momento de partida. El día de cada momento es el de la zona horaria
-- de la Prestadora de la sesión. Con cero días devuelve el mismo momento.
CREATE FUNCTION interno.sumar_dias_habiles(p_pais text, p_desde timestamptz, p_dias integer)
  RETURNS timestamptz
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_zona   text;
  v_local  timestamp;
  v_dia    date;
  v_cuenta integer := 0;
BEGIN
  IF p_desde IS NULL OR p_dias IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_dias < 0 OR p_dias > 3650 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_dias = 0 THEN
    RETURN p_desde;
  END IF;

  v_zona  := interno.zona_horaria_de_la_prestadora(interno.prestadora_actual());
  v_local := p_desde AT TIME ZONE v_zona;
  v_dia   := v_local::date;

  WHILE v_cuenta < p_dias LOOP
    v_dia := v_dia + 1;
    IF extract(isodow FROM v_dia) < 6
       AND NOT EXISTS (SELECT 1 FROM feriados_por_pais f WHERE f.pais = p_pais AND f.fecha = v_dia) THEN
      v_cuenta := v_cuenta + 1;
    END IF;
  END LOOP;

  RETURN (v_dia + v_local::time) AT TIME ZONE v_zona;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.sumar_dias_habiles(text, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.sumar_dias_habiles(text, timestamptz, integer) TO authenticated, trabajo_sin_persona;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Los derechos que una persona puede pedir.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.catalogo_derechos_de_la_persona (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave  text NOT NULL UNIQUE,
  orden  smallint NOT NULL,

  CONSTRAINT catalogo_derechos_de_la_persona_clave_escrita CHECK (clave ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.catalogo_derechos_de_la_persona IS
  'Los derechos que una persona puede pedir sobre sus datos. El nombre visible de cada uno es la frase derechos_de_la_persona.derecho.<clave>.';

INSERT INTO public.catalogo_derechos_de_la_persona (clave, orden) VALUES
  ('acceso',                       1),
  ('copia_de_la_historia_clinica', 2),
  ('rectificacion',                3),
  ('supresion',                    4),
  ('portabilidad',                 5),
  ('oposicion',                    6);

ALTER TABLE public.catalogo_derechos_de_la_persona ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalogo_derechos_de_la_persona FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.catalogo_derechos_de_la_persona TO authenticated, trabajo_sin_persona;

CREATE POLICY derechos_los_lee_quien_tiene_sesion ON public.catalogo_derechos_de_la_persona
  FOR SELECT TO authenticated, trabajo_sin_persona
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. El plazo de respuesta de cada derecho en cada país.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.plazos_de_respuesta_de_derechos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pais           text NOT NULL,
  tipo           text NOT NULL REFERENCES public.catalogo_derechos_de_la_persona(clave),
  cantidad       integer NOT NULL,
  unidad         text NOT NULL,
  fuente         text NOT NULL,
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  dias_de_aviso  integer NOT NULL,

  CONSTRAINT plazos_de_respuesta_pais_escrito CHECK (pais ~ '^[A-Z]{2}$'),
  CONSTRAINT plazos_de_respuesta_cantidad_positiva CHECK (cantidad BETWEEN 1 AND 3650),
  CONSTRAINT plazos_de_respuesta_unidad_conocida CHECK (unidad IN ('horas', 'dias_corridos', 'dias_habiles')),
  CONSTRAINT plazos_de_respuesta_fuente_escrita CHECK (btrim(fuente) <> ''),
  CONSTRAINT plazos_de_respuesta_fechas_en_orden CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT plazos_de_respuesta_aviso_razonable CHECK (dias_de_aviso BETWEEN 0 AND 365),
  CONSTRAINT plazos_de_respuesta_unico UNIQUE (pais, tipo, vigente_desde)
);

COMMENT ON TABLE public.plazos_de_respuesta_de_derechos IS
  'Plazo de respuesta de cada derecho en cada país, con la norma y su artículo en fuente. Rige el vigente el día en que se recibió la solicitud. Sólo se cargan plazos escritos con su artículo en el documento legal del país.';

ALTER TABLE public.plazos_de_respuesta_de_derechos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plazos_de_respuesta_de_derechos FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.plazos_de_respuesta_de_derechos TO authenticated, trabajo_sin_persona;

CREATE POLICY plazos_de_respuesta_los_lee_quien_tiene_sesion ON public.plazos_de_respuesta_de_derechos
  FOR SELECT TO authenticated, trabajo_sin_persona
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Las solicitudes de una persona sobre sus datos.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.solicitudes_de_derechos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id     uuid NOT NULL REFERENCES public.prestadoras(id),
  -- Si la persona se borra del Directorio —la supresión que ella pidió—, la solicitud queda.
  persona_id        uuid,
  tipo              text NOT NULL REFERENCES public.catalogo_derechos_de_la_persona(clave),
  recibida_en       timestamptz NOT NULL DEFAULT now(),
  plazo_id          uuid REFERENCES public.plazos_de_respuesta_de_derechos(id),
  vence_en          timestamptz,
  estado            text NOT NULL DEFAULT 'pendiente',
  respondida_en     timestamptz,
  respondida_por    uuid REFERENCES public.usuarios(id),
  cargada_por       uuid REFERENCES public.usuarios(id),
  cargada_en        timestamptz NOT NULL DEFAULT now(),
  aviso_enviado_en  timestamptz,

  CONSTRAINT solicitudes_de_derechos_de_la_misma_prestadora
    FOREIGN KEY (persona_id, prestadora_id) REFERENCES public.personas(id, prestadora_id)
    ON DELETE SET NULL (persona_id),
  CONSTRAINT solicitudes_de_derechos_estado_conocido CHECK (estado IN ('pendiente', 'respondida')),
  CONSTRAINT solicitudes_de_derechos_respuesta_completa
    CHECK ((estado = 'respondida') = (respondida_en IS NOT NULL)),
  CONSTRAINT solicitudes_de_derechos_vencimiento_con_plazo
    CHECK ((plazo_id IS NULL) = (vence_en IS NULL))
);

CREATE INDEX solicitudes_de_derechos_por_prestadora ON public.solicitudes_de_derechos (prestadora_id, estado, vence_en);
CREATE INDEX solicitudes_de_derechos_por_persona ON public.solicitudes_de_derechos (persona_id) WHERE persona_id IS NOT NULL;

COMMENT ON TABLE public.solicitudes_de_derechos IS
  'Lo que una persona pide sobre sus datos. El vencimiento lo calcula la base con el plazo del país de la Prestadora vigente el día en que se recibió. No se edita ni se borra: se marca respondida.';

-- El plazo que rige y el vencimiento de una solicitud: el del país de la Prestadora, vigente el día
-- (en la zona horaria de la Prestadora) en que se recibió. Sin plazo cargado, no hay nada.
CREATE FUNCTION interno.vencimiento_de_la_solicitud(p_prestadora uuid, p_tipo text, p_recibida timestamptz)
  RETURNS TABLE (plazo_id uuid, vence_en timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  WITH lugar AS (
    SELECT pr.pais, interno.zona_horaria_de_la_prestadora(pr.id) AS zona
      FROM prestadoras pr
     WHERE pr.id = p_prestadora
  )
  SELECT pz.id,
         CASE pz.unidad
           WHEN 'horas' THEN p_recibida + make_interval(hours => pz.cantidad)
           WHEN 'dias_corridos' THEN p_recibida + make_interval(days => pz.cantidad)
           ELSE interno.sumar_dias_habiles(l.pais, p_recibida, pz.cantidad)
         END
    FROM lugar l
    JOIN plazos_de_respuesta_de_derechos pz
      ON pz.pais = l.pais
     AND pz.tipo = p_tipo
     AND pz.vigente_desde <= (p_recibida AT TIME ZONE l.zona)::date
     AND (pz.vigente_hasta IS NULL OR pz.vigente_hasta >= (p_recibida AT TIME ZONE l.zona)::date)
   ORDER BY pz.vigente_desde DESC
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION interno.vencimiento_de_la_solicitud(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.vencimiento_de_la_solicitud(uuid, text, timestamptz) TO authenticated, trabajo_sin_persona;

-- Lo que escribe la base y no quien llama. Al cargar: quién y cuándo, el estado, el plazo y el
-- vencimiento. Después, sólo dos cambios: marcarla respondida —una vez, y la base anota quién y
-- cuándo—, o la constancia del aviso, que deja sólo el trabajo sin persona.
CREATE FUNCTION interno.solicitud_de_derecho_la_escribe_la_base()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_vence record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.recibida_en IS NULL OR NEW.recibida_en > now() THEN
      RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = 'P0001';
    END IF;
    NEW.cargada_por      := interno.usuario_de_la_sesion();
    NEW.cargada_en       := now();
    NEW.estado           := 'pendiente';
    NEW.respondida_en    := NULL;
    NEW.respondida_por   := NULL;
    NEW.aviso_enviado_en := NULL;
    SELECT v.plazo_id, v.vence_en INTO v_vence
      FROM interno.vencimiento_de_la_solicitud(NEW.prestadora_id, NEW.tipo, NEW.recibida_en) v;
    NEW.plazo_id := v_vence.plazo_id;
    NEW.vence_en := v_vence.vence_en;
    RETURN NEW;
  END IF;

  -- Lo que no cambia nunca después del alta.
  IF (NEW.prestadora_id, NEW.persona_id, NEW.tipo, NEW.recibida_en, NEW.plazo_id, NEW.vence_en,
      NEW.cargada_por, NEW.cargada_en)
     IS DISTINCT FROM
     (OLD.prestadora_id, OLD.persona_id, OLD.tipo, OLD.recibida_en, OLD.plazo_id, OLD.vence_en,
      OLD.cargada_por, OLD.cargada_en) THEN
    -- Salvo la persona, que puede quedar vacía cuando se la borra del Directorio.
    IF NOT (NEW.persona_id IS NULL AND OLD.persona_id IS NOT NULL
            AND (NEW.prestadora_id, NEW.tipo, NEW.recibida_en, NEW.plazo_id, NEW.vence_en,
                 NEW.cargada_por, NEW.cargada_en)
                IS NOT DISTINCT FROM
                (OLD.prestadora_id, OLD.tipo, OLD.recibida_en, OLD.plazo_id, OLD.vence_en,
                 OLD.cargada_por, OLD.cargada_en)) THEN
      RAISE EXCEPTION 'no_se_edita' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- La constancia del aviso: sólo el trabajo sin persona, una vez.
  IF NEW.aviso_enviado_en IS DISTINCT FROM OLD.aviso_enviado_en THEN
    IF OLD.aviso_enviado_en IS NOT NULL
       OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
      RAISE EXCEPTION 'no_se_edita' USING ERRCODE = 'P0001';
    END IF;
    NEW.aviso_enviado_en := now();
  END IF;

  -- La respuesta: de pendiente a respondida, una vez.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado <> 'pendiente' THEN
      RAISE EXCEPTION 'ya_resuelta' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.estado <> 'respondida' THEN
      RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
    END IF;
    NEW.respondida_en  := now();
    NEW.respondida_por := interno.usuario_de_la_sesion();
  ELSIF NEW.respondida_en IS DISTINCT FROM OLD.respondida_en
        OR NEW.respondida_por IS DISTINCT FROM OLD.respondida_por THEN
    RAISE EXCEPTION 'no_se_edita' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION interno.solicitud_de_derecho_la_escribe_la_base() FROM PUBLIC, anon;

CREATE TRIGGER solicitud_de_derecho_la_escribe_la_base
  BEFORE INSERT OR UPDATE ON public.solicitudes_de_derechos
  FOR EACH ROW EXECUTE FUNCTION interno.solicitud_de_derecho_la_escribe_la_base();

-- Lo hecho con un permiso de acceso queda auditado, como en toda tabla con datos de un Cliente.
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR UPDATE OR DELETE ON public.solicitudes_de_derechos
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

-- RLS y permisos. Sólo la administración de la Prestadora. Sin DELETE para nadie.
ALTER TABLE public.solicitudes_de_derechos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitudes_de_derechos FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON public.solicitudes_de_derechos TO authenticated;
GRANT INSERT (prestadora_id, persona_id, tipo, recibida_en) ON public.solicitudes_de_derechos TO authenticated;
GRANT UPDATE (estado) ON public.solicitudes_de_derechos TO authenticated;

CREATE POLICY las_solicitudes_las_lee_la_administracion ON public.solicitudes_de_derechos
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY las_solicitudes_las_carga_la_administracion ON public.solicitudes_de_derechos
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_la_administracion_de_la_prestadora(prestadora_id));

CREATE POLICY las_solicitudes_las_responde_la_administracion ON public.solicitudes_de_derechos
  FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.es_la_administracion_de_la_prestadora(prestadora_id))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_la_administracion_de_la_prestadora(prestadora_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. El aviso de vencimiento, para el trabajo sin persona, de a una Prestadora.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Las pendientes que ya entraron en los días de aviso de su plazo —o que ya vencieron— y que
-- todavía no se avisaron. Con el día en que se recibió y el día en que vence, en la zona horaria
-- de la Prestadora, que son los que dice el correo.
CREATE FUNCTION interno.derechos_por_vencer(p_prestadora uuid)
  RETURNS TABLE (solicitud_id uuid, tipo text, recibida_en timestamptz, vence_en timestamptz,
                 recibida_el date, vence_el date)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
  SELECT s.id, s.tipo, s.recibida_en, s.vence_en,
         (s.recibida_en AT TIME ZONE interno.zona_horaria_de_la_prestadora(p_prestadora))::date,
         (s.vence_en AT TIME ZONE interno.zona_horaria_de_la_prestadora(p_prestadora))::date
    FROM solicitudes_de_derechos s
    JOIN plazos_de_respuesta_de_derechos pz ON pz.id = s.plazo_id
   WHERE s.prestadora_id = p_prestadora
     AND s.estado = 'pendiente'
     AND s.vence_en IS NOT NULL
     AND s.aviso_enviado_en IS NULL
     AND now() >= s.vence_en - make_interval(days => pz.dias_de_aviso)
   ORDER BY s.vence_en, s.id
$$;
REVOKE EXECUTE ON FUNCTION interno.derechos_por_vencer(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.derechos_por_vencer()
  RETURNS TABLE (solicitud_id uuid, tipo text, recibida_en timestamptz, vence_en timestamptz,
                 recibida_el date, vence_el date)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_avisar_los_derechos_por_vencer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM interno.derechos_por_vencer(v_prest);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.derechos_por_vencer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derechos_por_vencer() TO trabajo_sin_persona;

-- La constancia de que se avisó. Devuelve falso si esa solicitud ya no estaba por avisar.
CREATE FUNCTION public.anotar_aviso_de_derecho_por_vencer(p_solicitud uuid)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR COALESCE(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso_para_avisar_los_derechos_por_vencer' USING ERRCODE = '42501';
  END IF;

  UPDATE solicitudes_de_derechos s
     SET aviso_enviado_en = now()
   WHERE s.id = p_solicitud
     AND s.prestadora_id = v_prest
     AND s.id IN (SELECT p.solicitud_id FROM interno.derechos_por_vencer(v_prest) p);
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.anotar_aviso_de_derecho_por_vencer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anotar_aviso_de_derecho_por_vencer(uuid) TO trabajo_sin_persona;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Quién accedió a la información de salud de un Paciente, para su familia.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Contesta sólo si el Paciente es del Cliente de quien pregunta, en la Prestadora de la sesión, y
-- quien pregunta es el titular de ese Cliente o una persona autorizada a la que le dieron ver los
-- datos del Paciente. Si no, la misma respuesta que si el Paciente no existiera.
CREATE FUNCTION public.accesos_a_la_informacion_de_salud_del_paciente(p_paciente uuid, p_limite integer DEFAULT 500)
  RETURNS TABLE (momento timestamptz, quien text, rol text, origen text, categorias text[])
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_usuario uuid := interno.usuario_de_la_sesion();
  v_prest   uuid := interno.prestadora_actual();
BEGIN
  IF v_usuario IS NULL OR v_prest IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 5000 THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pacientes pa
     WHERE pa.id = p_paciente
       AND pa.prestadora_id = v_prest
       AND pa.deleted_at IS NULL
       AND pa.cliente_id = interno.cliente_id_de_usuario(v_usuario)
       AND interno.persona_autorizada_puede(v_usuario, 'persona_autorizada_ficha_del_paciente')
  ) THEN
    RAISE EXCEPTION 'paciente_no_encontrado' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT c.momento, u.nombre, u.rol, c.origen, c.categorias
      FROM consultas_a_hce c
      LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.prestadora_id = v_prest
       AND c.paciente_id = p_paciente
     ORDER BY c.momento DESC
     LIMIT p_limite;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accesos_a_la_informacion_de_salud_del_paciente(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accesos_a_la_informacion_de_salud_del_paciente(uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Las frases del correo de aviso.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('derechos_de_la_persona.aviso_de_vencimiento.asunto', '{"es-AR": "Una solicitud de {{derecho}} vence el {{fecha}}", "en": "A request for {{derecho}} is due on {{fecha}}", "pt-BR": "Uma solicitação de {{derecho}} vence em {{fecha}}"}'::jsonb, true, true),
  ('derechos_de_la_persona.aviso_de_vencimiento.texto', '{"es-AR": "La Prestadora recibió el {{recibida}} una solicitud de {{derecho}}. El plazo para responderla vence el {{fecha}}. Respóndala desde el Panel antes de esa fecha.", "en": "On {{recibida}}, a request for {{derecho}} was received. The deadline to answer it is {{fecha}}. Answer it from the Panel before that date.", "pt-BR": "Em {{recibida}}, foi recebida uma solicitação de {{derecho}}. O prazo para respondê-la vence em {{fecha}}. Responda-a pelo Painel antes dessa data."}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.acceso', '{"es-AR": "acceso a los datos", "en": "access to personal data", "pt-BR": "acesso aos dados"}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.copia_de_la_historia_clinica', '{"es-AR": "copia de la historia clínica", "en": "a copy of the medical record", "pt-BR": "cópia do prontuário"}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.rectificacion', '{"es-AR": "rectificación de datos", "en": "correction of personal data", "pt-BR": "retificação de dados"}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.supresion', '{"es-AR": "supresión de datos", "en": "deletion of personal data", "pt-BR": "eliminação de dados"}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.portabilidad', '{"es-AR": "portabilidad de datos", "en": "data portability", "pt-BR": "portabilidade de dados"}'::jsonb, true, true),
  ('derechos_de_la_persona.derecho.oposicion', '{"es-AR": "oposición al tratamiento de datos", "en": "objection to data processing", "pt-BR": "oposição ao tratamento de dados"}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
