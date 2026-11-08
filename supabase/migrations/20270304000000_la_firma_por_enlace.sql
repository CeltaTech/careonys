-- El documento firmado con el enlace no lleva renglones para firmar a mano: lleva una frase que dice
-- con qué enlace, a qué Email y cuándo se firmó. El Email es el que se usó para mandarlo, y se guarda
-- en el momento del envío: si después cambia la Ficha de Persona, lo firmado no cambia.
--
-- Los renglones para firmar a mano pasan a ser un pie que el Panel agrega sólo al imprimir, el mismo
-- para todos los documentos, y su texto sale de la base.

BEGIN;

-- El texto de fábrica pierde los renglones de firma. El anterior deja de estar vigente y no se
-- borra: hay documentos que lo citan.
UPDATE public.textos_consentimiento
   SET vigente_hasta = now(), updated_at = now()
 WHERE jurisdiccion = 'AR'
   AND clave = 'consentimiento_pagador'
   AND idioma = 'es-AR'
   AND version = 1
   AND vigente_hasta IS NULL;

INSERT INTO public.textos_consentimiento
  (jurisdiccion, clave, modalidad, version, idioma, titulo, cuerpo, puntos_clave, es_borrador,
   control_de_ubicacion_en_el_turno)
SELECT jurisdiccion, clave, modalidad, 2, idioma, titulo,
$texto$CONSENTIMIENTO A LA OBLIGACIÓN DE PAGAR

Prestadora: {{prestadora}}
Quien se obliga: {{pagador}}
Documento: {{documento}}
Firma en su representación: {{apoderado}}
Servicio contratado para: {{cliente}}
Fecha: {{fecha}}

------------------------------------------------------------------------

Quien firma declara que conoce el servicio contratado y asume la obligación de pagarlo
a {{prestadora}}, en las condiciones y con la periodicidad que se hayan acordado.

Esta obligación es propia y no depende de que un tercero —una obra social, una prepaga u
otra entidad— reconozca, autorice o pague la prestación.

Quien firma puede dejar de estar obligado para adelante avisándolo por escrito a la
Prestadora. Lo que ya se prestó hasta ese aviso queda alcanzado por esta obligación.

Los datos personales que se dejan acá se usan para facturar y cobrar el servicio, y para
nada más.
$texto$,
       puntos_clave, false, control_de_ubicacion_en_el_turno
  FROM public.textos_consentimiento
 WHERE jurisdiccion = 'AR'
   AND clave = 'consentimiento_pagador'
   AND idioma = 'es-AR'
   AND version = 1;

-- El Email al que se mandó cada enlace.
ALTER TABLE public.enlaces_consentimiento_pagador ADD COLUMN email text;

-- El Email del enlace con el que se firmó, copiado al firmar. Lo lee el Panel, que no alcanza la
-- tabla de enlaces.
ALTER TABLE public.consentimientos_pagador ADD COLUMN firmado_con_email text;
GRANT SELECT (firmado_con_email) ON public.consentimientos_pagador TO authenticated;
GRANT SELECT, UPDATE (firmado_con_email) ON public.consentimientos_pagador TO trabajo_sin_persona;

INSERT INTO public.mensajes_del_sistema (prestadora_id, clave, i18n)
VALUES
  (NULL, 'documento_para_firmar.firmado_electronicamente', '{"es-AR": "Firmado electrónicamente mediante el enlace enviado a su cuenta de correo {{email}} el {{fecha}} a las {{hora}}.", "en": "Signed electronically through the link sent to the email account {{email}} on {{fecha}} at {{hora}}.", "pt-BR": "Assinado eletronicamente por meio do link enviado para a conta de e-mail {{email}} em {{fecha}} às {{hora}}."}'),
  (NULL, 'pie_de_firmas.fecha',      '{"es-AR": "Lugar y fecha", "en": "Place and date", "pt-BR": "Local e data"}'),
  (NULL, 'pie_de_firmas.firma',      '{"es-AR": "Firma", "en": "Signature", "pt-BR": "Assinatura"}'),
  (NULL, 'pie_de_firmas.aclaracion', '{"es-AR": "Aclaración", "en": "Printed name", "pt-BR": "Nome legível"}'),
  (NULL, 'pie_de_firmas.dni',        '{"es-AR": "DNI", "en": "DNI", "pt-BR": "DNI"}');

COMMIT;

NOTIFY pgrst, 'reload schema';
