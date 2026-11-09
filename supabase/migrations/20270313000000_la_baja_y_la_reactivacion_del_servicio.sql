-- La baja y la reactivación de un Servicio.
--
-- 1. Un Servicio con guardias asignadas no se da de baja: primero se cancelan o se reasignan. Una
--    serie encendida con un Asistente cuenta igual, porque son las guardias que vienen.
-- 2. La baja pasa por una Lista de comprobación que arma cada Prestadora: hasta que no se marcan
--    todos los renglones encendidos, no se confirma.
-- 3. Un Servicio dado de baja se puede reactivar, con un motivo elegido de la lista que configura
--    cada Prestadora.
-- 4. Si al dar de baja el Cliente debe algo, queda un aviso para quien ve el estado de cuenta. La
--    deuda no frena la baja. El aviso lo anota la baja misma, en la misma operación.
--
-- La baja y la reactivación se hacen sólo por las dos funciones de abajo, que corren con los
-- permisos de quien llama y dejan el registro en la misma operación. Un cambio de estado hecho por
-- una persona por cualquier otro camino lo rechaza la base.

-- ---------------------------------------------------------------------------------------------
-- Los dos catálogos de la Prestadora
-- ---------------------------------------------------------------------------------------------

CREATE TABLE public.lista_de_comprobacion_baja_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lista_de_comprobacion_baja_servicio_prestadora ON public.lista_de_comprobacion_baja_servicio (prestadora_id);
ALTER TABLE public.lista_de_comprobacion_baja_servicio ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.motivos_reactivacion_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  pide_detalle boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX motivos_reactivacion_servicio_prestadora ON public.motivos_reactivacion_servicio (prestadora_id);
ALTER TABLE public.motivos_reactivacion_servicio ENABLE ROW LEVEL SECURITY;

-- La administración los arma; el resto del Panel de la Prestadora los lee para poder usarlos.
CREATE POLICY administracion_gestiona_lista_de_comprobacion
  ON public.lista_de_comprobacion_baja_servicio TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()));
CREATE POLICY coordinador_lee_lista_de_comprobacion
  ON public.lista_de_comprobacion_baja_servicio FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_coordinador());

CREATE POLICY administracion_gestiona_motivos_reactivacion
  ON public.motivos_reactivacion_servicio TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()));
CREATE POLICY coordinador_lee_motivos_reactivacion
  ON public.motivos_reactivacion_servicio FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_coordinador());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lista_de_comprobacion_baja_servicio TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motivos_reactivacion_servicio TO authenticated;
REVOKE ALL ON public.lista_de_comprobacion_baja_servicio FROM anon;
REVOKE ALL ON public.motivos_reactivacion_servicio FROM anon;

-- ---------------------------------------------------------------------------------------------
-- El registro de cada baja y de cada reactivación
-- ---------------------------------------------------------------------------------------------

-- Lo que quedó escrito ese día no cambia aunque después se cambie el catálogo: por eso se guarda
-- el texto del motivo y de cada renglón marcado, no una referencia a la fila.
CREATE TABLE public.bajas_de_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  motivo_detalle text,
  comprobaciones text[] NOT NULL DEFAULT '{}',
  dada_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bajas_de_servicio_servicio ON public.bajas_de_servicio (servicio_id);
ALTER TABLE public.bajas_de_servicio ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reactivaciones_de_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  motivo_detalle text,
  reactivada_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reactivaciones_de_servicio_servicio ON public.reactivaciones_de_servicio (servicio_id);
ALTER TABLE public.reactivaciones_de_servicio ENABLE ROW LEVEL SECURITY;

-- Se ve si se ve el Servicio. Se escribe sólo a nombre propio y sólo quien puede cerrar Servicios;
-- no se corrige ni se borra.
CREATE POLICY se_ve_con_su_servicio
  ON public.bajas_de_servicio FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND EXISTS (SELECT 1 FROM public.servicios s WHERE s.id = servicio_id));
CREATE POLICY quien_puede_cerrar_la_anota
  ON public.bajas_de_servicio FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND dada_por = interno.usuario_de_la_sesion()
              AND (interno.es_admin_prestadora() OR interno.es_superadmin() OR interno.tiene_permiso('gestionar_servicios'))
              AND EXISTS (SELECT 1 FROM public.servicios s WHERE s.id = servicio_id AND s.prestadora_id = prestadora_id));
CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.bajas_de_servicio FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

CREATE POLICY se_ve_con_su_servicio
  ON public.reactivaciones_de_servicio FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND EXISTS (SELECT 1 FROM public.servicios s WHERE s.id = servicio_id));
CREATE POLICY quien_puede_cerrar_la_anota
  ON public.reactivaciones_de_servicio FOR INSERT TO authenticated
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND reactivada_por = interno.usuario_de_la_sesion()
              AND (interno.es_admin_prestadora() OR interno.es_superadmin() OR interno.tiene_permiso('gestionar_servicios'))
              AND EXISTS (SELECT 1 FROM public.servicios s WHERE s.id = servicio_id AND s.prestadora_id = prestadora_id));
CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.reactivaciones_de_servicio FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT, INSERT ON public.bajas_de_servicio TO authenticated;
GRANT SELECT, INSERT ON public.reactivaciones_de_servicio TO authenticated;
GRANT SELECT ON public.bajas_de_servicio TO trabajo_sin_persona;
GRANT SELECT ON public.reactivaciones_de_servicio TO trabajo_sin_persona;
REVOKE ALL ON public.bajas_de_servicio FROM anon;
REVOKE ALL ON public.reactivaciones_de_servicio FROM anon;

-- ---------------------------------------------------------------------------------------------
-- El aviso de la baja de un Servicio con deuda
-- ---------------------------------------------------------------------------------------------

-- Uno por moneda adeudada. La deuda es del Cliente: se le reclama al Responsable de pagos del
-- Servicio y el Contratante responde solidariamente, por eso el aviso lleva a los dos.
CREATE TABLE public.avisos_baja_servicio_con_deuda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  baja_id uuid NOT NULL REFERENCES public.bajas_de_servicio(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  responsable_de_pagos_persona_id uuid,
  contratante_persona_id uuid,
  importe numeric NOT NULL CHECK (importe > 0),
  moneda text NOT NULL,
  dias_de_atraso integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  visto_at timestamptz,
  visto_por uuid,
  UNIQUE (baja_id, moneda)
);
CREATE INDEX avisos_baja_servicio_con_deuda_pendientes
  ON public.avisos_baja_servicio_con_deuda (prestadora_id) WHERE visto_at IS NULL;
ALTER TABLE public.avisos_baja_servicio_con_deuda ENABLE ROW LEVEL SECURITY;

-- Lo ve y lo marca como visto sólo quien ve el estado de cuenta. Lo escribe el trabajo de la
-- Prestadora, que es quien conoce la deuda.
CREATE POLICY quien_ve_el_estado_de_cuenta_lo_lee
  ON public.avisos_baja_servicio_con_deuda FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora() OR interno.tiene_permiso('ver_estado_de_cuenta_cliente')));
CREATE POLICY quien_ve_el_estado_de_cuenta_lo_marca
  ON public.avisos_baja_servicio_con_deuda FOR UPDATE TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.es_admin_prestadora() OR interno.tiene_permiso('ver_estado_de_cuenta_cliente')))
  WITH CHECK (prestadora_id = interno.prestadora_actual()
              AND visto_por = interno.usuario_de_la_sesion());
CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.avisos_baja_servicio_con_deuda TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT ON public.avisos_baja_servicio_con_deuda TO authenticated;
GRANT UPDATE (visto_at, visto_por) ON public.avisos_baja_servicio_con_deuda TO authenticated;
GRANT SELECT, INSERT ON public.avisos_baja_servicio_con_deuda TO trabajo_sin_persona;
REVOKE ALL ON public.avisos_baja_servicio_con_deuda FROM anon;

