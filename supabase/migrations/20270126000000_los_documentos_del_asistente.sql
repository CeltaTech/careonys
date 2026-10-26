-- Los documentos del Asistente, como en la aplicación de conductores de Cabify.
--
-- El Asistente sube cada documento y la Prestadora lo aprueba o lo observa con un motivo; lo que
-- carga la Prestadora queda aprobado de entrada. Cada documento guarda quién lo otorgó, y si ese
-- organismo tiene registro público, el Panel lleva a él para comprobar la validez.
--
-- La matrícula deja de ser un caso aparte: cada profesión tiene la suya como un documento más
-- («Matrícula de enfermería»…), que se pide a ese tipo de Asistente e impide trabajar si falta.
-- Con eso se borran la tabla de matrículas, sus vistas, sus funciones y sus disparadores, y el
-- control pasa a uno solo que mira todos los documentos que impiden trabajar.
--
-- Un documento que deja de valer tiene días de gracia, que la Prestadora puede prorrogar: mientras
-- duran, el Asistente sigue con los Pacientes que ya atendía y no recibe ninguno nuevo. Para un
-- turno de guardia puntual, quien tiene el permiso puede asignar igual, con motivo, y queda
-- registrado. Un turno fijo nunca se asigna así.

BEGIN;

-- ─── 1. Quién otorga cada documento ──────────────────────────────────────────────────────────

CREATE TABLE public.organismos_otorgantes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pais text NOT NULL,
  nombre text NOT NULL,
  enlace_comprobacion text,
  activo boolean DEFAULT true NOT NULL,
  orden integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (pais, nombre)
);

COMMENT ON TABLE public.organismos_otorgantes IS 'Organismos que otorgan documentos, por país. Catálogo común a todas las Prestadoras: no guarda datos de ninguna, y por eso no lleva la columna de la Prestadora.';
COMMENT ON COLUMN public.organismos_otorgantes.enlace_comprobacion IS 'Registro público donde se comprueba la validez de un documento. Vacío si el organismo no tiene consulta pública. Se carga después de comprobarlo a mano.';

ALTER TABLE public.organismos_otorgantes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organismos_otorgantes FROM anon;
GRANT SELECT ON public.organismos_otorgantes TO authenticated, trabajo_sin_persona;

CREATE POLICY organismos_otorgantes_los_lee_cualquiera
  ON public.organismos_otorgantes
  FOR SELECT
  TO authenticated, trabajo_sin_persona
  USING (true);

INSERT INTO public.organismos_otorgantes (pais, nombre, enlace_comprobacion, orden)
SELECT 'AR', o.nombre, o.enlace, o.orden
  FROM (VALUES
    ('Nación', 'https://sisa.msal.gov.ar/sisa/#sisa', 1),
    ('Buenos Aires', 'https://sisa.msal.gov.ar/sisa/#sisa', 2),
    ('Catamarca', 'https://sisa.msal.gov.ar/sisa/#sisa', 3),
    ('Chaco', 'https://sisa.msal.gov.ar/sisa/#sisa', 4),
    ('Chubut', 'https://sisa.msal.gov.ar/sisa/#sisa', 5),
    ('Ciudad Autónoma de Buenos Aires', 'https://sisa.msal.gov.ar/sisa/#sisa', 6),
    ('Córdoba', 'https://sisa.msal.gov.ar/sisa/#sisa', 7),
    ('Corrientes', 'https://sisa.msal.gov.ar/sisa/#sisa', 8),
    ('Entre Ríos', 'https://sisa.msal.gov.ar/sisa/#sisa', 9),
    ('Formosa', 'https://sisa.msal.gov.ar/sisa/#sisa', 10),
    ('Jujuy', 'https://sisa.msal.gov.ar/sisa/#sisa', 11),
    ('La Pampa', 'https://sisa.msal.gov.ar/sisa/#sisa', 12),
    ('La Rioja', 'https://sisa.msal.gov.ar/sisa/#sisa', 13),
    ('Mendoza', 'https://sisa.msal.gov.ar/sisa/#sisa', 14),
    ('Misiones', 'https://sisa.msal.gov.ar/sisa/#sisa', 15),
    ('Neuquén', 'https://sisa.msal.gov.ar/sisa/#sisa', 16),
    ('Río Negro', 'https://sisa.msal.gov.ar/sisa/#sisa', 17),
    ('Salta', 'https://sisa.msal.gov.ar/sisa/#sisa', 18),
    ('San Juan', 'https://sisa.msal.gov.ar/sisa/#sisa', 19),
    ('San Luis', 'https://sisa.msal.gov.ar/sisa/#sisa', 20),
    ('Santa Cruz', 'https://sisa.msal.gov.ar/sisa/#sisa', 21),
    ('Santa Fe', 'https://sisa.msal.gov.ar/sisa/#sisa', 22),
    ('Santiago del Estero', 'https://sisa.msal.gov.ar/sisa/#sisa', 23),
    ('Tierra del Fuego', 'https://sisa.msal.gov.ar/sisa/#sisa', 24),
    ('Tucumán', 'https://sisa.msal.gov.ar/sisa/#sisa', 25),
    ('Registro Nacional de Reincidencia', NULL, 26),
    ('ARCA', 'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do', 27)
  ) AS o (nombre, enlace, orden);

-- ─── 2. La configuración de cada tipo de documento ───────────────────────────────────────────

ALTER TABLE public.tipos_documento_asistente
  ADD COLUMN vencimiento text DEFAULT 'fecha_del_documento' NOT NULL,
  ADD COLUMN periodo_cantidad integer,
  ADD COLUMN periodo_unidad text REFERENCES public.catalogo_periodos_cobro(clave),
  ADD COLUMN lleva_numero boolean DEFAULT false NOT NULL,
  ADD COLUMN requisitos text,
  ADD COLUMN enlace_para_obtenerlo text,
  ADD COLUMN impide_trabajar boolean DEFAULT false NOT NULL,
  ADD COLUMN dias_de_gracia integer DEFAULT 0 NOT NULL,
  ADD CONSTRAINT tipos_documento_asistente_vencimiento_check
    CHECK (vencimiento IN ('no_vence', 'fecha_del_documento', 'plazo_desde_emision')),
  ADD CONSTRAINT tipos_documento_asistente_plazo_completo
    CHECK ((periodo_cantidad IS NULL) = (periodo_unidad IS NULL)
           AND (periodo_cantidad IS NULL OR periodo_cantidad > 0)
           AND ((vencimiento = 'plazo_desde_emision') = (periodo_cantidad IS NOT NULL))),
  ADD CONSTRAINT tipos_documento_asistente_dias_de_gracia_check
    CHECK (dias_de_gracia >= 0);

