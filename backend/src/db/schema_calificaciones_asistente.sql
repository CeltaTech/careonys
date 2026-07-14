-- Pendiente #13(b) (docs/PENDIENTES.md) — calificación que el Cliente deja sobre el
-- Asistente tras una guardia. Puramente informativa: no dispara ninguna acción automática
-- del sistema sobre el Asistente (rechazo, exclusión, restricción de guardias futuras) — la
-- única injerencia de la prestadora es decidir si esa calificación puntual se muestra en la
-- ficha pública del Asistente o no (`visible_publica`), nunca editar/borrar el contenido.

CREATE TABLE calificaciones_asistente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID NOT NULL REFERENCES asistentes(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  cliente_id UUID NOT NULL REFERENCES usuarios(id),
  guardia_id UUID NOT NULL REFERENCES guardias(id),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  estrellas INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario TEXT,
  visible_publica BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calificaciones_asistente ENABLE ROW LEVEL SECURITY;

-- El Cliente solo califica guardias propias, una vez, de su propia prestadora
CREATE POLICY "cliente_crea_su_calificacion" ON calificaciones_asistente
  FOR INSERT WITH CHECK (
    cliente_id = auth.uid()
    AND prestadora_id = current_tenant()
    AND guardia_id IN (
      SELECT g.id FROM guardias g
      JOIN pacientes p ON p.id = g.paciente_id
      WHERE p.cliente_id = auth.uid()
    )
  );

-- Admin_prestadora/coordinador ven todas las calificaciones de su prestadora (para decidir
-- visibilidad); el Cliente ve las suyas; el Asistente ve las propias
CREATE POLICY "prestadora_ve_calificaciones" ON calificaciones_asistente
  FOR SELECT USING (
    prestadora_id = current_tenant()
    OR cliente_id = auth.uid()
    OR asistente_id = auth.uid()
  );

-- Único campo editable por la prestadora: visible_publica (aplicar la restricción de
-- columna a nivel de ruta del backend, no solo RLS — ver backend/src/routes/)
CREATE POLICY "admin_prestadora_actualiza_visibilidad" ON calificaciones_asistente
  FOR UPDATE USING (
    prestadora_id = current_tenant()
    AND EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin_prestadora','coordinador'))
  );

NOTIFY pgrst, 'reload schema';
