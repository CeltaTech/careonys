-- Las brechas de seguridad, con su cuenta regresiva.
-- ======================================================================================
--
-- QUÉ HACE. Deja a la Prestadora un lugar donde anotar cada incidente de seguridad sobre los
-- datos de sus pacientes, la lista de pacientes alcanzados, la evaluación del riesgo y a quién
-- se avisó y cuándo. Y le calcula, para cada incidente, cuánto tiempo le queda para avisar a
-- cada destinatario según la ley del país de la Prestadora.
--
-- Son cuatro tablas y una función:
--
--   1. Los incidentes. Todo incidente queda anotado, se haya avisado o no, y no se borra. Lleva
--      cuándo ocurrió y cuándo se supo, porque cada ley cuenta el plazo desde uno de los dos.
--      La evaluación tiene los cuatro factores que pide la norma de Estados Unidos sobre
--      información de salud (45 CFR 164.402, definición de brecha, apartado 2): qué datos y
--      cuántos, quién los recibió o los usó, si de verdad se vieron o se llevaron, y cuánto se
--      redujo el riesgo. Sirve en cualquier país: es la forma ordenada de llegar a una conclusión.
--
--   2. Los pacientes alcanzados por cada incidente.
--
--   3. Los plazos para avisar, por país. Se cargan sólo los que el documento legal del país
--      escribe con número, unidad, desde qué momento cuentan y artículo. Un país sin plazo
--      cargado no tiene cuenta regresiva: el producto no inventa un plazo.
--
--   4. Las plantillas del aviso, por país y destinatario. Nace sin filas: un país sin plantilla
--      no tiene texto de aviso.
--
--   5. La función de la cuenta regresiva: para un incidente, cada plazo del país de la
--      Prestadora, cuándo vence y cuál manda, que es el que vence primero entre los avisos que
--      faltan.
--
-- LOS DÍAS HÁBILES salen de `interno.sumar_dias_habiles`, que crea la migración
-- 20270409000200 con el calendario de feriados de cada país. Esa corre antes que ésta.
--
-- QUIÉN LO VE. Sólo la administración de la Prestadora dueña del incidente. Ningún otro rol del
-- Panel, ningún Asistente y ningún Cliente.
--
-- PARA VOLVER ATRÁS. Se borran la función, las cuatro tablas, las tres funciones de los
-- disparadores y las cuatro acciones del catálogo del registro de actividad. Antes hay que
-- confirmar que no quedó ningún incidente cargado: es registro que la ley pide conservar.

-- --------------------------------------------------------------------------------------
-- 1. Los incidentes
-- --------------------------------------------------------------------------------------

CREATE TABLE public.incidentes_de_seguridad (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id               uuid        NOT NULL REFERENCES public.prestadoras(id),
  ocurrido_at                 timestamptz NOT NULL,
  conocido_at                 timestamptz NOT NULL,
  descripcion                 text        NOT NULL,
  cargado_por                 uuid        NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
  -- A quién se avisó y cuándo. Vacío quiere decir que todavía no se avisó.
  autoridad_notificada_at     timestamptz,
  titulares_notificados_at    timestamptz,
  responsable_notificado_at   timestamptz,
  -- Los cuatro factores de la evaluación del riesgo.
  factor_naturaleza_y_alcance text,
  factor_quien_recibio        text,
  factor_adquiridos_o_vistos  text,
  factor_mitigacion           text,
  conclusion                  text,
  evaluado_por                uuid        REFERENCES public.usuarios(id),
  evaluado_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incidentes_de_seguridad_id_prestadora_unique UNIQUE (id, prestadora_id),
  CONSTRAINT incidentes_de_seguridad_la_descripcion_no_va_vacia CHECK (btrim(descripcion) <> ''),
  CONSTRAINT incidentes_de_seguridad_no_se_supo_antes_de_ocurrir CHECK (conocido_at >= ocurrido_at),
  CONSTRAINT incidentes_de_seguridad_conclusion_conocida
    CHECK (conclusion IS NULL OR conclusion IN ('baja_probabilidad_de_compromiso', 'se_presume_brecha')),
  CONSTRAINT incidentes_de_seguridad_conclusion_de_los_cuatro_factores
    CHECK (conclusion IS NULL OR (
      btrim(coalesce(factor_naturaleza_y_alcance, '')) <> ''
      AND btrim(coalesce(factor_quien_recibio, '')) <> ''
      AND btrim(coalesce(factor_adquiridos_o_vistos, '')) <> ''
      AND btrim(coalesce(factor_mitigacion, '')) <> ''
    ))
);

