-- La Coordinadora no ve los precios.
--
-- Qué hace:
--   - Agrega al catálogo de permisos «ver la facturación de los Clientes», reservado de fábrica a
--     la administración de la Prestadora, igual que el estado de cuenta.
--   - La facturación de los Clientes (facturas, cobros y correcciones) pasa a pedir ese permiso
--     además de ser personal de la Prestadora. La administración lo tiene siempre.
--   - La lista de precios sólo la lee quien gestiona la facturación. Quién la escribe no cambia.
--   - Una prestación puede nacer sin precio: la carga la Coordinadora, con su Servicio, su
--     configuración, su vigencia y su nota, y el precio lo pone después la administración o quien
--     tenga el permiso. Sin precio quiere decir sin forma de precio y con todas las columnas del
--     precio vacías.
--   - La tabla de prestaciones, con sus precios, sólo la leen y la escriben la administración y
--     quien gestiona la facturación, siempre sobre los Pacientes que ven. La Coordinadora sin el
--     permiso sólo puede dar de alta una prestación sin precio, de un Paciente que ve, y que no
--     reemplace a otra.
--   - Para el trabajo de todos los días se publica una vista de las prestaciones sin las columnas
--     del precio, con una marca de si ya tiene precio. Filtra por la Prestadora de la sesión y por
--     los Pacientes que ve quien consulta. Y se publica una consulta con los tipos de servicio y
--     las modalidades vigentes de la lista de precios, sin precio y sin identificador, para que la
--     Coordinadora elija qué se presta.
--   - El cronograma de guardias sigue siendo de quien ve al Paciente de la prestación, tenga o no
--     el permiso: su política deja de consultar la tabla de prestaciones con los permisos de quien
--     llama y pasa a una función que la mira por su cuenta.
--   - La baja de un Servicio sigue cerrando todas sus prestaciones aunque la haga una Coordinadora
--     sin el permiso.
--   - Las actualizaciones de precios por índice no tocan las prestaciones sin precio.
--   - Los saldos de los Clientes dejan de depender del permiso de facturación: los ve también
--     quien tiene sólo el permiso de ver el estado de cuenta, sin ver las facturas ni los cobros.
--
-- Qué se comprobó en la base en vivo antes de escribirla:
--   - la tabla de prestaciones tenía una sola política, para todo, por Prestadora y Paciente visto;
--   - la única otra política que consulta la tabla de prestaciones es la del cronograma de guardias;
--   - ninguna vista lee la tabla de prestaciones;
--   - las funciones con los permisos de quien llama que escriben en prestaciones son el alta de la
--     prestación que reemplaza a otra (sólo para quien ve el precio), la baja del Servicio y las
--     actualizaciones de precios por índice (sólo la administración);
--   - el permiso nuevo no existía y el último lugar del catálogo era el 23.
--
-- Cómo se deshace, en otra migración:
--   - volver a crear la política única de prestaciones y la del cronograma como estaban, y la de
--     lectura de la lista de precios para administración y Coordinadoras;
--   - devolverle a la facturación la condición de sólo ser personal de la Prestadora;
--   - poner precio a las prestaciones que no lo tengan, volver la forma de precio y el precio final
--     obligatorios, y la restricción de coherencia como estaba;
--   - borrar la vista, la consulta de tipos de servicio, las funciones nuevas y el renglón del
--     catálogo, y volver las tres funciones de precios y la de la baja a su texto anterior.

BEGIN;

-- 1. El permiso.
INSERT INTO public.catalogo_acciones_permisos (accion, default_solo_admin, orden)
VALUES ('ver_facturacion_cliente', true, 24)
ON CONFLICT (accion) DO NOTHING;

-- 2. Quién gestiona la facturación de los Clientes.
CREATE OR REPLACE FUNCTION interno.gestiona_la_facturacion()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_personal_de_la_prestadora() AND interno.tiene_permiso('ver_facturacion_cliente');
$function$;

COMMENT ON FUNCTION interno.gestiona_la_facturacion() IS
  'Si quien inició sesión es personal de la Prestadora y tiene el permiso de ver la facturación de los Clientes. La administración lo tiene siempre.';

-- 3. La lista de precios la lee quien gestiona la facturación.
DROP POLICY panel_lee_lista_precios ON public.lista_precios;
CREATE POLICY panel_lee_lista_precios ON public.lista_precios
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.gestiona_la_facturacion());

-- 4. Una prestación puede no tener precio todavía.
ALTER TABLE public.prestaciones ALTER COLUMN precio_final DROP NOT NULL;
ALTER TABLE public.prestaciones ALTER COLUMN forma_de_precio DROP NOT NULL;

