-- Los accesos de las personas autorizadas los pide el titular por escrito, y la Prestadora los ejecuta.
--
-- QUÉ PASABA HASTA ACÁ. Cualquier persona anotada en las personas autorizadas de un Cliente veía exactamente
-- lo mismo que el titular: reportes, medicación, patologías, la agenda, el mapa en vivo, la cuota
-- y el código para pagar. Las dos únicas diferencias eran que no podía calificar al Asistente ni
-- pedir medicación. No había forma de darle menos a uno que a otro, y la tabla de las personas autorizadas admitía
-- un solo rol —`solo_lectura`— por una restricción que hacía imposible guardar cualquier otra cosa.
--
-- QUÉ SE DECIDIÓ (Desarrollador, 2026-09-08). El titular le dice a la Prestadora quién entra a su
-- personas autorizadas y qué puede ver cada uno; la Prestadora lo carga; el sistema arma el documento con esa
-- configuración escrita en castellano y el titular lo firma —en papel o confirmándolo desde su
-- aplicación—. El titular no configura por su cuenta: pide y firma. Así, el día que alguien diga
-- «yo nunca autoricé eso», está la instrucción con nombre, fecha y firma, adentro del sistema y no
-- en un cajón.
--
-- POR QUÉ NO ES UNA PANTALLA DE CONFIGURACIÓN PARA LA CLIENTE. Se evaluó y se descartó el mismo
-- día: una pantalla donde el titular reparte accesos no deja constancia de nada fuera del sistema,
-- y abre una consola de administración adentro de una aplicación pensada para mirar cómo está la
-- persona cuidada. Quien vuelva a proponerlo tiene que contestar antes esa objeción.
--
-- QUÉ ES CADA COSA DE LAS QUE SE CREAN ACÁ:
--
--   instrucciones_acceso_personas_autorizadas  → la constancia. Quién la dio, quién la cargó, cuándo, el texto
--                                   completo del documento y su huella, y cómo se cerró.
--   permisos_personas_autorizadas     → el estado vigente. Qué puede ver hoy cada persona de las personas autorizadas.
--                                   Cuelga de la instrucción que lo produjo.
--   interno.persona_autorizada_puede         → la única pregunta, para que el motor y las políticas no puedan
--                                   contestar cosas distintas.
--
-- LOS DOS ESTADOS NO SON EL MISMO. Los permisos rigen desde que la Prestadora los carga; la
-- instrucción puede quedar pendiente de firma. Es a propósito: una separación o una pelea familiar
-- necesitan cortar un acceso en el acto, y si el sistema exigiera la firma primero, eso se
-- resolvería por afuera del sistema, que es peor.
--
-- DÓNDE VIVE LA LISTA DE QUÉ SE PUEDE DAR. En `backend/src/utils/catalogoPersonasAutorizadas.js`, igual
-- que la lista de interruptores de la Prestadora vive en `catalogoVisibilidad.js`. Acá no se
-- guarda: la lista describe lo que el producto sabe hacer —la escribe CeltaTech y cambia con cada
-- versión—, no una decisión de nadie. La base guarda únicamente lo decidido.
--
-- Y POR ESO ESTA REGLA, QUE NO ES OPCIONAL: toda clave nueva que una política vaya a mirar se
-- rellena, para los miembros que ya existen, en la misma migración que escribe esa política. La
-- función de abajo niega cuando no encuentra fila —falla cerrado, como manda CLAUDE.md §5—, así que
-- una clave mirada por una política y sin rellenar apagaría esa función para todo el mundo.

-- ============================================================================
-- 0. Quién, del lado del Panel, puede tocar todo esto
-- ============================================================================

-- La misma condición la necesitan las dos tablas de abajo y el depósito de los papeles firmados:
-- cuatro lugares. Se escribe una sola vez, como manda la regla del punto único de verdad, y las
-- políticas la llaman.
--
-- El Superadmin entra por `es_superadmin()`, que además exige el segundo factor cuando la
-- plataforma lo tiene activado, y no por la puerta de al lado, que no lo exige. El Admin y el
-- Coordinador entran por `tiene_permiso`, que para el Admin siempre dice que sí y para el
-- Coordinador consulta lo que configuró su Prestadora.
CREATE OR REPLACE FUNCTION interno.puede_configurar_accesos_del_personas_autorizadas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
  SELECT interno.es_superadmin()
      OR (
        EXISTS (
          SELECT 1 FROM usuarios u
           WHERE u.id = auth.uid()
             AND u.rol IN ('admin_prestadora', 'coordinador')
        )
        AND interno.tiene_permiso('configurar_accesos_del_personas_autorizadas')
      )