CREATE INDEX incidentes_de_seguridad_por_prestadora
  ON public.incidentes_de_seguridad (prestadora_id, conocido_at DESC);

COMMENT ON TABLE public.incidentes_de_seguridad IS
  'Cada incidente de seguridad sobre datos de pacientes de una Prestadora: cuándo ocurrió, cuándo se supo, la evaluación de los cuatro factores del riesgo, la conclusión y a quién se avisó. Todo incidente queda anotado, se haya avisado o no, y no se borra.';

-- Quién evaluó y cuándo lo pone la base, nunca el pedido. Y un aviso dado no se des-da: la
-- fecha de un aviso que ya salió no se cambia ni se vacía.
CREATE FUNCTION interno.el_incidente_de_seguridad_anota_sus_cambios() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF (OLD.autoridad_notificada_at IS NOT NULL
        AND NEW.autoridad_notificada_at IS DISTINCT FROM OLD.autoridad_notificada_at)
     OR (OLD.titulares_notificados_at IS NOT NULL
        AND NEW.titulares_notificados_at IS DISTINCT FROM OLD.titulares_notificados_at)
     OR (OLD.responsable_notificado_at IS NOT NULL
        AND NEW.responsable_notificado_at IS DISTINCT FROM OLD.responsable_notificado_at) THEN
    RAISE EXCEPTION 'aviso_ya_dado'
      USING ERRCODE = '23514',
            DETAIL = 'La fecha de un aviso que ya se dio no se cambia.';
  END IF;

  IF NEW.factor_naturaleza_y_alcance IS DISTINCT FROM OLD.factor_naturaleza_y_alcance
     OR NEW.factor_quien_recibio IS DISTINCT FROM OLD.factor_quien_recibio
     OR NEW.factor_adquiridos_o_vistos IS DISTINCT FROM OLD.factor_adquiridos_o_vistos
     OR NEW.factor_mitigacion IS DISTINCT FROM OLD.factor_mitigacion
     OR NEW.conclusion IS DISTINCT FROM OLD.conclusion THEN
    NEW.evaluado_por := interno.usuario_de_la_sesion();
    NEW.evaluado_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_el_incidente_de_seguridad_anota_sus_cambios
  BEFORE UPDATE ON public.incidentes_de_seguridad
  FOR EACH ROW EXECUTE FUNCTION interno.el_incidente_de_seguridad_anota_sus_cambios();

CREATE FUNCTION interno.el_incidente_de_seguridad_no_se_borra() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'interno'
AS $$
BEGIN
  RAISE EXCEPTION 'Un incidente de seguridad y sus pacientes alcanzados no se borran'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_el_incidente_de_seguridad_no_se_borra
  BEFORE DELETE ON public.incidentes_de_seguridad
  FOR EACH ROW EXECUTE FUNCTION interno.el_incidente_de_seguridad_no_se_borra();

CREATE TRIGGER trg_el_incidente_de_seguridad_no_se_vacia
  BEFORE TRUNCATE ON public.incidentes_de_seguridad
  FOR EACH STATEMENT EXECUTE FUNCTION interno.el_incidente_de_seguridad_no_se_borra();

-- --------------------------------------------------------------------------------------
-- 2. Los pacientes alcanzados
-- --------------------------------------------------------------------------------------

