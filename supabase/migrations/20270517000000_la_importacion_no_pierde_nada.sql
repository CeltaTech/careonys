-- La importación no pierde nada.
--
-- Todo lo que trae una Prestadora al importar queda guardado y a la vista de su administración:
-- el archivo original, cada hoja leída, lo que no tiene un lugar propio en el sistema y los
-- documentos sueltos de un Paciente. Nada se descarta y nada se inventa: lo dudoso queda como
-- pedido de dato hasta que la Prestadora conteste.
--
-- Hace ocho cosas:
--   1. El lote de importación acepta clases nuevas y guarda dónde quedó el archivo original y
--      qué hojas se leyeron.
--   2. Los pedidos de importación aceptan clases nuevas de dato.
--   3. Crea la historia anterior del Paciente, que es información de salud.
--   4. Crea los antecedentes del Legajo de cada Asistente.
--   5. Crea los antecedentes de cada Cliente: facturas, cobros y deudas anteriores.
--   6. Deja que la importación cargue los valores normales de signos vitales de un Paciente.
--   7. Crea el depósito privado de los archivos originales de cada lote.
--   8. Crea el depósito privado de los documentos de la historia anterior de cada Paciente.
--
-- Lo que se importa no se modifica ni se borra: ninguna de las tres tablas nuevas ni de los dos
-- depósitos nuevos tiene permiso de cambio ni de borrado para nadie.
--
-- Corre entera o no corre.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. El lote de importación
-- ---------------------------------------------------------------------------------------------

-- Clases nuevas de lote: medicación, valores normales de signos vitales, historia anterior y
-- documento suelto.
ALTER TABLE public.importaciones_prestadora
  DROP CONSTRAINT importaciones_prestadora_tipo_check;
ALTER TABLE public.importaciones_prestadora
  ADD CONSTRAINT importaciones_prestadora_tipo_check
  CHECK (tipo = ANY (ARRAY['asistente'::text, 'cliente'::text, 'lista_precios'::text, 'servicio'::text,
                           'medicacion'::text, 'rangos_vitales'::text, 'historia'::text, 'documento'::text]));

-- El archivo original: dónde quedó guardado, de qué tipo es y cuánto pesa. Y una entrada por cada
-- hoja o tabla leída, con cuántos renglones tenía y cuántos se leyeron.
ALTER TABLE public.importaciones_prestadora
  ADD COLUMN archivo_ruta   text,
  ADD COLUMN archivo_tipo   text,
  ADD COLUMN archivo_tamano bigint,
  ADD COLUMN hojas          jsonb NOT NULL DEFAULT '[]'::jsonb;

-- El original vive en la carpeta de su Prestadora y de su lote, y en ninguna otra.
ALTER TABLE public.importaciones_prestadora
  ADD CONSTRAINT importaciones_prestadora_el_original_es_del_lote
  CHECK (archivo_ruta IS NULL OR archivo_ruta LIKE prestadora_id::text || '/' || id::text || '/%'),
  ADD CONSTRAINT importaciones_prestadora_tamano_no_negativo
  CHECK (archivo_tamano IS NULL OR archivo_tamano >= 0),
  ADD CONSTRAINT importaciones_prestadora_hojas_es_una_lista
  CHECK (jsonb_typeof(hojas) = 'array');

-- Lo que cuelga de un lote lo cita junto con su Prestadora: así la base garantiza que nunca
-- apunta al lote de otra.
ALTER TABLE public.importaciones_prestadora
  ADD CONSTRAINT importaciones_prestadora_id_prestadora_unico UNIQUE (id, prestadora_id);

-- La importación escribe las columnas nuevas al crear el lote y al terminarlo, igual que las de
-- resultado. La lectura ya la tienen la importación y la administración por el permiso de toda
-- la tabla.
GRANT INSERT (archivo_ruta, archivo_tipo, archivo_tamano, hojas),
      UPDATE (archivo_ruta, archivo_tipo, archivo_tamano, hojas)
  ON TABLE public.importaciones_prestadora TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 2. Los pedidos de importación
-- ---------------------------------------------------------------------------------------------