-- Anota el aviso de una baja si el Cliente debe algo. Lo llama la baja, en la misma operación, y
-- con privilegio propio: quien da de baja puede no ver el estado de cuenta, y la deuda tiene que
-- quedar anotada igual. Sólo alcanza una baja de la Prestadora de la sesión.
--
-- La deuda sale de quien lleva la cobranza. Si la lleva otro software, es el último estado de
-- cuenta que informó, tal como llegó. Si la lleva Careonys, es lo que falta cobrar de sus
-- facturas, por moneda, y el atraso se cuenta desde el vencimiento impago más antiguo.
-- Con el aviso apagado en Configuración no se anota.
CREATE OR REPLACE FUNCTION interno.anotar_deuda_de_la_baja(p_baja uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_baja bajas_de_servicio%ROWTYPE;
  v_servicio servicios%ROWTYPE;
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

  SELECT coalesce((regla ->> 'sigue_la_cobranza')::boolean, true) = false INTO v_la_lleva_otro
    FROM configuracion_facturacion_clientes
   WHERE prestadora_id = v_baja.prestadora_id;

  INSERT INTO avisos_baja_servicio_con_deuda
    (prestadora_id, servicio_id, baja_id, cliente_id, responsable_de_pagos_persona_id,
     contratante_persona_id, importe, moneda, dias_de_atraso)
  SELECT v_baja.prestadora_id, v_servicio.id, v_baja.id, v_servicio.cliente_id,
         v_servicio.pagador_persona_id, v_servicio.contratante_persona_id,
         d.importe, d.moneda, d.dias_de_atraso
    FROM (
      SELECT e.saldo AS importe, e.moneda, e.dias_de_atraso
        FROM estado_de_cuenta_externo_vigente e
       WHERE coalesce(v_la_lleva_otro, false)
         AND e.prestadora_id = v_baja.prestadora_id
         AND e.cliente_id = v_servicio.cliente_id
      UNION ALL
      SELECT sum(s.saldo), s.moneda,
             coalesce(current_date - min(s.fecha_vencimiento) FILTER (WHERE s.fecha_vencimiento < current_date), 0)
        FROM saldos_cliente s
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
REVOKE ALL ON FUNCTION interno.anotar_deuda_de_la_baja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.anotar_deuda_de_la_baja(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cuántas guardias asignadas tiene un Servicio
-- ---------------------------------------------------------------------------------------------

-- Cuenta todas, también las que quien pregunta no ve: un Asistente de otra zona con una guardia
-- programada frena la baja igual. Contesta sólo un número, y sólo de un Servicio de la Prestadora
-- de la sesión.
CREATE OR REPLACE FUNCTION interno.guardias_asignadas_del_servicio(p_servicio uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT (
    (SELECT count(*) FROM guardias g
      WHERE g.servicio_id = p_servicio
        AND g.prestadora_id = interno.prestadora_actual()
        AND g.asistente_id IS NOT NULL
        AND g.estado IN ('programada', 'activa', 'pausada'))
    +
    (SELECT count(*) FROM series_guardias sg
      WHERE sg.servicio_id = p_servicio
        AND sg.prestadora_id = interno.prestadora_actual()
        AND sg.asistente_id IS NOT NULL
        AND sg.estado = 'activa')
  )::integer;
$function$;
REVOKE ALL ON FUNCTION interno.guardias_asignadas_del_servicio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.guardias_asignadas_del_servicio(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- El estado de un Servicio cambia sólo por la baja o la reactivación
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION interno.crear_y_cerrar_servicios_lo_hace_quien_puede()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_cambia_estado boolean := TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' OR v_cambia_estado)
     AND NOT (interno.es_admin_prestadora()
              OR interno.es_superadmin()
              OR interno.tiene_permiso('gestionar_servicios')) THEN
    RAISE EXCEPTION 'crear_y_cerrar_servicios_lo_hace_quien_puede';
  END IF;

  -- Una persona cambia el estado sólo por las dos funciones, que dejan el registro.
  IF v_cambia_estado
     AND COALESCE(current_setting('careonys.cambio_de_estado_del_servicio', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'el_estado_del_servicio_cambia_por_la_baja_o_la_reactivacion';
  END IF;

  IF v_cambia_estado AND NEW.estado = 'de_baja'
     AND interno.guardias_asignadas_del_servicio(NEW.id) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_guardias_asignadas';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Dar de baja y reactivar
-- ---------------------------------------------------------------------------------------------

-- Corre con los permisos de quien llama: la protección por fila decide qué Servicio alcanza.
-- Cierra lo que el Servicio tiene pactado —prestaciones, series y guardias sin Asistente— y lo
-- deja de baja, todo en una sola operación. Devuelve el registro de la baja.
CREATE OR REPLACE FUNCTION public.dar_de_baja_el_servicio(
  p_servicio uuid,
  p_motivo text,
  p_motivo_detalle text,
  p_comprobaciones uuid[]
)
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

  IF interno.guardias_asignadas_del_servicio(p_servicio) > 0 THEN
    RAISE EXCEPTION 'el_servicio_tiene_guardias_asignadas';
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

  -- La fecha de fin de cada prestación la pone la base al ver la baja.
  UPDATE prestaciones SET estado = 'de_baja'
   WHERE servicio_id = p_servicio AND estado = 'vigente';
  UPDATE series_guardias
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelado_at = now()
   WHERE servicio_id = p_servicio AND estado = 'activa';
  UPDATE guardias
     SET estado = 'cancelada', cancelacion_origen = 'prestadora', cancelacion_alcance = 'total'
   WHERE servicio_id = p_servicio AND estado = 'programada' AND asistente_id IS NULL;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios SET estado = 'de_baja' WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  PERFORM interno.anotar_deuda_de_la_baja(v_baja);

  RETURN v_baja;
END;
$function$;
REVOKE ALL ON FUNCTION public.dar_de_baja_el_servicio(uuid, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dar_de_baja_el_servicio(uuid, text, text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reactivar_el_servicio(
  p_servicio uuid,
  p_motivo uuid,
  p_motivo_detalle text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_servicio servicios%ROWTYPE;
  v_motivo motivos_reactivacion_servicio%ROWTYPE;
  v_reactivacion uuid;
BEGIN
  SELECT * INTO v_servicio FROM servicios
   WHERE id = p_servicio AND prestadora_id = interno.prestadora_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_inexistente';
  END IF;
  IF v_servicio.estado <> 'de_baja' THEN
    RAISE EXCEPTION 'el_servicio_esta_vigente';
  END IF;

  SELECT * INTO v_motivo FROM motivos_reactivacion_servicio m
   WHERE m.id = p_motivo AND m.prestadora_id = v_servicio.prestadora_id AND m.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo_de_reactivacion_inexistente';
  END IF;
  IF v_motivo.pide_detalle AND coalesce(btrim(p_motivo_detalle), '') = '' THEN
    RAISE EXCEPTION 'motivo_de_reactivacion_pide_detalle';
  END IF;

  INSERT INTO reactivaciones_de_servicio (prestadora_id, servicio_id, motivo, motivo_detalle, reactivada_por)
  VALUES (v_servicio.prestadora_id, p_servicio, v_motivo.nombre,
          CASE WHEN v_motivo.pide_detalle THEN btrim(p_motivo_detalle) END,
          interno.usuario_de_la_sesion())
  RETURNING id INTO v_reactivacion;

  PERFORM set_config('careonys.cambio_de_estado_del_servicio', p_servicio::text, true);
  UPDATE servicios SET estado = 'vigente' WHERE id = p_servicio;
  PERFORM set_config('careonys.cambio_de_estado_del_servicio', '', true);

  RETURN v_reactivacion;
END;
$function$;
REVOKE ALL ON FUNCTION public.reactivar_el_servicio(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivar_el_servicio(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Las frases del aviso por WhatsApp
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.mensajes_del_sistema (clave, i18n, admite_texto_propio, activo) VALUES
  ('baja_servicio_con_deuda.asunto',
   '{"es-AR": "Baja de un Servicio con deuda", "en": "Cancellation of a Service with debt", "pt-BR": "Baixa de um Serviço com dívida"}'::jsonb,
   true, true),
  ('baja_servicio_con_deuda.texto',
   '{"es-AR": "{{servicio}}: {{importe}}, con {{dias}} días de atraso.", "en": "{{servicio}}: {{importe}}, {{dias}} days overdue.", "pt-BR": "{{servicio}}: {{importe}}, com {{dias}} dias de atraso."}'::jsonb,
   true, true),
  ('baja_servicio_con_deuda.texto_uno',
   '{"es-AR": "{{servicio}}: {{importe}}, con {{dias}} día de atraso.", "en": "{{servicio}}: {{importe}}, {{dias}} day overdue.", "pt-BR": "{{servicio}}: {{importe}}, com {{dias}} dia de atraso."}'::jsonb,
   true, true),
  ('baja_servicio_con_deuda.texto_sin_atraso',
   '{"es-AR": "{{servicio}}: {{importe}}.", "en": "{{servicio}}: {{importe}}.", "pt-BR": "{{servicio}}: {{importe}}."}'::jsonb,
   true, true);

NOTIFY pgrst, 'reload schema';