-- Las dos claves foráneas llevan la Prestadora: un incidente de una Prestadora no puede nombrar
-- a un paciente de otra, aunque alguien conozca su identificador.
CREATE TABLE public.pacientes_de_incidentes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid        NOT NULL REFERENCES public.prestadoras(id),
  incidente_id  uuid        NOT NULL,
  paciente_id   uuid        NOT NULL,
  agregado_por  uuid        NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pacientes_de_incidentes_el_incidente_es_de_la_prestadora
    FOREIGN KEY (incidente_id, prestadora_id)
    REFERENCES public.incidentes_de_seguridad (id, prestadora_id),
  CONSTRAINT pacientes_de_incidentes_el_paciente_es_de_la_prestadora
    FOREIGN KEY (paciente_id, prestadora_id)
    REFERENCES public.pacientes (id, prestadora_id),
  CONSTRAINT pacientes_de_incidentes_un_paciente_una_vez UNIQUE (incidente_id, paciente_id)
);

CREATE INDEX pacientes_de_incidentes_por_paciente
  ON public.pacientes_de_incidentes (prestadora_id, paciente_id);

COMMENT ON TABLE public.pacientes_de_incidentes IS
  'Los pacientes cuyos datos alcanzó un incidente de seguridad. No se borra.';

CREATE TRIGGER trg_el_paciente_alcanzado_no_se_borra
  BEFORE DELETE ON public.pacientes_de_incidentes
  FOR EACH ROW EXECUTE FUNCTION interno.el_incidente_de_seguridad_no_se_borra();

CREATE TRIGGER trg_el_paciente_alcanzado_no_se_vacia
  BEFORE TRUNCATE ON public.pacientes_de_incidentes
  FOR EACH STATEMENT EXECUTE FUNCTION interno.el_incidente_de_seguridad_no_se_borra();

-- --------------------------------------------------------------------------------------
-- 3. Los plazos para avisar, por país
-- --------------------------------------------------------------------------------------

CREATE TABLE public.plazos_de_notificacion_de_brechas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiccion   text        NOT NULL,
  destinatario   text        NOT NULL,
  organismo      text,
  cantidad       integer     NOT NULL,
  unidad         text        NOT NULL,
  cuenta_desde   text        NOT NULL,
  fuente         text        NOT NULL,
  vigencia_desde date        NOT NULL,
  vigencia_hasta date,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plazos_de_notificacion_de_brechas_jurisdiccion_es_un_pais CHECK (jurisdiccion ~ '^[A-Z]{2}$'),
  CONSTRAINT plazos_de_notificacion_de_brechas_destinatario_conocido
    CHECK (destinatario IN ('autoridad', 'titular', 'responsable')),
  CONSTRAINT plazos_de_notificacion_de_brechas_la_cantidad_es_positiva CHECK (cantidad > 0),
  CONSTRAINT plazos_de_notificacion_de_brechas_unidad_conocida
    CHECK (unidad IN ('horas', 'dias_corridos', 'dias_habiles')),
  CONSTRAINT plazos_de_notificacion_de_brechas_momento_conocido
    CHECK (cuenta_desde IN ('ocurrido', 'conocido')),
  CONSTRAINT plazos_de_notificacion_de_brechas_cita_su_norma CHECK (btrim(fuente) <> ''),
  CONSTRAINT plazos_de_brechas_la_vigencia_no_termina_antes_de_empezar
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CONSTRAINT plazos_de_notificacion_de_brechas_un_plazo_por_vigencia
    UNIQUE (jurisdiccion, destinatario, vigencia_desde)
);

COMMENT ON TABLE public.plazos_de_notificacion_de_brechas IS
  'Plazo legal para avisar de un incidente de seguridad, por país y destinatario. Se cargan sólo los plazos que el documento legal del país escribe con número, unidad, momento de inicio y artículo. Se cargan con migraciones y ningún plazo vive en el código.';

