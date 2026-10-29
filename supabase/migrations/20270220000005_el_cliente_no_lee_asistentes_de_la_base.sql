-- El Cliente deja de leer Asistentes y certificados directo de la base.
-- ============================================================================
--
-- La política le abría al Cliente todas las columnas —teléfono, domicilio, coordenadas— de
-- cualquier Asistente que lo hubiera atendido alguna vez, con una guardia de cualquier fecha. La
-- protección por fila no recorta columnas, y la clave pública del navegador alcanza para pedirlas.
--
-- Lo que el Cliente ve del Asistente —nombre, foto, tipo y certificado vigente, del que tiene una
-- guardia en curso o próxima— lo arma el backend con el trabajo de la Prestadora y columnas
-- contadas (backend/src/routes/appClientes.js). Sin política, la base no le entrega ninguna fila.

DROP POLICY IF EXISTS cliente_lee_asistente_asignado ON public.asistentes;
DROP POLICY IF EXISTS cliente_ve_certificado_asistente_asignado ON public.certificados;

-- Sólo la usaban esas dos políticas.
DROP FUNCTION IF EXISTS interno.asistente_atiende_al_cliente(uuid, uuid);

NOTIFY pgrst, 'reload schema';