$function$;

REVOKE ALL ON FUNCTION interno.puede_configurar_accesos_del_personas_autorizadas() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.puede_configurar_accesos_del_personas_autorizadas() FROM anon;
GRANT EXECUTE ON FUNCTION interno.puede_configurar_accesos_del_personas_autorizadas() TO authenticated;
GRANT EXECUTE ON FUNCTION interno.puede_configurar_accesos_del_personas_autorizadas() TO service_role;

-- ============================================================================
-- 1. La constancia
-- ============================================================================

CREATE TABLE public.instrucciones_acceso_personas_autorizadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,

  -- Quién dio la instrucción y quién la cargó. Son dos personas distintas y las dos importan: el
  -- titular pidió, alguien de la Prestadora ejecutó, y si mañana se discute hay que poder decir
  -- los dos nombres.
  dada_por uuid NOT NULL REFERENCES public.usuarios(id),
  cargada_por uuid NOT NULL REFERENCES public.usuarios(id),

  -- El documento tal cual se generó, y su huella. La huella es lo que convierte «confirmó» en
  -- prueba: sin ella el registro dice que el titular aceptó y no dice QUÉ aceptó, y cualquiera
  -- puede sostener después que el texto era otro. Si alguien le mueve una coma, no coincide.
  documento_texto text NOT NULL,
  documento_huella text NOT NULL,
  documento_idioma text NOT NULL,

  -- `pendiente_firma` es un estado normal, no un error: los permisos ya rigen. Ver arriba.
  estado text NOT NULL DEFAULT 'pendiente_firma'
    CHECK (estado IN ('pendiente_firma', 'cerrada', 'anulada')),
  cerrada_como text
    CHECK (cerrada_como IN ('confirmada_en_la_app', 'papel_firmado')),
  cerrada_en timestamptz,
  -- Con qué aparato confirmó, para poder reconstruir el acto. Nunca la dirección de red ni ningún
  -- otro dato que no haga falta para eso (CLAUDE.md §6).
  cerrada_desde text,
  archivo_firmado_url text,

  -- El código de un solo uso que se le manda al titular cuando confirma desde la aplicación. Se
  -- guarda la huella del código, nunca el código. Mismo criterio que `mfa_codigos_recuperacion`.
  codigo_huella text,
  codigo_expira_en timestamptz,
  codigo_intentos integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Una instrucción pendiente por Cliente. Si llega una nueva antes de que se firme la anterior, la
-- anterior se anula: lo último que pidió el titular es lo que vale, y dos pendientes a la vez
-- dejarían al titular firmando algo que ya no es lo que rige.
CREATE UNIQUE INDEX instrucciones_acceso_personas autorizadas_una_pendiente_por_cliente
  ON public.instrucciones_acceso_personas_autorizadas (cliente_id)
  WHERE estado = 'pendiente_firma';

CREATE INDEX idx_instrucciones_acceso_personas autorizadas_cliente
  ON public.instrucciones_acceso_personas_autorizadas (cliente_id, created_at DESC);

ALTER TABLE public.instrucciones_acceso_personas_autorizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY panel_gestiona_instrucciones_acceso_personas_autorizadas ON public.instrucciones_acceso_personas_autorizadas
  FOR ALL
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  );

-- El titular lee la suya para poder leerla y firmarla. Nadie más de las personas autorizadas: la instrucción dice
-- qué se le dio y qué se le negó a cada uno, y eso es del titular.
CREATE POLICY titular_lee_sus_instrucciones_acceso_personas_autorizadas ON public.instrucciones_acceso_personas_autorizadas
  FOR SELECT
  USING (cliente_id = auth.uid());

CREATE TRIGGER trg_auditoria_soporte
  AFTER INSERT OR UPDATE OR DELETE ON public.instrucciones_acceso_personas_autorizadas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_soporte_mutacion();

-- ============================================================================
-- 2. El estado vigente
-- ============================================================================

CREATE TABLE public.permisos_personas_autorizadas (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  clave text NOT NULL,
  permitido boolean NOT NULL,
  -- De qué instrucción salió. Queda en nulo solamente en las filas que esta misma migración
  -- rellena para los miembros que ya existían: para ellos no hubo instrucción, y lo que se guarda
  -- es lo que regía antes de que esto existiera.
  instruccion_id uuid REFERENCES public.instrucciones_acceso_personas_autorizadas(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, usuario_id, clave)
);