-- Costa Rica: docs/legal/costa_rica.md, renglones 18 y 19.
-- Panamá: docs/legal/panama.md, renglones 20 a 23.
INSERT INTO public.plazos_de_notificacion_de_brechas
  (jurisdiccion, destinatario, organismo, cantidad, unidad, cuenta_desde, fuente, vigencia_desde)
VALUES
  ('CR', 'autoridad', 'PRODHAB', 5, 'dias_habiles', 'ocurrido',
   'Reglamento de la Ley 8968 (Decreto Ejecutivo 37554-JP), artículos 38 y 39',
   DATE '2013-03-05'),
  ('CR', 'titular', NULL, 5, 'dias_habiles', 'ocurrido',
   'Reglamento de la Ley 8968 (Decreto Ejecutivo 37554-JP), artículos 38 y 39',
   DATE '2013-03-05'),
  ('PA', 'autoridad', 'ANTAI', 72, 'horas', 'conocido',
   'Decreto Ejecutivo 285 de 2021, reglamentario de la Ley 81 de 2019, artículo 37',
   DATE '2021-03-29'),
  ('PA', 'titular', NULL, 72, 'horas', 'conocido',
   'Decreto Ejecutivo 285 de 2021, reglamentario de la Ley 81 de 2019, artículo 37',
   DATE '2021-03-29');

-- --------------------------------------------------------------------------------------
-- 4. Las plantillas del aviso, por país y destinatario
-- --------------------------------------------------------------------------------------

-- El texto va en los tres idiomas del producto. Puede llevar estos marcadores, que el backend
-- reemplaza con los datos del incidente: {ocurrido}, {conocido}, {descripcion},
-- {cantidad_de_pacientes}. `contenido_minimo` es la lista de lo que la ley pide que diga el
-- aviso, tal como la escribe la norma, para que quien lo revisa pueda cotejarlo.
CREATE TABLE public.plantillas_de_aviso_de_brechas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiccion     text        NOT NULL,
  destinatario     text        NOT NULL,
  texto            jsonb       NOT NULL,
  contenido_minimo text[]      NOT NULL DEFAULT '{}',
  fuente           text        NOT NULL,
  vigencia_desde   date        NOT NULL,
  vigencia_hasta   date,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plantillas_de_aviso_de_brechas_jurisdiccion_es_un_pais CHECK (jurisdiccion ~ '^[A-Z]{2}$'),
  CONSTRAINT plantillas_de_aviso_de_brechas_destinatario_conocido
    CHECK (destinatario IN ('autoridad', 'titular', 'responsable')),
  CONSTRAINT plantillas_de_aviso_de_brechas_en_los_tres_idiomas
    CHECK (jsonb_typeof(texto) = 'object' AND texto ?& ARRAY['es-AR', 'en', 'pt-BR']),
  CONSTRAINT plantillas_de_aviso_de_brechas_cita_su_norma CHECK (btrim(fuente) <> ''),
  CONSTRAINT plantillas_de_brechas_la_vigencia_no_termina_antes_de_empezar
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CONSTRAINT plantillas_de_aviso_de_brechas_una_por_vigencia
    UNIQUE (jurisdiccion, destinatario, vigencia_desde)
);

COMMENT ON TABLE public.plantillas_de_aviso_de_brechas IS
  'Texto del aviso de un incidente de seguridad, por país y destinatario, en los tres idiomas, con el contenido mínimo que pide la norma. Un país sin plantilla no tiene texto de aviso: el producto no lo improvisa.';

-- --------------------------------------------------------------------------------------
-- 5. Permisos y políticas: sólo la administración de la Prestadora
-- --------------------------------------------------------------------------------------

REVOKE ALL ON public.incidentes_de_seguridad FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
REVOKE ALL ON public.pacientes_de_incidentes FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
REVOKE ALL ON public.plazos_de_notificacion_de_brechas FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
REVOKE ALL ON public.plantillas_de_aviso_de_brechas FROM PUBLIC, anon, authenticated, trabajo_sin_persona;

