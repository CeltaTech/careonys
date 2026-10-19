-- LA ENTRADA TÉCNICA SALE DE CAREONYS.
--
-- Careonys deja de tener una entrada propia para la cuenta técnica de CeltaTech. Se queda sólo la
-- cerradura: la tabla de los permisos de acceso, su auditoría y `prestadora_actual()`, que da
-- precedencia al permiso vigente. Abrir un permiso es de CeltaTech, desde su lado.
--
-- 1. La cuenta técnica ya no escribe sus permisos. Se cambia la política que la dejaba hacer todo
--    sobre los suyos por una que sólo la deja leerlos —el backend necesita encontrar el vigente con
--    la credencial de la persona—, y se le quitan a `authenticated` los permisos de tabla para
--    escribir. Cerrar el vencido y anotar la actividad lo hace el backend con la credencial del
--    trabajo de esa Prestadora, que ya tiene su política y sus permisos.
--
-- 2. `es_superadmin()` deja de mirar el segundo factor: el interruptor que lo pedía se va.
--
-- 3. Se van las piezas de la entrada propia, que no tienen datos: los códigos de recuperación por
--    correo, la tabla del interruptor, las dos frases del correo de recuperación y la función que
--    contaba los correos enviados para la pantalla de la cuenta técnica. Quedan guardadas en el
--    estante de CeltaTech (`Codigos-utiles`).

BEGIN;

-- Antes de borrar, que no haya nada que perder.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mfa_codigos_recuperacion) THEN
    RAISE EXCEPTION 'mfa_codigos_recuperacion tiene filas: no se borra';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.mfa_factors) THEN
    RAISE EXCEPTION 'hay segundos factores dados de alta: no se quita el interruptor';
  END IF;
END
$$;

-- 1. La cuenta técnica sólo lee sus permisos.
DROP POLICY superadmin_gestiona_su_propia_permiso_de_acceso ON public.permisos_de_acceso;

CREATE POLICY superadmin_lee_sus_permisos_de_acceso ON public.permisos_de_acceso
  FOR SELECT TO authenticated
  USING (admin_id = auth.uid() AND interno.es_superadmin());

REVOKE INSERT, UPDATE, DELETE ON public.permisos_de_acceso FROM authenticated;

-- 2. Superadmin es el rol, y nada más. CREATE OR REPLACE conserva los permisos de ejecución.
CREATE OR REPLACE FUNCTION interno.es_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'superadmin');
$$;

-- El mismo cuerpo, con el primer comentario dicho como es hoy.
CREATE OR REPLACE FUNCTION interno.prestadora_actual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, interno
AS $$
  SELECT COALESCE(
    -- 1. El permiso de acceso que CeltaTech abrió para esta cuenta, mientras está vigente. Tapa
    --    todo lo demás.
    (SELECT s.prestadora_id FROM permisos_de_acceso s
      WHERE s.admin_id = auth.uid()
        AND s.salida_at IS NULL
        AND s.expira_at > NOW()
        AND s.ultima_actividad_at > NOW() - INTERVAL '5 minutes'
      ORDER BY s.entrada_at DESC LIMIT 1),

    -- 2. La Prestadora de la cuenta con la que se entró. Es una sola: para trabajar en otra hay
    --    que salir de ésta y entrar allá, con la cuenta de allá.
    (SELECT prestadora_id FROM usuarios WHERE id = auth.uid()),

    -- 3. El trabajo sin persona: la Prestadora para la que el backend generó su credencial.
    (SELECT NULLIF(auth.jwt() ->> 'prestadora_id', '')::uuid
      WHERE auth.jwt() ->> 'role' = 'trabajo_sin_persona')
  )
$$;

-- 3. Las piezas de la entrada propia.
DROP FUNCTION public.correos_enviados_desde(timestamptz);
DROP TABLE public.mfa_codigos_recuperacion;
DROP TABLE public.configuracion_plataforma;

DELETE FROM public.mensajes_del_sistema
  WHERE prestadora_id IS NULL
    AND clave IN ('mfa_codigo_recuperacion.asunto', 'mfa_codigo_recuperacion.texto');

COMMIT;

NOTIFY pgrst, 'reload schema';
