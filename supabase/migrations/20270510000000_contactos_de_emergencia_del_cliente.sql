-- Los contactos de emergencia del Cliente.
--
-- El Cliente designa a quién se llama si al Paciente le pasa algo. Puede ser cualquiera de las
-- personas del Cliente, una Persona autorizada u otra persona. Son hasta tres por Cliente, en orden
-- de prioridad. Si la persona todavía no está en Contactos, se la da de alta al escribirla, con
-- nombre, apellido y teléfono, en la misma operación que guarda la lista.
--
-- Quién los cambia:
--   - la administración de la Prestadora, y el superadministrador con esa Prestadora abierta;
--   - el Coordinador que ve al Cliente y tiene el permiso de editar los datos del Cliente;
--   - el titular del Cliente, desde su aplicación. La aplicación trabaja con el trabajo de la
--     Prestadora y le dice a la base en nombre de quién. Desde ahí sólo elige entre las personas
--     que ya tienen un lugar en ese Cliente; a cualquier otra la escribe como nueva.
--
-- La lista se reemplaza entera y de una sola vez, y el cambio queda en el registro de actividad.
-- El registro guarda sólo qué personas estaban y cuáles quedaron, nunca sus datos.
--
-- La persona sin documento. El tipo y el número de documento de una persona pasan a admitir vacío,
-- con una sola consecuencia: la persona sin documento sólo puede ser contacto de emergencia. Para
-- ocupar cualquier otro lugar —Contratante, Paciente, obra social o prepaga, Responsable de pagos,
-- Persona autorizada, Apoderado, firmante, familiar de relevo— primero se le completa el documento.
-- La base lo hace cumplir en cada tabla que cita a una persona con otro rol, y falla cerrado con el
-- motivo «la_persona_no_tiene_documento». Un documento cargado no se vuelve a vaciar, y cuando está
-- cargado se valida igual que siempre.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- La persona sin documento
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.personas
  ALTER COLUMN documento_tipo DROP NOT NULL,
  ALTER COLUMN documento_numero DROP NOT NULL;

-- El documento va entero o no va: el tipo sin número, o el número sin tipo, no se guarda.
ALTER TABLE public.personas
  ADD CONSTRAINT personas_el_documento_va_entero CHECK ((documento_tipo IS NULL) = (documento_numero IS NULL));

-- La validación de siempre cuando el documento viene. Sin documento, la persona se guarda sin
-- ninguno de sus datos derivados; sólo se sigue validando el género. Un documento que ya estaba
-- cargado no se vacía: devuelve «falta_el_documento», como antes.
CREATE OR REPLACE FUNCTION interno.el_documento_es_valido()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO public, interno
AS $$
declare
  v record;
  v_pais_prestadora text;
begin
  if new.documento_tipo is null and nullif(btrim(coalesce(new.documento_numero, '')), '') is null then
    if tg_op = 'UPDATE' and old.documento_numero is not null then
      raise exception 'falta_el_documento';
    end if;
    new.documento_tipo := null;
    new.documento_numero := null;
    new.documento_pais := null;
    new.dni := null;
    if new.clase = 'fisica' and new.genero is not null and btrim(new.genero) <> '' then
      select prestadoras.pais into v_pais_prestadora from public.prestadoras where id = new.prestadora_id;
      if not exists (select 1 from public.catalogo_generos g
                      where g.pais = v_pais_prestadora and g.codigo = new.genero and g.activo) then
        raise exception 'genero_no_corresponde';
      end if;
    else
      new.genero := null;
    end if;
    return new;
  end if;

  select * into v
    from interno.identidad_validada(new.prestadora_id, new.clase, new.documento_tipo,
                                    new.documento_numero, new.documento_pais, new.dni, new.genero);
  new.documento_numero := v.numero;
  new.documento_pais := v.pais;
  new.dni := v.dni;
  new.genero := v.genero;
  return new;
end;
$$;

