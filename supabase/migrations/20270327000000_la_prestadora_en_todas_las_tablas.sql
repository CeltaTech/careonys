-- Toda tabla con datos de una Prestadora dice de cuál es.
--
-- Siete tablas lo sabían sólo por su fila madre, y una lo decía con dos columnas. Así no se las
-- puede copiar de a una Prestadora por vez sin recorrer la madre, y la copia de respaldo tiene que
-- poder pedir «lo de esta Prestadora» tabla por tabla, con el mismo filtro en todas.
--
-- La columna se completa sola con `interno.prestadora_actual()`, la misma que usan las políticas.
-- La clave foránea doble —madre y Prestadora juntas— hace que no pueda quedar distinta de la de la
-- madre: si no coinciden, la base rechaza la fila. No hace falta ningún disparador.

-- Las madres ofrecen el par para que las hijas lo citen.
CREATE UNIQUE INDEX clientes_id_y_prestadora ON public.clientes (id, prestadora_id);
CREATE UNIQUE INDEX usuarios_id_y_prestadora ON public.usuarios (id, prestadora_id);
CREATE UNIQUE INDEX asistentes_id_y_prestadora ON public.asistentes (id, prestadora_id);
CREATE UNIQUE INDEX liquidaciones_asistente_id_y_prestadora ON public.liquidaciones_asistente (id, prestadora_id);
CREATE UNIQUE INDEX accesos_intermediacion_id_y_prestadora ON public.accesos_intermediacion (id, prestadora_id);

-- liquidaciones_asistente_items ← liquidaciones_asistente
ALTER TABLE public.liquidaciones_asistente_items ADD COLUMN prestadora_id uuid;
UPDATE public.liquidaciones_asistente_items h SET prestadora_id = m.prestadora_id
  FROM public.liquidaciones_asistente m WHERE m.id = h.liquidacion_id;
