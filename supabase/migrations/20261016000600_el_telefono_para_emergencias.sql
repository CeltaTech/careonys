-- El teléfono para emergencias de cada Prestadora.
--
-- Es el número al que llama el Asistente desde el cartel de una emergencia que todavía no salió
-- del teléfono: el botón marca sin pasar por internet, así que sirve justo cuando el aviso no
-- llega. Puede ser el mismo que el teléfono general o uno distinto; lo carga la Prestadora en
-- Configuración › La Prestadora, y sin número no hay botón.
--
-- Vive al lado de los otros canales de contacto de la Prestadora. Los permisos de la tabla ya
-- alcanzan a la columna nueva, y la protección por fila es la de la tabla.

ALTER TABLE public.configuracion_prestadora
  ADD COLUMN telefono_emergencias text;

NOTIFY pgrst, 'reload schema';
