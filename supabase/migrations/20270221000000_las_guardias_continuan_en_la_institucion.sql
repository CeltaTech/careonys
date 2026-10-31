-- Las guardias pueden continuar en la institución donde está internado el Paciente.
--
-- Hasta acá, registrar una hospitalización pausaba todas las guardias: el Asistente dejaba de ir
-- porque en la casa no había nadie. Si el Cliente lo pide, ahora el Asistente va a cuidar al
-- Paciente a la institución, y la institución pasa a ser su domicilio temporal mientras dure la
-- internación. Decidido por el Desarrollador.
--
-- Tres cosas:
--
-- 1. El domicilio temporal que nace de una hospitalización la nombra (`hospitalizacion_id`), y
--    sólo puede nombrar una del mismo Paciente y la misma Prestadora.
-- 2. Ese domicilio rige en el momento, lo cargue quien lo cargue, igual que la hospitalización
--    que lo origina: si quedara pendiente de aprobación, el Asistente iría a una casa vacía. Lo
--    que sí sigue pasando por aprobación es cambiarle después la dirección.
-- 3. Registrar y cerrar una hospitalización pasan a ser una sola operación cada una, en la base:
--    la hospitalización, el domicilio y las guardias se guardan juntos o no se guarda nada. Antes
--    eran tres pedidos sueltos desde el navegador, y si fallaba el segundo quedaba una internación
--    registrada con las guardias corriendo.

ALTER TABLE public.hospitalizaciones_paciente
  ADD CONSTRAINT hospitalizaciones_paciente_id_paciente_prestadora_key
  UNIQUE (id, paciente_id, prestadora_id);

ALTER TABLE public.domicilios_temporales_paciente
  ADD COLUMN hospitalizacion_id uuid,
  ADD CONSTRAINT domicilios_temp_una_por_hospitalizacion UNIQUE (hospitalizacion_id),
  ADD CONSTRAINT domicilios_temp_hospitalizacion_fk
    FOREIGN KEY (hospitalizacion_id, paciente_id, prestadora_id)
    REFERENCES public.hospitalizaciones_paciente (id, paciente_id, prestadora_id);

-- Mismo cuerpo que antes, con la excepción del comienzo.
CREATE OR REPLACE FUNCTION interno.lo_que_carga_otro_coordinador_queda_pendiente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_fila      jsonb := to_jsonb(NEW);
  v_vigente   jsonb;
  v_datos     jsonb;
  v_operacion text;
BEGIN
  -- El domicilio de una internación rige en el momento, como la internación. Al darlo de alta, y
  -- al terminarlo sin tocar nada más: cambiarle la dirección sí queda pendiente.
  IF TG_TABLE_NAME = 'domicilios_temporales_paciente' THEN
    IF TG_OP = 'INSERT' AND NEW.hospitalizacion_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.hospitalizacion_id IS NOT NULL
       AND (to_jsonb(NEW) - 'fecha_fin') = (to_jsonb(OLD) - 'fecha_fin') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT interno.la_carga_queda_pendiente(NEW.paciente_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_vigente := to_jsonb(OLD);
  ELSIF TG_TABLE_NAME = 'informacion_de_salud_del_paciente' THEN
    -- La información de salud es una por Paciente: si ya está, guardarla es modificarla.
    SELECT to_jsonb(s) INTO v_vigente
      FROM informacion_de_salud_del_paciente s
     WHERE s.paciente_id = NEW.paciente_id;
  END IF;

  IF v_vigente IS NULL THEN
    v_datos := v_fila;
    v_operacion := 'alta';
  ELSE
    -- Sólo lo que cambió: al aceptarlo se aplica sobre lo que esté vigente ese día.
    -- En un alta sobre una fila que ya existe, lo que llega vacío es lo que no se mandó: no se
    -- sabe qué quiso decir, y vaciar lo vigente no puede ser lo que se pidió.
    SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) INTO v_datos
      FROM jsonb_each(v_fila) n
     WHERE n.value IS DISTINCT FROM v_vigente -> n.key
       AND (TG_OP = 'UPDATE' OR n.value <> 'null'::jsonb);
    v_operacion := 'modificacion';
  END IF;

  v_datos := v_datos - 'id' - 'prestadora_id' - 'paciente_id' - 'created_at' - 'updated_at'
                     - 'hospitalizacion_id';
  IF v_datos = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO cargas_sujetas_a_aprobacion
    (prestadora_id, paciente_id, tabla, operacion, registro_id, datos, cargado_por)
  VALUES
    (NEW.prestadora_id, NEW.paciente_id, TG_TABLE_NAME, v_operacion,
     CASE WHEN TG_OP = 'UPDATE' THEN NEW.id END, v_datos, interno.usuario_de_la_sesion());

  -- Lo vigente no cambia.
  RETURN NULL;