-- Nadie borra. El alta no elige quién cargó: lo pone la base. La corrección alcanza sólo a la
-- evaluación y a los avisos; lo que se anotó del hecho queda como se anotó.
GRANT SELECT ON public.incidentes_de_seguridad TO authenticated;
GRANT INSERT (prestadora_id, ocurrido_at, conocido_at, descripcion)
  ON public.incidentes_de_seguridad TO authenticated;
GRANT UPDATE (factor_naturaleza_y_alcance, factor_quien_recibio, factor_adquiridos_o_vistos,
              factor_mitigacion, conclusion,
              autoridad_notificada_at, titulares_notificados_at, responsable_notificado_at)
  ON public.incidentes_de_seguridad TO authenticated;

GRANT SELECT ON public.pacientes_de_incidentes TO authenticated;
GRANT INSERT (prestadora_id, incidente_id, paciente_id)
  ON public.pacientes_de_incidentes TO authenticated;

GRANT SELECT ON public.plazos_de_notificacion_de_brechas TO authenticated;
GRANT SELECT ON public.plantillas_de_aviso_de_brechas TO authenticated;

ALTER TABLE public.incidentes_de_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_de_incidentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plazos_de_notificacion_de_brechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_de_aviso_de_brechas ENABLE ROW LEVEL SECURITY;

CREATE POLICY la_administracion_ve_los_incidentes_de_su_prestadora
  ON public.incidentes_de_seguridad FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY la_administracion_carga_incidentes_de_su_prestadora
  ON public.incidentes_de_seguridad FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND cargado_por = auth.uid()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY la_administracion_evalua_y_avisa_los_incidentes_propios
  ON public.incidentes_de_seguridad FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY la_administracion_ve_los_pacientes_alcanzados_de_su_prestadora
  ON public.pacientes_de_incidentes FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY la_administracion_agrega_pacientes_alcanzados_de_su_prestadora
  ON public.pacientes_de_incidentes FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND agregado_por = auth.uid()
              AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY la_administracion_lee_los_plazos_de_su_pais
  ON public.plazos_de_notificacion_de_brechas FOR SELECT TO authenticated
  USING ((interno.es_superadmin() OR interno.es_admin_prestadora())
         AND jurisdiccion = (SELECT p.pais FROM public.prestadoras p
                              WHERE p.id = interno.prestadora_actual()));

CREATE POLICY la_administracion_lee_las_plantillas_de_su_pais
  ON public.plantillas_de_aviso_de_brechas FOR SELECT TO authenticated
  USING ((interno.es_superadmin() OR interno.es_admin_prestadora())
         AND jurisdiccion = (SELECT p.pais FROM public.prestadoras p
                              WHERE p.id = interno.prestadora_actual()));

REVOKE ALL ON FUNCTION interno.el_incidente_de_seguridad_anota_sus_cambios() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION interno.el_incidente_de_seguridad_no_se_borra() FROM PUBLIC, anon;

-- --------------------------------------------------------------------------------------
-- 6. La cuenta regresiva
-- --------------------------------------------------------------------------------------