ALTER TABLE public.liquidaciones_asistente_items
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT liquidaciones_asistente_items_prestadora_de_la_liquidacion
    FOREIGN KEY (liquidacion_id, prestadora_id) REFERENCES public.liquidaciones_asistente (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX liquidaciones_asistente_items_prestadora ON public.liquidaciones_asistente_items (prestadora_id);

-- permisos_personas_autorizadas ← clientes
ALTER TABLE public.permisos_personas_autorizadas ADD COLUMN prestadora_id uuid;
UPDATE public.permisos_personas_autorizadas h SET prestadora_id = m.prestadora_id
  FROM public.clientes m WHERE m.id = h.cliente_id;
ALTER TABLE public.permisos_personas_autorizadas
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT permisos_personas_autorizadas_de_la_prestadora_del_cliente
    FOREIGN KEY (cliente_id, prestadora_id) REFERENCES public.clientes (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX permisos_personas_autorizadas_prestadora ON public.permisos_personas_autorizadas (prestadora_id);

-- personas_autorizadas ← clientes
ALTER TABLE public.personas_autorizadas ADD COLUMN prestadora_id uuid;
UPDATE public.personas_autorizadas h SET prestadora_id = m.prestadora_id
  FROM public.clientes m WHERE m.id = h.cliente_id;
ALTER TABLE public.personas_autorizadas
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT personas_autorizadas_de_la_prestadora_del_cliente
    FOREIGN KEY (cliente_id, prestadora_id) REFERENCES public.clientes (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX personas_autorizadas_prestadora ON public.personas_autorizadas (prestadora_id);

-- qr_cobro_efectivo ← accesos_intermediacion
ALTER TABLE public.qr_cobro_efectivo ADD COLUMN prestadora_id uuid;
UPDATE public.qr_cobro_efectivo h SET prestadora_id = m.prestadora_id
  FROM public.accesos_intermediacion m WHERE m.id = h.acceso_id;
ALTER TABLE public.qr_cobro_efectivo
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT qr_cobro_efectivo_de_la_prestadora_del_acceso
    FOREIGN KEY (acceso_id, prestadora_id) REFERENCES public.accesos_intermediacion (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX qr_cobro_efectivo_prestadora ON public.qr_cobro_efectivo (prestadora_id);

-- tokens_activacion_cuenta ← usuarios
ALTER TABLE public.tokens_activacion_cuenta ADD COLUMN prestadora_id uuid;
UPDATE public.tokens_activacion_cuenta h SET prestadora_id = m.prestadora_id
  FROM public.usuarios m WHERE m.id = h.usuario_id;
ALTER TABLE public.tokens_activacion_cuenta
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT tokens_activacion_cuenta_de_la_prestadora_del_usuario
    FOREIGN KEY (usuario_id, prestadora_id) REFERENCES public.usuarios (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX tokens_activacion_cuenta_prestadora ON public.tokens_activacion_cuenta (prestadora_id);

-- tokens_recuperacion_clave ← usuarios
ALTER TABLE public.tokens_recuperacion_clave ADD COLUMN prestadora_id uuid;
UPDATE public.tokens_recuperacion_clave h SET prestadora_id = m.prestadora_id
  FROM public.usuarios m WHERE m.id = h.usuario_id;
ALTER TABLE public.tokens_recuperacion_clave
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT tokens_recuperacion_clave_de_la_prestadora_del_usuario
    FOREIGN KEY (usuario_id, prestadora_id) REFERENCES public.usuarios (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX tokens_recuperacion_clave_prestadora ON public.tokens_recuperacion_clave (prestadora_id);

-- verificaciones_asistente ← asistentes
ALTER TABLE public.verificaciones_asistente ADD COLUMN prestadora_id uuid;
UPDATE public.verificaciones_asistente h SET prestadora_id = m.prestadora_id
  FROM public.asistentes m WHERE m.id = h.asistente_id;
ALTER TABLE public.verificaciones_asistente
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT verificaciones_asistente_de_la_prestadora_del_asistente
    FOREIGN KEY (asistente_id, prestadora_id) REFERENCES public.asistentes (id, prestadora_id) ON DELETE CASCADE;
CREATE INDEX verificaciones_asistente_prestadora ON public.verificaciones_asistente (prestadora_id);

-- auditoria_cambio_dueno_push: el cambio de dueño de un teléfono ocurre siempre adentro de una
-- Prestadora, así que la anotación lleva una sola, como todas las tablas.
DROP POLICY admin_prestadora_lee_los_cambios_que_la_involucran ON public.auditoria_cambio_dueno_push;
DROP POLICY superadmin_lee_los_cambios_de_su_sesion_activa ON public.auditoria_cambio_dueno_push;
DROP POLICY trabajo_sin_persona_anota_cambio_de_dueno ON public.auditoria_cambio_dueno_push;

ALTER TABLE public.auditoria_cambio_dueno_push ADD COLUMN prestadora_id uuid;
UPDATE public.auditoria_cambio_dueno_push SET prestadora_id = prestadora_nueva;
ALTER TABLE public.auditoria_cambio_dueno_push
  ALTER COLUMN prestadora_id SET NOT NULL,
  ALTER COLUMN prestadora_id SET DEFAULT interno.prestadora_actual(),
  ADD CONSTRAINT auditoria_cambio_dueno_push_prestadora_id_fkey
    FOREIGN KEY (prestadora_id) REFERENCES public.prestadoras (id),
  DROP COLUMN prestadora_anterior,
  DROP COLUMN prestadora_nueva;
CREATE INDEX idx_auditoria_cambio_dueno_push_prestadora ON public.auditoria_cambio_dueno_push (prestadora_id, created_at DESC);
GRANT INSERT (prestadora_id) ON public.auditoria_cambio_dueno_push TO trabajo_sin_persona;

CREATE POLICY admin_prestadora_lee_los_cambios_de_su_prestadora ON public.auditoria_cambio_dueno_push
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.usuarios u
     WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora'
       AND u.prestadora_id = auditoria_cambio_dueno_push.prestadora_id));
CREATE POLICY superadmin_lee_los_cambios_de_su_sesion_activa ON public.auditoria_cambio_dueno_push
  FOR SELECT USING (interno.es_superadmin() AND prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_anota_cambio_de_dueno ON public.auditoria_cambio_dueno_push
  FOR INSERT TO trabajo_sin_persona WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
