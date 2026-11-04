-- El Apoderado deja de ser un dato de la Ficha de Persona y pasa a ser de cada Cliente.
--
-- Un poder vale para un caso: quien firma por un Cliente no firma por otro aunque sea la misma
-- persona, y sólo firma con el poder aprobado por la administración. Hay dos funciones, separadas:
-- firmar el consentimiento de quien paga y firmar la autorización de signos vitales. El nombre de
-- la función no se muestra nunca: en pantalla dice «Apoderado», sin apellido.
--
-- Se escribe sólo por funciones de esta migración, que usan por igual el Panel y la aplicación del
-- Cliente: la tabla y el depósito no reciben escrituras directas del Cliente.

-- ---------------------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------------------
CREATE TABLE public.apoderados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL,
  funcion text NOT NULL CHECK (funcion IN ('pagos', 'signos_vitales')),
  persona_id uuid NOT NULL,
  archivo_url text,
  estado text NOT NULL DEFAULT 'en_revision'
    CHECK (estado IN ('falta', 'en_revision', 'aprobado', 'observado')),
  motivo_observacion text,
  revisado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  revisado_at timestamptz,
  cargado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  quitado_en timestamptz,
  quitado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT apoderados_cliente_fkey FOREIGN KEY (cliente_id, prestadora_id)
    REFERENCES public.clientes(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT apoderados_persona_fkey FOREIGN KEY (persona_id, prestadora_id)
    REFERENCES public.personas(id, prestadora_id),
  CONSTRAINT apoderados_observado_con_motivo
    CHECK (estado <> 'observado' OR btrim(COALESCE(motivo_observacion, '')) <> ''),
  CONSTRAINT apoderados_sin_poder_solo_si_falta
    CHECK (estado = 'falta' OR archivo_url IS NOT NULL)
);

CREATE UNIQUE INDEX apoderados_uno_vigente_por_funcion
  ON public.apoderados (cliente_id, funcion) WHERE quitado_en IS NULL;
CREATE INDEX idx_apoderados_persona ON public.apoderados (persona_id);
CREATE INDEX idx_apoderados_prestadora ON public.apoderados (prestadora_id);

CREATE TRIGGER trg_auditoria_acceso
  AFTER INSERT OR DELETE OR UPDATE ON public.apoderados
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_de_acceso_mutacion();

ALTER TABLE public.apoderados ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.apoderados FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.apoderados TO authenticated, trabajo_sin_persona;

CREATE POLICY apoderados_los_lee_el_personal ON public.apoderados
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

CREATE POLICY apoderados_los_lee_el_trabajo ON public.apoderados
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- ---------------------------------------------------------------------------------------
-- El depósito de los poderes. La ruta es <prestadora>/<cliente>/<función>/<archivo>.
-- La copia de respaldo no necesita política propia: la suya alcanza a todo depósito.
-- ---------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('poderes', 'poderes', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png']);

CREATE POLICY poderes_los_sube_el_trabajo ON storage.objects
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text);

CREATE POLICY poderes_los_lee_el_trabajo ON storage.objects
  FOR SELECT TO trabajo_sin_persona
  USING (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text);

CREATE POLICY poderes_trabajo_borra_el_que_no_quedo ON storage.objects
  FOR DELETE TO trabajo_sin_persona
  USING (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
         AND NOT EXISTS (SELECT 1 FROM public.apoderados a WHERE a.archivo_url = name));

CREATE POLICY poderes_los_sube_quien_puede ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
              AND interno.tiene_permiso('registrar_consentimiento_pagador'));

CREATE POLICY poderes_los_lee_el_personal ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
         AND interno.es_personal_de_la_prestadora());

CREATE POLICY poderes_personal_borra_el_que_no_quedo ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'poderes' AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
         AND interno.tiene_permiso('registrar_consentimiento_pagador')
         AND NOT EXISTS (SELECT 1 FROM public.apoderados a WHERE a.archivo_url = name));