-- Clases nuevas de dato:
--   persona          no se sabe de quién es el renglón;
--   hallazgo         medicación o valores normales de signos vitales que la IA encontró en un
--                    documento, para confirmar;
--   receta           medicación importada sin receta;
--   firma_medicacion medicación importada sin la firma de la familia;
--   renglones        la cuenta de renglones leídos no coincide con la de renglones del archivo.
ALTER TABLE public.pedidos_de_importacion
  DROP CONSTRAINT pedidos_de_importacion_dato_check;
ALTER TABLE public.pedidos_de_importacion
  ADD CONSTRAINT pedidos_de_importacion_dato_check
  CHECK (dato = ANY (ARRAY['localidad'::text, 'coordinador'::text, 'asistente'::text, 'horario'::text,
                           'documento'::text, 'documento_paciente'::text, 'tipo_servicio'::text, 'dato'::text,
                           'persona'::text, 'hallazgo'::text, 'receta'::text, 'firma_medicacion'::text,
                           'renglones'::text]));

-- ---------------------------------------------------------------------------------------------
-- 3. La historia anterior del Paciente
-- ---------------------------------------------------------------------------------------------

-- Lo que la Prestadora traía de un Paciente y que no tiene un lugar propio en el sistema:
-- documentos, guardias, reportes e internaciones anteriores, lo que la IA encontró en un
-- documento y los datos de columnas que la Prestadora no asignó. Cada fila guarda de qué lote,
-- de qué hoja y de qué renglón salió, y el renglón entero en «datos».
--
-- Es información de salud: se lee sólo por el registro de accesos, como las demás.
CREATE TABLE public.historia_anterior_del_paciente (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id     uuid        NOT NULL DEFAULT interno.prestadora_actual()
                                REFERENCES public.prestadoras(id),
  paciente_id       uuid        NOT NULL,
  importacion_id    uuid        NOT NULL,
  fila              integer,
  hoja              text,
  clase             text        NOT NULL,
  etiqueta          text,
  valor             text,
  datos             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fecha             date,
  documento_ruta    text,
  documento_nombre  text,
  documento_tipo    text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT historia_anterior_del_paciente_clase_check
    CHECK (clase = ANY (ARRAY['documento'::text, 'guardia'::text, 'reporte'::text, 'internacion'::text,
                              'hallazgo'::text, 'columna_sin_lugar'::text, 'otro'::text])),
  CONSTRAINT historia_anterior_del_paciente_fila_positiva
    CHECK (fila IS NULL OR fila > 0),
  CONSTRAINT historia_anterior_del_paciente_datos_es_un_objeto
    CHECK (jsonb_typeof(datos) = 'object'),
  -- El documento vive en la carpeta de su Prestadora, de su Paciente y de su lote.
  CONSTRAINT historia_anterior_del_paciente_el_documento_es_del_paciente
    CHECK (documento_ruta IS NULL
           OR documento_ruta LIKE prestadora_id::text || '/' || paciente_id::text || '/'
                                  || importacion_id::text || '/%'),
  CONSTRAINT historia_anterior_del_paciente_paciente_de_la_prestadora
    FOREIGN KEY (paciente_id, prestadora_id)
    REFERENCES public.pacientes(id, prestadora_id),
  CONSTRAINT historia_anterior_del_paciente_lote_de_la_prestadora
    FOREIGN KEY (importacion_id, prestadora_id)
    REFERENCES public.importaciones_prestadora(id, prestadora_id)
);

COMMENT ON TABLE public.historia_anterior_del_paciente IS
  'Lo que la Prestadora trajo de un Paciente al importar y que no tiene un lugar propio en el sistema. Es información de salud. No se modifica ni se borra.';

CREATE INDEX historia_anterior_del_paciente_por_paciente
  ON public.historia_anterior_del_paciente (prestadora_id, paciente_id);
CREATE INDEX historia_anterior_del_paciente_por_lote
  ON public.historia_anterior_del_paciente (importacion_id);

ALTER TABLE public.historia_anterior_del_paciente ENABLE ROW LEVEL SECURITY;

-- Las dos reglas de toda la información de salud: la ve sólo quien atiende al Paciente, y sólo
-- por el registro de accesos.
CREATE POLICY la_informacion_de_salud_la_ve_quien_atiende
  ON public.historia_anterior_del_paciente
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (interno.alcanza_la_informacion_de_salud(paciente_id));

