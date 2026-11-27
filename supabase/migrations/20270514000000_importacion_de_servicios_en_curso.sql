-- Importación de Servicios que ya están en curso.
--
-- La Prestadora que empieza a usar Careonys trae Servicios que ya están andando: con su Cliente,
-- sus Pacientes, su Coordinador, su precio, su cronograma y el Asistente que ya cubre los turnos
-- de guardia. Esta migración prepara la base para que la importación de planillas los cargue.
--
-- Hace cuatro cosas:
--   1. Acepta un lote de importación nuevo, el de Servicios.
--   2. Crea la lista de pedidos de importación: cada dato de la planilla que la importación no
--      pudo resolver sola queda anotado ahí, para que la administración de la Prestadora lo conteste.
--   3. Crea la función que deja asignado al Asistente que ya cubre un Servicio en curso.
--   4. Le da a la cuenta de la importación los permisos justos para crear todo eso, siempre dentro
--      de su propia Prestadora y nunca en otra.
--
-- Corre entera o no corre.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. El lote de Servicios
-- ---------------------------------------------------------------------------------------------

-- Hasta hoy un lote de importación podía ser de Asistentes, de Clientes o de lista de precios.
-- Se agrega el de Servicios.
ALTER TABLE public.importaciones_prestadora
  DROP CONSTRAINT importaciones_prestadora_tipo_check;
ALTER TABLE public.importaciones_prestadora
  ADD CONSTRAINT importaciones_prestadora_tipo_check
  CHECK (tipo = ANY (ARRAY['asistente'::text, 'cliente'::text, 'lista_precios'::text, 'servicio'::text]));

-- ---------------------------------------------------------------------------------------------
-- 2. Los pedidos de importación
-- ---------------------------------------------------------------------------------------------

-- Un pedido es un dato de un renglón de la planilla que la importación no pudo resolver sola:
-- una localidad que no reconoce, un Coordinador o un Asistente que no encuentra, un horario que
-- no entiende, un documento que falta. Guarda qué dato era, qué decía la planilla, por qué no se
-- resolvió y qué opciones encontró. La administración lo contesta y el pedido queda resuelto.
--
-- Las referencias a Servicio, Cliente, Paciente y Asistente van junto con la Prestadora: así la
-- base garantiza que un pedido nunca apunta a algo de otra Prestadora.
CREATE TABLE public.pedidos_de_importacion (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id   uuid        NOT NULL DEFAULT interno.prestadora_actual()
                              REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  importacion_id  uuid        NOT NULL
                              REFERENCES public.importaciones_prestadora(id) ON DELETE CASCADE,
  fila            integer     NOT NULL,
  dato            text        NOT NULL,
  valor_original  text,
  motivo          text,
  sugerencias     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  renglon         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  servicio_id     uuid,
  cliente_id      uuid,
  paciente_id     uuid,
  asistente_id    uuid,
  estado          text        NOT NULL DEFAULT 'abierto',
  respuesta       jsonb,
  resuelto_en     timestamptz,
  resuelto_por    uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pedidos_de_importacion_dato_check
    CHECK (dato = ANY (ARRAY['localidad'::text, 'coordinador'::text, 'asistente'::text, 'horario'::text,
                             'documento'::text, 'documento_paciente'::text, 'tipo_servicio'::text, 'dato'::text])),
  CONSTRAINT pedidos_de_importacion_estado_check
    CHECK (estado = ANY (ARRAY['abierto'::text, 'resuelto'::text])),
  CONSTRAINT pedidos_de_importacion_fila_positiva
    CHECK (fila > 0),
  CONSTRAINT pedidos_de_importacion_servicio_de_la_prestadora
    FOREIGN KEY (servicio_id, prestadora_id)
    REFERENCES public.servicios(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT pedidos_de_importacion_cliente_de_la_prestadora
    FOREIGN KEY (cliente_id, prestadora_id)
    REFERENCES public.clientes(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT pedidos_de_importacion_paciente_de_la_prestadora
    FOREIGN KEY (paciente_id, prestadora_id)
    REFERENCES public.pacientes(id, prestadora_id) ON DELETE CASCADE,
  CONSTRAINT pedidos_de_importacion_asistente_de_la_prestadora
    FOREIGN KEY (asistente_id, prestadora_id)
    REFERENCES public.asistentes(id, prestadora_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.pedidos_de_importacion IS
  'Datos de la planilla que la importación no pudo resolver sola y que contesta la administración de la Prestadora.';

-- La administración busca los pedidos abiertos de su Prestadora.
CREATE INDEX pedidos_de_importacion_por_prestadora_y_estado
  ON public.pedidos_de_importacion (prestadora_id, estado);
CREATE INDEX pedidos_de_importacion_por_importacion
  ON public.pedidos_de_importacion (importacion_id);

ALTER TABLE public.pedidos_de_importacion ENABLE ROW LEVEL SECURITY;

-- La administración de la Prestadora lee los pedidos de su Prestadora. Es el mismo criterio con el
-- que lee los lotes de importación.
CREATE POLICY admin_lee_pedidos_de_importacion
  ON public.pedidos_de_importacion
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_superadmin()
      OR EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

-- Y los contesta, sin poder mandarlos a otra Prestadora.
CREATE POLICY admin_contesta_pedidos_de_importacion
  ON public.pedidos_de_importacion
  FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_superadmin()
      OR EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  )
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_superadmin()
      OR EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
    )
  );

-- El personal de la Prestadora puede anotar un pedido en su propia Prestadora.
CREATE POLICY personal_anota_pedidos_de_importacion
  ON public.pedidos_de_importacion
  FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_personal_de_la_prestadora()
  );