CREATE INDEX idx_permisos_personas_autorizadas_usuario
  ON public.permisos_personas_autorizadas (usuario_id);

ALTER TABLE public.permisos_personas_autorizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY panel_gestiona_permisos_personas_autorizadas ON public.permisos_personas_autorizadas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes f
       WHERE f.id = permisos_personas_autorizadas.cliente_id
         AND f.prestadora_id = interno.current_tenant()
    )
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes f
       WHERE f.id = permisos_personas_autorizadas.cliente_id
         AND f.prestadora_id = interno.current_tenant()
    )
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  );

CREATE POLICY titular_lee_los_permisos_de_su_personas_autorizadas ON public.permisos_personas_autorizadas
  FOR SELECT
  USING (cliente_id = auth.uid());

-- Cada persona ve lo suyo. Sin esto, quien está en las personas autorizadas no puede saber por qué una pantalla
-- no le aparece, y la aplicación tendría que adivinarlo.
CREATE POLICY miembro_lee_sus_propios_permisos ON public.permisos_personas_autorizadas
  FOR SELECT
  USING (usuario_id = auth.uid());

CREATE TRIGGER trg_auditoria_soporte
  AFTER INSERT OR UPDATE OR DELETE ON public.permisos_personas_autorizadas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_soporte_mutacion();

-- ============================================================================
-- 3. La única pregunta
-- ============================================================================

-- Vive en `interno` y no en `public` porque no la llama ningún navegador: la usan las políticas de
-- acá abajo y el motor. Falla cerrado: sin fila, no.
--
-- El titular queda afuera de toda la cuenta. Él firmó la prestación y ve todo, siempre; no hay
-- instrucción que le pueda quitar nada, ni siquiera una suya.
CREATE OR REPLACE FUNCTION interno.persona_autorizada_puede(p_usuario uuid, p_clave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $function$
  SELECT CASE
    WHEN p_usuario IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM clientes f WHERE f.id = p_usuario) THEN true
    ELSE COALESCE(
      (SELECT p.permitido
         FROM permisos_personas_autorizadas p
        WHERE p.usuario_id = p_usuario
          AND p.clave = p_clave),
      false
    )
  END
$function$;

