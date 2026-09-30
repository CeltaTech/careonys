-- El Asistente no da por resuelto su propio aviso de demora.
--
-- La política que le deja anotar que su aviso ya se envió alcanza sus avisos y ninguno más, pero el
-- permiso de tabla de `authenticated` es entero, así que con su sesión podía cambiar cualquier
-- columna de esa fila, también `resuelto_at`. Resolver una alerta es del Coordinador y de la
-- administración, desde el Panel. El permiso no se puede achicar por columnas, porque es de todo el
-- rol y el Panel sí marca `resuelto_at`: el límite va en la política del Asistente.

ALTER POLICY asistente_anota_el_envio_de_su_aviso_de_demora ON public.alertas_tempranas_guardia
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND fuente = 'aviso_demora_asistente'
    AND reportado_por = auth.uid()
    AND resuelto_at IS NULL
    AND EXISTS (
      SELECT 1
        FROM public.guardias g
       WHERE g.id = alertas_tempranas_guardia.guardia_id
         AND g.asistente_id = interno.asistente_de_la_sesion()
    )
  );

NOTIFY pgrst, 'reload schema';