UPDATE public.tipos_documento_asistente
   SET vencimiento = CASE WHEN requiere_vencimiento THEN 'fecha_del_documento' ELSE 'no_vence' END;

ALTER TABLE public.tipos_documento_asistente DROP COLUMN requiere_vencimiento;

COMMENT ON COLUMN public.tipos_documento_asistente.vencimiento IS 'Cómo vence: no_vence; fecha_del_documento (la carga quien sube el documento); plazo_desde_emision (la calcula la base desde la fecha de emisión).';
COMMENT ON COLUMN public.tipos_documento_asistente.periodo_cantidad IS 'Con plazo desde la emisión, cuántas unidades dura el documento.';
COMMENT ON COLUMN public.tipos_documento_asistente.periodo_unidad IS 'Con plazo desde la emisión, la unidad de tiempo. Sale del mismo catálogo que las formas de cobro.';
COMMENT ON COLUMN public.tipos_documento_asistente.lleva_numero IS 'Si quien lo carga tiene que escribir el número del documento.';
COMMENT ON COLUMN public.tipos_documento_asistente.requisitos IS 'Lo que se mira a ojo al revisar el documento. Se le muestra al Asistente al cargarlo.';
COMMENT ON COLUMN public.tipos_documento_asistente.enlace_para_obtenerlo IS 'Dónde se tramita el documento. Se le muestra al Asistente al cargarlo.';
COMMENT ON COLUMN public.tipos_documento_asistente.impide_trabajar IS 'Si falta o no vale, el Asistente no recibe turnos, salvo los días de gracia y la excepción de a una guardia.';
COMMENT ON COLUMN public.tipos_documento_asistente.dias_de_gracia IS 'Días desde que el documento deja de valer en que el Asistente sigue con los Pacientes que ya atendía.';

-- ─── 3. A quién se pide cada documento y quién lo otorga ─────────────────────────────────────

