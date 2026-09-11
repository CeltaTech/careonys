-- La Prestadora arma su forma de cobro, y lo que se guarda es el acceso
-- =====================================================================
--
-- QUÉ ESTABA MAL. `suscripciones_match` traía una sola manera de cobrar escrita en su
-- forma: importe mensual obligatorio, período de prueba obligatorio que termina en una fecha, y
-- una fecha de próximo cobro como única manera de vencer. Eso es una política de comercialización
-- adentro del esquema, y la política es un dato de cada Prestadora (`celtatech/CLAUDE.md`, «nunca
-- hardcodear … ni reglas operativas o comerciales»). El diseño está en
-- `docs/PRD_07_Modalidad_Match.md` §3.
--
-- LAS PIEZAS, NO LOS TIPOS. `formas_de_cobro_match` no lleva una columna que diga «esto es
-- una suscripción» o «esto es un paquete». Lleva las piezas sueltas —qué se cobra, cada cuánto,
-- con qué período gratuito, con qué saldo, si se renueva sola— y la forma sale de cómo se
-- combinen. Una suscripción mensual es importe + cada 1 mes + renueva sola. Un paquete de cinco
-- contactos es importe + una sola vez + saldo 5. Cualquier otra combinación es la forma propia de
-- esa Prestadora, y entra sin migración.
--
-- Y EL ACCESO DEJA DE LLAMARSE SUSCRIPCIÓN. La tabla guarda lo que habilita —el acceso a los
-- datos de contacto—, no una manera de pagarlo, así que pasa a `accesos_match`. El acceso
-- termina por una fecha o por un saldo, los dos guardados, nunca por una cuenta hecha al vuelo
-- (§3.1 del PRD). Las tres tablas del cobro están vacías, comprobado contra la base el
-- 2026-09-11, así que el renombre no mueve un solo dato.
--
-- EL ESTADO `trial` SE VA. Nombraba un período gratuito, que es una de las piezas y no un estado:
-- un paquete no tiene prueba y una forma propia puede no tenerla. Ningún código decidía nada
-- distinto entre `trial` y `activa` —los dos lugares que los miraban los trataban igual—, así que
-- se juntan en `vigente`. Que el acceso esté todavía en su período gratuito se sabe mirando
-- `gratis_hasta`, que es donde vive el dato.

-- ---------------------------------------------------------------------------
-- 1. Las formas de cobro que arma cada Prestadora
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.formas_de_cobro_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id),

  -- El nombre que la Prestadora le pone y que el Cliente ve. Es texto de ella, no del producto:
  -- no se traduce y no sale de ningún catálogo.
  nombre text NOT NULL,

  -- Qué se cobra. La moneda la completa el disparador con la de la Prestadora.
  importe numeric(12,2) NOT NULL,
  moneda moneda_iso NOT NULL,

  -- Cada cuánto se cobra. Vacías las dos: se cobra una sola vez.
  periodo_cantidad integer,
  periodo_unidad text,

  -- Con qué período gratuito. Vacía: ninguno.
  dias_gratis integer,

  -- Con qué saldo de contactos. Vacía: sin tope mientras el acceso esté vigente.
  contactos_incluidos integer,

  -- Si se renueva sola. Es la pieza que decide si al acceso le corresponden los resguardos del
  -- §3.2 del PRD —aviso previo, baja en un clic, corte diferido, período de gracia—.
  renueva_sola boolean NOT NULL DEFAULT false,

  -- Si hoy se le ofrece a los Clientes. Una forma que ya se contrató no se borra: se apaga.
  ofrecida boolean NOT NULL DEFAULT true,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT formas_cobro_mkt_nombre_por_prestadora UNIQUE (prestadora_id, nombre),
  CONSTRAINT formas_cobro_mkt_importe_no_negativo CHECK (importe >= 0),
  CONSTRAINT formas_cobro_mkt_unidad_conocida
    CHECK (periodo_unidad IS NULL OR periodo_unidad IN ('dia', 'semana', 'mes', 'anio')),
  -- El período son dos datos que sólo significan algo juntos: cada cuántos, y de qué.
  CONSTRAINT formas_cobro_mkt_periodo_entero
    CHECK ((periodo_cantidad IS NULL) = (periodo_unidad IS NULL)),
  CONSTRAINT formas_cobro_mkt_periodo_positivo
    CHECK (periodo_cantidad IS NULL OR periodo_cantidad > 0),
  -- Sin período no hay qué renovar: una forma que se cobra una sola vez no se renueva sola.
  CONSTRAINT formas_cobro_mkt_renueva_con_periodo
    CHECK (renueva_sola = false OR periodo_cantidad IS NOT NULL),
  CONSTRAINT formas_cobro_mkt_dias_gratis_no_negativos
    CHECK (dias_gratis IS NULL OR dias_gratis >= 0),
  CONSTRAINT formas_cobro_mkt_contactos_positivos
    CHECK (contactos_incluidos IS NULL OR contactos_incluidos > 0)
);