-- ---------------------------------------------------------------------------------------
-- El caso que ya existe: el Apoderado anotado en la Ficha de quien paga pasa a ese Cliente, a la
-- espera del poder.
-- ---------------------------------------------------------------------------------------
INSERT INTO public.apoderados (prestadora_id, cliente_id, funcion, persona_id, estado)
SELECT c.prestadora_id, c.id, 'pagos', p.apoderado_persona_id, 'falta'
  FROM public.clientes c
  JOIN public.personas p ON p.id = c.pagador_persona_id
 WHERE p.apoderado_persona_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------
-- Una Ficha puede quedar sin género: al Apoderado no se le pregunta. El Asistente lo sigue
-- exigiendo en la base, y los demás formularios en el Backend y en el Panel.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.identidad_validada(p_prestadora uuid, p_clase text, p_tipo text, p_numero text, p_pais text, p_dni text, p_genero text, OUT numero text, OUT pais text, OUT dni text, OUT genero text)
 RETURNS record LANGUAGE plpgsql SET search_path TO 'public', 'interno'
AS $function$
declare
  v_pais_prestadora text;
  v_tipo record;
begin
  if p_tipo is null or p_numero is null or btrim(p_numero) = '' then
    raise exception 'falta_el_documento';
  end if;
  select prestadoras.pais into v_pais_prestadora from public.prestadoras where id = p_prestadora;
  select lleva_pais, verifica_modulo_11, contiene_dni into v_tipo
    from public.catalogo_documentos_de_identidad c
   where c.pais = v_pais_prestadora and c.clase = p_clase and c.codigo = p_tipo and c.activo;
  if not found then raise exception 'documento_no_corresponde'; end if;
  if v_tipo.verifica_modulo_11 then
    numero := regexp_replace(p_numero, '[\s.\-]', '', 'g');
    if not interno.cumple_modulo_11(numero) then raise exception 'numero_no_valido'; end if;
  else
    numero := upper(btrim(p_numero));
  end if;
  if v_tipo.lleva_pais then
    if p_pais is null then raise exception 'falta_el_pais_del_documento'; end if;
    pais := p_pais;
  else pais := null; end if;
  if v_tipo.contiene_dni then
    dni := regexp_replace(coalesce(p_dni, ''), '[\s.\-]', '', 'g');
    if dni = '' then raise exception 'falta_el_dni'; end if;
    if dni !~ '^[0-9]{1,8}$' or ltrim(dni, '0') <> ltrim(substr(numero, 3, 8), '0') then
      raise exception 'dni_no_coincide';
    end if;
    dni := ltrim(dni, '0');
  else dni := null; end if;
  if p_clase = 'fisica' and p_genero is not null and btrim(p_genero) <> '' then
    if not exists (select 1 from public.catalogo_generos g where g.pais = v_pais_prestadora and g.codigo = p_genero and g.activo) then
      raise exception 'genero_no_corresponde';
    end if;
    genero := p_genero;
  else genero := null; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION interno.el_documento_del_asistente_es_valido()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'interno'
AS $function$
declare
  v record;
begin
  if new.genero is null or btrim(new.genero) = '' then
    raise exception 'falta_el_genero';
  end if;
  select * into v
    from interno.identidad_validada(new.prestadora_id, 'fisica', new.documento_tipo,
                                    new.documento_numero, new.documento_pais, new.dni, new.genero);
  new.documento_numero := v.numero;
  new.documento_pais := v.pais;
  new.dni := v.dni;
  new.genero := v.genero;
  return new;
end;
$function$;