CREATE TABLE public.tipos_documento_por_tipo_asistente (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  tipo_documento_id uuid NOT NULL,
  tipo_asistente_id uuid NOT NULL REFERENCES public.tipos_asistente(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (tipo_documento_id, prestadora_id)
    REFERENCES public.tipos_documento_asistente(id, prestadora_id) ON DELETE CASCADE,
  UNIQUE (tipo_documento_id, tipo_asistente_id)
);

COMMENT ON TABLE public.tipos_documento_por_tipo_asistente IS 'A qué tipos de Asistente se pide cada documento («Se pide a»).';

CREATE TABLE public.organismos_por_tipo_documento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  tipo_documento_id uuid NOT NULL,
  organismo_id uuid NOT NULL REFERENCES public.organismos_otorgantes(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (tipo_documento_id, prestadora_id)
    REFERENCES public.tipos_documento_asistente(id, prestadora_id) ON DELETE CASCADE,
  UNIQUE (tipo_documento_id, organismo_id)
);

COMMENT ON TABLE public.organismos_por_tipo_documento IS 'Qué organismos pueden otorgar cada documento («Otorgado por»). Con uno solo queda ese; con varios, el Asistente elige.';

-- Los cuatro de siempre se piden a todos los tipos de Asistente.
INSERT INTO public.tipos_documento_por_tipo_asistente (prestadora_id, tipo_documento_id, tipo_asistente_id)
SELECT d.prestadora_id, d.id, t.id
  FROM public.tipos_documento_asistente d
 CROSS JOIN public.tipos_asistente t
 WHERE t.prestadora_id IS NULL OR t.prestadora_id = d.prestadora_id;

INSERT INTO public.organismos_por_tipo_documento (prestadora_id, tipo_documento_id, organismo_id)
SELECT d.prestadora_id, d.id, o.id
  FROM public.tipos_documento_asistente d
  JOIN public.organismos_otorgantes o
    ON o.pais = 'AR'
   AND ((d.nombre = 'Certificado de Antecedentes Penales' AND o.nombre = 'Registro Nacional de Reincidencia')
     OR (d.nombre = 'Monotributo' AND o.nombre = 'ARCA'));

-- La antigua opción «Exige matrícula para poder atender» pasa a «Impide trabajar si falta».
-- Cada matrícula es un documento, que se pide sólo a su profesión.
INSERT INTO public.tipos_documento_asistente
  (prestadora_id, nombre, vencimiento, lleva_numero, impide_trabajar)
SELECT p.id, m.nombre, 'no_vence', true, true
  FROM public.prestadoras p
 CROSS JOIN (VALUES
   ('Matrícula de enfermería'),
   ('Matrícula de medicina'),
   ('Matrícula de kinesiología'),
   ('Matrícula de acompañamiento terapéutico')
 ) AS m (nombre);

INSERT INTO public.tipos_documento_por_tipo_asistente (prestadora_id, tipo_documento_id, tipo_asistente_id)
SELECT d.prestadora_id, d.id, t.id
  FROM public.tipos_documento_asistente d
  JOIN public.tipos_asistente t
    ON (d.nombre, t.clave) IN (('Matrícula de enfermería', 'enfermero'),
                               ('Matrícula de medicina', 'medico'),
                               ('Matrícula de kinesiología', 'kinesiologo'),
                               ('Matrícula de acompañamiento terapéutico', 'acompanante_terapeutico'))
   AND (t.prestadora_id IS NULL OR t.prestadora_id = d.prestadora_id);

INSERT INTO public.organismos_por_tipo_documento (prestadora_id, tipo_documento_id, organismo_id)
SELECT d.prestadora_id, d.id, o.id
  FROM public.tipos_documento_asistente d
  JOIN public.organismos_otorgantes o
    ON o.pais = 'AR' AND o.nombre NOT IN ('Registro Nacional de Reincidencia', 'ARCA')
 WHERE d.nombre LIKE 'Matrícula de %';

-- ─── 4. Cada documento cargado, con su historial ─────────────────────────────────────────────

-- Cada carga es una fila nueva: el documento que vale es el último cargado, y los anteriores
-- quedan como historial.
ALTER TABLE public.documentos_asistente
  DROP CONSTRAINT documentos_asistente_asistente_id_tipo_documento_id_key;

ALTER TABLE public.documentos_asistente
  ADD COLUMN estado text DEFAULT 'en_revision' NOT NULL,
  ADD COLUMN motivo_observacion text,
  ADD COLUMN revisado_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN revisado_at timestamptz,
  ADD COLUMN cargado_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN fecha_emision date,
  ADD COLUMN numero text,
  ADD COLUMN organismo_id uuid REFERENCES public.organismos_otorgantes(id),
  ADD CONSTRAINT documentos_asistente_estado_check
    CHECK (estado IN ('falta', 'en_revision', 'aprobado', 'observado')),
  ADD CONSTRAINT documentos_asistente_observado_con_motivo
    CHECK (estado <> 'observado' OR btrim(COALESCE(motivo_observacion, '')) <> '');

-- Los que había no tienen archivo: falta cargarlos.
UPDATE public.documentos_asistente SET estado = 'falta';

CREATE INDEX documentos_asistente_ultimo_idx
  ON public.documentos_asistente (asistente_id, tipo_documento_id, created_at DESC);

COMMENT ON COLUMN public.documentos_asistente.estado IS 'falta, en_revision, aprobado u observado. «Por vencer» y «Vencido» salen de la fecha de vencimiento, no se guardan.';
COMMENT ON COLUMN public.documentos_asistente.motivo_observacion IS 'Por qué la Prestadora lo observó. Se le muestra al Asistente.';
COMMENT ON COLUMN public.documentos_asistente.revisado_por IS 'Quién lo aprobó u observó.';
COMMENT ON COLUMN public.documentos_asistente.cargado_por IS 'Quién lo subió: el Asistente o alguien de la Prestadora.';
COMMENT ON COLUMN public.documentos_asistente.fecha_emision IS 'Fecha de emisión, cuando el tipo vence por plazo desde la emisión.';
COMMENT ON COLUMN public.documentos_asistente.numero IS 'Número del documento, cuando el tipo lleva número.';
COMMENT ON COLUMN public.documentos_asistente.organismo_id IS 'Quién lo otorgó. Sale de los organismos marcados para ese tipo.';

-- El vencimiento lo pone la base cuando sale de la configuración, y el organismo tiene que ser uno
-- de los marcados para ese tipo.
CREATE FUNCTION interno.completar_documento_asistente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_tipo public.tipos_documento_asistente;
BEGIN
  SELECT * INTO v_tipo
    FROM tipos_documento_asistente
   WHERE id = NEW.tipo_documento_id;

  IF v_tipo.vencimiento = 'no_vence' THEN
    NEW.fecha_vencimiento := NULL;
  ELSIF v_tipo.vencimiento = 'plazo_desde_emision' THEN
    NEW.fecha_vencimiento := CASE
      WHEN NEW.fecha_emision IS NULL THEN NULL
      ELSE (NEW.fecha_emision + CASE v_tipo.periodo_unidad
              WHEN 'dia'    THEN make_interval(days => v_tipo.periodo_cantidad)
              WHEN 'semana' THEN make_interval(weeks => v_tipo.periodo_cantidad)
              WHEN 'mes'    THEN make_interval(months => v_tipo.periodo_cantidad)
              WHEN 'anio'   THEN make_interval(years => v_tipo.periodo_cantidad)
            END)::date
    END;
  END IF;

  IF NEW.organismo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM organismos_por_tipo_documento o
        WHERE o.tipo_documento_id = NEW.tipo_documento_id
          AND o.organismo_id = NEW.organismo_id) THEN
    RAISE EXCEPTION 'organismo_no_otorga_ese_documento' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.completar_documento_asistente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.completar_documento_asistente()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER completar_documento_asistente
  BEFORE INSERT OR UPDATE OF tipo_documento_id, fecha_emision, fecha_vencimiento, organismo_id
  ON public.documentos_asistente
  FOR EACH ROW EXECUTE FUNCTION interno.completar_documento_asistente();

-- ─── 5. La matrícula como tabla aparte se va ─────────────────────────────────────────────────

DROP VIEW public.estado_matricula_asistente;
DROP VIEW public.matriculas_asistente_verificacion;

DROP POLICY prescripciones_asistente_sube_su_matricula ON storage.objects;
DROP POLICY prescripciones_asistente_lee_su_matricula ON storage.objects;

DROP TRIGGER trg_exigir_matricula_en_guardia ON public.guardias;
DROP TRIGGER trg_exigir_matricula_en_asignacion ON public.asignaciones_de_turno;
DROP FUNCTION public.exigir_matricula_en_guardia();
DROP FUNCTION interno.exigir_matricula_en_asignacion();
DROP FUNCTION interno.motivo_bloqueo_matricula(uuid, date);

DROP TABLE public.matriculas_asistente;

ALTER TABLE public.tipos_asistente
  DROP COLUMN requiere_matricula,
  DROP COLUMN tipo_matricula;

ALTER TABLE public.prestadoras DROP COLUMN modo_control_matricula;

-- La opción del teléfono pasa a valer para todos los documentos.
UPDATE public.configuracion_visibilidad_app
   SET clave = 'asistente_carga_sus_documentos'
 WHERE clave = 'asistente_carga_su_matricula';

-- ─── 6. Prórrogas de los días de gracia ──────────────────────────────────────────────────────

CREATE TABLE public.prorrogas_de_gracia_documento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes(id),
  tipo_documento_id uuid NOT NULL,
  dias integer NOT NULL CHECK (dias > 0),
  hasta date NOT NULL,
  prorrogado_por uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (tipo_documento_id, prestadora_id)
    REFERENCES public.tipos_documento_asistente(id, prestadora_id)
);