REVOKE ALL ON FUNCTION interno.persona_autorizada_puede(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.persona_autorizada_puede(uuid, text) FROM anon;
-- Conserva `authenticated` porque la llaman las políticas de abajo, y una política evalúa su
-- expresión con los permisos de quien consulta: sin esto no devolvería cero filas, fallaría.
GRANT EXECUTE ON FUNCTION interno.persona_autorizada_puede(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION interno.persona_autorizada_puede(uuid, text) TO service_role;

-- ============================================================================
-- 4. Se rellena lo que ya existe
-- ============================================================================

-- Los valores de fábrica son exactamente lo que pasa hoy, para que ninguna Cliente que ya usa el
-- sistema note un cambio el día que esto se publique: se ve todo, y las dos acciones de escritura
-- siguen apagadas. Es el mismo criterio de `catalogoVisibilidad.js`.
--
-- Esto es un relleno de una sola vez, con datos. La lista de claves sigue viviendo en el motor: acá
-- se escribe la que existe hoy porque las políticas de abajo la miran y la función falla cerrado.
INSERT INTO public.permisos_personas_autorizadas (cliente_id, usuario_id, clave, permitido)
SELECT m.cliente_id, m.usuario_id, c.clave, c.permitido
  FROM public.miembros_cliente m
 CROSS JOIN (VALUES
   ('persona_autorizada_reportes', true),
   ('persona_autorizada_ficha_del_paciente', true),
   ('persona_autorizada_medicacion', true),
   ('persona_autorizada_guardias', true),
   ('persona_autorizada_ubicacion_en_vivo', true),
   ('persona_autorizada_alertas', true),
   ('persona_autorizada_internaciones', true),
   ('persona_autorizada_dinero', true),
   ('persona_autorizada_verifica_con_codigo', true),
   ('persona_autorizada_califica_al_asistente', false),
   ('persona_autorizada_pide_medicacion', false)
 ) AS c(clave, permitido)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. El rol de las personas autorizadas deja de existir
-- ============================================================================

-- Con accesos por persona, `rol` no significaría nada: quedarían dos verdades para la misma
-- decisión, que es justo lo que prohíbe la regla del punto único de verdad. Los atajos de la
-- pantalla —«darle todo», «sólo mirar»— escriben filas de accesos, no un segundo dato.
ALTER TABLE public.miembros_cliente DROP CONSTRAINT IF EXISTS miembros_cliente_rol_check;
ALTER TABLE public.miembros_cliente DROP COLUMN IF EXISTS rol;

-- ============================================================================
-- 6. Quién puede cargar la instrucción lo decide cada Prestadora
-- ============================================================================

-- El producto no elige el reparto de trabajo adentro de una Prestadora: lo pone en el catálogo y
-- cada una lo configura en Configuración › Accesos. Lo único que decide CeltaTech es el valor de
-- fábrica, y viene en «sólo Admin» porque repartir acceso a la información de salud de una persona
-- se parece más a dar de alta un Cliente que a corregir un teléfono. Abrirlo al Coordinador es un
-- clic.
INSERT INTO public.catalogo_acciones_permisos (accion, default_solo_admin, orden)
SELECT 'configurar_accesos_del_personas_autorizadas', true, 10
 WHERE NOT EXISTS (
   SELECT 1 FROM public.catalogo_acciones_permisos WHERE accion = 'configurar_accesos_del_personas_autorizadas'
 );

-- ============================================================================
-- 7. Las políticas preguntan lo mismo que el motor
-- ============================================================================

-- Cuatro tablas decían «sólo el titular» mientras el motor dejaba pasar a todo las personas autorizadas. Las
-- cuatro pasan a preguntar por el acceso que corresponda. `interno.cliente_id_de_usuario` sigue
-- resolviendo de qué Cliente es quien entró; lo que se agrega es qué le dejaron ver.

DROP POLICY IF EXISTS cliente_ve_hospitalizaciones_de_su_paciente ON public.hospitalizaciones_paciente;
CREATE POLICY cliente_ve_hospitalizaciones_de_su_paciente ON public.hospitalizaciones_paciente
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = hospitalizaciones_paciente.paciente_id
         AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_internaciones')
  );

DROP POLICY IF EXISTS cliente_ve_su_qr_cobro ON public.qr_cobro_efectivo;
CREATE POLICY cliente_ve_su_qr_cobro ON public.qr_cobro_efectivo
  FOR SELECT
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

DROP POLICY IF EXISTS cliente_genera_su_qr_cobro ON public.qr_cobro_efectivo;
CREATE POLICY cliente_genera_su_qr_cobro ON public.qr_cobro_efectivo
  FOR INSERT
  WITH CHECK (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
    AND EXISTS (
      SELECT 1 FROM public.suscripciones_match s
       WHERE s.id = qr_cobro_efectivo.suscripcion_id
         AND s.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
  );

DROP POLICY IF EXISTS cliente_ve_su_suscripcion_match ON public.suscripciones_match;
CREATE POLICY cliente_ve_su_suscripcion_match ON public.suscripciones_match
  FOR SELECT
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

DROP POLICY IF EXISTS cliente_ve_sus_cobros_match ON public.cobros_match;
CREATE POLICY cliente_ve_sus_cobros_match ON public.cobros_match
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.suscripciones_match s
       WHERE s.id = cobros_match.suscripcion_id
         AND s.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

-- Y las que ya decían «toda el Cliente» ahora dicen además qué le dejaron ver a cada uno.

DROP POLICY IF EXISTS cliente_ve_reportes_de_sus_pacientes ON public.reportes;
CREATE POLICY cliente_ve_reportes_de_sus_pacientes ON public.reportes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = reportes.paciente_id
         AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_reportes')
  );

DROP POLICY IF EXISTS cliente_ve_alertas_de_sus_pacientes ON public.alertas;
CREATE POLICY cliente_ve_alertas_de_sus_pacientes ON public.alertas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = alertas.paciente_id
         AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_alertas')
  );

DROP POLICY IF EXISTS cliente_ve_guardias_de_sus_pacientes ON public.guardias;
CREATE POLICY cliente_ve_guardias_de_sus_pacientes ON public.guardias
  FOR SELECT
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id IN (SELECT interno.pacientes_de_la_guardia(guardias.id))
         AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_guardias')
  );

DROP POLICY IF EXISTS cliente_lee_indicaciones_de_sus_pacientes ON public.indicaciones_medicacion;
CREATE POLICY cliente_lee_indicaciones_de_sus_pacientes ON public.indicaciones_medicacion
  FOR SELECT
  USING (
    prestadora_id = interno.current_tenant()
    AND paciente_id IN (SELECT interno.pacientes_de_la_cliente())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_medicacion')
  );

DROP POLICY IF EXISTS cliente_carga_indicaciones_de_sus_pacientes ON public.indicaciones_medicacion;
CREATE POLICY cliente_carga_indicaciones_de_sus_pacientes ON public.indicaciones_medicacion
  FOR INSERT
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND paciente_id IN (SELECT interno.pacientes_de_la_cliente())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_pide_medicacion')
  );

