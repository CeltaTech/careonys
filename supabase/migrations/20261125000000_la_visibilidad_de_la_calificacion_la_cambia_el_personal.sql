-- La visibilidad de una calificación la cambia el personal de la Prestadora.
--
-- La ruta del Panel la cambiaba con la llave maestra porque la política dejaba afuera a Superadmin,
-- que entra con un permiso de acceso abierto. Ahora la ruta va con la credencial de quien pide, y
-- la política dice lo mismo que la ruta: Admin_prestadora, Coordinador, y Superadmin mientras el
-- permiso está abierto, siempre adentro de la Prestadora de la sesión.

ALTER POLICY admin_prestadora_actualiza_visibilidad ON public.calificaciones_asistente
  USING (
    prestadora_id = interno.prestadora_actual()
    AND interno.es_personal_de_la_prestadora()
  );

NOTIFY pgrst, 'reload schema';