COMMENT ON TABLE public.prorrogas_de_gracia_documento IS 'Cada vez que la Prestadora prorrogó la gracia de un documento de un Asistente. Sin tope, y no se borra.';
COMMENT ON COLUMN public.prorrogas_de_gracia_documento.hasta IS 'Hasta qué día dura la gracia con esta prórroga. La calcula la base.';

-- Hasta qué día dura la gracia de un documento, o vacío si el documento vale ese día o si nunca
-- tuvo uno aprobado. La gracia arranca en el último vencimiento aprobado y dura los días de gracia
-- del tipo, o hasta donde llegue la prórroga más larga dada después de ese vencimiento.
CREATE FUNCTION interno.gracia_hasta(p_asistente_id uuid, p_tipo_documento_id uuid, p_dia date DEFAULT CURRENT_DATE)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id uuid;
  v_vencio        date;
  v_hasta         date;
BEGIN
  SELECT a.prestadora_id INTO v_prestadora_id
    FROM public.asistentes a
   WHERE a.id = p_asistente_id;

  -- Una persona o el trabajo sin persona sólo preguntan por un Asistente de su Prestadora.
  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.documentos_asistente d
        WHERE d.asistente_id = p_asistente_id
          AND d.tipo_documento_id = p_tipo_documento_id
          AND d.estado = 'aprobado'
          AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= p_dia)) THEN
    RETURN NULL;
  END IF;

  SELECT max(d.fecha_vencimiento) INTO v_vencio
    FROM public.documentos_asistente d
   WHERE d.asistente_id = p_asistente_id
     AND d.tipo_documento_id = p_tipo_documento_id
     AND d.estado = 'aprobado'
     AND d.fecha_vencimiento < p_dia;

  IF v_vencio IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT v_vencio + t.dias_de_gracia INTO v_hasta
    FROM public.tipos_documento_asistente t
   WHERE t.id = p_tipo_documento_id;

  SELECT GREATEST(v_hasta, max(p.hasta)) INTO v_hasta
    FROM public.prorrogas_de_gracia_documento p
   WHERE p.asistente_id = p_asistente_id
     AND p.tipo_documento_id = p_tipo_documento_id
     AND p.hasta > v_vencio;

  RETURN v_hasta;
END;
$function$;

REVOKE ALL ON FUNCTION interno.gracia_hasta(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.gracia_hasta(uuid, uuid, date)
  TO authenticated, service_role, trabajo_sin_persona;

-- Quien prorroga dice cuántos días; hasta cuándo lo calcula la base, desde donde termina la gracia
-- de hoy, o desde hoy si ya terminó. Sin un documento aprobado antes no hay gracia que prorrogar.
CREATE FUNCTION interno.calcular_prorroga_de_gracia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_gracia date;
BEGIN
  v_gracia := interno.gracia_hasta(NEW.asistente_id, NEW.tipo_documento_id, CURRENT_DATE);
  IF v_gracia IS NULL THEN
    RAISE EXCEPTION 'documento_sin_gracia' USING ERRCODE = '23514';
  END IF;
  NEW.hasta := GREATEST(v_gracia, CURRENT_DATE) + NEW.dias;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.calcular_prorroga_de_gracia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.calcular_prorroga_de_gracia()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER calcular_prorroga_de_gracia
  BEFORE INSERT ON public.prorrogas_de_gracia_documento
  FOR EACH ROW EXECUTE FUNCTION interno.calcular_prorroga_de_gracia();

-- ─── 7. Qué documentos impiden trabajar ──────────────────────────────────────────────────────

-- Los nombres de los documentos que impiden que ese Asistente trabaje ese día con ese Paciente.
-- Mira los tipos activos que impiden trabajar y se piden a su tipo de Asistente; un Asistente sin
-- tipo cargado no queda alcanzado. Un documento vale si está aprobado y no venció. Durante la
-- gracia vale sólo para los Pacientes que ya atendía antes de que venciera.
CREATE FUNCTION interno.documentos_que_bloquean(
  p_asistente_id uuid,
  p_dia date,
  p_paciente_id uuid DEFAULT NULL,
  p_servicio_id uuid DEFAULT NULL
)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prestadora_id uuid;
  v_tipo_id       uuid;
  v_tipo          record;
  v_hasta         date;
  v_vencio        date;
  v_bloquean      text[] := ARRAY[]::text[];
BEGIN
  IF p_asistente_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  SELECT a.prestadora_id, a.tipo_asistente_id INTO v_prestadora_id, v_tipo_id
    FROM public.asistentes a
   WHERE a.id = p_asistente_id;

  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('', 'service_role')
     AND v_prestadora_id IS DISTINCT FROM interno.prestadora_actual() THEN
    RAISE EXCEPTION 'El Asistente no pertenece a la Prestadora de quien pregunta'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo_id IS NULL THEN
    RETURN v_bloquean;
  END IF;

  FOR v_tipo IN
    SELECT t.id, t.nombre
      FROM public.tipos_documento_asistente t
      JOIN public.tipos_documento_por_tipo_asistente r ON r.tipo_documento_id = t.id
     WHERE t.prestadora_id = v_prestadora_id
       AND t.activo
       AND t.impide_trabajar
       AND r.tipo_asistente_id = v_tipo_id
     ORDER BY t.nombre
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= p_dia));

    v_hasta := interno.gracia_hasta(p_asistente_id, v_tipo.id, p_dia);

    IF v_hasta IS NOT NULL AND v_hasta >= p_dia THEN
      SELECT max(d.fecha_vencimiento) INTO v_vencio
        FROM public.documentos_asistente d
       WHERE d.asistente_id = p_asistente_id
         AND d.tipo_documento_id = v_tipo.id
         AND d.estado = 'aprobado'
         AND d.fecha_vencimiento < p_dia;

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.guardias g
         WHERE g.asistente_id = p_asistente_id
           AND g.fecha <= v_vencio
           AND g.estado <> 'cancelada'
           AND (g.paciente_id = p_paciente_id OR g.servicio_id = p_servicio_id))
      OR EXISTS (
        SELECT 1 FROM public.series_guardias s
         WHERE s.asistente_id = p_asistente_id
           AND s.estado = 'activa'
           AND s.paciente_id = p_paciente_id);
    END IF;

    v_bloquean := v_bloquean || v_tipo.nombre;
  END LOOP;

  RETURN v_bloquean;
