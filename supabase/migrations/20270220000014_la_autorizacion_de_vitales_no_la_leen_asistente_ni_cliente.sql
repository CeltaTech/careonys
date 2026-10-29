-- La autorización de monitoreo de los signos vitales la ve quien la firmó, y nadie más que la
-- Prestadora. El Asistente no es parte de ese documento: no lo lee. El Cliente lo lee sólo si
-- quien entra es quien lo firmó, y hoy eso no se puede saber, porque el firmante está guardado
-- como texto tecleado y no como una Ficha de Persona. Hasta que lo esté, no lo lee nadie desde
-- las aplicaciones.
--
-- Ninguna de las dos aplicaciones lo leía directo: lo único que necesitan es si hay una
-- autorización vigente, y eso lo contesta el backend con el trabajo de la Prestadora
-- (`backend/src/utils/vitalesReferencia.js`), que no pasa por estas políticas.

DROP POLICY IF EXISTS asistente_lee_autorizaciones_de_sus_pacientes ON public.autorizaciones_monitoreo_paciente;
DROP POLICY IF EXISTS cliente_lee_autorizaciones_de_sus_pacientes ON public.autorizaciones_monitoreo_paciente;

NOTIFY pgrst, 'reload schema';