CREATE POLICY la_informacion_de_salud_pasa_por_el_registro
  ON public.historia_anterior_del_paciente
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (interno.lectura_de_salud_anotada())
  WITH CHECK (interno.lectura_de_salud_anotada());

-- En el Panel la lee la administración de la Prestadora y el Coordinador que ve al Paciente.
CREATE POLICY panel_lee_historia_anterior_del_paciente
  ON public.historia_anterior_del_paciente
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_admin_prestadora() OR interno.coordinador_ve_al_paciente(paciente_id))
  );

-- La importación la carga y la lee en su Prestadora. Otro trabajo sin persona no.
CREATE POLICY la_importacion_carga_historia_anterior_del_paciente
  ON public.historia_anterior_del_paciente
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

CREATE POLICY la_importacion_lee_historia_anterior_del_paciente
  ON public.historia_anterior_del_paciente
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

-- Permisos de la tabla. Supabase le da todo a cada tabla nueva: primero se quita y después se da
-- lo justo. Nadie la modifica ni la borra.
REVOKE ALL ON TABLE public.historia_anterior_del_paciente
  FROM PUBLIC, anon, authenticated, trabajo_sin_persona, service_role;

GRANT SELECT ON TABLE public.historia_anterior_del_paciente TO authenticated, trabajo_sin_persona;

GRANT INSERT (prestadora_id, paciente_id, importacion_id, fila, hoja, clase, etiqueta, valor, datos,
              fecha, documento_ruta, documento_nombre, documento_tipo)
  ON TABLE public.historia_anterior_del_paciente TO trabajo_sin_persona;

-- Se suma a la lista de tablas de información de salud. Es la lista que usan la lectura y la
-- carga por el registro de accesos.
CREATE OR REPLACE FUNCTION interno.tablas_de_salud()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY[
    'aclaraciones_reporte', 'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_turno_guardia',
    'historia_anterior_del_paciente', 'hospitalizaciones_paciente', 'indicaciones_medicacion',
    'informacion_de_salud_del_paciente', 'informes_obra_social', 'rangos_referencia_vitales',
    'reportes', 'versiones_registro_clinico'
  ]::text[];
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4. Los antecedentes del Legajo
-- ---------------------------------------------------------------------------------------------

-- Lo que la Prestadora traía de un Asistente y que no tiene un lugar propio en el Legajo: las
-- guardias anteriores, con el Paciente si se lo encontró, y los datos de columnas que la
-- Prestadora no asignó.
CREATE TABLE public.antecedentes_del_legajo (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id   uuid        NOT NULL DEFAULT interno.prestadora_actual()
                              REFERENCES public.prestadoras(id),
  asistente_id    uuid        NOT NULL,
  importacion_id  uuid        NOT NULL,
  paciente_id     uuid,
  fila            integer,
  hoja            text,
  clase           text        NOT NULL,
  etiqueta        text,
  valor           text,
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fecha           date,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT antecedentes_del_legajo_clase_check
    CHECK (clase = ANY (ARRAY['guardia'::text, 'columna_sin_lugar'::text, 'otro'::text])),
  CONSTRAINT antecedentes_del_legajo_fila_positiva
    CHECK (fila IS NULL OR fila > 0),
  CONSTRAINT antecedentes_del_legajo_datos_es_un_objeto
    CHECK (jsonb_typeof(datos) = 'object'),
  CONSTRAINT antecedentes_del_legajo_asistente_de_la_prestadora
    FOREIGN KEY (asistente_id, prestadora_id)
    REFERENCES public.asistentes(id, prestadora_id),
  CONSTRAINT antecedentes_del_legajo_paciente_de_la_prestadora
    FOREIGN KEY (paciente_id, prestadora_id)
    REFERENCES public.pacientes(id, prestadora_id),
  CONSTRAINT antecedentes_del_legajo_lote_de_la_prestadora
    FOREIGN KEY (importacion_id, prestadora_id)
    REFERENCES public.importaciones_prestadora(id, prestadora_id)
);

COMMENT ON TABLE public.antecedentes_del_legajo IS
  'Lo que la Prestadora trajo de un Asistente al importar y que no tiene un lugar propio en el Legajo. No se modifica ni se borra.';