-- Para un incidente, un renglón por cada plazo del país de la Prestadora vigente a la fecha
-- en que ocurrió el incidente. `manda` marca el que vence primero entre los avisos que faltan
-- dar; si ya se dieron todos, el que venció primero.
--
-- Se saltea la RLS sólo para leer los plazos y llamar al calendario de días hábiles. Antes
-- comprueba lo mismo que las políticas: que quien pide sea la administración y que el
-- incidente sea de su Prestadora. Si no, no devuelve nada.
CREATE FUNCTION public.cuenta_regresiva_del_incidente(p_incidente uuid)
  RETURNS TABLE (
    destinatario  text,
    organismo     text,
    cantidad      integer,
    unidad        text,
    cuenta_desde  text,
    desde_at      timestamptz,
    vence_at      timestamptz,
    notificado_at timestamptz,
    vencido       boolean,
    manda         boolean,
    fuente        text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'interno'
AS $$
#variable_conflict use_column
DECLARE
  v_incidente public.incidentes_de_seguridad%ROWTYPE;
  v_pais      text;
BEGIN
  IF NOT (interno.es_superadmin() OR interno.es_admin_prestadora()) THEN
    RETURN;
  END IF;

  SELECT i.* INTO v_incidente
    FROM public.incidentes_de_seguridad i
   WHERE i.id = p_incidente
     AND i.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.pais INTO v_pais FROM public.prestadoras p WHERE p.id = v_incidente.prestadora_id;
  IF v_pais IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH plazos AS (
    SELECT pl.destinatario, pl.organismo, pl.cantidad, pl.unidad, pl.cuenta_desde, pl.fuente,
           CASE pl.cuenta_desde
             WHEN 'ocurrido' THEN v_incidente.ocurrido_at
             ELSE v_incidente.conocido_at
           END AS desde_at,
           CASE pl.destinatario
             WHEN 'autoridad' THEN v_incidente.autoridad_notificada_at
             WHEN 'titular' THEN v_incidente.titulares_notificados_at
             ELSE v_incidente.responsable_notificado_at
           END AS notificado_at
      FROM public.plazos_de_notificacion_de_brechas pl
     WHERE pl.jurisdiccion = v_pais
       AND pl.vigencia_desde <= v_incidente.ocurrido_at::date
       AND (pl.vigencia_hasta IS NULL OR pl.vigencia_hasta >= v_incidente.ocurrido_at::date)
  ),
  con_vencimiento AS (
    SELECT pz.*,
           CASE pz.unidad
             WHEN 'horas' THEN pz.desde_at + make_interval(hours => pz.cantidad)
             WHEN 'dias_corridos' THEN pz.desde_at + make_interval(days => pz.cantidad)
             ELSE interno.sumar_dias_habiles(v_pais, pz.desde_at, pz.cantidad)
           END AS vence_at
      FROM plazos pz
  ),
  el_que_manda AS (
    SELECT cv.destinatario
      FROM con_vencimiento cv
     ORDER BY (cv.notificado_at IS NOT NULL), cv.vence_at, cv.destinatario
     LIMIT 1
  )
  SELECT cv.destinatario, cv.organismo, cv.cantidad, cv.unidad, cv.cuenta_desde,
         cv.desde_at, cv.vence_at, cv.notificado_at,
         (cv.notificado_at IS NULL AND cv.vence_at < now()) AS vencido,
         (cv.destinatario = (SELECT m.destinatario FROM el_que_manda m)) AS manda,
         cv.fuente
    FROM con_vencimiento cv
   ORDER BY cv.vence_at, cv.destinatario;
END;
$$;

COMMENT ON FUNCTION public.cuenta_regresiva_del_incidente(uuid) IS
  'Para un incidente de seguridad, cada plazo legal de aviso del país de la Prestadora, cuándo vence y cuál manda. Sólo para la administración de la Prestadora dueña del incidente.';

REVOKE ALL ON FUNCTION public.cuenta_regresiva_del_incidente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cuenta_regresiva_del_incidente(uuid) TO authenticated;

-- --------------------------------------------------------------------------------------
-- 7. Las acciones nuevas del registro de actividad
-- --------------------------------------------------------------------------------------

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'alta_de_incidente_de_seguridad', 'modificacion_critica', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'alta_de_paciente_alcanzado_por_incidente', 'modificacion_critica', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'evaluacion_de_incidente_de_seguridad', 'modificacion_critica', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT 'notificacion_de_incidente_de_seguridad', 'modificacion_critica', COALESCE(max(orden), 0) + 1, false
  FROM public.catalogo_acciones_registradas
ON CONFLICT (accion) DO NOTHING;

NOTIFY pgrst, 'reload schema';
