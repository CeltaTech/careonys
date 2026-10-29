-- CADA PERSONA CAMBIA SÓLO LAS COLUMNAS QUE LE TOCAN.
--
-- La política dice qué filas alcanza una persona; el permiso de tabla, qué columnas. En estas tres
-- tablas `authenticated` tenía el permiso entero, así que quien alcanzaba una fila podía reescribir
-- cualquier columna de ella:
--
--  · el aviso de demora: el Asistente anota que avisó, y nada más. Con el permiso entero podía
--    cambiar el motivo, la fuente o a quién se le reportó.
--  · el consentimiento del Asistente: lo único que se escribe después de firmar es el retiro. Con el
--    permiso entero podía cambiar qué texto había firmado, la decisión o la fecha, y deshacer un
--    retiro. Y al firmar podía guardar un texto que nunca se le mostró.
--  · los datos bancarios: se corrigen la cuenta, el banco y el titular. Con el permiso entero podía
--    mover la fila a otro país o a otra clase de cuenta.
--
-- El trabajo sin persona no cambia: es otro rol, con sus propios permisos.

-- ---- Avisos de demora ----
REVOKE UPDATE ON public.alertas_tempranas_guardia FROM authenticated;
GRANT UPDATE (resuelto_at, resuelto_nota, ultima_notificacion_at, veces_notificado, backup_notificado_at)
  ON public.alertas_tempranas_guardia TO authenticated;

-- ---- Consentimientos del Asistente ----
REVOKE UPDATE ON public.consentimientos_asistente FROM authenticated;
GRANT UPDATE (retirado_at, motivo_retiro) ON public.consentimientos_asistente TO authenticated;

REVOKE INSERT ON public.consentimientos_asistente FROM authenticated;
GRANT INSERT (prestadora_id, asistente_id, clave, texto_consentimiento_id, version_mostrada,
              idioma_mostrado, texto_mostrado, decision)
  ON public.consentimientos_asistente TO authenticated;

-- Lo firmado es exactamente el texto vigente que se le mostró: misma clave, misma versión, mismo
-- idioma y mismo cuerpo. La fecha de la decisión la pone la base.
DROP POLICY IF EXISTS asistente_registra_su_consentimiento ON public.consentimientos_asistente;
CREATE POLICY asistente_registra_su_consentimiento ON public.consentimientos_asistente
  FOR INSERT TO authenticated
  WITH CHECK (
    interno.lee_la_configuracion(prestadora_id)
    AND interno.es_su_propio_legajo_de_asistente(asistente_id)
    AND EXISTS (
      SELECT 1 FROM public.textos_consentimiento t
       WHERE t.id = consentimientos_asistente.texto_consentimiento_id
         AND t.clave = consentimientos_asistente.clave
         AND t.version = consentimientos_asistente.version_mostrada
         AND t.idioma = consentimientos_asistente.idioma_mostrado
         AND t.cuerpo = consentimientos_asistente.texto_mostrado
         AND t.vigente_hasta IS NULL
    )
  );

-- Retirar es lo único: se parte de un otorgamiento vigente y se termina retirado.
DROP POLICY IF EXISTS asistente_retira_su_consentimiento ON public.consentimientos_asistente;
CREATE POLICY asistente_retira_su_consentimiento ON public.consentimientos_asistente
  FOR UPDATE TO authenticated
  USING (
    interno.es_su_propio_legajo_de_asistente(asistente_id)
    AND decision = 'otorgado'
    AND retirado_at IS NULL
  )
  WITH CHECK (
    interno.es_su_propio_legajo_de_asistente(asistente_id)
    AND retirado_at IS NOT NULL
  );

-- ---- Datos bancarios del Asistente ----
REVOKE UPDATE ON public.datos_bancarios_asistente FROM authenticated;
GRANT UPDATE (identificador, banco, titular, updated_at) ON public.datos_bancarios_asistente TO authenticated;

NOTIFY pgrst, 'reload schema';