CREATE INDEX antecedentes_del_legajo_por_asistente
  ON public.antecedentes_del_legajo (prestadora_id, asistente_id);
CREATE INDEX antecedentes_del_legajo_por_lote
  ON public.antecedentes_del_legajo (importacion_id);

ALTER TABLE public.antecedentes_del_legajo ENABLE ROW LEVEL SECURITY;

-- En el Panel los lee la administración de la Prestadora y el Coordinador que tiene a cargo al
-- Asistente. Los datos de columnas sin lugar pueden ser confidenciales: el Coordinador los ve
-- sólo con el permiso de ver los datos confidenciales de los Asistentes.
CREATE POLICY panel_lee_antecedentes_del_legajo
  ON public.antecedentes_del_legajo
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (
      interno.es_admin_prestadora()
      OR (interno.coordinador_alcanza_asistente(asistente_id)
          AND (clase <> 'columna_sin_lugar' OR interno.tiene_permiso('ver_datos_reservados_asistente')))
    )
  );

CREATE POLICY la_importacion_carga_antecedentes_del_legajo
  ON public.antecedentes_del_legajo
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

CREATE POLICY la_importacion_lee_antecedentes_del_legajo
  ON public.antecedentes_del_legajo
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.antecedentes_del_legajo
  FROM PUBLIC, anon, authenticated, trabajo_sin_persona, service_role;

GRANT SELECT ON TABLE public.antecedentes_del_legajo TO authenticated, trabajo_sin_persona;

GRANT INSERT (prestadora_id, asistente_id, importacion_id, paciente_id, fila, hoja, clase, etiqueta,
              valor, datos, fecha)
  ON TABLE public.antecedentes_del_legajo TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 5. Los antecedentes del Cliente
-- ---------------------------------------------------------------------------------------------

-- Las facturas, los cobros y las deudas anteriores que la Prestadora traía de un Cliente.
CREATE TABLE public.antecedentes_del_cliente (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id   uuid        NOT NULL DEFAULT interno.prestadora_actual()
                              REFERENCES public.prestadoras(id),
  cliente_id      uuid        NOT NULL,
  importacion_id  uuid        NOT NULL,
  fila            integer,
  hoja            text,
  clase           text        NOT NULL,
  etiqueta        text,
  valor           text,
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fecha           date,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT antecedentes_del_cliente_clase_check
    CHECK (clase = ANY (ARRAY['factura'::text, 'cobro'::text, 'deuda'::text, 'otro'::text])),
  CONSTRAINT antecedentes_del_cliente_fila_positiva
    CHECK (fila IS NULL OR fila > 0),
  CONSTRAINT antecedentes_del_cliente_datos_es_un_objeto
    CHECK (jsonb_typeof(datos) = 'object'),
  CONSTRAINT antecedentes_del_cliente_cliente_de_la_prestadora
    FOREIGN KEY (cliente_id, prestadora_id)
    REFERENCES public.clientes(id, prestadora_id),
  CONSTRAINT antecedentes_del_cliente_lote_de_la_prestadora
    FOREIGN KEY (importacion_id, prestadora_id)
    REFERENCES public.importaciones_prestadora(id, prestadora_id)
);

COMMENT ON TABLE public.antecedentes_del_cliente IS
  'Facturas, cobros y deudas anteriores que la Prestadora trajo de un Cliente al importar. No se modifica ni se borra.';

CREATE INDEX antecedentes_del_cliente_por_cliente
  ON public.antecedentes_del_cliente (prestadora_id, cliente_id);
CREATE INDEX antecedentes_del_cliente_por_lote
  ON public.antecedentes_del_cliente (importacion_id);

ALTER TABLE public.antecedentes_del_cliente ENABLE ROW LEVEL SECURITY;

-- En el Panel los lee la administración de la Prestadora y quien tiene el permiso de ver la
-- facturación de los Clientes.
CREATE POLICY panel_lee_antecedentes_del_cliente
  ON public.antecedentes_del_cliente
  FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.prestadora_actual()
    AND (interno.es_admin_prestadora() OR interno.tiene_permiso('ver_facturacion_cliente'))
  );

CREATE POLICY la_importacion_carga_antecedentes_del_cliente
  ON public.antecedentes_del_cliente
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

