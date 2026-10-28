-- Las personas autorizadas dejan la llave maestra. Anotarlas, retirarlas y armar, firmar y aplicar
-- la autorización de sus accesos no lo puede hacer el titular con su propio acceso, y tampoco el
-- Panel con el de quien lo usa en todos los casos: el backend lo hace con el trabajo de la
-- Prestadora, acotado a ella por las políticas de abajo.
--
-- Sólo las columnas que ese camino lee y escribe.

-- La Ficha de Persona de quien se anota: se busca por su documento y, si no está, se crea. La base
-- valida el documento con `interno.identidad_validada`, que lee los dos catálogos del país.
GRANT EXECUTE ON FUNCTION interno.identidad_validada(uuid, text, text, text, text, text, text)
  TO trabajo_sin_persona;

GRANT SELECT (pais, clase, codigo, orden, activo, lleva_pais, verifica_modulo_11, contiene_dni)
  ON public.catalogo_documentos_de_identidad TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.catalogo_documentos_de_identidad
  FOR SELECT TO trabajo_sin_persona
  USING (interno.prestadora_actual() IS NOT NULL);

GRANT SELECT (id, pais, codigo, orden, activo) ON public.catalogo_generos TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.catalogo_generos
  FOR SELECT TO trabajo_sin_persona
  USING (interno.prestadora_actual() IS NOT NULL);

GRANT SELECT (documento_tipo, documento_numero, dni) ON public.personas TO trabajo_sin_persona;
GRANT INSERT (prestadora_id, clase, nombre, apellido, documento_tipo, documento_numero, dni, genero, email)
  ON public.personas TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_crea_en_esta_prestadora ON public.personas
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- La persona autorizada: se anota y se retira. Leer ya podía.
GRANT INSERT (usuario_id, cliente_id, persona_id, email, creado_por), DELETE
  ON public.personas_autorizadas TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_anota_en_esta_prestadora ON public.personas_autorizadas
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (cliente_id IN (SELECT f.id FROM public.clientes f WHERE f.prestadora_id = interno.prestadora_actual()));
CREATE POLICY trabajo_sin_persona_retira_en_esta_prestadora ON public.personas_autorizadas
  FOR DELETE TO trabajo_sin_persona
  USING (cliente_id IN (SELECT f.id FROM public.clientes f WHERE f.prestadora_id = interno.prestadora_actual()));

-- Lo que rige para cada persona autorizada: se lee, y al firmarse una autorización se reemplaza.
GRANT SELECT (cliente_id, usuario_id, clave, permitido, instruccion_id, updated_at),
      INSERT (cliente_id, usuario_id, clave, permitido, instruccion_id, updated_at),
      DELETE
  ON public.permisos_personas_autorizadas TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.permisos_personas_autorizadas
  FOR ALL TO trabajo_sin_persona
  USING (cliente_id IN (SELECT f.id FROM public.clientes f WHERE f.prestadora_id = interno.prestadora_actual()))
  WITH CHECK (cliente_id IN (SELECT f.id FROM public.clientes f WHERE f.prestadora_id = interno.prestadora_actual()));

-- La autorización: se arma, se anula cuando llega otra, y se cierra con el código o con el
-- documento firmado. No se borra nunca.
GRANT SELECT (id, prestadora_id, cliente_id, dada_por, cargada_por, documento_texto, documento_verificador,
              documento_idioma, estado, cerrada_como, cerrada_en, cerrada_desde, archivo_firmado_url,
              codigo_verificador, codigo_expira_en, codigo_intentos, created_at, accesos_pedidos),
      INSERT (prestadora_id, cliente_id, dada_por, cargada_por, documento_texto, documento_verificador,
              documento_idioma, accesos_pedidos),
      UPDATE (estado, cerrada_como, cerrada_en, cerrada_desde, archivo_firmado_url, codigo_verificador,
              codigo_expira_en, codigo_intentos)
  ON public.instrucciones_acceso_personas_autorizadas TO trabajo_sin_persona;
CREATE POLICY trabajo_sin_persona_lee_en_esta_prestadora ON public.instrucciones_acceso_personas_autorizadas
  FOR SELECT TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_arma_en_esta_prestadora ON public.instrucciones_acceso_personas_autorizadas
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (prestadora_id = interno.prestadora_actual());
CREATE POLICY trabajo_sin_persona_cierra_en_esta_prestadora ON public.instrucciones_acceso_personas_autorizadas
  FOR UPDATE TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
