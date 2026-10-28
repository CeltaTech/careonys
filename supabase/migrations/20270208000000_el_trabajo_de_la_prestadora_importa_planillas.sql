-- La importación de planillas deja la llave maestra. Las filas importadas nacen pendientes de
-- conformidad, y la política restrictiva `oculta_pendientes_de_conformidad` se las esconde a
-- todos, el trabajo sin persona incluido: así ninguna tarea programada avisa, cobra ni asigna
-- sobre algo que la Prestadora todavía no revisó. Quien importa es la excepción, porque tiene que
-- escribirlas, mostrarlas para la revisión y después conformarlas o deshacerlas.
--
-- La excepción no es un rol nuevo sino un trabajo con nombre: la credencial del trabajo sin
-- persona la firma el backend y lleva el nombre del trabajo adentro, así que nadie de afuera puede
-- presentarse como la importación. Cualquier otro trabajo sigue sin ver lo pendiente.
--
-- El nombre es el de `TRABAJO_DE_LA_IMPORTACION` en `backend/src/routes/panelImportacion.js`.

CREATE FUNCTION interno.es_la_importacion()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT current_user = 'trabajo_sin_persona'
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'trabajo', '')
         = 'importación de planillas'
$$;

REVOKE ALL ON FUNCTION interno.es_la_importacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.es_la_importacion() TO service_role, authenticated, trabajo_sin_persona;

ALTER POLICY oculta_pendientes_de_conformidad ON public.asistentes
  USING (NOT pendiente_conformidad OR interno.es_la_importacion())
  WITH CHECK (NOT pendiente_conformidad OR interno.es_la_importacion());
ALTER POLICY oculta_pendientes_de_conformidad ON public.clientes
  USING (NOT pendiente_conformidad OR interno.es_la_importacion())
  WITH CHECK (NOT pendiente_conformidad OR interno.es_la_importacion());
ALTER POLICY oculta_pendientes_de_conformidad ON public.pacientes
  USING (NOT pendiente_conformidad OR interno.es_la_importacion())
  WITH CHECK (NOT pendiente_conformidad OR interno.es_la_importacion());

-- El lote: se abre, se lee para la revisión y se cierra.
GRANT SELECT,
      INSERT (prestadora_id, usuario_id, tipo, archivo_nombre, filas_totales),
      UPDATE (filas_creadas, filas_error, errores, estado_conformidad, revisada_en, revisada_por)
  ON public.importaciones_prestadora TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_importa_en_esta_prestadora ON public.importaciones_prestadora
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La conformidad cambia una sola columna; el rechazo borra lo que se había creado.
GRANT UPDATE (pendiente_conformidad) ON public.asistentes TO trabajo_sin_persona;

GRANT INSERT (usuario_id, contratante_persona_id, prestadora_id, plan, importacion_id, pendiente_conformidad),
      UPDATE (pendiente_conformidad),
      DELETE
  ON public.clientes TO trabajo_sin_persona;

GRANT INSERT (cliente_id, persona_id, nivel_complejidad, patologias, prestadora_id, importacion_id, pendiente_conformidad),
      DELETE
  ON public.pacientes TO trabajo_sin_persona;

-- La Ficha del Paciente se completa con lo que trae la fila y todavía no tiene.
GRANT SELECT (codigo_postal, fecha_nacimiento),
      UPDATE (calle, numero, piso, unidad, lugar_id, codigo_postal, lat, lng, fecha_nacimiento)
  ON public.personas TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_completa_fichas_de_esta_prestadora ON public.personas
  FOR UPDATE TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La localidad reconocida sin duda que todavía no estaba en la lista de la Prestadora.
GRANT INSERT (prestadora_id, nombre, pais, provincia, municipio, id_oficial, localidad_censal, fuente, parte_de, lat, lng)
  ON public.lugares TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_agrega_lugares_de_esta_prestadora ON public.lugares
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
