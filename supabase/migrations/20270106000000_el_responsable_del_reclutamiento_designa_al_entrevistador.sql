-- El Responsable del reclutamiento y el Entrevistador.
--
-- Cada Prestadora elige quién es su Responsable del reclutamiento. Sin elección, lo es su
-- Administrador: la fila puede no existir y la columna puede quedar vacía, y quien lo resuelve es
-- el backend (`backend/src/utils/responsableDelReclutamiento.js`).
--
-- Cada entrevista tiene su Entrevistador, que es el único que la mueve, la cancela o le carga el
-- informe. El informe es el texto de `observaciones`, y cargarlo deja la entrevista `realizada`.
-- La situación `no_asistio` deja de existir: si la persona no se presenta, la entrevista se
-- cancela con el motivo escrito. La tabla de entrevistas no tiene ninguna fila, así que la
-- columna nueva nace obligatoria sin nada que completar.

BEGIN;

CREATE TABLE public.configuracion_reclutamiento (
  prestadora_id uuid PRIMARY KEY REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  responsable_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracion_reclutamiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY gestiona_configuracion_reclutamiento_la_administracion
  ON public.configuracion_reclutamiento
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_superadmin() OR interno.es_admin_prestadora()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_superadmin() OR interno.es_admin_prestadora()));

CREATE POLICY lee_configuracion_reclutamiento_el_panel
  ON public.configuracion_reclutamiento
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual());

CREATE POLICY trabajo_sin_persona_de_esta_prestadora
  ON public.configuracion_reclutamiento
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON public.configuracion_reclutamiento FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.configuracion_reclutamiento TO authenticated;
GRANT SELECT ON public.configuracion_reclutamiento TO trabajo_sin_persona;

ALTER TABLE public.entrevistas_postulacion
  ADD COLUMN entrevistador_id uuid NOT NULL REFERENCES public.usuarios(id);

GRANT INSERT (entrevistador_id), UPDATE (entrevistador_id)
  ON public.entrevistas_postulacion TO trabajo_sin_persona;

ALTER TABLE public.entrevistas_postulacion
  DROP CONSTRAINT entrevistas_postulacion_estado_check;

ALTER TABLE public.entrevistas_postulacion
  ADD CONSTRAINT entrevistas_postulacion_estado_check
  CHECK (estado IN ('agendada', 'realizada', 'cancelada'));

COMMIT;

NOTIFY pgrst, 'reload schema';