-- La importación anota, lee y cierra los pedidos de su Prestadora. Otro trabajo sin persona no.
CREATE POLICY la_importacion_maneja_pedidos_de_importacion
  ON public.pedidos_de_importacion
  FOR ALL TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual())
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

-- Permisos de la tabla. Supabase le da todo a cada tabla nueva: primero se quita y después se da
-- lo justo. Nadie borra pedidos: se cierran.
REVOKE ALL ON TABLE public.pedidos_de_importacion FROM PUBLIC, anon, authenticated, trabajo_sin_persona;

GRANT SELECT ON TABLE public.pedidos_de_importacion TO authenticated, trabajo_sin_persona;

GRANT INSERT (prestadora_id, importacion_id, fila, dato, valor_original, motivo, sugerencias, renglon,
              servicio_id, cliente_id, paciente_id, asistente_id)
  ON TABLE public.pedidos_de_importacion TO authenticated, trabajo_sin_persona;

-- La administración sólo contesta.
GRANT UPDATE (estado, respuesta, resuelto_en, resuelto_por)
  ON TABLE public.pedidos_de_importacion TO authenticated;

-- La importación, además, completa a qué quedó ligado el pedido cuando lo resuelve.
GRANT UPDATE (estado, respuesta, resuelto_en, resuelto_por,
              servicio_id, cliente_id, paciente_id, asistente_id)
  ON TABLE public.pedidos_de_importacion TO trabajo_sin_persona;

GRANT ALL ON TABLE public.pedidos_de_importacion TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Dejar asignado al Asistente que ya cubre el Servicio
-- ---------------------------------------------------------------------------------------------

-- En un Servicio en curso el Asistente ya está trabajando: no hay que pedirle que acepte. Esta
-- función deja la asignación aceptada, pone al Asistente en la serie de turnos de guardia y en
-- los turnos de guardia programados de esa serie desde hoy en adelante.
--
-- Corre con los permisos de quien la llama, así que la base sigue mirando la Prestadora en cada
-- paso. Y sólo la puede usar la importación: cualquier otro recibe «sin_permiso».
-- Los controles de siempre siguen valiendo: si el Asistente está desactivado, le falta un
-- documento o tiene una tarea prohibida, la base lo rechaza y el error sube tal cual.
CREATE OR REPLACE FUNCTION public.asignar_serie_en_curso(p_serie_id uuid, p_asistente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, interno
AS $$
DECLARE
  v_prest uuid := interno.prestadora_actual();
BEGIN
  IF v_prest IS NULL OR NOT interno.es_la_importacion() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  IF p_serie_id IS NULL OR p_asistente_id IS NULL THEN
    RAISE EXCEPTION 'falta_un_dato' USING ERRCODE = '23502';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM series_turnos_guardia s
                  WHERE s.id = p_serie_id AND s.prestadora_id = v_prest) THEN
    RAISE EXCEPTION 'serie_inexistente' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO asignaciones_de_turno_guardia (prestadora_id, serie_id, asistente_id, estado)
  VALUES (v_prest, p_serie_id, p_asistente_id, 'aceptada');

  UPDATE series_turnos_guardia
     SET asistente_id = p_asistente_id
   WHERE id = p_serie_id
     AND prestadora_id = v_prest;

  UPDATE turnos_guardia
     SET asistente_id = p_asistente_id
   WHERE serie_id = p_serie_id
     AND prestadora_id = v_prest
     AND estado = 'programada'
     AND fecha >= interno.hoy_de_la_prestadora(v_prest);

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.asignar_serie_en_curso(uuid, uuid) IS
  'Deja asignado y aceptado al Asistente que ya cubre un Servicio en curso. Sólo la usa la importación.';