ALTER TABLE public.prestaciones DROP CONSTRAINT prestaciones_precio_coherente_con_su_forma;
ALTER TABLE public.prestaciones
  ADD CONSTRAINT prestaciones_precio_coherente_con_su_forma CHECK (
    (forma_de_precio IS NULL
      AND precio_lista_id IS NULL
      AND precio_lista_snapshot IS NULL
      AND tipo_descuento IS NULL
      AND valor_descuento IS NULL
      AND sentido_del_ajuste IS NULL
      AND precio_final IS NULL
      AND precio_turno_guardia_adicional IS NULL
      AND precio_hora_adicional IS NULL
      AND NOT requiere_revision)
    OR (forma_de_precio = 'lista'
      AND precio_lista_id IS NOT NULL
      AND precio_lista_snapshot IS NOT NULL
      AND precio_final IS NOT NULL)
    OR (forma_de_precio = 'directo'
      AND precio_lista_id IS NULL
      AND tipo_descuento IS NULL
      AND precio_final IS NOT NULL));

COMMENT ON COLUMN public.prestaciones.forma_de_precio IS
  'Cómo se llegó al precio: de la lista o escrito. Vacía quiere decir que la prestación todavía no tiene precio.';

-- 5. Quién ve una prestación.
CREATE OR REPLACE FUNCTION interno.ve_la_prestacion(p_paciente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_superadmin()
      OR interno.es_admin_prestadora()
      OR interno.coordinador_ve_al_paciente(p_paciente);
$function$;

COMMENT ON FUNCTION interno.ve_la_prestacion(uuid) IS
  'Si quien inició sesión ve las prestaciones de ese Paciente: la administración, o la Coordinadora que lo ve. No dice nada del precio.';

REVOKE ALL ON FUNCTION interno.ve_la_prestacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.ve_la_prestacion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION interno.ve_la_prestacion_por_id(p_prestacion bigint, p_prestadora uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM prestaciones p
     WHERE p.id = p_prestacion
       AND p.prestadora_id = p_prestadora
       AND p.prestadora_id = interno.prestadora_actual()
       AND interno.ve_la_prestacion(p.paciente_id));
$function$;

COMMENT ON FUNCTION interno.ve_la_prestacion_por_id(bigint, uuid) IS
  'Si la prestación es de la Prestadora de la sesión y quien inició sesión ve a su Paciente. La usa la política del cronograma de guardias.';

REVOKE ALL ON FUNCTION interno.ve_la_prestacion_por_id(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.ve_la_prestacion_por_id(bigint, uuid) TO authenticated, service_role;

-- 6. Las políticas de la tabla de prestaciones.
DROP POLICY panel_gestiona_prestaciones ON public.prestaciones;

CREATE POLICY panel_gestiona_prestaciones_con_precio ON public.prestaciones
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.ve_la_prestacion(paciente_id)
         AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.gestiona_la_facturacion()))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.ve_la_prestacion(paciente_id)
              AND (interno.es_superadmin() OR interno.es_admin_prestadora() OR interno.gestiona_la_facturacion()));

-- La Coordinadora sin el permiso da de alta sin precio. No lee la fila de vuelta: la lee de la
-- vista de más abajo.
CREATE POLICY panel_carga_prestaciones_sin_precio ON public.prestaciones
  FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.es_personal_de_la_prestadora()
              AND interno.ve_la_prestacion(paciente_id)
              AND forma_de_precio IS NULL
              AND prestacion_anterior_id IS NULL);

-- 7. El cronograma de guardias es de quien ve al Paciente de la prestación.
DROP POLICY panel_gestiona_el_cronograma_de_guardias ON public.cronograma_de_guardias;
CREATE POLICY panel_gestiona_el_cronograma_de_guardias ON public.cronograma_de_guardias
  TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND interno.ve_la_prestacion_por_id(prestacion_id, prestadora_id))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND interno.ve_la_prestacion_por_id(prestacion_id, prestadora_id));

-- 8. Las prestaciones sin las columnas del precio.
-- No toma los permisos de quien consulta, porque tiene que alcanzar a la Coordinadora que no lee la
-- tabla; por eso filtra ella misma por la Prestadora de la sesión y por los Pacientes que ve.
CREATE VIEW public.prestaciones_sin_importes
  WITH (security_barrier = true)