-- La Ficha que nació sin género lo recibe cuando esa persona llega por un formulario que lo pide.
-- Es una sola columna, una sola vez, y sólo por el personal o por el trabajo de la Prestadora.
CREATE OR REPLACE FUNCTION public.completar_genero_de_la_ficha(p_persona uuid, p_genero text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  IF interno.prestadora_actual() IS NULL
     OR NOT (auth.jwt() ->> 'role' = 'trabajo_sin_persona' OR interno.es_personal_de_la_prestadora()) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE public.personas
     SET genero = p_genero
   WHERE id = p_persona
     AND prestadora_id = interno.prestadora_actual()
     AND genero IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.completar_genero_de_la_ficha(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_genero_de_la_ficha(uuid, text) TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------
-- Quién puede gestionarlo, una sola regla para las tres escrituras
-- ---------------------------------------------------------------------------------------
-- Desde la aplicación llega el trabajo de la Prestadora en nombre del titular de ese Cliente; desde
-- el Panel, una persona con permiso. Cualquier otro caso se rechaza. Devuelve quién lo hizo.
CREATE OR REPLACE FUNCTION interno.quien_gestiona_al_apoderado(p_cliente uuid, p_usuario uuid)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NOT NULL THEN
    IF auth.jwt() ->> 'role' = 'trabajo_sin_persona' THEN
      IF p_usuario IS NOT NULL AND EXISTS (
        SELECT 1 FROM clientes c
         WHERE c.id = p_cliente AND c.prestadora_id = v_prestadora AND c.usuario_id = p_usuario
      ) THEN
        RETURN p_usuario;
      END IF;
    ELSIF interno.es_personal_de_la_prestadora()
      AND interno.tiene_permiso('registrar_consentimiento_pagador')
      AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = p_cliente AND c.prestadora_id = v_prestadora) THEN
      RETURN auth.uid();
    END IF;
  END IF;
  RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION interno.quien_gestiona_al_apoderado(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Nombrar. Nombrar a otro reemplaza al que estaba: deja de firmar en el momento.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nombrar_apoderado(
  p_cliente uuid, p_funcion text, p_nombre text, p_apellido text, p_cuil text, p_archivo text,
  p_usuario uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid := interno.quien_gestiona_al_apoderado(p_cliente, p_usuario);
  v_prestadora uuid := interno.prestadora_actual();
  v_pais text;
  v_numero text;
  v_tipo text;
  v_persona uuid;
  v_id uuid;
BEGIN
  IF p_funcion IS NULL OR p_funcion NOT IN ('pagos', 'signos_vitales')
     OR btrim(COALESCE(p_nombre, '')) = '' OR btrim(COALESCE(p_apellido, '')) = ''
     OR btrim(COALESCE(p_cuil, '')) = '' OR btrim(COALESCE(p_archivo, '')) = '' THEN
    RAISE EXCEPTION 'faltan_datos' USING ERRCODE = '22023';
  END IF;

  v_numero := regexp_replace(p_cuil, '[\s.\-]', '', 'g');
  IF NOT interno.cumple_modulo_11(v_numero) THEN
    RAISE EXCEPTION 'numero_no_valido' USING ERRCODE = '22023';
  END IF;

  IF p_archivo NOT LIKE v_prestadora::text || '/' || p_cliente::text || '/' || p_funcion || '/%' THEN
    RAISE EXCEPTION 'archivo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT pais INTO v_pais FROM prestadoras WHERE id = v_prestadora;

  -- Si esa persona ya tiene Ficha se usa la misma, sin cambiarle nada.
  SELECT p.id INTO v_persona
    FROM personas p
   WHERE p.prestadora_id = v_prestadora
     AND p.clase = 'fisica'
     AND p.documento_numero = v_numero
     AND p.documento_tipo IN (
       SELECT c.codigo FROM catalogo_documentos_de_identidad c
        WHERE c.pais = v_pais AND c.clase = 'fisica' AND c.verifica_modulo_11 AND c.activo)
   LIMIT 1;

  IF v_persona IS NULL THEN
    SELECT c.codigo INTO v_tipo
      FROM catalogo_documentos_de_identidad c
     WHERE c.pais = v_pais AND c.clase = 'fisica' AND c.verifica_modulo_11 AND c.activo
     ORDER BY c.orden
     LIMIT 1;
    IF v_tipo IS NULL THEN
      RAISE EXCEPTION 'documento_no_corresponde' USING ERRCODE = '22023';
    END IF;

    INSERT INTO personas (prestadora_id, clase, nombre, apellido, documento_tipo, documento_numero, dni)
    VALUES (v_prestadora, 'fisica', btrim(p_nombre), btrim(p_apellido), v_tipo, v_numero,
            ltrim(substr(v_numero, 3, 8), '0'))
    RETURNING id INTO v_persona;
  END IF;

  UPDATE apoderados
     SET quitado_en = now(), quitado_por = v_quien
   WHERE cliente_id = p_cliente AND funcion = p_funcion AND quitado_en IS NULL;

  INSERT INTO apoderados (prestadora_id, cliente_id, funcion, persona_id, archivo_url, estado, cargado_por)
  VALUES (v_prestadora, p_cliente, p_funcion, v_persona, p_archivo, 'en_revision', v_quien)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.nombrar_apoderado(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nombrar_apoderado(uuid, text, text, text, text, text, uuid) TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------
-- Cargar o reemplazar el poder de quien ya está nombrado: vuelve a revisión y no firma hasta que se
-- apruebe de nuevo.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reemplazar_poder_del_apoderado(
  p_cliente uuid, p_funcion text, p_archivo text, p_usuario uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid := interno.quien_gestiona_al_apoderado(p_cliente, p_usuario);
  v_prestadora uuid := interno.prestadora_actual();
  v_id uuid;
BEGIN
  IF p_archivo IS NULL
     OR p_archivo NOT LIKE v_prestadora::text || '/' || p_cliente::text || '/' || p_funcion || '/%' THEN
    RAISE EXCEPTION 'archivo_invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE apoderados
     SET archivo_url = p_archivo, estado = 'en_revision', motivo_observacion = NULL,
         revisado_por = NULL, revisado_at = NULL, cargado_por = v_quien
   WHERE cliente_id = p_cliente AND funcion = p_funcion AND quitado_en IS NULL
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reemplazar_poder_del_apoderado(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_poder_del_apoderado(uuid, text, text, uuid) TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------
-- Quitar. Lo que ya firmó sigue vigente: la fila queda, con la fecha en que dejó de firmar.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quitar_apoderado(
  p_cliente uuid, p_funcion text, p_usuario uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_quien uuid := interno.quien_gestiona_al_apoderado(p_cliente, p_usuario);
BEGIN
  UPDATE apoderados
     SET quitado_en = now(), quitado_por = v_quien
   WHERE cliente_id = p_cliente AND funcion = p_funcion AND quitado_en IS NULL;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.quitar_apoderado(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quitar_apoderado(uuid, text, uuid) TO authenticated, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------
-- Revisar el poder: es de la administración. Devuelve falso si otra persona ya lo resolvió.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisar_apoderado(p_id uuid, p_aprobar boolean, p_motivo text DEFAULT NULL)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(p_aprobar, false) AND btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = '22023';
  END IF;

  UPDATE apoderados
     SET estado = CASE WHEN p_aprobar THEN 'aprobado' ELSE 'observado' END,
         motivo_observacion = CASE WHEN p_aprobar THEN NULL ELSE btrim(p_motivo) END,
         revisado_por = auth.uid(),
         revisado_at = now()
   WHERE id = p_id
     AND prestadora_id = v_prestadora
     AND quitado_en IS NULL
     AND estado = 'en_revision';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.revisar_apoderado(uuid, boolean, text) FROM PUBLIC, anon, trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION public.revisar_apoderado(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- Quién firma la autorización de signos vitales: el Apoderado con el poder aprobado, y si no hay,
-- quien contrató, salvo que sea una entidad.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.firmante_autorizacion_signos_vitales(p_paciente uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
           (SELECT a.persona_id FROM apoderados a
             WHERE a.cliente_id = c.id
               AND a.funcion = 'signos_vitales'
               AND a.quitado_en IS NULL
               AND a.estado = 'aprobado'),
           CASE WHEN pe.clase = 'juridica' THEN NULL ELSE pe.id END)
    FROM pacientes pa
    JOIN clientes c ON c.id = pa.cliente_id
    JOIN personas pe ON pe.id = c.contratante_persona_id
   WHERE pa.id = p_paciente;
$function$;

-- ---------------------------------------------------------------------------------------
-- Qué Fichas ve el Coordinador: el Apoderado de un Cliente suyo es una de ellas.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
  SELECT p_persona IS NOT NULL AND interno.es_coordinador() AND (
       EXISTS (SELECT 1 FROM clientes c
                WHERE (c.contratante_persona_id = p_persona OR c.pagador_persona_id = p_persona)
                  AND c.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(c.id))
    OR EXISTS (SELECT 1 FROM apoderados a
                WHERE a.persona_id = p_persona
                  AND a.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(a.cliente_id))
    OR EXISTS (SELECT 1 FROM consentimientos_pagador cp
                WHERE (cp.pagador_persona_id = p_persona OR cp.firmante_persona_id = p_persona)
                  AND cp.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_cliente(cp.cliente_id))
    OR EXISTS (SELECT 1 FROM personas_autorizadas pa
                WHERE pa.persona_id = p_persona
                  AND interno.coordinador_ve_al_cliente(pa.cliente_id))
    OR EXISTS (SELECT 1 FROM pacientes pac
                WHERE (pac.persona_id = p_persona OR pac.obra_social_persona_id = p_persona)
                  AND pac.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(pac.id))
    OR EXISTS (SELECT 1 FROM consentimientos_medicacion cm
                 JOIN indicaciones_medicacion im ON im.id = cm.indicacion_id
                WHERE cm.firmante_persona_id = p_persona
                  AND cm.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_al_paciente(im.paciente_id))
    OR EXISTS (SELECT 1 FROM excepciones_familiar_relevo e
                WHERE e.familiar_persona_id = p_persona
                  AND e.prestadora_id = interno.prestadora_actual()
                  AND interno.coordinador_ve_la_guardia(e.guardia_id))
  );
$function$;

CREATE OR REPLACE FUNCTION interno.coordinador_ve_a_la_persona(p_persona uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.la_persona_tiene_un_rol_que_el_coordinador_ve(p_persona);
$function$;

-- ---------------------------------------------------------------------------------------
-- Desde la aplicación, nombrar o quitar puede obligar a rehacer el consentimiento pendiente. Ese
-- trabajo corre con el trabajo de la Prestadora, y sólo en la suya.
-- ---------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.consentimientos_pagador TO trabajo_sin_persona;
CREATE POLICY consentimientos_pagador_los_rehace_el_trabajo ON public.consentimientos_pagador
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT ON public.textos_consentimiento_pagador TO trabajo_sin_persona;
CREATE POLICY textos_consentimiento_pagador_los_lee_el_trabajo ON public.textos_consentimiento_pagador
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

-- ---------------------------------------------------------------------------------------
-- La Ficha de Persona deja de guardarlo
-- ---------------------------------------------------------------------------------------
DROP TRIGGER el_apoderado_es_una_persona ON public.personas;
DROP FUNCTION interno.el_apoderado_es_una_persona();
ALTER TABLE public.personas DROP CONSTRAINT personas_solo_la_juridica_tiene_apoderado;
ALTER TABLE public.personas DROP CONSTRAINT personas_apoderado_fkey;
DROP INDEX public.idx_personas_por_apoderado;
ALTER TABLE public.personas DROP COLUMN apoderado_persona_id;

-- ---------------------------------------------------------------------------------------
-- Los textos. Salen de acá hacia las dos interfaces, y cada Prestadora puede cambiarlos.
-- ---------------------------------------------------------------------------------------
INSERT INTO public.mensajes_del_sistema (prestadora_id, clave, i18n)
VALUES
  (NULL, 'apoderado.titulo', '{"es-AR": "Apoderado", "en": "Authorised signatory", "pt-BR": "Procurador"}'),
  (NULL, 'apoderado.nombrar', '{"es-AR": "Nombrar apoderado", "en": "Appoint signatory", "pt-BR": "Nomear procurador"}'),
  (NULL, 'apoderado.quitar', '{"es-AR": "Quitar apoderado", "en": "Remove signatory", "pt-BR": "Remover procurador"}'),
  (NULL, 'apoderado.quitar_aviso', '{"es-AR": "{{nombre}} dejará de firmar para este Cliente. Lo que ya firmó sigue vigente.", "en": "{{nombre}} will stop signing for this Client. What has already been signed remains in force.", "pt-BR": "{{nombre}} deixará de assinar por este Cliente. O que já foi assinado continua em vigor."}'),
  (NULL, 'apoderado.quitar_confirmar', '{"es-AR": "Quitar", "en": "Remove", "pt-BR": "Remover"}'),
  (NULL, 'apoderado.poder', '{"es-AR": "Poder", "en": "Power of attorney", "pt-BR": "Procuração"}'),
  (NULL, 'apoderado.nombre', '{"es-AR": "Nombre", "en": "First name", "pt-BR": "Nome"}'),
  (NULL, 'apoderado.apellido', '{"es-AR": "Apellido", "en": "Last name", "pt-BR": "Sobrenome"}'),
  (NULL, 'apoderado.cuil', '{"es-AR": "CUIL", "en": "CUIL", "pt-BR": "CUIL"}'),
  (NULL, 'apoderado.cancelar', '{"es-AR": "Cancelar", "en": "Cancel", "pt-BR": "Cancelar"}'),
  (NULL, 'apoderado.guardar', '{"es-AR": "Guardar", "en": "Save", "pt-BR": "Salvar"}'),
  (NULL, 'apoderado.cargar', '{"es-AR": "Cargar", "en": "Upload", "pt-BR": "Enviar"}'),
  (NULL, 'apoderado.ver', '{"es-AR": "Ver", "en": "View", "pt-BR": "Ver"}'),
  (NULL, 'apoderado.reemplazar', '{"es-AR": "Reemplazar", "en": "Replace", "pt-BR": "Substituir"}'),
  (NULL, 'apoderado.aprobar', '{"es-AR": "Aprobar", "en": "Approve", "pt-BR": "Aprovar"}'),
  (NULL, 'apoderado.observar', '{"es-AR": "Observar", "en": "Return with notes", "pt-BR": "Observar"}'),
  (NULL, 'apoderado.motivo', '{"es-AR": "Motivo", "en": "Reason", "pt-BR": "Motivo"}'),
  (NULL, 'apoderado.campo_obligatorio', '{"es-AR": "Complete este dato.", "en": "Complete this field.", "pt-BR": "Preencha este dado."}'),
  (NULL, 'apoderado.estado_falta', '{"es-AR": "Falta cargar", "en": "Not uploaded", "pt-BR": "Falta enviar"}'),
  (NULL, 'apoderado.estado_en_revision', '{"es-AR": "En revisión", "en": "Under review", "pt-BR": "Em análise"}'),
  (NULL, 'apoderado.estado_aprobado', '{"es-AR": "Aprobado", "en": "Approved", "pt-BR": "Aprovado"}'),
  (NULL, 'apoderado.estado_observado', '{"es-AR": "Observado", "en": "Returned with notes", "pt-BR": "Com observação"}');

NOTIFY pgrst, 'reload schema';