END;
$function$;

-- Corre con los permisos de quien llama: la protección por fila de cada tabla decide si puede
-- registrar la internación de ese Paciente y tocar sus guardias.
--
-- `p_domicilio` vacío: las guardias se pausan desde el día de inicio. Con datos: las guardias
-- continúan en la institución, que pasa a ser el domicilio temporal desde ese mismo día. Trae los
-- casilleros de la dirección, las coordenadas y el motivo, escrito por el Panel en el idioma de
-- quien carga.
CREATE FUNCTION public.registrar_hospitalizacion(
  p_paciente uuid,
  p_institucion text,
  p_motivo text,
  p_fecha_inicio date,
  p_domicilio jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_prestadora uuid;
  v_id         uuid := gen_random_uuid();
  v_d          domicilios_temporales_paciente;
BEGIN
  SELECT p.prestadora_id INTO v_prestadora
    FROM pacientes p
   WHERE p.id = p_paciente
     AND p.prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_institucion, '')), '') IS NULL OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;

  -- El identificador se arma acá y no se lee de vuelta: quien no alcanza la información de salud
  -- del Paciente puede registrar la internación, pero no leerla.
  INSERT INTO hospitalizaciones_paciente
    (id, prestadora_id, paciente_id, institucion, motivo, fecha_inicio, registrado_por)
  VALUES
    (v_id, v_prestadora, p_paciente, btrim(p_institucion), nullif(btrim(coalesce(p_motivo, '')), ''),
     p_fecha_inicio, interno.usuario_de_la_sesion());

  IF p_domicilio IS NULL THEN
    UPDATE guardias SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'programada' AND fecha >= p_fecha_inicio;
    UPDATE series_guardias SET estado = 'pausada'
     WHERE paciente_id = p_paciente AND estado = 'activa';
  ELSE
    v_d := jsonb_populate_record(NULL::domicilios_temporales_paciente, p_domicilio);
    INSERT INTO domicilios_temporales_paciente
      (prestadora_id, paciente_id, hospitalizacion_id, domicilio, calle, numero, piso, unidad,
       lugar_id, codigo_postal, lat, lng, motivo, fecha_inicio)
    VALUES
      (v_prestadora, p_paciente, v_id, v_d.domicilio, v_d.calle, v_d.numero, v_d.piso, v_d.unidad,
       v_d.lugar_id, v_d.codigo_postal, v_d.lat, v_d.lng, v_d.motivo, p_fecha_inicio);
  END IF;

  RETURN v_id;
END;
$function$;

-- Cierra la internación en `p_fecha`. Si las guardias continuaban en la institución, ese domicilio
-- temporal termina el mismo día; si se habían pausado, vuelven a correr.
CREATE FUNCTION public.cerrar_hospitalizacion(p_hospitalizacion uuid, p_fecha date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_paciente uuid;
  v_inicio   date;
BEGIN
  UPDATE hospitalizaciones_paciente h
     SET fecha_fin = greatest(p_fecha, h.fecha_inicio)
   WHERE h.id = p_hospitalizacion
     AND h.prestadora_id = interno.prestadora_actual()
     AND h.fecha_fin IS NULL
  RETURNING h.paciente_id, h.fecha_inicio INTO v_paciente, v_inicio;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM domicilios_temporales_paciente d WHERE d.hospitalizacion_id = p_hospitalizacion) THEN
    UPDATE domicilios_temporales_paciente d
       SET fecha_fin = greatest(p_fecha, d.fecha_inicio)
     WHERE d.hospitalizacion_id = p_hospitalizacion
       AND (d.fecha_fin IS NULL OR d.fecha_fin > greatest(p_fecha, d.fecha_inicio));
  ELSE
    UPDATE guardias SET estado = 'programada' WHERE paciente_id = v_paciente AND estado = 'pausada';
    UPDATE series_guardias SET estado = 'activa' WHERE paciente_id = v_paciente AND estado = 'pausada';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_hospitalizacion(uuid, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_hospitalizacion(uuid, text, text, date, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.cerrar_hospitalizacion(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_hospitalizacion(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