AS
  SELECT p.id,
         p.prestadora_id,
         p.servicio_id,
         p.paciente_id,
         p.tipo_servicio,
         p.configuracion,
         p.nota,
         p.estado,
         p.vigente_desde,
         p.vigente_hasta,
         p.prestacion_anterior_id,
         p.created_at,
         (p.forma_de_precio IS NOT NULL) AS tiene_precio
    FROM public.prestaciones p
   WHERE p.prestadora_id = interno.prestadora_actual()
     AND interno.ve_la_prestacion(p.paciente_id);

ALTER VIEW public.prestaciones_sin_importes OWNER TO postgres;

COMMENT ON VIEW public.prestaciones_sin_importes IS
  'Las prestaciones de los Pacientes que ve quien inició sesión, sin el precio. Es lo que lee la Coordinadora; la tabla con el precio la leen la administración y quien gestiona la facturación.';

REVOKE ALL ON public.prestaciones_sin_importes FROM PUBLIC, anon;
GRANT SELECT ON public.prestaciones_sin_importes TO authenticated;
GRANT ALL ON public.prestaciones_sin_importes TO service_role;

-- 9. Los tipos de servicio y las modalidades que rigen, sin precio.
CREATE OR REPLACE FUNCTION public.tipos_de_servicio_que_rigen(p_fecha date DEFAULT interno.hoy_de_la_sesion())
 RETURNS TABLE(tipo_servicio text, modalidad text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT DISTINCT l.tipo_servicio, l.modalidad
    FROM lista_precios l
   WHERE interno.es_personal_de_la_prestadora()
     AND l.prestadora_id = interno.prestadora_actual()
     AND l.activo
     AND l.vigente_desde <= p_fecha
     AND (l.vigente_hasta IS NULL OR l.vigente_hasta >= p_fecha)
   ORDER BY l.tipo_servicio, l.modalidad;
$function$;

COMMENT ON FUNCTION public.tipos_de_servicio_que_rigen(date) IS
  'Los tipos de servicio y las modalidades vigentes de la lista de precios de la Prestadora de la sesión, sin precio. Sólo para su personal.';

REVOKE ALL ON FUNCTION public.tipos_de_servicio_que_rigen(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tipos_de_servicio_que_rigen(date) TO authenticated, service_role;

-- 10. La baja del Servicio cierra todas sus prestaciones, también las que quien la hace no lee.
CREATE OR REPLACE FUNCTION interno.dar_de_baja_las_prestaciones_del_servicio(p_servicio uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
BEGIN
  -- Sólo para un Servicio de la Prestadora de la sesión que ya tiene su baja anotada.
  IF NOT EXISTS (SELECT 1 FROM bajas_de_servicio b
                  WHERE b.servicio_id = p_servicio
                    AND b.prestadora_id = interno.prestadora_actual()) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- La fecha de fin de cada prestación la pone la base al ver la baja.
  UPDATE prestaciones SET estado = 'de_baja'
   WHERE servicio_id = p_servicio
     AND prestadora_id = interno.prestadora_actual()
     AND estado = 'vigente';
END;
$function$;

COMMENT ON FUNCTION interno.dar_de_baja_las_prestaciones_del_servicio(uuid) IS
  'Da de baja las prestaciones vigentes de un Servicio que se está dando de baja. La llama la baja del Servicio.';

REVOKE ALL ON FUNCTION interno.dar_de_baja_las_prestaciones_del_servicio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.dar_de_baja_las_prestaciones_del_servicio(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dar_de_baja_el_servicio(p_servicio uuid, p_motivo text, p_motivo_detalle text, p_comprobaciones uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio servicios%ROWTYPE;
  v_pide_detalle boolean;
  v_comprobaciones text[];
  v_faltan integer;
  v_baja uuid;
BEGIN
  SELECT * INTO v_servicio FROM servicios
   WHERE id = p_servicio AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente';
  END IF;
  IF v_servicio.estado <> 'vigente' THEN
    RAISE EXCEPTION 'el_servicio_ya_esta_de_baja';
  END IF;

  IF interno.turnos_guardia_asignados_del_servicio(p_servicio) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_turnos_guardia_asignados';
  END IF;

  SELECT m.pide_detalle INTO v_pide_detalle
    FROM motivos_cierre_servicio m
   WHERE m.prestadora_id = v_servicio.prestadora_id
     AND m.activo
     AND coalesce(m.clave, m.nombre) = p_motivo
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_cierre_inexistente:%', p_motivo;
  END IF;
  IF v_pide_detalle AND coalesce(btrim(p_motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_cierre_pide_detalle:%', p_motivo;
  END IF;

  SELECT count(*) INTO v_faltan
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND NOT (l.id = ANY (coalesce(p_comprobaciones, '{}')));
  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'faltan_comprobaciones_de_la_baja';
  END IF;

  SELECT coalesce(array_agg(l.nombre ORDER BY l.orden, l.created_at), '{}') INTO v_comprobaciones
    FROM lista_de_comprobacion_baja_servicio l
   WHERE l.prestadora_id = v_servicio.prestadora_id
     AND l.activo
     AND l.id = ANY (coalesce(p_comprobaciones, '{}'));

  INSERT INTO bajas_de_servicio (prestadora_id, servicio_id, motivo, motivo_detalle, comprobaciones, dada_por)
  VALUES (v_servicio.prestadora_id, p_servicio, p_motivo,
          CASE WHEN v_pide_detalle THEN btrim(p_motivo_detalle) END,
          v_comprobaciones, interno.usuario_de_la_sesion())
  RETURNING id INTO v_baja;

  -- Todas las prestaciones del Servicio, también las que quien da la baja no lee por el precio.
  PERFORM interno.dar_de_baja_las_prestaciones_del_servicio(p_servicio);
  UPDATE series_turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE servicio_id = p_servicio AND estado = 'activa';
  -- Lo pausado y lo suspendido también se cancela: la baja no deja nada esperando volver.
  UPDATE turnos_guardia
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'servicio',
         interrupcion_id = NULL
   WHERE servicio_id = p_servicio
     AND ((estado = 'programada' AND asistente_id IS NULL) OR estado IN ('pausada', 'suspendida'));

  -- Las pausas y las suspensiones abiertas del Servicio terminan con la baja.
  UPDATE interrupciones_de_cobertura
     SET levantada_desde = greatest(desde, interno.hoy_de_la_prestadora(prestadora_id)),
         levantada_at = now(), levantada_por = interno.usuario_de_la_sesion()
   WHERE servicio_id = p_servicio AND tipo IN ('pausa', 'suspension') AND levantada_at IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios
     SET estado = 'de_baja',
         vigente_hasta = greatest(vigente_desde,
                                  interno.hoy_de_la_prestadora(prestadora_id))
   WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  PERFORM interno.anotar_turnos_sin_cubrir();

  RETURN v_baja;
END;
$function$;

-- 11. Las actualizaciones por índice no tocan las prestaciones sin precio.
CREATE OR REPLACE FUNCTION public.actualizar_precios_por_indice(p_desde date, p_periodo_base date, p_periodo_nuevo date, p_aplicar boolean)
 RETURNS TABLE(clase text, renglon_id bigint, renglon_nuevo_id bigint, servicio_id uuid, descripcion text, indice text, precio_actual numeric, precio_nuevo numeric, moneda text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_prestadora  uuid := interno.prestadora_actual();
  v_regla       jsonb;
  v_indice_p    text;
  v_factor      numeric;
  v_lista       public.lista_precios;
  v_prestacion  record;
  v_pendientes  jsonb;
  v_elemento    jsonb;
  v_reemplazo   bigint;
BEGIN
  IF v_prestadora IS NULL OR NOT interno.es_la_administracion_de_la_prestadora(v_prestadora) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_periodo_base IS NULL OR p_periodo_nuevo IS NULL
     OR p_desde <> date_trunc('month', p_desde)::date
     OR date_trunc('month', p_periodo_nuevo) <= date_trunc('month', p_periodo_base) THEN
    RAISE EXCEPTION 'dato_invalido' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prestadora;
  -- Igual que `condicionDe` de `panel/src/lib/condicionesDelCliente.js`: 'ninguno' es «sin índice».
  v_indice_p := NULLIF(NULLIF(btrim(coalesce(v_regla ->> 'indice_de_actualizacion', '')), ''), 'ninguno');

  -- Las prestaciones se eligen antes de tocar la lista, con su marca de revisión de ese momento:
  -- reemplazar un renglón de la lista marca a revisar las que apuntan a él, y la que se versiona
  -- acá no tiene nada que revisar. Las que todavía no tienen precio no se actualizan.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'servicio_id', p.servicio_id, 'tipo_servicio', p.tipo_servicio,
           'precio_final', p.precio_final, 'precio_lista_snapshot', p.precio_lista_snapshot,
           'precio_lista_id', p.precio_lista_id, 'requiere_revision', p.requiere_revision,
           'precio_turno_guardia_adicional', p.precio_turno_guardia_adicional,
           'precio_hora_adicional', p.precio_hora_adicional,
           'moneda', p.moneda, 'indice', x.indice)), '[]'::jsonb)
    INTO v_pendientes
    FROM public.prestaciones p
    LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
    CROSS JOIN LATERAL (SELECT
        CASE WHEN c.indice_de_actualizacion = 'ninguno' THEN NULL
             ELSE coalesce(NULLIF(btrim(coalesce(c.indice_de_actualizacion, '')), ''), v_indice_p) END AS indice) x
   WHERE p.prestadora_id = v_prestadora
     AND p.estado = 'vigente'
     AND p.vigente_hasta IS NULL
     AND p.vigente_desde < p_desde
     AND p.servicio_id IS NOT NULL
     AND p.forma_de_precio IS NOT NULL
     AND x.indice IS NOT NULL;

  -- La lista de precios de la Prestadora.
  IF v_indice_p IS NOT NULL THEN
    v_factor := public.valor_del_indice(v_indice_p, p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_indice_p, p_periodo_base), 0);
    FOR v_lista IN
      SELECT * FROM public.lista_precios l
       WHERE l.prestadora_id = v_prestadora AND l.vigente_hasta IS NULL AND l.activo
         AND l.vigente_desde < p_desde
       ORDER BY l.tipo_servicio, l.modalidad, l.id
    LOOP
      clase := 'lista';
      renglon_id := v_lista.id;
      renglon_nuevo_id := NULL;
      servicio_id := NULL;
      descripcion := v_lista.tipo_servicio || ' — ' || v_lista.modalidad;
      indice := v_indice_p;
      precio_actual := v_lista.precio;
      precio_nuevo := round(v_lista.precio * v_factor, 2);
      moneda := v_lista.moneda;
      IF p_aplicar AND precio_nuevo IS NOT NULL THEN
        renglon_nuevo_id := public.reemplazar_precio_de_lista(v_lista.id, precio_nuevo, p_desde);
      END IF;
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Las prestaciones de los Servicios que se actualizan por índice.
  FOR v_elemento IN SELECT * FROM jsonb_array_elements(v_pendientes) LOOP
    v_factor := public.valor_del_indice(v_elemento ->> 'indice', p_periodo_nuevo)
              / NULLIF(public.valor_del_indice(v_elemento ->> 'indice', p_periodo_base), 0);
    clase := 'prestacion';
    renglon_id := (v_elemento ->> 'id')::bigint;
    renglon_nuevo_id := NULL;
    servicio_id := (v_elemento ->> 'servicio_id')::uuid;
    descripcion := v_elemento ->> 'tipo_servicio';
    indice := v_elemento ->> 'indice';
    precio_actual := (v_elemento ->> 'precio_final')::numeric;
    precio_nuevo := round(precio_actual * v_factor, 2);
    moneda := v_elemento ->> 'moneda';

    IF p_aplicar AND precio_nuevo IS NOT NULL AND precio_nuevo <> precio_actual THEN
      -- Si el renglón de la lista del que salió fue reemplazado recién, la nueva apunta al nuevo.
      SELECT l.id INTO v_reemplazo FROM public.lista_precios l
       WHERE l.reemplaza_a = NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint
         AND l.vigente_desde = p_desde
       ORDER BY l.id DESC LIMIT 1;

      renglon_nuevo_id := interno.copiar_renglon('public.prestaciones', renglon_id, jsonb_build_object(
        'precio_final', precio_nuevo,
        'precio_lista_snapshot', CASE WHEN v_elemento ->> 'precio_lista_snapshot' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_lista_snapshot')::numeric * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v_elemento ->> 'precio_turno_guardia_adicional' IS NULL THEN NULL
                                         ELSE round((v_elemento ->> 'precio_turno_guardia_adicional')::numeric * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v_elemento ->> 'precio_hora_adicional' IS NULL THEN NULL
                                      ELSE round((v_elemento ->> 'precio_hora_adicional')::numeric * v_factor, 2) END,
        'precio_lista_id', coalesce(v_reemplazo, NULLIF(v_elemento ->> 'precio_lista_id', '')::bigint),
        'vigente_desde', p_desde,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', renglon_id
      ));

      UPDATE public.prestaciones
         SET vigente_hasta = p_desde - 1,
             requiere_revision = (v_elemento ->> 'requiere_revision')::boolean
       WHERE id = renglon_id;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ajustar_precios_por_indice()
 RETURNS TABLE(aplicados integer, propuestos integer, sin_efecto integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prest      uuid := interno.prestadora_actual();
  v_regla      jsonb;
  v            record;
  v_ancla      date;
  v_rige       date;
  v_base       date;
  v_nuevo      date;
  v_factor     numeric;
  v_precio     numeric;
  v_propuesta  uuid;
  v_nueva      bigint;
BEGIN
  IF v_prest IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'trabajo_sin_persona' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Dos corridas a la vez para la misma Prestadora harían el mismo ajuste dos veces.
  PERFORM pg_advisory_xact_lock(hashtextextended('ajuste_por_indice:' || v_prest::text, 0));

  aplicados := 0;
  propuestos := 0;
  sin_efecto := 0;

  SELECT c.regla INTO v_regla FROM public.configuracion_facturacion_clientes c
   WHERE c.prestadora_id = v_prest;

  -- Las pendientes que ya no corresponden: la prestación dejó de ser la vigente, cambió su
  -- precio, o el Servicio cambió de índice o lo sacó.
  WITH vencidas AS (
    UPDATE public.propuestas_de_ajuste_por_indice pr
       SET estado = 'sin_efecto'
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     WHERE pr.prestadora_id = v_prest
       AND pr.estado = 'pendiente'
       AND p.id = pr.prestacion_id
       AND (p.estado <> 'vigente'
            OR p.vigente_hasta IS NOT NULL
            OR p.precio_final <> pr.precio_actual
            OR (SELECT x.indice FROM interno.condiciones_del_ajuste_por_indice(
                  v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x)
               IS DISTINCT FROM pr.indice)
    RETURNING pr.id
  )
  SELECT count(*) INTO sin_efecto FROM vencidas;

  -- Las que todavía no tienen precio no se ajustan.
  FOR v IN
    SELECT p.id, p.servicio_id, p.vigente_desde, p.precio_final, p.precio_lista_snapshot, p.moneda,
           p.precio_turno_guardia_adicional, p.precio_hora_adicional,
           x.indice, x.meses, x.ajuste
      FROM public.prestaciones p
      LEFT JOIN public.condiciones_comerciales_servicio c ON c.servicio_id = p.servicio_id
     CROSS JOIN LATERAL interno.condiciones_del_ajuste_por_indice(
           v_regla, c.indice_de_actualizacion, c.meses_entre_actualizaciones, c.ajuste_por_indice) x
     WHERE p.prestadora_id = v_prest
       AND p.estado = 'vigente'
       AND p.vigente_hasta IS NULL
       AND p.servicio_id IS NOT NULL
       AND p.vigente_desde <= interno.hoy_de_la_prestadora(v_prest)
       AND p.forma_de_precio IS NOT NULL
       AND p.precio_final > 0
       AND x.indice IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                        WHERE pr.prestacion_id = p.id AND pr.estado = 'pendiente')
     ORDER BY p.id
  LOOP
    SELECT greatest(date_trunc('month', v.vigente_desde)::date, max(pr.rige_desde))
      INTO v_ancla
      FROM public.propuestas_de_ajuste_por_indice pr
     WHERE pr.prestacion_id = v.id AND pr.estado = 'rechazada';

    v_rige := (v_ancla + make_interval(months => v.meses))::date;
    CONTINUE WHEN interno.hoy_de_la_prestadora(v_prest) < v_rige;

    v_base := (date_trunc('month', v.vigente_desde) - interval '1 month')::date;
    v_nuevo := (v_rige - interval '1 month')::date;

    v_factor := interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_nuevo)
              / NULLIF(interno.valor_del_indice_de_la_prestadora(v_prest, v.indice, v_base), 0);
    CONTINUE WHEN v_factor IS NULL;

    v_precio := round(v.precio_final * v_factor, 2);
    CONTINUE WHEN v_precio = v.precio_final;

    -- Ya hubo un ajuste para ese mes (rechazado, por ejemplo): no se vuelve a proponer.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.propuestas_de_ajuste_por_indice pr
                           WHERE pr.prestacion_id = v.id AND pr.rige_desde = v_rige
                             AND pr.estado <> 'sin_efecto');

    IF v.ajuste = 'automatico' THEN
      v_nueva := interno.copiar_renglon('public.prestaciones', v.id, jsonb_build_object(
        'precio_final', v_precio,
        'precio_lista_snapshot', CASE WHEN v.precio_lista_snapshot IS NULL THEN NULL
                                      ELSE round(v.precio_lista_snapshot * v_factor, 2) END,
        'precio_turno_guardia_adicional', CASE WHEN v.precio_turno_guardia_adicional IS NULL THEN NULL
                                         ELSE round(v.precio_turno_guardia_adicional * v_factor, 2) END,
        'precio_hora_adicional', CASE WHEN v.precio_hora_adicional IS NULL THEN NULL
                                      ELSE round(v.precio_hora_adicional * v_factor, 2) END,
        'vigente_desde', v_rige,
        'vigente_hasta', NULL,
        'requiere_revision', false,
        'prestacion_anterior_id', v.id
      ));

      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde, estado, prestacion_nueva_id)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige, 'aplicada', v_nueva)
      RETURNING id INTO v_propuesta;

      INSERT INTO public.registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
      VALUES (v_prest, NULL, 'ajuste_por_indice_aplicado', 'propuestas_de_ajuste_por_indice', v_propuesta,
              jsonb_build_object('prestacion_id', v.id, 'prestacion_nueva_id', v_nueva,
                                 'servicio_id', v.servicio_id, 'indice', v.indice,
                                 'precio_anterior', v.precio_final, 'precio_nuevo', v_precio,
                                 'moneda', v.moneda, 'rige_desde', v_rige));
      aplicados := aplicados + 1;
    ELSE
      INSERT INTO public.propuestas_de_ajuste_por_indice (
        prestadora_id, prestacion_id, servicio_id, indice, periodo_base, periodo_nuevo,
        precio_actual, precio_propuesto, moneda, rige_desde)
      VALUES (v_prest, v.id, v.servicio_id, v.indice, v_base, v_nuevo,
              v.precio_final, v_precio, v.moneda, v_rige);
      propuestos := propuestos + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$function$;

-- 12. Los saldos de los Clientes son del estado de cuenta, no de la facturación.
-- Hasta ahora la vista de saldos se consultaba con los permisos de quien preguntaba y leía las
-- facturas, los cobros y las correcciones. Con la facturación reservada al permiso nuevo, quien
-- tiene sólo el estado de cuenta se quedaba sin saldos. La cuenta pasa a una vista interna, que
-- no se publica y lee las tres tablas por su cuenta. La vista publicada filtra ella misma: la
-- Prestadora de la sesión con el permiso de facturación o el de estado de cuenta, o el Cliente
-- autorizado a ver la plata, sobre sus propias facturas.
CREATE VIEW interno.saldos_de_las_facturas AS
SELECT f.id AS factura_id,
       f.prestadora_id,
       f.cliente_id,
       f.periodo,
       f.moneda,
       f.monto_total,
       f.monto_facturado,
       f.comprobante_tipo,
       f.comprobante_numero,
       f.facturado_at,
       co.neto AS correcciones_neto,
       co.correcciones_contadas,
       (COALESCE(f.monto_facturado, f.monto_total, 0) + co.neto)::numeric(12, 2)::numeric AS monto_a_cobrar,
       r.cobrado,
       (COALESCE(f.monto_facturado, f.monto_total, 0) + co.neto - r.cobrado)::numeric(12, 2) AS saldo,
       public.estado_de_factura(f.prestadora_id,
                                (COALESCE(f.monto_facturado, f.monto_total, 0) + co.neto)::numeric(12, 2),
                                r.cobrado, f.fecha_vencimiento) AS estado,
       f.estado AS estado_guardado,
       f.fecha_emision,
       f.fecha_vencimiento,
       r.cobros_contados,
       r.ultimo_cobro_fecha,
       r.origenes,
       f.updated_at AS actualizado_en,
       f.servicio_id,
       f.periodo_hasta
  FROM public.facturas_cliente f
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(c.monto), 0)::numeric(12, 2)::numeric AS cobrado,
           COUNT(*)::integer AS cobros_contados,
           MAX(c.fecha_cobro) AS ultimo_cobro_fecha,
           COALESCE(ARRAY_AGG(DISTINCT c.origen ORDER BY c.origen), ARRAY[]::text[]) AS origenes
      FROM public.cobros_cliente c
     WHERE c.factura_id = f.id AND c.estado = 'registrado') r
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(CASE WHEN k.sentido = 'resta' THEN -k.monto ELSE k.monto END), 0)::numeric(12, 2)::numeric AS neto,
           COUNT(*)::integer AS correcciones_contadas
      FROM public.correcciones_factura_cliente k
     WHERE k.factura_id = f.id) co;