ALTER FUNCTION public.asignar_serie_en_curso(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.asignar_serie_en_curso(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_serie_en_curso(uuid, uuid) TO trabajo_sin_persona, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Lo que la importación necesita para crear un Servicio en curso
-- ---------------------------------------------------------------------------------------------
--
-- Cada permiso de tabla va junto con su política. Las políticas nuevas exigen las dos cosas:
-- que sea la importación y que la fila sea de su Prestadora.

-- El Servicio nace con su Coordinador. La importación ya podía crear el Servicio; ahora también
-- le pone el Coordinador. La base sigue exigiendo que sea Coordinador de esa Prestadora.
GRANT INSERT (coordinador_id, coordinador_asignado_por),
      UPDATE (coordinador_id, coordinador_asignado_por)
  ON TABLE public.servicios TO trabajo_sin_persona;

-- La Prestación: qué se presta, a qué Paciente y a qué precio.
GRANT SELECT ON TABLE public.prestaciones TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, servicio_id, paciente_id, tipo_servicio, vigente_desde, vigente_hasta,
              moneda, forma_de_precio, precio_lista_id, precio_lista_snapshot, sentido_del_ajuste,
              tipo_descuento, valor_descuento, precio_final, precio_turno_guardia_adicional,
              precio_hora_adicional, configuracion, nota)
  ON TABLE public.prestaciones TO trabajo_sin_persona;

CREATE POLICY la_importacion_lee_prestaciones
  ON public.prestaciones
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

CREATE POLICY la_importacion_carga_prestaciones
  ON public.prestaciones
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

-- El precio de lista sale de la lista de precios de la Prestadora: la importación la lee.
GRANT SELECT ON TABLE public.lista_precios TO trabajo_sin_persona;

CREATE POLICY la_importacion_lee_la_lista_de_precios
  ON public.lista_precios
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

-- El cronograma de guardias de la Prestación.
GRANT INSERT (prestadora_id, prestacion_id, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin)
  ON TABLE public.cronograma_de_guardias TO trabajo_sin_persona;

CREATE POLICY la_importacion_carga_el_cronograma_de_guardias
  ON public.cronograma_de_guardias
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

-- La serie de turnos de guardia y sus Pacientes. Son las columnas que llena la función que crea
-- la serie, más el Asistente que la cubre.
GRANT INSERT (prestadora_id, servicio_id, paciente_id, dias_semana, hora_inicio, hora_fin,
              dias_hasta_el_fin, modalidad, vigente_desde, vigente_hasta),
      UPDATE (asistente_id)
  ON TABLE public.series_turnos_guardia TO trabajo_sin_persona;

GRANT INSERT (serie_id, paciente_id, prestadora_id)
  ON TABLE public.series_turnos_guardia_pacientes TO trabajo_sin_persona;

-- La asignación del Asistente a la serie, ya aceptada.
GRANT INSERT (serie_id, estado)
  ON TABLE public.asignaciones_de_turno_guardia TO trabajo_sin_persona;

-- La función que crea la serie y sus turnos de guardia corre con los permisos de quien la llama,
-- y usa estas funciones por dentro.
GRANT EXECUTE ON FUNCTION public.crear_turno_guardia_recurrente(uuid, uuid[], text[], text, text, integer, text, date, date)
  TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.dia_de_la_semana(date) TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.dias_de_generacion_de_la_prestadora() TO trabajo_sin_persona;
GRANT EXECUTE ON FUNCTION interno.guardia_que_contiene(uuid, uuid, uuid, date, time without time zone,
                                                      time without time zone, smallint)
  TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