END;
$function$;

REVOKE ALL ON FUNCTION interno.documentos_que_bloquean(uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.documentos_que_bloquean(uuid, date, uuid, uuid)
  TO authenticated, service_role, trabajo_sin_persona;

-- ─── 8. La excepción de a una guardia ────────────────────────────────────────────────────────

CREATE TABLE public.excepciones_por_documentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  guardia_id uuid NOT NULL REFERENCES public.guardias(id),
  asistente_id uuid NOT NULL REFERENCES public.asistentes(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  motivo text NOT NULL CHECK (btrim(motivo) <> ''),
  documentos text[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.excepciones_por_documentos IS 'Turnos de guardia asignados con documentos pendientes: quién, a quién, por qué y qué documentos faltaban. Vale sólo para esa guardia y ese Asistente. No se borra.';

CREATE INDEX excepciones_por_documentos_guardia_idx
  ON public.excepciones_por_documentos (guardia_id, asistente_id);

-- Los disparadores la consultan con los permisos de quien escribe, que no siempre puede leer la
-- tabla; por eso la pregunta va con privilegio y contesta sólo sí o no.
CREATE FUNCTION interno.hay_excepcion_por_documentos(p_guardia_id uuid, p_asistente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.excepciones_por_documentos e
      JOIN public.guardias g ON g.id = e.guardia_id AND g.prestadora_id = e.prestadora_id
     WHERE e.guardia_id = p_guardia_id
       AND e.asistente_id = p_asistente_id);
$function$;

REVOKE ALL ON FUNCTION interno.hay_excepcion_por_documentos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.hay_excepcion_por_documentos(uuid, uuid)
  TO authenticated, service_role, trabajo_sin_persona;

INSERT INTO public.catalogo_acciones_permisos (accion, default_solo_admin, orden)
VALUES ('asignar_con_documentos_pendientes', false, 18);

-- ─── 9. Los disparadores que hacen cumplir los documentos ────────────────────────────────────

CREATE FUNCTION interno.exigir_documentos_en_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
BEGIN
  IF NEW.asistente_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.asistente_id IS NOT DISTINCT FROM OLD.asistente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND interno.hay_excepcion_por_documentos(NEW.id, NEW.asistente_id) THEN
    RETURN NEW;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(
    NEW.asistente_id,
    interno.dia_en_que_termina_guardia(NEW.fecha, NEW.hora_inicio, NEW.hora_fin, NEW.dias_hasta_el_fin),
    NEW.paciente_id,
    NEW.servicio_id
  );

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.exigir_documentos_en_guardia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.exigir_documentos_en_guardia()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER trg_exigir_documentos_en_guardia
  BEFORE INSERT OR UPDATE ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.exigir_documentos_en_guardia();

CREATE FUNCTION interno.exigir_documentos_en_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_bloquean text[];
  v_dia      date;
  v_paciente uuid;
  v_servicio uuid;
BEGIN
  IF NOT (TG_OP = 'INSERT'
          OR (NEW.estado = 'aceptada' AND OLD.estado IS DISTINCT FROM 'aceptada')) THEN
    RETURN NEW;
  END IF;

  IF NEW.guardia_id IS NOT NULL THEN
    IF interno.hay_excepcion_por_documentos(NEW.guardia_id, NEW.asistente_id) THEN
      RETURN NEW;
    END IF;

    SELECT interno.dia_en_que_termina_guardia(g.fecha, g.hora_inicio, g.hora_fin, g.dias_hasta_el_fin),
           g.paciente_id, g.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.guardias g
     WHERE g.id = NEW.guardia_id;
  ELSIF NEW.serie_id IS NOT NULL THEN
    SELECT GREATEST(s.vigente_desde, CURRENT_DATE), s.paciente_id, s.servicio_id
      INTO v_dia, v_paciente, v_servicio
      FROM public.series_guardias s
     WHERE s.id = NEW.serie_id;
  END IF;

  v_bloquean := interno.documentos_que_bloquean(NEW.asistente_id, COALESCE(v_dia, CURRENT_DATE), v_paciente, v_servicio);

  IF cardinality(v_bloquean) > 0 THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION interno.exigir_documentos_en_asignacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.exigir_documentos_en_asignacion()
  TO authenticated, service_role, trabajo_sin_persona;

CREATE TRIGGER trg_exigir_documentos_en_asignacion
  BEFORE INSERT OR UPDATE ON public.asignaciones_de_turno
  FOR EACH ROW EXECUTE FUNCTION interno.exigir_documentos_en_asignacion();

-- ─── 10. Asignar y reasignar, con la excepción ───────────────────────────────────────────────

-- Si los documentos bloquean y viene un motivo, quien tiene el permiso asigna igual y queda
-- registrado. Sin motivo, el error dice qué documentos faltan.
CREATE FUNCTION interno.excepcion_por_documentos(
  p_prestadora_id uuid,
  p_guardia_id uuid,
  p_asistente_id uuid,
  p_bloquean text[],
  p_motivo text
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF cardinality(p_bloquean) = 0 THEN
    RETURN;
  END IF;

  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(p_bloquean, ', ')
      USING ERRCODE = '23514';
  END IF;

  IF NOT interno.tiene_permiso('asignar_con_documentos_pendientes') THEN
    RAISE EXCEPTION 'sin_permiso_para_asignar_con_documentos_pendientes' USING ERRCODE = '42501';
  END IF;

  INSERT INTO excepciones_por_documentos (prestadora_id, guardia_id, asistente_id, usuario_id, motivo, documentos)
  VALUES (p_prestadora_id, p_guardia_id, p_asistente_id, interno.usuario_de_la_sesion(), btrim(p_motivo), p_bloquean);
END;
$function$;

REVOKE ALL ON FUNCTION interno.excepcion_por_documentos(uuid, uuid, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.excepcion_por_documentos(uuid, uuid, uuid, text[], text)
  TO authenticated, service_role;

DROP FUNCTION public.asignar_turno(uuid, uuid);

CREATE FUNCTION public.asignar_turno(p_guardia_id uuid, p_asistente_id uuid, p_motivo_excepcion text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_guardia    public.guardias;
  v_pendiente  public.asignaciones_de_turno;
  v_anterior   uuid;
  v_nueva      uuid;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  -- Primero la asignación pendiente y después el turno: es el mismo orden en que los toma
  -- `aceptar_asignacion`, así las dos nunca se esperan una a la otra.
  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno
   WHERE guardia_id = p_guardia_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_guardia
    FROM guardias
   WHERE id = p_guardia_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardia_no_encontrada';
  END IF;

  IF v_guardia.estado <> 'programada' THEN
    RAISE EXCEPTION 'guardia_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  -- Lo que ya está como se pide no se toca: ni se retira ni se vuelve a avisar.
  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_guardia.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_guardia.asistente_id, v_pendiente.asistente_anterior_id);

  -- Las mismas paredes que pone la base cuando el turno pasa a ser de alguien, puestas ahora,
  -- para que el Coordinador se entere al asignar y no el Asistente al aceptar.
  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    -- El Coordinador asigna sólo a los Asistentes de su zona. Lo frenaría igual la política de
    -- la asignación, pero con un error que no dice qué pasó.
    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    PERFORM interno.excepcion_por_documentos(
      v_prestadora,
      v_guardia.id,
      p_asistente_id,
      interno.documentos_que_bloquean(
        p_asistente_id,
        interno.dia_en_que_termina_guardia(v_guardia.fecha, v_guardia.hora_inicio, v_guardia.hora_fin, v_guardia.dias_hasta_el_fin),
        v_guardia.paciente_id,
        v_guardia.servicio_id
      ),
      p_motivo_excepcion
    );

    IF v_guardia.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_guardia.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_guardia.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_guardia.asistente_id IS NOT NULL THEN
    UPDATE guardias SET asistente_id = NULL WHERE id = v_guardia.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno (prestadora_id, guardia_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_guardia.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  -- Alguien perdió el turno: la alarma se abre ya. Si había una abierta, sigue la misma.
  IF v_guardia.asistente_id IS NOT NULL OR v_pendiente.id IS NOT NULL THEN
    INSERT INTO incidentes_turno_sin_cubrir (prestadora_id, guardia_id)
    VALUES (v_prestadora, v_guardia.id)
    ON CONFLICT (guardia_id) WHERE resuelto_at IS NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_guardia.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.asignar_turno(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_turno(uuid, uuid, text) TO postgres, service_role, authenticated;

-- El turno fijo se repite: nunca se asigna con documentos pendientes.
CREATE OR REPLACE FUNCTION public.asignar_serie(p_serie_id uuid, p_asistente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_serie      public.series_guardias;
  v_pendiente  public.asignaciones_de_turno;
  v_anterior   uuid;
  v_nueva      uuid;
  v_bloquean   text[];
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  SELECT * INTO v_pendiente
    FROM asignaciones_de_turno
   WHERE serie_id = p_serie_id
     AND prestadora_id = v_prestadora
     AND estado = 'sin_responder'
   FOR UPDATE;

  SELECT * INTO v_serie
    FROM series_guardias
   WHERE id = p_serie_id
     AND prestadora_id = v_prestadora
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'serie_no_encontrada';
  END IF;

  IF v_serie.estado <> 'activa' THEN
    RAISE EXCEPTION 'serie_no_se_asigna' USING ERRCODE = '23514';
  END IF;

  IF p_asistente_id IS NOT NULL AND v_pendiente.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NOT NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id = p_asistente_id THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;
  IF p_asistente_id IS NULL AND v_pendiente.id IS NULL AND v_serie.asistente_id IS NULL THEN
    RETURN jsonb_build_object('sin_cambios', true);
  END IF;

  v_anterior := COALESCE(v_serie.asistente_id, v_pendiente.asistente_anterior_id);

  IF p_asistente_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM asistentes a WHERE a.id = p_asistente_id AND a.prestadora_id = v_prestadora) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    IF EXISTS (SELECT 1 FROM usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')
       AND NOT interno.coordinador_alcanza_asistente(p_asistente_id) THEN
      RAISE EXCEPTION 'asistente_no_encontrado';
    END IF;

    v_bloquean := interno.documentos_que_bloquean(
      p_asistente_id, GREATEST(v_serie.vigente_desde, CURRENT_DATE), v_serie.paciente_id, v_serie.servicio_id);
    IF cardinality(v_bloquean) > 0 THEN
      RAISE EXCEPTION 'documentos_bloquean:%:', array_to_string(v_bloquean, ', ') USING ERRCODE = '23514';
    END IF;

    IF v_serie.canal_modalidad IS NOT NULL
       AND NOT interno.asistente_trabaja_en_modalidad(p_asistente_id, v_serie.canal_modalidad) THEN
      RAISE EXCEPTION 'modalidad_bloquea:%:', v_serie.canal_modalidad USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_pendiente.id IS NOT NULL THEN
    UPDATE asignaciones_de_turno SET estado = 'retirada' WHERE id = v_pendiente.id;
  END IF;

  IF v_serie.asistente_id IS NOT NULL THEN
    UPDATE series_guardias SET asistente_id = NULL WHERE id = v_serie.id;
  END IF;

  IF p_asistente_id IS NOT NULL THEN
    INSERT INTO asignaciones_de_turno (prestadora_id, serie_id, asistente_id, asistente_anterior_id)
    VALUES (v_prestadora, v_serie.id, p_asistente_id, v_anterior)
    RETURNING id INTO v_nueva;
  END IF;

  RETURN jsonb_build_object(
    'sin_cambios', false,
    'asignacion_id', v_nueva,
    'titular_retirado', v_serie.asistente_id,
    'pendiente_retirado', v_pendiente.asistente_id,
    'asistente_anterior_id', v_anterior
  );
END;
$function$;

DROP FUNCTION public.reasignar_guardia_por_emergencia(uuid, uuid, text);

CREATE FUNCTION public.reasignar_guardia_por_emergencia(
  p_guardia_id uuid,
  p_asistente_id uuid,
  p_motivo text,
  p_motivo_excepcion text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_usuario    uuid;
  v_motivo     text := btrim(COALESCE(p_motivo, ''));
  v_guardia    record;
  v_tocadas    integer;
BEGIN
  -- La Prestadora y la persona salen de la sesión, nunca del pedido. Sin persona no hay a quién
  -- atribuirle el cambio, y no se hace.
  v_prestadora := interno.prestadora_actual();
  v_usuario := interno.usuario_de_la_sesion();
  IF v_prestadora IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'reasignacion_sin_sesion' USING ERRCODE = '42501';
  END IF;

  IF p_guardia_id IS NULL OR p_asistente_id IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION 'reasignacion_incompleta' USING ERRCODE = '23514';
  END IF;

  -- La lectura pasa por la RLS de quien pide.
  SELECT g.id, g.asistente_id, g.estado, g.checkin_at, g.fecha, g.hora_inicio, g.hora_fin,
         g.dias_hasta_el_fin, g.paciente_id, g.servicio_id
    INTO v_guardia
    FROM public.guardias g
   WHERE g.id = p_guardia_id
     AND g.prestadora_id = v_prestadora
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reasignacion_sin_guardia' USING ERRCODE = '42501';
  END IF;

  IF v_guardia.estado <> 'ausente' OR v_guardia.checkin_at IS NOT NULL
     OR v_guardia.asistente_id IS NOT DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'guardia_empezada_no_cambia_de_asistente' USING ERRCODE = '23514';
  END IF;

  PERFORM interno.excepcion_por_documentos(
    v_prestadora,
    p_guardia_id,
    p_asistente_id,
    interno.documentos_que_bloquean(
      p_asistente_id,
      interno.dia_en_que_termina_guardia(v_guardia.fecha, v_guardia.hora_inicio, v_guardia.hora_fin, v_guardia.dias_hasta_el_fin),
      v_guardia.paciente_id,
      v_guardia.servicio_id
    ),
    p_motivo_excepcion
  );

  PERFORM set_config('careonys.reasignacion_por_emergencia', p_guardia_id::text, true);

  INSERT INTO public.auditoria_reasignaciones_por_emergencia
    (prestadora_id, guardia_id, usuario_id, asistente_anterior_id, asistente_nuevo_id, motivo)
  VALUES
    (v_prestadora, p_guardia_id, v_usuario, v_guardia.asistente_id, p_asistente_id, v_motivo);

  -- Quien la cubre entra ahora: el turno vuelve a esperar su check-in.
  UPDATE public.guardias
     SET asistente_id = p_asistente_id,
         estado = 'programada'
   WHERE id = p_guardia_id
     AND prestadora_id = v_prestadora;
  GET DIAGNOSTICS v_tocadas = ROW_COUNT;

  PERFORM set_config('careonys.reasignacion_por_emergencia', '', true);

  IF v_tocadas = 0 THEN
    RAISE EXCEPTION 'reasignacion_sin_guardia' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.reasignar_guardia_por_emergencia(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reasignar_guardia_por_emergencia(uuid, uuid, text, text)
  TO postgres, service_role, authenticated;

-- ─── 11. Qué documentos se pide a cada Asistente y en qué estado está cada uno ───────────────

-- Un renglón por Asistente y documento pedido, con el último cargado. De acá salen «Enviados n de
-- total», la franja del Legajo y la gracia. Corre con los permisos de quien consulta.
CREATE VIEW public.documentos_pedidos_al_asistente
  WITH (security_invoker = true) AS
SELECT a.id AS asistente_id,
       a.prestadora_id,
       t.id AS tipo_documento_id,
       t.nombre,
       t.impide_trabajar,
       u.id AS documento_id,
       COALESCE(u.estado, 'falta') AS estado,
       u.fecha_vencimiento,
       u.motivo_observacion,
       interno.gracia_hasta(a.id, t.id, CURRENT_DATE) AS gracia_hasta
  FROM public.asistentes a
  JOIN public.tipos_documento_por_tipo_asistente r
    ON r.tipo_asistente_id = a.tipo_asistente_id AND r.prestadora_id = a.prestadora_id
  JOIN public.tipos_documento_asistente t
    ON t.id = r.tipo_documento_id AND t.activo
  LEFT JOIN LATERAL (
    SELECT d.id, d.estado, d.fecha_vencimiento, d.motivo_observacion
      FROM public.documentos_asistente d
     WHERE d.asistente_id = a.id AND d.tipo_documento_id = t.id
     ORDER BY d.created_at DESC
     LIMIT 1
  ) u ON true
 WHERE a.deleted_at IS NULL;

COMMENT ON VIEW public.documentos_pedidos_al_asistente IS 'Cada documento que se le pide a cada Asistente, con el último cargado. gracia_hasta viene vacía si el documento vale o nunca tuvo uno aprobado.';

REVOKE ALL ON public.documentos_pedidos_al_asistente FROM anon;
GRANT SELECT ON public.documentos_pedidos_al_asistente TO authenticated, service_role, trabajo_sin_persona;

-- ─── 12. Qué avisos al teléfono ya salieron ──────────────────────────────────────────────────

CREATE TABLE public.avisos_de_documento_enviados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),
  documento_id uuid NOT NULL REFERENCES public.documentos_asistente(id) ON DELETE CASCADE,
  clase text NOT NULL CHECK (clase IN ('por_vencer', 'vencido')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (documento_id, clase)
);

COMMENT ON TABLE public.avisos_de_documento_enviados IS 'Avisos de «por vencer» y «vencido» que ya se mandaron al teléfono del Asistente, uno por documento y clase.';

ALTER TABLE public.avisos_de_documento_enviados ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.avisos_de_documento_enviados FROM anon;
GRANT SELECT, INSERT ON public.avisos_de_documento_enviados TO trabajo_sin_persona;

CREATE POLICY avisos_de_documento_los_anota_el_trabajo
  ON public.avisos_de_documento_enviados
  FOR ALL
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- ─── 13. Protección por fila de lo nuevo, y lo que ve el Asistente ───────────────────────────

ALTER TABLE public.tipos_documento_por_tipo_asistente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organismos_por_tipo_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prorrogas_de_gracia_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excepciones_por_documentos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tipos_documento_por_tipo_asistente,
              public.organismos_por_tipo_documento,
              public.prorrogas_de_gracia_documento,
              public.excepciones_por_documentos FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento_por_tipo_asistente TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organismos_por_tipo_documento TO authenticated;
GRANT SELECT, INSERT ON public.prorrogas_de_gracia_documento TO authenticated;
GRANT SELECT, INSERT ON public.excepciones_por_documentos TO authenticated;
GRANT SELECT ON public.tipos_documento_por_tipo_asistente,
                public.organismos_por_tipo_documento,
                public.prorrogas_de_gracia_documento,
                public.excepciones_por_documentos TO trabajo_sin_persona;

-- La configuración la gestiona la administración; la leen quien coordina y el Asistente.
CREATE POLICY administracion_gestiona_tipos_por_tipo_asistente
  ON public.tipos_documento_por_tipo_asistente
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()));

CREATE POLICY equipo_lee_tipos_por_tipo_asistente
  ON public.tipos_documento_por_tipo_asistente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.asistente_de_la_sesion() IS NOT NULL
              OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.tipos_documento_por_tipo_asistente
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE POLICY administracion_gestiona_organismos_por_tipo
  ON public.organismos_por_tipo_documento
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()));

CREATE POLICY equipo_lee_organismos_por_tipo
  ON public.organismos_por_tipo_documento
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.asistente_de_la_sesion() IS NOT NULL
              OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = interno.usuario_de_la_sesion() AND u.rol = 'coordinador')));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.organismos_por_tipo_documento
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- Prorroga la administración; lee además quien coordina a ese Asistente.
CREATE POLICY administracion_prorroga_la_gracia
  ON public.prorrogas_de_gracia_documento
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_admin_prestadora() OR interno.es_superadmin())
              AND prorrogado_por = interno.usuario_de_la_sesion());

