-- El alta de un Asistente desde el Panel deja la llave maestra. Quien coordina puede tener el
-- permiso de dar de alta, pero la base le abre el Legajo, lo que cobra y las etapas de
-- incorporación sólo a la administración. Así que el backend hace el alta con el trabajo de la
-- Prestadora, acotado a ella por las políticas de abajo, y con el mismo trabajo la deshace si se
-- corta a mitad de camino.
--
-- Sólo las columnas que ese camino lee y escribe. `verificaciones_asistente` no tiene columna de
-- Prestadora: su política la toma del Legajo del que cuelga.

GRANT INSERT (usuario_id, nombre, documento_tipo, documento_numero, documento_pais, dni, genero,
              telefono, email, domicilio, calle, numero, piso, unidad, lugar_id, codigo_postal,
              lat, lng, tipo_asistente_id, estado, horas_semanales, canales, prestadora_id,
              importacion_id, pendiente_conformidad),
      DELETE
  ON public.asistentes TO trabajo_sin_persona;

GRANT SELECT (activo) ON public.tipos_asistente TO trabajo_sin_persona;

GRANT SELECT (clave, prestadora_id, activa, orden)
  ON public.etapas_incorporacion_asistente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_lee_etapas_de_esta_prestadora ON public.etapas_incorporacion_asistente
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());

GRANT SELECT (asistente_id),
      INSERT (asistente_id, etapa, estado, revisado_por, completado_en),
      DELETE
  ON public.verificaciones_asistente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_verifica_en_esta_prestadora ON public.verificaciones_asistente
  FOR ALL TO trabajo_sin_persona
  USING (asistente_id IN (SELECT id FROM public.asistentes WHERE prestadora_id = interno.prestadora_actual()))
  WITH CHECK (asistente_id IN (SELECT id FROM public.asistentes WHERE prestadora_id = interno.prestadora_actual()));

GRANT SELECT (asistente_id, prestadora_id),
      INSERT (asistente_id, prestadora_id, valor_hora)
  ON public.remuneraciones_asistente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_remunera_en_esta_prestadora ON public.remuneraciones_asistente
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

GRANT SELECT (asistente_id, prestadora_id), DELETE
  ON public.referencias_laborales_asistente TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_limpia_referencias_de_esta_prestadora ON public.referencias_laborales_asistente
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
