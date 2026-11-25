-- La autorización que firma el Cliente pasa a llamarse «Autorización al Asistente» y suma un
-- párrafo: el personal asistente puede ver, durante el turno de guardia en curso, el nombre de la
-- obra social del Paciente y su número de afiliado, para usarlos en una emergencia. Sin esta
-- autorización firmada, el teléfono del Asistente no recibe esos dos datos.
--
-- Una versión firmada no se reescribe: se agrega la versión 2 y la 1 deja de regir. Las firmas
-- de la versión 1 siguen valiendo para lo que decían.

INSERT INTO public.textos_consentimiento
  (jurisdiccion, clave, modalidad, version, idioma, titulo, cuerpo, puntos_clave, es_borrador,
   vigente_desde, control_de_ubicacion_en_el_turno_guardia)
SELECT v1.jurisdiccion, v1.clave, v1.modalidad, 2, v1.idioma, nuevo.titulo,
       v1.cuerpo || E'\n\n' || nuevo.parrafo,
       v1.puntos_clave, false, now(), v1.control_de_ubicacion_en_el_turno_guardia
  FROM public.textos_consentimiento v1
  JOIN (VALUES
    ('es-AR', 'Autorización al Asistente',
     'Autorizo además al personal asistente que asigne a {{paciente}} a ver, durante el turno de guardia en curso, el nombre de su obra social y su número de afiliado, para usarlos en caso de emergencia.'),
    ('en', 'Authorization for the Assistant',
     'I further authorize the assistant staff assigned to {{paciente}} to view, during the shift in progress, the name of their health insurance and their membership number, to be used in case of emergency.'),
    ('pt-BR', 'Autorização ao Assistente',
     'Autorizo ainda o pessoal assistente designado para {{paciente}} a ver, durante o plantão em andamento, o nome do seu plano de saúde e o seu número de beneficiário, para uso em caso de emergência.')
  ) AS nuevo(idioma, titulo, parrafo) ON nuevo.idioma = v1.idioma
 WHERE v1.jurisdiccion = 'AR' AND v1.clave = 'autorizacion_signos_vitales' AND v1.version = 1;

UPDATE public.textos_consentimiento
   SET vigente_hasta = now()
 WHERE jurisdiccion = 'AR' AND clave = 'autorizacion_signos_vitales' AND version = 1;

NOTIFY pgrst, 'reload schema';