CREATE POLICY administracion_lee_las_prorrogas
  ON public.prorrogas_de_gracia_documento
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora() OR interno.es_superadmin()
              OR interno.coordinador_alcanza_asistente(asistente_id)));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.prorrogas_de_gracia_documento
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- La excepción la registra quien tiene el permiso, a su propio nombre.
CREATE POLICY quien_tiene_el_permiso_registra_la_excepcion
  ON public.excepciones_por_documentos
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND usuario_id = interno.usuario_de_la_sesion()
              AND interno.tiene_permiso('asignar_con_documentos_pendientes'));

CREATE POLICY administracion_y_coordinacion_leen_las_excepciones
  ON public.excepciones_por_documentos
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora() OR interno.es_superadmin()
              OR interno.coordinador_alcanza_asistente(asistente_id)));

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.excepciones_por_documentos
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- El Asistente ve los tipos de documento de su Prestadora.
CREATE POLICY asistente_lee_tipos_documento
  ON public.tipos_documento_asistente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.asistente_de_la_sesion() IS NOT NULL);

-- El Asistente ve sus documentos y carga los nuevos, que entran a revisión.
CREATE POLICY asistente_lee_sus_documentos
  ON public.documentos_asistente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND asistente_id = interno.asistente_de_la_sesion());

