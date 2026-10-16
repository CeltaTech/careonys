-- El trabajo sin persona guarda y abre las autorizaciones de monitoreo de su Prestadora.
--
-- El Panel sube la autorización firmada que avala el monitoreo de signos vitales de un Paciente,
-- y la vuelve a abrir con un enlace temporal. Lo sube quien organiza el trabajo, y el depósito
-- sólo se lo deja a quien administra; la ruta lo hace con la credencial del trabajo de la
-- Prestadora activa, que alcanza únicamente la carpeta de esa Prestadora. Sube y lee: no
-- reemplaza ni borra.
--
-- Y cinco reglas de otros depósitos, escritas para las personas, pasan a nombrar a quiénes
-- alcanzan. Estaban dadas a todos los roles, así que la base también las evaluaba para el
-- trabajo sin persona, y una pregunta por una tabla que él no puede leer: cualquier lectura suya
-- en los archivos fallaba entera, en cualquier depósito. Para las personas y para quien entra sin
-- sesión no cambia nada.

ALTER POLICY archivos_de_contenidos_los_gestiona_quien_publica ON storage.objects TO anon, authenticated;
ALTER POLICY archivos_de_contenidos_los_ve_quien_ve_la_pieza ON storage.objects TO anon, authenticated;
ALTER POLICY documentos_pagador_los_alcanza_su_organizacion ON storage.objects TO anon, authenticated;
ALTER POLICY instrucciones_personas_autorizadas_panel_lee ON storage.objects TO anon, authenticated;
ALTER POLICY instrucciones_personas_autorizadas_panel_sube ON storage.objects TO anon, authenticated;

CREATE POLICY autorizaciones_monitoreo_las_sube_el_trabajo
  ON storage.objects
  FOR INSERT
  TO trabajo_sin_persona
  WITH CHECK (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
  );

CREATE POLICY autorizaciones_monitoreo_las_lee_el_trabajo
  ON storage.objects
  FOR SELECT
  TO trabajo_sin_persona
  USING (
    bucket_id = 'autorizaciones-monitoreo'
    AND (storage.foldername(name))[1] = (interno.prestadora_actual())::text
  );

NOTIFY pgrst, 'reload schema';
