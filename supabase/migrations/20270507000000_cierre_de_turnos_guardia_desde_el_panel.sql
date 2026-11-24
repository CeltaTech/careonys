-- Las formas de cerrar un turno de guardia pasan todas por un solo lugar.
--
-- Un turno de guardia se cierra de cinco maneras: el relevo lee el código QR del Asistente que
-- sale; el Asistente que sale lee el código QR del Cliente o de otro Asistente; el Coordinador
-- autoriza la salida o la llegada desde el Panel; alguien del Panel lo cierra a mano, con un
-- motivo de la lista y la hora de salida; o el Coordinador da el permiso para que el Paciente
-- quede solo. Ninguna de las cinco espera el Reporte: si al cerrar hay un Reporte pendiente, el
-- turno queda en «Salida sin Reporte», con la misma marca y la misma elección de la Prestadora
-- sobre la factura que ya usaba el relevo.
--
-- El único camino es `interno.cerrar_el_turno_guardia`. Las personas lo usan por
-- `public.cerrar_turno_guardia` y `public.permitir_que_el_paciente_quede_solo`, y el backend, con
-- el trabajo de la Prestadora, por la primera. Escribir el cierre directo en la tabla deja de
-- andar para cualquier persona con sesión, sea Asistente o personal del Panel.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- La lista de motivos con los que se cierra un turno de guardia desde el Panel.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.motivos_cierre_turno_guardia (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  prestadora_id uuid NOT NULL,
  clave text,
  nombre text,
  pide_detalle boolean DEFAULT false NOT NULL,
  lo_escribe_el_sistema boolean DEFAULT false NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  orden integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT motivos_cierre_turno_guardia_pkey PRIMARY KEY (id),
  CONSTRAINT motivos_cierre_turno_guardia_prestadora_id_fkey FOREIGN KEY (prestadora_id)
    REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  CONSTRAINT motivos_cierre_turno_guardia_los_del_sistema_no_se_apagan
    CHECK ((NOT lo_escribe_el_sistema) OR activo),
  CONSTRAINT motivos_cierre_turno_guardia_del_sistema_son_del_producto
    CHECK ((NOT lo_escribe_el_sistema) OR (clave IS NOT NULL)),
  CONSTRAINT motivos_cierre_turno_guardia_nombre_segun_nivel
    CHECK (((clave IS NOT NULL) AND (nombre IS NULL)) OR ((clave IS NULL) AND (nombre IS NOT NULL)))
);

ALTER TABLE public.motivos_cierre_turno_guardia OWNER TO postgres;

COMMENT ON TABLE public.motivos_cierre_turno_guardia IS 'Por qué se cerró un turno de guardia desde el Panel. Cada Prestadora arma su lista: nace con los que trae el producto y a partir de ahí agrega y saca los que quiera.';
COMMENT ON COLUMN public.motivos_cierre_turno_guardia.clave IS 'Motivo que trajo el producto. El texto visible sale de las traducciones, buscándolo por esta clave.';
COMMENT ON COLUMN public.motivos_cierre_turno_guardia.nombre IS 'Motivo que escribió la Prestadora. Se muestra tal cual, sin traducir.';
COMMENT ON COLUMN public.motivos_cierre_turno_guardia.pide_detalle IS 'Cerrar con este motivo obliga a escribir qué pasó.';
COMMENT ON COLUMN public.motivos_cierre_turno_guardia.lo_escribe_el_sistema IS 'El motivo no se elige: lo escribe la base cuando el cierre sale de otra operación, como el permiso para que el Paciente quede solo. No se ofrece para elegir y no se puede apagar.';

CREATE UNIQUE INDEX motivos_cierre_turno_guardia_clave_unica
  ON public.motivos_cierre_turno_guardia USING btree (prestadora_id, clave) WHERE (clave IS NOT NULL);
CREATE UNIQUE INDEX motivos_cierre_turno_guardia_nombre_unico
  ON public.motivos_cierre_turno_guardia USING btree (prestadora_id, lower(nombre)) WHERE (nombre IS NOT NULL);
CREATE INDEX motivos_cierre_turno_guardia_activos
  ON public.motivos_cierre_turno_guardia USING btree (prestadora_id, orden) WHERE activo;