CREATE POLICY asistente_carga_sus_documentos
  ON public.documentos_asistente
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND asistente_id = interno.asistente_de_la_sesion()
              AND estado = 'en_revision'
              AND cargado_por = interno.usuario_de_la_sesion()
              AND revisado_por IS NULL
              AND revisado_at IS NULL
              AND motivo_observacion IS NULL);

-- Los archivos van a la carpeta del Asistente adentro de la de su Prestadora.
CREATE POLICY documentos_del_legajo_los_sube_el_asistente
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-asistente'
              AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
              AND (storage.foldername(name))[2] = (interno.asistente_de_la_sesion())::text);

CREATE POLICY documentos_del_legajo_los_lee_el_asistente
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-asistente'
         AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
         AND (storage.foldername(name))[2] = (interno.asistente_de_la_sesion())::text);

-- Lo que se haga con un permiso de acceso abierto queda registrado, como en las tablas hermanas.
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.tipos_documento_por_tipo_asistente
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.organismos_por_tipo_documento
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.prorrogas_de_gracia_documento
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();
CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.excepciones_por_documentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

-- ─── 14. Los avisos al teléfono del Asistente ────────────────────────────────────────────────

INSERT INTO public.mensajes_del_sistema (prestadora_id, clave, i18n)
VALUES
  (NULL, 'documento_observado.titulo',
   '{"es-AR": "Documento observado", "en": "Document returned", "pt-BR": "Documento com observação"}'),
  (NULL, 'documento_observado.cuerpo',
   '{"es-AR": "{{documento}}: {{motivo}}. Vuelva a cargarlo.", "en": "{{documento}}: {{motivo}}. Please upload it again.", "pt-BR": "{{documento}}: {{motivo}}. Envie-o novamente."}'),
  (NULL, 'documento_aprobado.titulo',
   '{"es-AR": "Documento aprobado", "en": "Document approved", "pt-BR": "Documento aprovado"}'),
  (NULL, 'documento_aprobado.cuerpo',
   '{"es-AR": "{{documento}} quedó aprobado.", "en": "{{documento}} has been approved.", "pt-BR": "{{documento}} foi aprovado."}'),
  (NULL, 'documento_por_vencer.titulo',
   '{"es-AR": "Documento por vencer", "en": "Document about to expire", "pt-BR": "Documento a vencer"}'),
  (NULL, 'documento_por_vencer.cuerpo',
   '{"es-AR": "{{documento}} vence el {{fecha}}. Suba la renovación.", "en": "{{documento}} expires on {{fecha}}. Please upload the renewal.", "pt-BR": "{{documento}} vence em {{fecha}}. Envie a renovação."}'),
  (NULL, 'documento_vencido.titulo',
   '{"es-AR": "Documento vencido", "en": "Document expired", "pt-BR": "Documento vencido"}'),
  (NULL, 'documento_vencido.cuerpo',
   '{"es-AR": "{{documento}} venció el {{fecha}}. Suba la renovación.", "en": "{{documento}} expired on {{fecha}}. Please upload the renewal.", "pt-BR": "{{documento}} venceu em {{fecha}}. Envie a renovação."}');

COMMIT;

NOTIFY pgrst, 'reload schema';
