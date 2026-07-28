-- Entidad Servicio (Fase 6). Un Servicio pertenece siempre a UNA sola Cliente.
CREATE TABLE IF NOT EXISTS servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  etiqueta TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'de_baja')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE servicios ADD CONSTRAINT servicios_id_prestadora_unique UNIQUE (id, prestadora_id);

CREATE INDEX IF NOT EXISTS idx_servicios_cliente ON servicios (cliente_id);

ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_gestiona_servicios" ON servicios
  FOR ALL USING (
    es_superadmin() OR (
      servicios.prestadora_id = current_tenant()
      AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol IN ('admin_prestadora', 'coordinador'))
    )
  );

CREATE POLICY "cliente_ve_sus_servicios" ON servicios
  FOR SELECT USING (servicios.cliente_id = auth.uid());

ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES servicios(id);
ALTER TABLE guardias ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES servicios(id);

CREATE OR REPLACE FUNCTION validar_servicio_misma_cliente()
RETURNS TRIGGER AS $$
DECLARE
  cliente_paciente UUID;
  cliente_servicio UUID;
BEGIN
  IF NEW.servicio_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cliente_id INTO cliente_paciente FROM pacientes WHERE id = NEW.paciente_id;
  SELECT cliente_id INTO cliente_servicio FROM servicios WHERE id = NEW.servicio_id;

  IF cliente_paciente IS NULL OR cliente_servicio IS NULL OR cliente_paciente <> cliente_servicio THEN
    RAISE EXCEPTION 'El Servicio indicado no pertenece a la misma Cliente que el Paciente';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validar_servicio_prestaciones ON prestaciones;
CREATE TRIGGER validar_servicio_prestaciones
  BEFORE INSERT OR UPDATE OF servicio_id, paciente_id ON prestaciones
  FOR EACH ROW EXECUTE FUNCTION validar_servicio_misma_cliente();

DROP TRIGGER IF EXISTS validar_servicio_guardias ON guardias;
CREATE TRIGGER validar_servicio_guardias
  BEFORE INSERT OR UPDATE OF servicio_id, paciente_id ON guardias
  FOR EACH ROW EXECUTE FUNCTION validar_servicio_misma_cliente();

ALTER TABLE facturas_cliente_items ADD COLUMN IF NOT EXISTS servicio_id UUID REFERENCES servicios(id);

NOTIFY pgrst, 'reload schema';
;