-- Una persona sin documento no ocupa ningún lugar fuera de los contactos de emergencia. La columna
-- que cita a la persona llega por argumento; puede ser una sola persona o una lista de personas.
CREATE FUNCTION interno.la_persona_del_rol_tiene_documento()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_valor jsonb := to_jsonb(NEW) -> TG_ARGV[0];
BEGIN
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(
             CASE jsonb_typeof(v_valor)
               WHEN 'array' THEN v_valor
               WHEN 'string' THEN jsonb_build_array(v_valor)
               ELSE '[]'::jsonb
             END) AS x(persona)
      JOIN public.personas pe ON pe.id = x.persona::uuid
     WHERE pe.documento_numero IS NULL
  ) THEN
    RAISE EXCEPTION 'la_persona_no_tiene_documento' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_persona_del_rol_tiene_documento() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER la_persona_del_rol_tiene_documento_contratante
  BEFORE INSERT OR UPDATE OF contratante_persona_id ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('contratante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_paciente
  BEFORE INSERT OR UPDATE OF persona_id ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_obra_social
  BEFORE INSERT OR UPDATE OF obra_social_persona_id ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('obra_social_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_familiar
  BEFORE INSERT OR UPDATE OF familiar_persona_id ON public.excepciones_familiar_relevo
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('familiar_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_autorizada
  BEFORE INSERT OR UPDATE OF persona_id ON public.personas_autorizadas
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_pagador
  BEFORE INSERT OR UPDATE OF pagador_persona_id ON public.consentimientos_pagador
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('pagador_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_firmante
  BEFORE INSERT OR UPDATE OF firmante_persona_id ON public.consentimientos_pagador
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('firmante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_firmante
  BEFORE INSERT OR UPDATE OF firmante_persona_id ON public.consentimientos_medicacion
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('firmante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_firmante
  BEFORE INSERT OR UPDATE OF firmante_persona_id ON public.autorizaciones_monitoreo_paciente
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('firmante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_apoderado
  BEFORE INSERT OR UPDATE OF persona_id ON public.apoderados
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_contratante
  BEFORE INSERT OR UPDATE OF contratante_persona_id ON public.condiciones_comerciales_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('contratante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_titular
  BEFORE INSERT OR UPDATE OF persona_id ON public.solicitudes_de_derechos
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_pagador
  BEFORE INSERT OR UPDATE OF pagador_persona_id ON public.pagadores_del_servicio
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('pagador_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_contratante
  BEFORE INSERT OR UPDATE OF contratante_persona_id ON public.avisos_baja_servicio_con_deuda
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('contratante_persona_id');
CREATE TRIGGER la_persona_del_rol_tiene_documento_pagadores
  BEFORE INSERT OR UPDATE OF responsables_de_pagos_persona_ids ON public.avisos_baja_servicio_con_deuda
  FOR EACH ROW EXECUTE FUNCTION interno.la_persona_del_rol_tiene_documento('responsables_de_pagos_persona_ids');

-- ---------------------------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.contactos_emergencia_cliente (
  id            uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras (id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL,
  persona_id    uuid NOT NULL,
  prioridad     smallint NOT NULL,
  cargado_por   uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL,
  -- El Cliente y la persona son de la misma Prestadora que la fila: la base no deja otra cosa.
  CONSTRAINT contactos_emergencia_cliente_cliente_fkey
    FOREIGN KEY (cliente_id, prestadora_id) REFERENCES public.clientes (id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT contactos_emergencia_cliente_persona_fkey
    FOREIGN KEY (persona_id, prestadora_id) REFERENCES public.personas (id, prestadora_id) ON DELETE CASCADE,
  -- Prioridad de 1 a 3 y una sola persona por prioridad: nunca más de tres por Cliente.
  CONSTRAINT contactos_emergencia_cliente_prioridad_de_1_a_3 CHECK (prioridad BETWEEN 1 AND 3),
  CONSTRAINT contactos_emergencia_cliente_una_por_prioridad UNIQUE (cliente_id, prioridad),
  CONSTRAINT contactos_emergencia_cliente_una_vez_cada_persona UNIQUE (cliente_id, persona_id)
);

CREATE INDEX contactos_emergencia_cliente_prestadora_idx ON public.contactos_emergencia_cliente (prestadora_id);
CREATE INDEX contactos_emergencia_cliente_persona_idx ON public.contactos_emergencia_cliente (persona_id);

COMMENT ON TABLE public.contactos_emergencia_cliente IS
  'Las personas a las que se llama si al Paciente le pasa algo. Hasta tres por Cliente, en orden de prioridad.';
COMMENT ON COLUMN public.contactos_emergencia_cliente.prioridad IS
  'El orden en que se llama: 1 es el primero.';

ALTER TABLE public.contactos_emergencia_cliente ENABLE ROW LEVEL SECURITY;

-- Lee el personal de la Prestadora abierta. El Coordinador, sólo los de los Clientes que ve.
CREATE POLICY contactos_emergencia_los_lee_el_personal ON public.contactos_emergencia_cliente
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_personal_de_la_prestadora()
    AND (NOT interno.es_coordinador() OR interno.coordinador_ve_al_cliente(cliente_id))
  );

-- El trabajo de la Prestadora: la aplicación del Cliente y la del Asistente leen por acá.
CREATE POLICY contactos_emergencia_los_lee_el_trabajo ON public.contactos_emergencia_cliente
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- Nadie escribe directo en la tabla: se escribe sólo con la función de más abajo.
REVOKE ALL ON TABLE public.contactos_emergencia_cliente FROM PUBLIC, anon, authenticated, trabajo_sin_persona;
GRANT SELECT ON TABLE public.contactos_emergencia_cliente TO authenticated, trabajo_sin_persona;
GRANT ALL ON TABLE public.contactos_emergencia_cliente TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Quién los ve y quién los cambia
-- ---------------------------------------------------------------------------------------------

-- Si quien pide puede ver los contactos de emergencia de ese Cliente. Falla cerrado.
CREATE FUNCTION interno.puede_ver_los_contactos_de_emergencia(p_cliente uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT coalesce(
    interno.prestadora_actual() IS NOT NULL
    AND p_cliente IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clientes c
                 WHERE c.id = p_cliente AND c.prestadora_id = interno.prestadora_actual())
    AND (
      auth.jwt() ->> 'role' = 'trabajo_sin_persona'
      OR (interno.es_personal_de_la_prestadora()
          AND (NOT interno.es_coordinador() OR interno.coordinador_ve_al_cliente(p_cliente)))
    ),
    false);
$$;

REVOKE ALL ON FUNCTION interno.puede_ver_los_contactos_de_emergencia(uuid) FROM PUBLIC, anon, authenticated;

-- Quién cambia los contactos de emergencia, y en nombre de quién queda. Si no puede, no sigue.
--   - Desde la aplicación del Cliente (el trabajo de la Prestadora): sólo el titular del Cliente,
--     que llega en p_usuario.
--   - Desde el Panel: el personal de la Prestadora con permiso de editar los datos del Cliente;
--     el Coordinador, además, sólo si ve al Cliente.
CREATE FUNCTION interno.quien_cambia_los_contactos_de_emergencia(p_cliente uuid, p_usuario uuid)
  RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NOT NULL AND p_cliente IS NOT NULL THEN
    IF auth.jwt() ->> 'role' = 'trabajo_sin_persona' THEN
      IF p_usuario IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.clientes c
         WHERE c.id = p_cliente AND c.prestadora_id = v_prest AND c.usuario_id = p_usuario
      ) THEN
        RETURN p_usuario;
      END IF;
    ELSIF interno.es_personal_de_la_prestadora()
      AND interno.tiene_permiso('editar_datos_cliente')
      AND (NOT interno.es_coordinador() OR interno.coordinador_ve_al_cliente(p_cliente))
      AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p_cliente AND c.prestadora_id = v_prest) THEN
      RETURN auth.uid();
    END IF;
  END IF;
  RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION interno.quien_cambia_los_contactos_de_emergencia(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Las personas que ya tienen un lugar en el Cliente, con cuál: el Contratante, los Pacientes, los
-- Responsables de pagos que rigen hoy en alguno de sus Servicios, las Personas autorizadas y los
-- contactos de emergencia que ya estaban. Es la lista entre la que elige el titular desde su
-- aplicación. Un solo lugar para la lectura y para el control, para que digan lo mismo.
CREATE FUNCTION interno.personas_vinculadas_al_cliente(p_cliente uuid)
  RETURNS TABLE (
    persona_id uuid,
    es_contratante boolean,
    es_paciente boolean,
    es_responsable_de_pagos boolean,
    es_persona_autorizada boolean,
    es_contacto_de_emergencia boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH lugares AS (
    SELECT c.contratante_persona_id AS persona_id, 'contratante' AS lugar
      FROM public.clientes c WHERE c.id = p_cliente
    UNION ALL
    SELECT pa.persona_id, 'paciente'
      FROM public.pacientes pa WHERE pa.cliente_id = p_cliente AND pa.deleted_at IS NULL
    UNION ALL
    SELECT ps.pagador_persona_id, 'responsable_de_pagos'
      FROM public.pagadores_del_servicio ps
      JOIN public.servicios s ON s.id = ps.servicio_id
     WHERE s.cliente_id = p_cliente
       AND ps.vigente_desde <= current_date
       AND (ps.vigente_hasta IS NULL OR ps.vigente_hasta >= current_date)
    UNION ALL
    SELECT pz.persona_id, 'persona_autorizada'
      FROM public.personas_autorizadas pz WHERE pz.cliente_id = p_cliente
    UNION ALL
    SELECT ce.persona_id, 'contacto_de_emergencia'
      FROM public.contactos_emergencia_cliente ce WHERE ce.cliente_id = p_cliente
  )
  SELECT l.persona_id,
         bool_or(l.lugar = 'contratante'),
         bool_or(l.lugar = 'paciente'),
         bool_or(l.lugar = 'responsable_de_pagos'),
         bool_or(l.lugar = 'persona_autorizada'),
         bool_or(l.lugar = 'contacto_de_emergencia')
    FROM lugares l
   WHERE l.persona_id IS NOT NULL
   GROUP BY l.persona_id;
$$;

REVOKE ALL ON FUNCTION interno.personas_vinculadas_al_cliente(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Leer la lista
-- ---------------------------------------------------------------------------------------------

-- La lista en orden de prioridad, con el nombre, los teléfonos en uso y qué lugar ocupa cada
-- persona en el Cliente. Una sola lectura para el Panel, la aplicación del Cliente y la del
-- Asistente, para que las tres digan lo mismo.
CREATE FUNCTION public.contactos_de_emergencia_del_cliente(p_cliente uuid)
  RETURNS TABLE (
    prioridad smallint,
    persona_id uuid,
    nombre text,
    telefonos text[],
    es_contratante boolean,
    es_paciente boolean,
    es_responsable_de_pagos boolean,
    es_persona_autorizada boolean
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF NOT interno.puede_ver_los_contactos_de_emergencia(p_cliente) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ce.prioridad,
         ce.persona_id,
         pe.nombre_visible,
         coalesce((SELECT array_agg(t.telefono ORDER BY t.created_at)
                     FROM public.telefonos_de_la_persona t
                    WHERE t.persona_id = ce.persona_id
                      AND t.prestadora_id = ce.prestadora_id
                      AND t.fuera_de_uso_at IS NULL), ARRAY[]::text[]),
         coalesce(v.es_contratante, false),
         coalesce(v.es_paciente, false),
         coalesce(v.es_responsable_de_pagos, false),
         coalesce(v.es_persona_autorizada, false)
    FROM public.contactos_emergencia_cliente ce
    JOIN public.personas pe ON pe.id = ce.persona_id
    LEFT JOIN interno.personas_vinculadas_al_cliente(p_cliente) v ON v.persona_id = ce.persona_id
   WHERE ce.cliente_id = p_cliente
     AND ce.prestadora_id = interno.prestadora_actual()
   ORDER BY ce.prioridad;
END;
$$;

ALTER FUNCTION public.contactos_de_emergencia_del_cliente(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.contactos_de_emergencia_del_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contactos_de_emergencia_del_cliente(uuid) TO authenticated, trabajo_sin_persona, service_role;

-- Las personas del propio Cliente entre las que elige el titular desde su aplicación, con el lugar
-- que ocupa cada una. Cualquier otra la escribe como nueva.
CREATE FUNCTION public.personas_para_contacto_de_emergencia(p_cliente uuid)
  RETURNS TABLE (
    persona_id uuid,
    nombre text,
    es_contratante boolean,
    es_paciente boolean,
    es_responsable_de_pagos boolean,
    es_persona_autorizada boolean
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF NOT interno.puede_ver_los_contactos_de_emergencia(p_cliente) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.persona_id, pe.nombre_visible,
         v.es_contratante, v.es_paciente, v.es_responsable_de_pagos, v.es_persona_autorizada
    FROM interno.personas_vinculadas_al_cliente(p_cliente) v
    JOIN public.personas pe ON pe.id = v.persona_id AND pe.prestadora_id = interno.prestadora_actual()
   WHERE pe.clase = 'fisica'
   ORDER BY pe.nombre_visible;
END;
$$;

ALTER FUNCTION public.personas_para_contacto_de_emergencia(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.personas_para_contacto_de_emergencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_para_contacto_de_emergencia(uuid) TO authenticated, trabajo_sin_persona, service_role;

-- ---------------------------------------------------------------------------------------------
-- Cambiar la lista
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.catalogo_acciones_registradas (accion, grupo, orden, la_hace_el_sistema)
SELECT v.accion, 'modificacion_critica', (SELECT max(orden) FROM public.catalogo_acciones_registradas) + v.n, false
  FROM (VALUES ('cambio_de_contactos_de_emergencia', 1)) AS v(accion, n);

-- Qué personas estaban, cuáles quedaron en orden de prioridad, y cuáles se dieron de alta al
-- escribirlas.
INSERT INTO public.catalogo_datos_del_registro (clave, orden)
SELECT v.clave, (SELECT COALESCE(max(orden), 0) FROM public.catalogo_datos_del_registro) + v.n
  FROM (VALUES ('contactos_anteriores', 1), ('contactos_nuevos', 2), ('personas_dadas_de_alta', 3)) AS v(clave, n);

-- Reemplaza la lista entera. p_contactos es una lista en orden de prioridad: el primero es el que
-- se llama primero. Cada elemento es una persona de Contactos ({"persona_id": …}) o una persona
-- nueva ({"nombre": …, "apellido": …, "telefono": …}), que se da de alta sin documento, con ese
-- teléfono, en esta misma operación. Una lista vacía deja al Cliente sin contactos de emergencia.
-- p_usuario es el titular en nombre de quien trabaja la aplicación del Cliente; desde el Panel va
-- nulo. Desde la aplicación sólo se eligen personas que ya tienen un lugar en ese Cliente.
CREATE FUNCTION public.reemplazar_contactos_de_emergencia(p_cliente uuid, p_contactos jsonb, p_usuario uuid DEFAULT NULL)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_quien uuid := interno.quien_cambia_los_contactos_de_emergencia(p_cliente, p_usuario);
  v_prest uuid := interno.prestadora_actual();
  v_desde_la_aplicacion boolean := auth.jwt() ->> 'role' = 'trabajo_sin_persona';
  v_contactos jsonb := coalesce(p_contactos, '[]'::jsonb);
  v_contacto jsonb;
  v_persona uuid;
  v_nombre text;
  v_apellido text;
  v_telefono text;
  v_digitos int;
  v_personas uuid[] := ARRAY[]::uuid[];
  v_altas uuid[] := ARRAY[]::uuid[];
  v_anteriores uuid[];
BEGIN
  IF jsonb_typeof(v_contactos) <> 'array' THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(v_contactos) > 3 THEN
    RAISE EXCEPTION 'demasiados_contactos_de_emergencia' USING ERRCODE = 'P0001';
  END IF;

  -- Un cambio por vez en cada Cliente.
  PERFORM 1 FROM public.clientes c WHERE c.id = p_cliente AND c.prestadora_id = v_prest FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  FOR v_contacto IN SELECT x.valor FROM jsonb_array_elements(v_contactos) WITH ORDINALITY AS x(valor, orden) ORDER BY x.orden
  LOOP
    IF jsonb_typeof(v_contacto) <> 'object' THEN
      RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
    END IF;

    IF nullif(v_contacto ->> 'persona_id', '') IS NOT NULL THEN
      BEGIN
        v_persona := (v_contacto ->> 'persona_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
      END;
      IF NOT EXISTS (SELECT 1 FROM public.personas pe WHERE pe.id = v_persona AND pe.prestadora_id = v_prest)
         OR (v_desde_la_aplicacion
             AND NOT EXISTS (SELECT 1 FROM interno.personas_vinculadas_al_cliente(p_cliente) v
                              WHERE v.persona_id = v_persona)) THEN
        RAISE EXCEPTION 'contacto_de_emergencia_inexistente' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      v_nombre := nullif(btrim(coalesce(v_contacto ->> 'nombre', '')), '');
      v_apellido := nullif(btrim(coalesce(v_contacto ->> 'apellido', '')), '');
      v_telefono := nullif(btrim(coalesce(v_contacto ->> 'telefono', '')), '');
      IF v_nombre IS NULL OR v_apellido IS NULL OR v_telefono IS NULL THEN
        RAISE EXCEPTION 'faltan_datos' USING ERRCODE = 'P0001';
      END IF;
      v_digitos := length(regexp_replace(v_telefono, '[^0-9]', '', 'g'));
      IF v_digitos < 8 OR v_digitos > 15 THEN
        RAISE EXCEPTION 'telefono_invalido' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.personas (prestadora_id, clase, nombre, apellido)
      VALUES (v_prest, 'fisica', v_nombre, v_apellido)
      RETURNING id INTO v_persona;
      INSERT INTO public.telefonos_de_la_persona (prestadora_id, persona_id, telefono)
      VALUES (v_prest, v_persona, v_telefono);
      v_altas := v_altas || v_persona;
    END IF;

    IF v_persona = ANY (v_personas) THEN
      RAISE EXCEPTION 'contacto_de_emergencia_repetido' USING ERRCODE = 'P0001';
    END IF;
    v_personas := v_personas || v_persona;
  END LOOP;

  SELECT coalesce(array_agg(ce.persona_id ORDER BY ce.prioridad), ARRAY[]::uuid[]) INTO v_anteriores
    FROM public.contactos_emergencia_cliente ce
   WHERE ce.cliente_id = p_cliente AND ce.prestadora_id = v_prest;

  IF v_anteriores = v_personas THEN
    RETURN;
  END IF;

  DELETE FROM public.contactos_emergencia_cliente ce
   WHERE ce.cliente_id = p_cliente AND ce.prestadora_id = v_prest;

  INSERT INTO public.contactos_emergencia_cliente (prestadora_id, cliente_id, persona_id, prioridad, cargado_por)
  SELECT v_prest, p_cliente, x.persona, x.orden, v_quien
    FROM unnest(v_personas) WITH ORDINALITY AS x(persona, orden);

  INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_prest, v_quien, 'cambio_de_contactos_de_emergencia', 'contactos_emergencia_cliente', p_cliente,
          jsonb_build_object('contactos_anteriores', to_jsonb(v_anteriores),
                             'contactos_nuevos', to_jsonb(v_personas),
                             'personas_dadas_de_alta', to_jsonb(v_altas)));
END;
$$;

ALTER FUNCTION public.reemplazar_contactos_de_emergencia(uuid, jsonb, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reemplazar_contactos_de_emergencia(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_contactos_de_emergencia(uuid, jsonb, uuid) TO authenticated, trabajo_sin_persona, service_role;

-- ---------------------------------------------------------------------------------------------
-- Los textos
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('contactos_de_emergencia.titulo', '{"es-AR": "Contactos de emergencia", "en": "Emergency contacts", "pt-BR": "Contatos de emergência"}'::jsonb, true, true),
  ('contactos_de_emergencia.contratante', '{"es-AR": "Contratante", "en": "Contracting party", "pt-BR": "Contratante"}'::jsonb, true, true),
  ('contactos_de_emergencia.paciente', '{"es-AR": "Paciente", "en": "Patient", "pt-BR": "Paciente"}'::jsonb, true, true),
  ('contactos_de_emergencia.responsable_de_pagos', '{"es-AR": "Responsable de pagos", "en": "Payment responsible", "pt-BR": "Responsável pelos pagamentos"}'::jsonb, true, true),
  ('contactos_de_emergencia.persona_autorizada', '{"es-AR": "Persona autorizada", "en": "Authorized person", "pt-BR": "Pessoa autorizada"}'::jsonb, true, true),
  ('contactos_de_emergencia.error.demasiados', '{"es-AR": "La lista ya tiene el máximo de contactos de emergencia. Quite uno antes de agregar otro.", "en": "The list already has the maximum number of emergency contacts. Remove one before adding another.", "pt-BR": "A lista já tem o máximo de contatos de emergência. Remova um antes de adicionar outro."}'::jsonb, true, true),
  ('contactos_de_emergencia.error.repetido', '{"es-AR": "Esa persona ya está en la lista de contactos de emergencia. Elija otra persona.", "en": "That person is already on the emergency contact list. Choose another person.", "pt-BR": "Essa pessoa já está na lista de contatos de emergência. Escolha outra pessoa."}'::jsonb, true, true),
  ('contactos_de_emergencia.error.inexistente', '{"es-AR": "La persona elegida no está disponible. Elija otra persona.", "en": "The selected person is not available. Choose another person.", "pt-BR": "A pessoa escolhida não está disponível. Escolha outra pessoa."}'::jsonb, true, true),
  ('contactos_de_emergencia.error.faltan_datos', '{"es-AR": "Faltan datos del contacto de emergencia. Ingrese el nombre, el apellido y el teléfono.", "en": "Emergency contact details are missing. Enter the first name, last name and phone number.", "pt-BR": "Faltam dados do contato de emergência. Informe o nome, o sobrenome e o telefone."}'::jsonb, true, true),
  ('contactos_de_emergencia.error.telefono_invalido', '{"es-AR": "El teléfono del contacto de emergencia no es válido. Revise el número.", "en": "The emergency contact phone number is not valid. Check the number.", "pt-BR": "O telefone do contato de emergência não é válido. Verifique o número."}'::jsonb, true, true),
  ('personas.error.la_persona_no_tiene_documento', '{"es-AR": "Esta persona no tiene documento cargado. Complete el documento en Contactos y vuelva a intentarlo.", "en": "This person has no identity document on file. Complete the document in Contacts and try again.", "pt-BR": "Esta pessoa não tem documento cadastrado. Complete o documento em Contatos e tente novamente."}'::jsonb, true, true);

COMMIT;

NOTIFY pgrst, 'reload schema';
