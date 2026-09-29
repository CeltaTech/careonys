-- Las columnas que la conservación necesita.
--
-- Dos piezas, y ninguna decide nada todavía. El motor que calcula vencimientos, avisa y borra o
-- desasocia se construye más adelante; acá queda sólo la forma de lo guardado, porque agregar
-- columnas a una base cargada de datos reales de salud es otro orden de trabajo.
--
-- 1. La fecha de fallecimiento del Paciente.
--
--    Es un dato que llega de afuera y puede no llegar nunca: el sistema no se entera solo de que
--    alguien murió. Por eso admite estar vacía, y vacía quiere decir «no se sabe», no «está vivo».
--    Donde el plazo corre desde la muerte —Panamá, Ley 68 art. 49—, mientras falte no hay
--    vencimiento que calcular y ninguna purga puede correr sobre ese Paciente.
--
--    No pide permiso nuevo: la carga quien ya puede editar los datos del Paciente, con las
--    políticas que la tabla ya tiene.
--
-- 2. La tabla de reglas de conservación, vacía.
--
--    Una regla dice, para un país y una clase de registro, desde qué hecho corre el plazo, cuánto
--    dura y qué corresponde cuando vence. Los plazos son legales y cambian con la ley: ninguno se
--    escribe en el código, se cargan acá como datos, con la norma que los fija y desde cuándo
--    rigen, y se aplica la regla vigente a la fecha del hecho.
--
--    Lo que tiene que poder expresar, porque hay un país que obliga a cada forma:
--    - el hecho desde el que corre: la última atención, el último registro, la muerte del
--      Paciente, cada hecho registrado por separado, o el fin del tratamiento;
--    - dos plazos encadenados que la norma suma —un renglón por tramo, en orden—;
--    - qué corresponde al vencer: borrar, desasociar, avisar y esperar, conservar, o
--      seudonimizar;
--    - un plazo que no vence nunca, que se escribe sin plazo y con «conservar».
--
--    Es configuración legal por país, igual que `escalas_legales` y `advertencias_legales`: no
--    guarda datos de ninguna Prestadora, y por eso no lleva la columna de la Prestadora. La lee
--    sólo el trabajo sin persona, y sólo las reglas del país de la Prestadora para la que trabaja.
--    Nadie la escribe desde afuera: se carga con migraciones.

-- ── 1. La fecha de fallecimiento ─────────────────────────────────────────────────────────────

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fecha_fallecimiento date;

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS pacientes_no_fallece_antes_de_nacer;
ALTER TABLE public.pacientes
  ADD CONSTRAINT pacientes_no_fallece_antes_de_nacer
  CHECK (fecha_fallecimiento IS NULL OR fecha_nacimiento IS NULL
         OR fecha_fallecimiento >= fecha_nacimiento);

COMMENT ON COLUMN public.pacientes.fecha_fallecimiento IS
  'Llega de afuera y puede faltar. Vacía quiere decir que no se sabe. Mientras falte, un plazo de conservación que corre desde la muerte no tiene vencimiento y ninguna purga corre sobre este Paciente.';

-- ── 2. Las reglas de conservación ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reglas_de_conservacion (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiccion       text        NOT NULL,
  clase_de_registro  text        NOT NULL,
  tramo              smallint    NOT NULL DEFAULT 1,
  hecho_de_inicio    text        NOT NULL,
  plazo_meses        integer,
  al_vencer          text        NOT NULL,
  fuente             text        NOT NULL,
  vigencia_desde     date        NOT NULL,
  vigencia_hasta     date,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- El mismo código de país que `prestadoras.pais`.
  CONSTRAINT reglas_de_conservacion_jurisdiccion_es_un_pais
    CHECK (jurisdiccion ~ '^[A-Z]{2}$'),
  CONSTRAINT reglas_de_conservacion_la_clase_no_va_vacia
    CHECK (btrim(clase_de_registro) <> ''),
  CONSTRAINT reglas_de_conservacion_el_tramo_empieza_en_uno
    CHECK (tramo >= 1),
  CONSTRAINT reglas_de_conservacion_hecho_conocido
    CHECK (hecho_de_inicio IN ('ultima_atencion', 'ultimo_registro', 'fallecimiento',
                               'cada_registro', 'fin_del_tratamiento')),
  CONSTRAINT reglas_de_conservacion_el_plazo_no_es_negativo
    CHECK (plazo_meses IS NULL OR plazo_meses >= 0),
  CONSTRAINT reglas_de_conservacion_accion_conocida
    CHECK (al_vencer IN ('borrar', 'desasociar', 'avisar', 'conservar', 'seudonimizar')),
  -- Lo que no vence nunca no puede mandar a hacer nada al vencer.
  CONSTRAINT reglas_de_conservacion_sin_plazo_se_conserva
    CHECK (plazo_meses IS NOT NULL OR al_vencer = 'conservar'),
  -- Una regla que no cita su norma no se puede explicar.
  CONSTRAINT reglas_de_conservacion_cita_su_norma
    CHECK (btrim(fuente) <> ''),
  CONSTRAINT reglas_de_conservacion_la_vigencia_no_termina_antes_de_empezar
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CONSTRAINT reglas_de_conservacion_un_tramo_por_vigencia
    UNIQUE (jurisdiccion, clase_de_registro, tramo, vigencia_desde)
);

COMMENT ON TABLE public.reglas_de_conservacion IS
  'Plazos legales de conservación por país y clase de registro. Un renglón por tramo; los tramos de una misma regla se suman en orden. Se carga con migraciones y ningún plazo vive en el código.';

ALTER TABLE public.reglas_de_conservacion ENABLE ROW LEVEL SECURITY;

-- Los permisos por defecto del esquema le dan todo a todos: se sacan, y queda sólo la lectura
-- del trabajo sin persona.
REVOKE ALL ON public.reglas_de_conservacion FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.reglas_de_conservacion TO trabajo_sin_persona;

-- Sólo las reglas del país de la Prestadora para la que trabaja. Sin Prestadora resuelta, o sin
-- país cargado, no ve ninguna.
DROP POLICY IF EXISTS trabajo_sin_persona_lee_las_reglas_de_su_pais ON public.reglas_de_conservacion;
CREATE POLICY trabajo_sin_persona_lee_las_reglas_de_su_pais ON public.reglas_de_conservacion
  FOR SELECT TO trabajo_sin_persona
  USING (
    jurisdiccion = (SELECT p.pais FROM public.prestadoras p
                     WHERE p.id = interno.current_tenant())
  );

NOTIFY pgrst, 'reload schema';