COMMENT ON TABLE public.formas_de_cobro_match IS
  'Cómo cobra cada Prestadora el acceso a los datos de contacto. Las piezas, no los tipos: la forma sale de cómo se combinen. docs/PRD_07_Modalidad_Match.md §3.';

CREATE INDEX IF NOT EXISTS idx_formas_cobro_mkt_prestadora
  ON public.formas_de_cobro_match (prestadora_id) WHERE ofrecida;

CREATE TRIGGER trg_completar_moneda
  BEFORE INSERT ON public.formas_de_cobro_match
  FOR EACH ROW EXECUTE FUNCTION public.fn_completar_moneda();

ALTER TABLE public.formas_de_cobro_match ENABLE ROW LEVEL SECURITY;

-- La Prestadora ve y arma las suyas. Quien las administra es el mismo que administra el resto de
-- su configuración; el Coordinador no fija precios.
CREATE POLICY prestadora_administra_sus_formas_de_cobro
  ON public.formas_de_cobro_match
  FOR ALL
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
  );

-- El Cliente lee las que esa Prestadora le ofrece: son las opciones entre las que elige. No mira
-- las personas autorizadas del dinero, porque acá todavía no hay nada contratado.
CREATE POLICY cliente_ve_las_formas_ofrecidas
  ON public.formas_de_cobro_match
  FOR SELECT
  USING (
    ofrecida
    AND prestadora_id = (
      SELECT f.prestadora_id FROM public.clientes f
      WHERE f.id = interno.cliente_id_de_usuario(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. La suscripción pasa a ser el acceso
-- ---------------------------------------------------------------------------

ALTER TABLE public.suscripciones_match RENAME TO accesos_match;

ALTER TABLE public.accesos_match RENAME CONSTRAINT
  suscripciones_match_estado_check TO accesos_match_estado_check;
ALTER TABLE public.accesos_match RENAME CONSTRAINT
  suscripciones_match_cliente_id_paciente_id_asistente__key TO accesos_match_un_acceso_por_asistente;
ALTER INDEX public.suscripciones_match_pkey RENAME TO accesos_match_pkey;
ALTER INDEX public.idx_suscripciones_match_cliente RENAME TO idx_accesos_match_cliente;
ALTER INDEX public.idx_suscripciones_match_prestadora RENAME TO idx_accesos_match_prestadora;
ALTER INDEX public.idx_suscripciones_match_referencia RENAME TO idx_accesos_match_referencia;

ALTER POLICY cliente_ve_su_suscripcion_match
  ON public.accesos_match RENAME TO cliente_ve_su_acceso_match;
ALTER POLICY prestadora_ve_suscripciones_match
  ON public.accesos_match RENAME TO prestadora_ve_accesos_match;

-- A qué forma se adhirió esta Cliente.
ALTER TABLE public.accesos_match
  ADD COLUMN forma_de_cobro_id uuid REFERENCES public.formas_de_cobro_match(id);

-- El importe pactado, congelado el día del alta: el de la forma puede cambiar después y este
-- acceso sigue con el que se acordó. Deja de llamarse mensual porque no siempre lo es.
ALTER TABLE public.accesos_match RENAME COLUMN monto_mensual TO importe;

-- Hasta cuándo está habilitado el acceso, y con cuántos contactos. Vacías: no termina por esa
-- vía. Las dos son datos guardados, nunca una cuenta hecha al vuelo (§3.1 del PRD).
ALTER TABLE public.accesos_match ADD COLUMN vigente_hasta date;
ALTER TABLE public.accesos_match ADD COLUMN saldo_contactos integer;

-- Hasta cuándo no se cobra. Es lo que mira el aviso previo al primer cobro. Vacía: sin período
-- gratuito. Reemplaza a `trial_inicio`, que no la leía nadie, y a `trial_fin`.
ALTER TABLE public.accesos_match ADD COLUMN gratis_hasta date;

ALTER TABLE public.accesos_match DROP COLUMN trial_inicio;
ALTER TABLE public.accesos_match DROP COLUMN trial_fin;

-- Un paquete de contactos se compra antes de elegir a quién contactar, así que no tiene un
-- Asistente. La unicidad se sostiene igual: con `asistente_id` vacío, Postgres deja convivir
-- varios paquetes de la misma Cliente, y sigue impidiendo dos accesos al mismo Asistente.
ALTER TABLE public.accesos_match ALTER COLUMN asistente_id DROP NOT NULL;

ALTER TABLE public.accesos_match
  ADD CONSTRAINT accesos_match_saldo_no_negativo
  CHECK (saldo_contactos IS NULL OR saldo_contactos >= 0);

-- Los estados, sin el que nombraba una forma de cobrar.
ALTER TABLE public.accesos_match DROP CONSTRAINT accesos_match_estado_check;
ALTER TABLE public.accesos_match ALTER COLUMN estado SET DEFAULT 'vigente';
ALTER TABLE public.accesos_match
  ADD CONSTRAINT accesos_match_estado_check
  CHECK (estado IN ('vigente', 'vencida', 'cancelada'));

DROP INDEX IF EXISTS public.idx_suscripciones_match_por_cobrar;
CREATE INDEX idx_accesos_match_por_cobrar
  ON public.accesos_match (prestadora_id, proximo_cobro)
  WHERE estado = 'vigente' AND proximo_cobro IS NOT NULL;

COMMENT ON TABLE public.accesos_match IS
  'El acceso a los datos de contacto que un Cliente tiene habilitado, y bajo qué forma de cobro. Termina por una fecha o por un saldo, los dos guardados. docs/PRD_07_Modalidad_Match.md §3.';

-- ---------------------------------------------------------------------------
-- 3. Lo que apuntaba a la tabla por su nombre viejo
-- ---------------------------------------------------------------------------

-- Las políticas de estas dos tablas nombran la de arriba y se actualizan solas: Postgres las
-- guarda apuntando a la tabla y a la columna, no a su nombre escrito.

ALTER TABLE public.cobros_match RENAME COLUMN suscripcion_id TO acceso_id;
ALTER TABLE public.cobros_match RENAME CONSTRAINT
  cobros_match_suscripcion_id_fkey TO cobros_match_acceso_id_fkey;
ALTER INDEX public.idx_cobros_match_suscripcion RENAME TO idx_cobros_match_acceso;
ALTER POLICY cliente_ve_sus_cobros_match
  ON public.cobros_match RENAME TO cliente_ve_los_cobros_de_su_acceso;

ALTER TABLE public.qr_cobro_efectivo RENAME COLUMN suscripcion_id TO acceso_id;
ALTER TABLE public.qr_cobro_efectivo RENAME CONSTRAINT
  qr_cobro_efectivo_suscripcion_id_fkey TO qr_cobro_efectivo_acceso_id_fkey;

NOTIFY pgrst, 'reload schema';