DROP POLICY IF EXISTS cliente_ve_sus_facturas ON public.facturas_cliente;
CREATE POLICY cliente_ve_sus_facturas ON public.facturas_cliente
  FOR SELECT
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

DROP POLICY IF EXISTS cliente_ve_items_de_sus_facturas ON public.facturas_cliente_items;
CREATE POLICY cliente_ve_items_de_sus_facturas ON public.facturas_cliente_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facturas_cliente f
       WHERE f.id = facturas_cliente_items.factura_id
         AND f.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

DROP POLICY IF EXISTS cliente_ve_sus_cobros ON public.cobros_cliente;
CREATE POLICY cliente_ve_sus_cobros ON public.cobros_cliente
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facturas_cliente f
       WHERE f.id = cobros_cliente.factura_id
         AND f.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

-- La calificación se lee siempre y se escribe según lo que se le haya dado a cada uno. Es la
-- única de todas donde las dos mitades dicen cosas distintas, y es a propósito: quien no puede
-- calificar igual tiene que poder ver lo que ya se calificó, o la pantalla le queda vacía sin
-- ninguna explicación.
DROP POLICY IF EXISTS cliente_gestiona_sus_calificaciones ON public.calificaciones_asistente;
CREATE POLICY cliente_gestiona_sus_calificaciones ON public.calificaciones_asistente
  FOR ALL
  USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id = calificaciones_asistente.paciente_id
         AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid())
    )
  )
  WITH CHECK (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_califica_al_asistente')
  );

-- Tres claves no aparecen en ninguna política, y no es un olvido. `persona_autorizada_ficha_del_paciente`
-- decide qué columnas de la ficha se mandan, no si la fila existe: negar la fila entera sacaría al
-- Paciente de la lista y dejaría a esa persona con una aplicación vacía. `persona_autorizada_ubicacion_en_vivo`
-- y `persona_autorizada_verifica_con_codigo` no son tablas: son la posición que llega mientras la Guardia
-- ocurre y el cotejo del código del Asistente. Las tres las hace cumplir el motor, que es la
-- puerta; acá está la segunda red, y una red no puede atajar lo que no pasa por ella.

-- ============================================================================
-- 8. Se van tres políticas que no decidían nada
-- ============================================================================

-- Postgres suma las políticas permisivas: alcanza con que una deje pasar. Estas tres decían «sólo
-- el titular» sobre tablas donde otra política más ancha ya dejaba pasar a todo las personas autorizadas, así que
-- no cortaban nada y hacían creer que sí. Lo que cada una intentaba decir ahora lo dice la política
-- que quedó, con el acceso de las personas autorizadas adentro.
DROP POLICY IF EXISTS cliente_crea_su_calificacion ON public.calificaciones_asistente;
DROP POLICY IF EXISTS cliente_ve_sus_facturas_items ON public.facturas_cliente_items;

DROP POLICY IF EXISTS prestadora_ve_calificaciones ON public.calificaciones_asistente;
CREATE POLICY prestadora_ve_calificaciones ON public.calificaciones_asistente
  FOR SELECT
  USING (
    prestadora_id = interno.current_tenant()
    OR asistente_id = auth.uid()
  );

-- ============================================================================
-- 9. Dónde se guarda el papel firmado
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
SELECT 'instrucciones-acceso-personas autorizadas', 'instrucciones-acceso-personas autorizadas', false
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'instrucciones-acceso-personas autorizadas');

-- La ruta empieza por la Organización y sigue por el Cliente, y las políticas lo exigen:
-- <prestadora_id>/<cliente_id>/<instruccion_id>.<extensión>
CREATE POLICY instrucciones_personas autorizadas_panel_sube ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'instrucciones-acceso-personas autorizadas'
    AND (storage.foldername(name))[1] = (interno.current_tenant())::text
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  );

CREATE POLICY instrucciones_personas autorizadas_panel_lee ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'instrucciones-acceso-personas autorizadas'
    AND (storage.foldername(name))[1] = (interno.current_tenant())::text
    AND interno.puede_configurar_accesos_del_personas_autorizadas()
  );

-- El titular lee el suyo: la carpeta del medio es el identificador de su Cliente, que es el mismo
-- que el suyo.
CREATE POLICY instrucciones_personas autorizadas_titular_lee ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'instrucciones-acceso-personas autorizadas'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

NOTIFY pgrst, 'reload schema';
