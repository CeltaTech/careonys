-- Lo que lee el Panel lo lee sólo el personal de la Prestadora.
-- ============================================================================
--
-- Estas políticas de lectura preguntaban únicamente si la fila era de la Prestadora de quien
-- consulta. Un Cliente, una persona autorizada y un Asistente también tienen Prestadora, así que
-- cualquiera de ellos leía con su sesión las calificaciones y las correcciones de factura de todos
-- los Clientes, los envíos de correo, las alarmas avisadas y la configuración de la Prestadora.
--
-- Ahora piden además ser personal de la Prestadora. Al Asistente le queda su propia política para
-- leer sus calificaciones (`asistente_lee_sus_calificaciones`), y al Cliente las suyas. El trabajo
-- sin persona tiene su política aparte en cada tabla que usa; las que no la tienen las lee sólo el
-- Panel con la sesión de quien pide.

DROP POLICY IF EXISTS prestadora_ve_calificaciones ON public.calificaciones_asistente;
CREATE POLICY prestadora_ve_calificaciones ON public.calificaciones_asistente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS panel_lee_correcciones_factura_cliente ON public.correcciones_factura_cliente;
CREATE POLICY panel_lee_correcciones_factura_cliente ON public.correcciones_factura_cliente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.gestiona_la_facturacion());

DROP POLICY IF EXISTS panel_lee_configuracion_pago_asistentes ON public.configuracion_pago_asistentes;
CREATE POLICY panel_lee_configuracion_pago_asistentes ON public.configuracion_pago_asistentes
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS lee_configuracion_reclutamiento_el_panel ON public.configuracion_reclutamiento;
CREATE POLICY lee_configuracion_reclutamiento_el_panel ON public.configuracion_reclutamiento
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS lee_configuracion_referencias_el_panel ON public.configuracion_referencias_laborales;
CREATE POLICY lee_configuracion_referencias_el_panel ON public.configuracion_referencias_laborales
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS la_prestadora_ve_sus_envios_de_correo ON public.envios_de_correo;
CREATE POLICY la_prestadora_ve_sus_envios_de_correo ON public.envios_de_correo
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS panel_lee_escalones_de_alarma_avisados ON public.escalones_de_alarma_avisados;
CREATE POLICY panel_lee_escalones_de_alarma_avisados ON public.escalones_de_alarma_avisados
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS su_prestadora_lee_las_especialidades ON public.especialidades;
CREATE POLICY su_prestadora_lee_las_especialidades ON public.especialidades
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS su_prestadora_lee_las_especialidades_de_cada_asistente ON public.especialidades_asistente;
CREATE POLICY su_prestadora_lee_las_especialidades_de_cada_asistente ON public.especialidades_asistente
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS lee_opciones_postulacion_el_panel ON public.opciones_postulacion;
CREATE POLICY lee_opciones_postulacion_el_panel ON public.opciones_postulacion
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS usuarios_prestadora_leen_sus_modalidades ON public.prestadora_modalidades;
CREATE POLICY usuarios_prestadora_leen_sus_modalidades ON public.prestadora_modalidades
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

DROP POLICY IF EXISTS usuarios_prestadora_leen_su_pasarela ON public.prestadora_pasarela_pago;
CREATE POLICY usuarios_prestadora_leen_su_pasarela ON public.prestadora_pasarela_pago
  FOR SELECT TO authenticated
  USING (prestadora_id = interno.prestadora_actual() AND interno.es_personal_de_la_prestadora());

NOTIFY pgrst, 'reload schema';