ALTER TABLE public.motivos_cierre_turno_guardia ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_prestadora_gestiona_motivos_cierre_turno_guardia
  ON public.motivos_cierre_turno_guardia TO authenticated
  USING ((prestadora_id = interno.prestadora_actual())
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()))
  WITH CHECK ((prestadora_id = interno.prestadora_actual())
         AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY coordinador_lee_motivos_cierre_turno_guardia
  ON public.motivos_cierre_turno_guardia FOR SELECT TO authenticated
  USING ((prestadora_id = interno.prestadora_actual()) AND interno.es_coordinador());

CREATE POLICY trabajo_sin_persona_lee_motivos_cierre_turno_guardia
  ON public.motivos_cierre_turno_guardia FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.motivos_cierre_turno_guardia FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.motivos_cierre_turno_guardia TO authenticated;
GRANT ALL ON TABLE public.motivos_cierre_turno_guardia TO service_role;
GRANT SELECT ON TABLE public.motivos_cierre_turno_guardia TO trabajo_sin_persona;

-- Los motivos con los que arranca cada Prestadora que ya existe.
INSERT INTO public.motivos_cierre_turno_guardia
  (prestadora_id, clave, pide_detalle, lo_escribe_el_sistema, orden)
SELECT p.id, m.clave, m.pide_detalle, m.lo_escribe_el_sistema, m.orden
  FROM public.prestadoras p
 CROSS JOIN (VALUES
   ('fallo_el_telefono_del_asistente',  false, false, 10),
   ('fallo_la_ubicacion_del_asistente', false, false, 20),
   ('lo_cubrio_el_coordinador',         false, false, 30),
   ('se_olvido_de_marcar_la_salida',    false, false, 40),
   ('paciente_solo_con_permiso',        false, true,  50),
   ('otro',                             true,  false, 99)
 ) AS m (clave, pide_detalle, lo_escribe_el_sistema, orden)
ON CONFLICT DO NOTHING;

-- Y los de cada Prestadora nueva, en el mismo lugar donde nace el resto de su configuración.
CREATE OR REPLACE FUNCTION public.sembrar_configuracion_prestadora(p_prestadora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tabla TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'sembrar_configuracion_prestadora: esa Prestadora no es la de quien llama';
  END IF;

  -- La fila de los datos de contacto, que ya no lleva el nombre: el de la Prestadora vive en
  -- `prestadoras.nombre_fantasia`, y uno solo.
  INSERT INTO configuracion_prestadora (prestadora_id)
  VALUES (p_prestadora_id)
  ON CONFLICT (prestadora_id) DO NOTHING;

  FOR v_tabla IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_constraint pk ON pk.conrelid = c.oid AND pk.contype = 'p'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = pk.conkey[1]
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'configuracion\_%'
      AND c.relname <> 'configuracion_prestadora'
      AND array_length(pk.conkey, 1) = 1
      AND a.attname = 'prestadora_id'
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (prestadora_id) VALUES ($1) ON CONFLICT DO NOTHING',
        v_tabla
      ) USING p_prestadora_id;
    EXCEPTION WHEN not_null_violation THEN
      RAISE EXCEPTION
        'No se puede sembrar la configuración de la Prestadora: la tabla % tiene una columna obligatoria sin valor de arranque. Póngale un DEFAULT a esa columna, o sáquele la forma de una fila por Prestadora.',
        v_tabla;
    END;
  END LOOP;

  -- Los motivos de cierre con los que arranca. De acá en adelante la lista es de ella: los
  -- puede sacar, apagar, y agregar los suyos.
  INSERT INTO motivos_cierre_servicio (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'fin_demanda',           false, 10),
    (p_prestadora_id, 'fallecimiento',         false, 20),
    (p_prestadora_id, 'internacion',           false, 30),
    (p_prestadora_id, 'baja_del_cliente',    false, 40),
    (p_prestadora_id, 'corte_de_pago',         false, 50),
    (p_prestadora_id, 'mudanza_fuera_de_zona', false, 60),
    (p_prestadora_id, 'otro',                  true,  99)
  ON CONFLICT DO NOTHING;

  -- Y las causas de sustitución, con el mismo criterio.
  INSERT INTO motivos_sustitucion_turno_guardia (prestadora_id, clave, pide_detalle, orden)
  VALUES
    (p_prestadora_id, 'emergencia', false, 10),
    (p_prestadora_id, 'otro',       true,  99)
  ON CONFLICT DO NOTHING;

  -- Y cómo puede terminar un turno que quedó sin nadie. Los dos primeros los escribe el motor
  -- cuando la base ya lo dice; los demás los elige quien coordina.
  INSERT INTO finales_turno_guardia_sin_cubrir
    (prestadora_id, clave, es_defecto_grave, pide_detalle, lo_escribe_el_sistema, orden)
  VALUES
    (p_prestadora_id, 'llego_un_relevo',               false, false, true,  10),
    (p_prestadora_id, 'ya_no_hacia_falta',             false, false, true,  20),
    (p_prestadora_id, 'lo_cubrio_la_coordinadora',     false, false, false, 30),
    (p_prestadora_id, 'se_extendio_el_turno_guardia',          false, false, false, 40),
    (p_prestadora_id, 'quedo_solo_con_consentimiento', true,  false, false, 50),
    (p_prestadora_id, 'no_fue_nadie',                  true,  false, false, 60),
    (p_prestadora_id, 'se_resolvio_de_otra_manera',    false, true,  false, 99)
  ON CONFLICT DO NOTHING;

  -- Y por qué se cierra un turno de guardia desde el Panel. El del Paciente solo lo escribe la
  -- base cuando se da ese permiso; los demás los elige quien cierra.
  INSERT INTO motivos_cierre_turno_guardia
    (prestadora_id, clave, pide_detalle, lo_escribe_el_sistema, orden)
  VALUES
    (p_prestadora_id, 'fallo_el_telefono_del_asistente',  false, false, 10),
    (p_prestadora_id, 'fallo_la_ubicacion_del_asistente', false, false, 20),
    (p_prestadora_id, 'lo_cubrio_el_coordinador',         false, false, 30),
    (p_prestadora_id, 'se_olvido_de_marcar_la_salida',    false, false, 40),
    (p_prestadora_id, 'paciente_solo_con_permiso',        false, true,  50),
    (p_prestadora_id, 'otro',                             true,  false, 99)
  ON CONFLICT DO NOTHING;

  -- Y los motivos con los que se resuelve una postulación o una Guardia. La lista la arma
  -- `sembrar_motivos_resolucion`, que sigue siendo el punto único: acá se la llama, no se la copia.
  PERFORM sembrar_motivos_resolucion(p_prestadora_id);
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- El turno de guardia guarda cuál motivo de la lista se eligió.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.turnos_guardia
  ADD COLUMN IF NOT EXISTS cerrada_motivo_id uuid;

ALTER TABLE public.turnos_guardia
  ADD CONSTRAINT turnos_guardia_cerrada_motivo_id_fkey FOREIGN KEY (cerrada_motivo_id)
  REFERENCES public.motivos_cierre_turno_guardia(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.turnos_guardia.cerrada_motivo_id IS 'El motivo de la lista con el que se cerró desde el Panel. El texto que quedó escrito en ese momento está en cerrada_motivo.';

-- ---------------------------------------------------------------------------------------------
-- Lo que el cierre necesita saber sin depender de qué filas ve quien cierra.
-- ---------------------------------------------------------------------------------------------

-- Si a algún Paciente del turno de guardia le queda el Reporte pendiente. Quien decide al cerrar es
-- el backend; la base lo usa para no aceptar un cierre que diga lo contrario.
CREATE OR REPLACE FUNCTION interno.el_reporte_esta_atrasado(p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM turno_guardia_pacientes tp
     WHERE tp.turno_guardia_id = p_turno_guardia
       AND tp.prestadora_id = interno.prestadora_actual()
       AND NOT EXISTS (
         SELECT 1 FROM reportes r
          WHERE r.prestadora_id = tp.prestadora_id
            AND r.turno_guardia_id = p_turno_guardia
            AND r.paciente_id = tp.paciente_id
       )
  );
$$;

ALTER FUNCTION interno.el_reporte_esta_atrasado(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_reporte_esta_atrasado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_reporte_esta_atrasado(uuid) TO authenticated, trabajo_sin_persona, service_role;

-- Si la Prestadora de la sesión factura los turnos de guardia con el Reporte pendiente. Mientras
-- ella no elija otra cosa, se factura.
CREATE OR REPLACE FUNCTION interno.factura_los_turnos_sin_reporte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $$
  SELECT COALESCE(
    (SELECT p.factura_turnos_sin_reporte FROM prestadoras p WHERE p.id = interno.prestadora_actual()),
    true
  );
$$;

ALTER FUNCTION interno.factura_los_turnos_sin_reporte() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.factura_los_turnos_sin_reporte() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.factura_los_turnos_sin_reporte() TO authenticated, trabajo_sin_persona, service_role;

-- Si una cuenta es del Panel de la Prestadora de la sesión. El backend, con el trabajo de la
-- Prestadora, cierra en nombre de quien autorizó, y esa persona tiene que ser de esta Prestadora.
CREATE OR REPLACE FUNCTION interno.es_del_panel_de_la_prestadora(p_usuario uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $$
  SELECT p_usuario IS NOT NULL AND EXISTS (
    SELECT 1 FROM usuarios u
     WHERE u.id = p_usuario
       AND (u.rol = 'superadmin'
            OR (u.rol IN ('admin_prestadora', 'coordinador')
                AND u.prestadora_id = interno.prestadora_actual()))
  );
$$;

ALTER FUNCTION interno.es_del_panel_de_la_prestadora(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.es_del_panel_de_la_prestadora(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.es_del_panel_de_la_prestadora(uuid) TO authenticated, trabajo_sin_persona, service_role;

-- Si quien inició sesión coordina el Servicio de este turno de guardia.
CREATE OR REPLACE FUNCTION interno.coordina_el_servicio_del_turno_guardia(p_turno_guardia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM turnos_guardia g
     WHERE g.id = p_turno_guardia
       AND g.prestadora_id = interno.prestadora_actual()
       AND interno.coordina_el_servicio(g.servicio_id)
  );
$$;

ALTER FUNCTION interno.coordina_el_servicio_del_turno_guardia(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.coordina_el_servicio_del_turno_guardia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.coordina_el_servicio_del_turno_guardia(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- El único camino del cierre.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.cerrar_el_turno_guardia(
  p_turno_guardia uuid,
  p_hora timestamp with time zone,
  p_reporte_atrasado boolean,
  p_motivo uuid,
  p_detalle text,
  p_cerrada_por uuid,
  p_lat double precision,
  p_lng double precision,
  p_motivo_del_sistema boolean
)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_persona boolean := current_user = 'authenticated';
  v_quien uuid;
  v_turno turnos_guardia%ROWTYPE;
  v_motivo motivos_cierre_turno_guardia%ROWTYPE;
  v_detalle text := NULLIF(btrim(COALESCE(p_detalle, '')), '');
  v_texto text;
  v_hora timestamp with time zone;
  v_atrasado boolean := COALESCE(p_reporte_atrasado, false);
  v_estado text;
BEGIN
  IF v_prestadora IS NULL THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Quién cierra. Una persona con sesión cierra desde el Panel, siempre con motivo, y queda
  -- anotada ella. El backend, con el trabajo de la Prestadora, cierra lo que hizo el Asistente
  -- —sin motivo— o lo que autorizó alguien del Panel, en nombre de esa persona.
  IF v_persona THEN
    v_quien := interno.usuario_de_la_sesion();
    IF v_quien IS NULL
       OR NOT interno.es_personal_de_la_prestadora()
       OR NOT (interno.es_superadmin()
               OR interno.es_admin_prestadora()
               OR interno.coordinador_ve_el_turno_guardia(p_turno_guardia)) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF p_motivo IS NULL THEN
      RAISE EXCEPTION 'falta_el_motivo' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_motivo IS NOT NULL THEN
    IF NOT interno.es_del_panel_de_la_prestadora(p_cerrada_por) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    v_quien := p_cerrada_por;
  END IF;

  SELECT * INTO v_turno
    FROM turnos_guardia
   WHERE id = p_turno_guardia
     AND prestadora_id = v_prestadora
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_encontrado' USING ERRCODE = 'P0001';
  END IF;
  IF v_turno.estado IS DISTINCT FROM 'activa' OR v_turno.checkout_at IS NOT NULL THEN
    RAISE EXCEPTION 'turno_guardia_ya_cerrado' USING ERRCODE = 'P0001';
  END IF;

  IF p_motivo IS NOT NULL THEN
    SELECT * INTO v_motivo
      FROM motivos_cierre_turno_guardia
     WHERE id = p_motivo
       AND prestadora_id = v_prestadora
       AND activo;
    IF NOT FOUND
       OR (v_motivo.lo_escribe_el_sistema AND NOT COALESCE(p_motivo_del_sistema, false)) THEN
      RAISE EXCEPTION 'motivo_de_salida_inexistente' USING ERRCODE = 'P0001';
    END IF;
    IF v_motivo.pide_detalle AND v_detalle IS NULL THEN
      RAISE EXCEPTION 'motivo_de_salida_pide_detalle' USING ERRCODE = 'P0001';
    END IF;
    v_texto := COALESCE(v_motivo.nombre, v_motivo.clave)
               || CASE WHEN v_detalle IS NULL THEN '' ELSE ' — ' || v_detalle END;
  END IF;

  -- La hora de salida: obligatoria, no en el futuro y no antes de la llegada. Un minuto de
  -- tolerancia en cada punta, porque el Panel la elige sin segundos.
  IF p_hora IS NULL THEN
    RAISE EXCEPTION 'hora_de_salida_obligatoria' USING ERRCODE = 'P0001';
  END IF;
  IF p_hora > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'hora_de_salida_futura' USING ERRCODE = 'P0001';
  END IF;
  v_hora := LEAST(p_hora, now());
  IF v_turno.checkin_at IS NOT NULL AND v_hora < v_turno.checkin_at THEN
    IF v_hora >= date_trunc('minute', v_turno.checkin_at) THEN
      v_hora := v_turno.checkin_at;
    ELSE
      RAISE EXCEPTION 'hora_de_salida_anterior_a_la_llegada' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- El Reporte pendiente lo decide el backend. Lo que la base no acepta es un cierre que diga que
  -- están todos cuando a algún Paciente todavía le queda el suyo.
  IF NOT v_atrasado AND interno.el_reporte_esta_atrasado(p_turno_guardia) THEN
    RAISE EXCEPTION 'reporte_no_coincide' USING ERRCODE = 'P0001';
  END IF;

  v_estado := CASE WHEN v_atrasado THEN 'salida_sin_reporte' ELSE 'completada' END;

  PERFORM set_config('careonys.cierre_por_la_funcion', 'si', true);

  UPDATE turnos_guardia SET
    checkout_at  = v_hora,
    checkout_lat = CASE WHEN v_persona THEN NULL ELSE p_lat END,
    checkout_lng = CASE WHEN v_persona THEN NULL ELSE p_lng END,
    estado       = v_estado,
    salio_sin_reporte = salio_sin_reporte OR v_atrasado,
    factura_espera_el_reporte = CASE WHEN v_atrasado
                                     THEN NOT interno.factura_los_turnos_sin_reporte()
                                     ELSE factura_espera_el_reporte END,
    push_reporte_pendiente_enviado_at = CASE WHEN v_atrasado
                                             THEN now()
                                             ELSE push_reporte_pendiente_enviado_at END,
    cerrada_at        = CASE WHEN p_motivo IS NULL THEN cerrada_at ELSE now() END,
    cerrada_origen    = CASE WHEN p_motivo IS NULL THEN cerrada_origen ELSE 'panel' END,
    cerrada_por       = CASE WHEN p_motivo IS NULL THEN cerrada_por ELSE v_quien END,
    cerrada_motivo    = CASE WHEN p_motivo IS NULL THEN cerrada_motivo ELSE v_texto END,
    cerrada_motivo_id = CASE WHEN p_motivo IS NULL THEN cerrada_motivo_id ELSE p_motivo END
  WHERE id = p_turno_guardia
    AND prestadora_id = v_prestadora;

  PERFORM set_config('careonys.cierre_por_la_funcion', '', true);

  RETURN v_estado;
END;
$$;

ALTER FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) TO authenticated, trabajo_sin_persona, service_role;

COMMENT ON FUNCTION interno.cerrar_el_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision, boolean) IS 'Único camino por el que un turno de guardia empezado se cierra: valida quién cierra, el motivo y la hora, y lo deja completado o en Salida sin Reporte con la elección de la Prestadora sobre la factura.';

-- La puerta pública del cierre. No acepta los motivos que escribe el sistema.
CREATE OR REPLACE FUNCTION public.cerrar_turno_guardia(
  p_turno_guardia uuid,
  p_hora timestamp with time zone,
  p_reporte_atrasado boolean,
  p_motivo uuid DEFAULT NULL,
  p_detalle text DEFAULT NULL,
  p_cerrada_por uuid DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
 RETURNS text
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public', 'interno'
AS $$
  SELECT interno.cerrar_el_turno_guardia(
    p_turno_guardia, p_hora, p_reporte_atrasado, p_motivo, p_detalle, p_cerrada_por, p_lat, p_lng, false
  );
$$;

ALTER FUNCTION public.cerrar_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cerrar_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision) TO authenticated, trabajo_sin_persona, service_role;

COMMENT ON FUNCTION public.cerrar_turno_guardia(uuid, timestamp with time zone, boolean, uuid, text, uuid, double precision, double precision) IS 'Cierra un turno de guardia empezado. Resuelve la Prestadora adentro, corre con los permisos de quien llama y devuelve el estado en que quedó.';

-- ---------------------------------------------------------------------------------------------
-- Nadie con sesión escribe el cierre directo en la tabla.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.el_cierre_pasa_por_la_funcion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF current_user <> 'authenticated'
     OR COALESCE(current_setting('careonys.cierre_por_la_funcion', true), '') = 'si' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.checkout_at IS NOT NULL OR NEW.checkout_lat IS NOT NULL OR NEW.checkout_lng IS NOT NULL
       OR NEW.estado IN ('completada', 'salida_sin_reporte')
       OR NEW.cerrada_at IS NOT NULL OR NEW.cerrada_origen IS NOT NULL
       OR NEW.cerrada_por IS NOT NULL OR NEW.cerrada_motivo IS NOT NULL
       OR NEW.cerrada_motivo_id IS NOT NULL
       OR NEW.salio_sin_reporte OR NEW.factura_espera_el_reporte
       OR NEW.reporte_llego_at IS NOT NULL THEN
      RAISE EXCEPTION 'el_cierre_pasa_por_la_funcion' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.checkout_at, NEW.checkout_lat, NEW.checkout_lng,
      NEW.cerrada_at, NEW.cerrada_origen, NEW.cerrada_por, NEW.cerrada_motivo, NEW.cerrada_motivo_id,
      NEW.salio_sin_reporte, NEW.factura_espera_el_reporte, NEW.reporte_llego_at)
     IS DISTINCT FROM
     (OLD.checkout_at, OLD.checkout_lat, OLD.checkout_lng,
      OLD.cerrada_at, OLD.cerrada_origen, OLD.cerrada_por, OLD.cerrada_motivo, OLD.cerrada_motivo_id,
      OLD.salio_sin_reporte, OLD.factura_espera_el_reporte, OLD.reporte_llego_at)
     OR (NEW.estado IN ('completada', 'salida_sin_reporte') AND NEW.estado IS DISTINCT FROM OLD.estado) THEN
    RAISE EXCEPTION 'el_cierre_pasa_por_la_funcion' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION interno.el_cierre_pasa_por_la_funcion() OWNER TO postgres;
REVOKE ALL ON FUNCTION interno.el_cierre_pasa_por_la_funcion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.el_cierre_pasa_por_la_funcion() TO authenticated, trabajo_sin_persona, service_role;

COMMENT ON FUNCTION interno.el_cierre_pasa_por_la_funcion() IS 'Una persona con sesión no escribe la salida, el cierre ni la marca del Reporte pendiente de un turno de guardia: eso lo hace sólo interno.cerrar_el_turno_guardia.';

DROP TRIGGER IF EXISTS el_cierre_pasa_por_la_funcion ON public.turnos_guardia;
CREATE TRIGGER el_cierre_pasa_por_la_funcion
  BEFORE INSERT OR UPDATE ON public.turnos_guardia
  FOR EACH ROW EXECUTE FUNCTION interno.el_cierre_pasa_por_la_funcion();

-- El Asistente marca su llegada y su ubicación, pero ya no su salida: la salida pasa por el
-- backend, que la cierra con el trabajo de la Prestadora.
CREATE OR REPLACE FUNCTION interno.el_asistente_marca_solo_su_turno_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_suyas constant text[] := ARRAY[
    'salida_checkin_at', 'salida_lat', 'salida_lng', 'medio_transporte',
    'checkin_at', 'checkin_lat', 'checkin_lng',
    'estado',
    'ubicacion_actual_lat', 'ubicacion_actual_lng', 'ubicacion_actual_at',
    'push_llegada_enviado_at', 'push_reporte_enviado_at'
  ];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF interno.es_personal_de_la_prestadora() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_suyas) IS DISTINCT FROM (to_jsonb(OLD) - v_suyas) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La salida hacia la casa y la llegada: se marcan una vez, con todo lo suyo, y no se reescriben.
  IF (NEW.salida_checkin_at, NEW.salida_lat, NEW.salida_lng, NEW.medio_transporte)
       IS DISTINCT FROM (OLD.salida_checkin_at, OLD.salida_lat, OLD.salida_lng, OLD.medio_transporte)
     AND (OLD.salida_checkin_at IS NOT NULL OR NEW.salida_checkin_at IS NULL) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;
  IF (NEW.checkin_at, NEW.checkin_lat, NEW.checkin_lng)
       IS DISTINCT FROM (OLD.checkin_at, OLD.checkin_lat, OLD.checkin_lng)
     AND (OLD.checkin_at IS NOT NULL OR NEW.checkin_at IS NULL OR NEW.estado IS DISTINCT FROM 'activa') THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- El estado: a empezada al llegar, desde una guardia que todavía no empezó y no se canceló.
  -- Ningún otro cambio es del Asistente.
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (NEW.estado = 'activa' AND OLD.estado IN ('programada', 'ausente', 'pausada')
              AND OLD.checkin_at IS NULL AND NEW.checkin_at IS NOT NULL) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- Los avisos ya mandados no se desmarcan: desmarcarlos los volvería a mandar.
  IF (OLD.push_llegada_enviado_at IS NOT NULL AND NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at)
     OR (OLD.push_reporte_enviado_at IS NOT NULL AND NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at) THEN
    RAISE EXCEPTION 'la_persona_cambia_solo_lo_suyo' USING ERRCODE = '42501';
  END IF;

  -- La hora de cada marca es la de la base, no la que mande el teléfono.
  IF NEW.salida_checkin_at IS DISTINCT FROM OLD.salida_checkin_at THEN NEW.salida_checkin_at := now(); END IF;
  IF NEW.checkin_at IS DISTINCT FROM OLD.checkin_at THEN NEW.checkin_at := now(); END IF;
  IF NEW.ubicacion_actual_at IS NOT NULL AND NEW.ubicacion_actual_at IS DISTINCT FROM OLD.ubicacion_actual_at THEN
    NEW.ubicacion_actual_at := now();
  END IF;
  IF NEW.push_llegada_enviado_at IS DISTINCT FROM OLD.push_llegada_enviado_at THEN NEW.push_llegada_enviado_at := now(); END IF;
  IF NEW.push_reporte_enviado_at IS DISTINCT FROM OLD.push_reporte_enviado_at THEN NEW.push_reporte_enviado_at := now(); END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- El permiso para que el Paciente quede solo cierra el turno de guardia.
-- ---------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS coordinador_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo;
DROP POLICY IF EXISTS panel_gestiona_consentimientos_paciente_solo ON public.consentimientos_paciente_solo;

CREATE POLICY personal_ve_consentimientos_paciente_solo
  ON public.consentimientos_paciente_solo FOR SELECT TO authenticated
  USING ((prestadora_id = interno.prestadora_actual())
         AND (interno.es_superadmin()
              OR interno.es_admin_prestadora()
              OR interno.coordinador_ve_el_turno_guardia(turno_guardia_id)));

-- Se carga sólo junto con el cierre del turno de guardia, y sólo el Administrador o el
-- Coordinador de ese Servicio. Una vez cargado no se cambia ni se borra.
CREATE POLICY quien_coordina_carga_consentimientos_paciente_solo
  ON public.consentimientos_paciente_solo FOR INSERT TO authenticated
  WITH CHECK ((prestadora_id = interno.prestadora_actual())
              AND COALESCE(current_setting('careonys.cierre_por_la_funcion', true), '') = 'si'
              AND (interno.es_superadmin()
                   OR interno.es_admin_prestadora()
                   OR interno.coordina_el_servicio_del_turno_guardia(turno_guardia_id)));

COMMENT ON TABLE public.consentimientos_paciente_solo IS 'El Cliente supo y aceptó que la persona atendida quedara sola durante un rato. Cada permiso cierra, en la misma operación, el turno de guardia del Asistente que se fue, con su motivo.';

CREATE OR REPLACE FUNCTION public.permitir_que_el_paciente_quede_solo(
  p_turno_guardia uuid,
  p_paciente uuid,
  p_quien text,
  p_medio text,
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone,
  p_nota text,
  p_reporte_atrasado boolean
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'interno'
AS $$
DECLARE
  v_prestadora uuid := interno.prestadora_actual();
  v_yo uuid := interno.usuario_de_la_sesion();
  v_motivo uuid;
  v_checkin timestamp with time zone;
  v_id uuid;
BEGIN
  IF v_prestadora IS NULL OR v_yo IS NULL
     OR NOT interno.es_personal_de_la_prestadora()
     OR NOT (interno.es_superadmin()
             OR interno.es_admin_prestadora()
             OR interno.coordina_el_servicio_del_turno_guardia(p_turno_guardia)) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  SELECT m.id INTO v_motivo
    FROM motivos_cierre_turno_guardia m
   WHERE m.prestadora_id = v_prestadora
     AND m.clave = 'paciente_solo_con_permiso'
     AND m.activo;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_de_salida_inexistente' USING ERRCODE = 'P0001';
  END IF;

  SELECT g.checkin_at INTO v_checkin
    FROM turnos_guardia g
   WHERE g.id = p_turno_guardia
     AND g.prestadora_id = v_prestadora;

  PERFORM set_config('careonys.cierre_por_la_funcion', 'si', true);
  INSERT INTO consentimientos_paciente_solo
    (prestadora_id, turno_guardia_id, paciente_id, quien_consintio, medio, desde_at, hasta_at, registrado_por, nota)
  VALUES
    (v_prestadora, p_turno_guardia, p_paciente, btrim(COALESCE(p_quien, '')), p_medio, p_desde, p_hasta, v_yo,
     NULLIF(btrim(COALESCE(p_nota, '')), ''))
  RETURNING id INTO v_id;

  -- El turno de guardia se cierra a la hora desde la que el Paciente quedó solo, que no puede
  -- ser antes de la llegada del Asistente ni después de este momento.
  PERFORM interno.cerrar_el_turno_guardia(
    p_turno_guardia,
    GREATEST(COALESCE(v_checkin, '-infinity'::timestamptz), LEAST(p_desde, now())),
    p_reporte_atrasado, v_motivo, NULL, NULL, NULL, NULL, true
  );

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.permitir_que_el_paciente_quede_solo(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.permitir_que_el_paciente_quede_solo(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permitir_que_el_paciente_quede_solo(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.permitir_que_el_paciente_quede_solo(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, text, boolean) IS 'Guarda el permiso del Cliente para que el Paciente quede solo y cierra, en la misma operación, el turno de guardia del Asistente que se fue. Sólo el Administrador o el Coordinador de ese Servicio.';

COMMIT;

NOTIFY pgrst, 'reload schema';