CREATE POLICY la_importacion_lee_antecedentes_del_cliente
  ON public.antecedentes_del_cliente
  FOR SELECT TO trabajo_sin_persona
  USING (interno.es_la_importacion() AND prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.antecedentes_del_cliente
  FROM PUBLIC, anon, authenticated, trabajo_sin_persona, service_role;

GRANT SELECT ON TABLE public.antecedentes_del_cliente TO authenticated, trabajo_sin_persona;

GRANT INSERT (prestadora_id, cliente_id, importacion_id, fila, hoja, clase, etiqueta, valor, datos, fecha)
  ON TABLE public.antecedentes_del_cliente TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 6. Los valores normales de signos vitales que trae la importación
-- ---------------------------------------------------------------------------------------------

-- La importación ya los leía; ahora también los carga, siempre para un Paciente de su
-- Prestadora. Los valores generales de la Prestadora, sin Paciente, no los carga.
CREATE POLICY la_importacion_carga_rangos_vitales
  ON public.rangos_referencia_vitales
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (
    interno.es_la_importacion()
    AND prestadora_id = interno.prestadora_actual()
    AND paciente_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.pacientes p
                 WHERE p.id = rangos_referencia_vitales.paciente_id
                   AND p.prestadora_id = interno.prestadora_actual())
  );

GRANT INSERT (prestadora_id, paciente_id, signo, valor_min, valor_max, unidad, fuente, nota_aclaratoria)
  ON TABLE public.rangos_referencia_vitales TO trabajo_sin_persona;

-- Para devolver el identificador de la fila que acaba de cargar.
GRANT SELECT (id) ON TABLE public.rangos_referencia_vitales TO trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 7. El depósito de los archivos originales
-- ---------------------------------------------------------------------------------------------

-- Privado. Ningún formato se rechaza. Ruta: <Prestadora>/<lote>/<archivo>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('originales-importacion', 'originales-importacion', false)
ON CONFLICT (id) DO NOTHING;

-- La importación sube y lee el original en la carpeta de su Prestadora.
CREATE POLICY originales_importacion_los_sube_la_importacion
  ON storage.objects
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (
    bucket_id = 'originales-importacion'
    AND interno.es_la_importacion()
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
  );

CREATE POLICY originales_importacion_los_lee_la_importacion
  ON storage.objects
  FOR SELECT TO trabajo_sin_persona
  USING (
    bucket_id = 'originales-importacion'
    AND interno.es_la_importacion()
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
  );

-- El Administrador de la Prestadora los descarga, en la carpeta de su Prestadora.
CREATE POLICY originales_importacion_los_lee_el_administrador
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'originales-importacion'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND interno.es_admin_prestadora()
  );

-- ---------------------------------------------------------------------------------------------
-- 8. El depósito de los documentos de la historia anterior
-- ---------------------------------------------------------------------------------------------

-- Privado. Ningún formato se rechaza. Ruta: <Prestadora>/<Paciente>/<lote>/<archivo>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('historia-anterior-pacientes', 'historia-anterior-pacientes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY historia_anterior_la_sube_la_importacion
  ON storage.objects
  FOR INSERT TO trabajo_sin_persona
  WITH CHECK (
    bucket_id = 'historia-anterior-pacientes'
    AND interno.es_la_importacion()
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
  );

CREATE POLICY historia_anterior_la_lee_la_importacion
  ON storage.objects
  FOR SELECT TO trabajo_sin_persona
  USING (
    bucket_id = 'historia-anterior-pacientes'
    AND interno.es_la_importacion()
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
  );

-- En el Panel la lee quien puede ver la historia anterior de ese Paciente: la administración o
-- el Coordinador que lo ve, y siempre que la regla de la información de salud lo deje. El
-- Paciente se compara como texto: una ruta mal formada no da error, niega.
CREATE POLICY historia_anterior_la_lee_quien_atiende
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'historia-anterior-pacientes'
    AND (storage.foldername(name))[1] = interno.prestadora_actual()::text
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
       WHERE p.id::text = (storage.foldername(objects.name))[2]
         AND p.prestadora_id = interno.prestadora_actual()
         AND interno.alcanza_la_informacion_de_salud(p.id)
         AND (interno.es_admin_prestadora() OR interno.coordinador_ve_al_paciente(p.id))
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