ALTER VIEW interno.saldos_de_las_facturas OWNER TO postgres;
REVOKE ALL ON interno.saldos_de_las_facturas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON interno.saldos_de_las_facturas TO service_role;
COMMENT ON VIEW interno.saldos_de_las_facturas IS
  'La cuenta del saldo de cada factura, sin filtro. No se publica: la leen la vista de saldos y las funciones de la base.';

CREATE OR REPLACE FUNCTION interno.ve_el_estado_de_cuenta()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_personal_de_la_prestadora() AND interno.tiene_permiso('ver_estado_de_cuenta_cliente');
$function$;
REVOKE ALL ON FUNCTION interno.ve_el_estado_de_cuenta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.ve_el_estado_de_cuenta() TO authenticated, service_role;
COMMENT ON FUNCTION interno.ve_el_estado_de_cuenta() IS
  'Si quien inició sesión es personal de la Prestadora y tiene el permiso de ver el estado de cuenta de los Clientes. La administración lo tiene siempre.';

CREATE OR REPLACE VIEW public.saldos_cliente AS
SELECT s.*
  FROM interno.saldos_de_las_facturas s
 WHERE (s.prestadora_id = interno.prestadora_actual()
        AND (interno.gestiona_la_facturacion() OR interno.ve_el_estado_de_cuenta()))
    OR (s.cliente_id = interno.cliente_id_de_usuario(auth.uid())
        AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero'));

ALTER VIEW public.saldos_cliente RESET (security_invoker);
ALTER VIEW public.saldos_cliente SET (security_barrier = true);
ALTER VIEW public.saldos_cliente OWNER TO postgres;
REVOKE ALL ON public.saldos_cliente FROM PUBLIC, anon;
GRANT SELECT ON public.saldos_cliente TO authenticated;
GRANT ALL ON public.saldos_cliente TO service_role;

-- El aviso de deuda al dar de baja un Servicio lee la cuenta sin filtro, como leía hasta ahora:
-- la baja la puede hacer quien no ve el estado de cuenta, y el aviso igual tiene que salir.
CREATE OR REPLACE FUNCTION interno.anotar_deuda_de_la_baja(p_baja uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_baja bajas_de_servicio%ROWTYPE;
  v_servicio servicios%ROWTYPE;
  v_responsables uuid[];
  v_contratante uuid;
  v_la_lleva_otro boolean;
  v_anotados integer;
BEGIN
  SELECT * INTO v_baja FROM bajas_de_servicio
   WHERE id = p_baja AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM configuracion_notificaciones
              WHERE prestadora_id = v_baja.prestadora_id
                AND evento = 'baja_servicio_con_deuda'
                AND activo = false) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_servicio FROM servicios WHERE id = v_baja.servicio_id;

  SELECT coalesce(
           (SELECT cc.contratante_persona_id
              FROM condiciones_comerciales_servicio cc
             WHERE cc.servicio_id = v_servicio.id AND cc.prestadora_id = v_baja.prestadora_id),
           (SELECT c.contratante_persona_id
              FROM clientes c
             WHERE c.id = v_servicio.cliente_id AND c.prestadora_id = v_baja.prestadora_id))
    INTO v_contratante;

  v_responsables := ARRAY(SELECT interno.responsables_de_pagos_en(v_servicio.id, interno.hoy_de_la_prestadora(v_baja.prestadora_id)));

  SELECT coalesce((regla ->> 'sigue_la_cobranza')::boolean, true) = false INTO v_la_lleva_otro
    FROM configuracion_facturacion_clientes
   WHERE prestadora_id = v_baja.prestadora_id;

  INSERT INTO avisos_baja_servicio_con_deuda
    (prestadora_id, servicio_id, baja_id, cliente_id, responsables_de_pagos_persona_ids,
     contratante_persona_id, importe, moneda, dias_de_atraso)
  SELECT v_baja.prestadora_id, v_servicio.id, v_baja.id, v_servicio.cliente_id,
         v_responsables, v_contratante,
         d.importe, d.moneda, d.dias_de_atraso
    FROM (
      SELECT e.saldo AS importe, e.moneda, e.dias_de_atraso
        FROM estado_de_cuenta_externo_vigente e
       WHERE coalesce(v_la_lleva_otro, false)
         AND e.prestadora_id = v_baja.prestadora_id
         AND e.cliente_id = v_servicio.cliente_id
      UNION ALL
      SELECT sum(s.saldo), s.moneda,
             coalesce(interno.hoy_de_la_prestadora(v_baja.prestadora_id) - min(s.fecha_vencimiento) FILTER (WHERE s.fecha_vencimiento < interno.hoy_de_la_prestadora(v_baja.prestadora_id)), 0)
        FROM interno.saldos_de_las_facturas s
       WHERE NOT coalesce(v_la_lleva_otro, false)
         AND s.prestadora_id = v_baja.prestadora_id
         AND s.cliente_id = v_servicio.cliente_id
         AND s.saldo > 0
       GROUP BY s.moneda
    ) d
   WHERE d.importe > 0
  ON CONFLICT (baja_id, moneda) DO NOTHING;

  GET DIAGNOSTICS v_anotados = ROW_COUNT;
  RETURN v_anotados;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
