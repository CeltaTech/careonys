-- La relación laboral de cada Asistente la define su Prestadora.
--
-- Hasta hoy eran dos valores fijos escritos en la base —monotributo y dependencia—, iguales para
-- todas. Pasa a ser una lista que arma cada Prestadora en Configuración, con los nombres que ella
-- use, y el Legajo del Asistente elige de esa lista.
--
-- Lo que ya estaba cargado se conserva: a cada Prestadora se le crean los renglones que sus
-- Asistentes ya tenían, con el mismo nombre que se veía en pantalla, y cada Legajo queda apuntando
-- al suyo.
--
-- La liquidación guarda el nombre de ese día, como guarda el de cada concepto: si mañana la
-- Prestadora cambia la lista, lo pagado sigue diciendo lo que decía.
--
-- `conceptos_liquidacion.aplica_a` repetía los dos valores fijos y no lo lee ningún código; sale
-- con ellos.

BEGIN;

CREATE TABLE public.relaciones_laborales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Para que el Legajo sólo pueda apuntar a un renglón de su misma Prestadora.
  UNIQUE (prestadora_id, id)
);
CREATE INDEX relaciones_laborales_prestadora ON public.relaciones_laborales (prestadora_id);
ALTER TABLE public.relaciones_laborales ENABLE ROW LEVEL SECURITY;

-- La administración la arma; el resto de la Prestadora la lee, el Asistente incluido, que ve la
-- suya en su aplicación.
CREATE POLICY administracion_gestiona_relaciones_laborales
  ON public.relaciones_laborales TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()))
  WITH CHECK (prestadora_id = interno.prestadora_actual() AND (interno.es_admin_prestadora() OR interno.es_superadmin()));
CREATE POLICY la_prestadora_lee_sus_relaciones_laborales
  ON public.relaciones_laborales FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relaciones_laborales TO authenticated;
REVOKE ALL ON public.relaciones_laborales FROM anon;

-- El Legajo apunta a un renglón de la lista de su Prestadora. Mientras un Legajo lo use, el
-- renglón no se borra: se apaga.
ALTER TABLE public.asistentes ADD COLUMN relacion_laboral_id uuid;
ALTER TABLE public.asistentes
  ADD CONSTRAINT asistentes_relacion_laboral_de_su_prestadora
  FOREIGN KEY (prestadora_id, relacion_laboral_id)
  REFERENCES public.relaciones_laborales (prestadora_id, id) ON DELETE RESTRICT;
CREATE INDEX asistentes_relacion_laboral ON public.asistentes (relacion_laboral_id);

INSERT INTO public.relaciones_laborales (prestadora_id, nombre, orden)
SELECT DISTINCT prestadora_id,
       CASE tipo_vinculo WHEN 'monotributo' THEN 'Monotributo' ELSE 'Dependencia' END,
       CASE tipo_vinculo WHEN 'monotributo' THEN 1 ELSE 2 END
  FROM public.asistentes
 WHERE tipo_vinculo IS NOT NULL;

UPDATE public.asistentes a
   SET relacion_laboral_id = r.id
  FROM public.relaciones_laborales r
 WHERE r.prestadora_id = a.prestadora_id
   AND r.nombre = CASE a.tipo_vinculo WHEN 'monotributo' THEN 'Monotributo' ELSE 'Dependencia' END;

-- El Coordinador sigue sin poder cambiarla, igual que antes.
CREATE OR REPLACE FUNCTION public.bloquear_edicion_laboral_coordinador()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  rol_actual TEXT;
BEGIN
  SELECT rol INTO rol_actual FROM usuarios WHERE id = interno.usuario_de_la_sesion();

  IF rol_actual = 'coordinador' THEN
    IF NEW.relacion_laboral_id IS DISTINCT FROM OLD.relacion_laboral_id
      OR NEW.horas_semanales IS DISTINCT FROM OLD.horas_semanales
      OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    THEN
      RAISE EXCEPTION 'Coordinador no puede modificar datos laborales internos del Asistente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER TABLE public.asistentes DROP COLUMN tipo_vinculo;

-- La liquidación guarda el nombre de ese día.
ALTER TABLE public.liquidaciones_asistente DROP CONSTRAINT liquidaciones_asistente_tipo_vinculo_check;
ALTER TABLE public.liquidaciones_asistente RENAME COLUMN tipo_vinculo TO relacion_laboral;
UPDATE public.liquidaciones_asistente
   SET relacion_laboral = CASE relacion_laboral WHEN 'monotributo' THEN 'Monotributo' WHEN 'dependencia' THEN 'Dependencia' ELSE relacion_laboral END
 WHERE relacion_laboral IS NOT NULL;

ALTER TABLE public.conceptos_liquidacion DROP COLUMN aplica_a;

COMMIT;

NOTIFY pgrst, 'reload schema';
