-- Se corrige la redacción de los textos de fábrica que el control de redacción encontró en la base.
--
-- Son textos que vienen escritos de fábrica: las advertencias legales, los textos de consentimiento,
-- el nombre de un índice de actualización y los mensajes que manda el sistema por correo y al
-- celular. Ninguno cambia lo que dice ni su alcance: sólo cómo está escrito. Los tres idiomas
-- quedan diciendo lo mismo que el castellano.
--
-- Qué se corrige: la raya larga, «acá» y «aquí», «clave» en vez de «contraseña», «email» en vez de
-- «correo», «por favor», «nosotros», la pasiva con «fue», el tiempo compuesto, «Habilitar», «Conviene»,
-- «ranking», «requieran», «solicitado», «Além disso» y los textos de enlace que no dicen adónde llevan.
--
-- Los textos de consentimiento se corrigen en la misma versión, sin crear una nueva. Lo que cada
-- persona firmó ya quedó guardado, palabra por palabra, en la copia de su firma, así que corregir el
-- texto de fábrica no borra ninguna constancia. Una versión nueva del consentimiento de ubicación,
-- en cambio, dejaría sin efecto las firmas que ya existen y obligaría a firmar otra vez por un
-- cambio que es sólo de redacción.
--
-- De los mensajes del sistema se tocan sólo los de fábrica. Los que escribió cada Prestadora para sí
-- quedan como están.
--
-- Al final, una comprobación revisa que cada texto haya quedado corregido. Si alguno no se encontró,
-- la migración entera se deshace.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Advertencias legales
-- ---------------------------------------------------------------------------------------------

UPDATE public.advertencias_legales
   SET texto_advertencia = replace(texto_advertencia,
         'Conviene evaluar si esta función es coherente con',
         'Evalúe si esta función es coherente con')
 WHERE jurisdiccion = 'AR' AND funcion_clave = 'penalizacion_inasistencias';

UPDATE public.advertencias_legales
   SET texto_advertencia = replace(replace(texto_advertencia,
         'Un ranking calculado por la plataforma',
         'Una clasificación calculada por la plataforma'),
         'art. 23 de la LCT — mismo hecho',
         'art. 23 de la LCT. Es el mismo hecho')
 WHERE jurisdiccion = 'AR' AND funcion_clave = 'ranking_plataforma';

-- ---------------------------------------------------------------------------------------------
-- Índice de actualización
-- ---------------------------------------------------------------------------------------------

UPDATE public.indices_de_actualizacion
   SET nombre = 'IPC INDEC, nivel general nacional (base diciembre 2016 = 100)'
 WHERE codigo = 'ipc_indec_nacional';

-- ---------------------------------------------------------------------------------------------
-- Textos de consentimiento
-- ---------------------------------------------------------------------------------------------

-- Autorización para controlar los signos vitales: «requieran» pasa a «exijan».
UPDATE public.textos_consentimiento
   SET cuerpo = replace(cuerpo, 'procedimientos que requieran punción', 'procedimientos que exijan punción')
 WHERE jurisdiccion = 'AR' AND clave = 'autorizacion_signos_vitales' AND version = 1 AND idioma = 'es-AR';

-- Medicación que carga el Cliente: el inciso entre rayas pasa a ir entre comas.
UPDATE public.textos_consentimiento
   SET cuerpo = replace(replace(cuerpo, 'prescripción médica —incluyendo', 'prescripción médica, incluyendo'),
                        'período indicado— concuerdan', 'período indicado, concuerdan')
 WHERE jurisdiccion = 'AR' AND clave = 'consentimiento_medicacion' AND version = 1 AND idioma = 'es-AR';

UPDATE public.textos_consentimiento
   SET cuerpo = replace(replace(cuerpo, 'medical prescription —including', 'medical prescription, including'),
                        'indicated period— faithfully', 'indicated period, faithfully')
 WHERE jurisdiccion = 'AR' AND clave = 'consentimiento_medicacion' AND version = 1 AND idioma = 'en';

UPDATE public.textos_consentimiento
   SET cuerpo = replace(replace(cuerpo, 'prescrição médica —incluindo', 'prescrição médica, incluindo'),
                        'período indicado— correspondem', 'período indicado, correspondem')
 WHERE jurisdiccion = 'AR' AND clave = 'consentimiento_medicacion' AND version = 1 AND idioma = 'pt-BR';

-- Obligación de pagar: el inciso entre rayas pasa a ir entre comas, y «acá» pasa a «en este documento».
UPDATE public.textos_consentimiento
   SET cuerpo = replace(replace(cuerpo,
         E'un tercero —una obra social, una prepaga u\notra entidad— reconozca',
         E'un tercero, sea una obra social, una prepaga u\notra entidad, reconozca'),
         'Los datos personales que se dejan acá se usan',
         'Los datos personales de este documento se usan')
 WHERE jurisdiccion = 'AR' AND clave = 'consentimiento_pagador' AND version = 2 AND idioma = 'es-AR';

-- Registro de la ubicación, versión 1, modalidad en relación de dependencia. Es un texto de relleno
-- que todavía no se publica. Se corrigen la raya del título y «acá» y «aquí» del cuerpo.
UPDATE public.textos_consentimiento
   SET titulo = 'TEXTO PROVISORIO: Registro de la ubicación en el trayecto hacia una guardia',
       cuerpo = replace(replace(cuerpo,
         'Está acá para poder construir', 'Existe para poder construir'),
         'Acá va a ir', 'Esta sección va a explicar')
 WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 1
   AND modalidad = 'dependencia' AND idioma = 'es-AR';

UPDATE public.textos_consentimiento
   SET titulo = 'DRAFT TEXT: Recording your location on your way to a shift'
 WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 1
   AND modalidad = 'dependencia' AND idioma = 'en';

UPDATE public.textos_consentimiento
   SET titulo = 'TEXTO PROVISÓRIO: Registro da sua localização a caminho do plantão',
       cuerpo = replace(cuerpo, 'Está aqui para permitir', 'Existe para permitir')
 WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 1
   AND modalidad = 'dependencia' AND idioma = 'pt-BR';

-- Registro de la ubicación, versión 2, modalidad autónoma: deja de hablar en nombre de «nosotros».
-- Quien registra la ubicación es la aplicación.
UPDATE public.textos_consentimiento
   SET cuerpo = CASE idioma
         WHEN 'es-AR' THEN 'La aplicación registra su ubicación durante el viaje al domicilio y durante su turno de guardia.'
         WHEN 'en'    THEN 'The app records your location during the trip to the home and during your shift.'
         WHEN 'pt-BR' THEN 'O aplicativo registra sua localização durante o trajeto até o domicílio e durante seu turno de plantão.'
       END
 WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 2
   AND modalidad = 'autonomo' AND control_de_ubicacion_en_el_turno IS TRUE
   AND idioma IN ('es-AR', 'en', 'pt-BR');

UPDATE public.textos_consentimiento
   SET cuerpo = CASE idioma
         WHEN 'es-AR' THEN 'La aplicación registra su ubicación durante el viaje al domicilio y al registrar la entrada y la salida.'
         WHEN 'en'    THEN 'The app records your location during the trip to the home and when you check in and check out.'
         WHEN 'pt-BR' THEN 'O aplicativo registra sua localização durante o trajeto até o domicílio e ao registrar a entrada e a saída.'
       END
 WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 2
   AND modalidad = 'autonomo' AND control_de_ubicacion_en_el_turno IS FALSE
   AND idioma IN ('es-AR', 'en', 'pt-BR');

-- ---------------------------------------------------------------------------------------------
-- Mensajes del sistema, sólo los de fábrica
-- ---------------------------------------------------------------------------------------------

CREATE TEMPORARY TABLE mensajes_corregidos (clave text PRIMARY KEY, es text, en text, pt text) ON COMMIT DROP;

INSERT INTO mensajes_corregidos (clave, es, en, pt) VALUES
  ('activacion_cuenta.antes_del_enlace',
   'Active la cuenta con el enlace siguiente:',
   'Activate your account with the following link:',
   'Ative a conta pelo link a seguir:'),

  ('apoderado.quitar_aviso',
   'Está por revocar una autorización. Confírmelo.',
   'You are about to revoke an authorization. Confirm it.',
   'Você está prestes a revogar uma autorização. Confirme.'),

  ('ausencia_de_golpe.ademas_uno',
   'Además deja otra guardia sin nadie.',
   'It also leaves one more shift with nobody.',
   'Também deixa outro plantão sem ninguém.'),

  ('ausencia_de_golpe.ademas_varios',
   'Además deja otras {{otras}} guardias sin nadie.',
   'It also leaves {{otras}} more shifts with nobody.',
   'Também deixa outros {{otras}} plantões sem ninguém.'),

  ('cambio_de_clave_habilitado.asunto',
   '{{prestadora}} permitió un cambio de contraseña en su cuenta',
   '{{prestadora}} allowed a password change on your account',
   'A {{prestadora}} permitiu uma troca de senha na sua conta'),

  ('cambio_de_clave_habilitado.texto',
   E'{{nombre}}: {{prestadora}} permitió por un tiempo corto que usted elija una contraseña nueva. La contraseña la elige usted: nadie de {{prestadora}} la ve ni la conoce.\n\nSi usted no llamó para pedirlo, avise ahora mismo.',
   E'{{nombre}}: {{prestadora}} allowed you, for a short time, to choose a new password. You choose it: nobody at {{prestadora}} sees it or knows it.\n\nIf you did not call to ask for this, say so right away.',
   E'{{nombre}}: a {{prestadora}} permitiu por um tempo curto que você escolha uma senha nova. Você escolhe a senha: ninguém da {{prestadora}} a vê nem a conhece.\n\nSe você não ligou para pedir isso, avise agora mesmo.'),

  ('cierre_del_servicio.cuerpo',
   'Se cerró el Servicio en el que participaba. Para consultas, comuníquese con su Coordinador.',
   'The Service you were taking part in has been closed. For questions, contact your Coordinator.',
   'O Serviço do qual participava foi encerrado. Para dúvidas, entre em contato com o seu Coordenador.'),

  ('clave_recuperada.asunto',
   'Se cambió la contraseña de su cuenta en {{prestadora}}',
   'Your {{prestadora}} account password was changed',
   'A senha da sua conta na {{prestadora}} foi alterada'),

  ('clave_recuperada.texto',
   E'{{nombre}}: la contraseña de su cuenta acaba de cambiarse.\n\nSi no fue usted, avise a {{prestadora}} ahora mismo.',
   E'{{nombre}}: the password on your account has just been changed.\n\nIf this was not you, tell {{prestadora}} right away.',
   E'{{nombre}}: a senha da sua conta acaba de ser alterada.\n\nSe não foi você, avise a {{prestadora}} agora mesmo.'),

  ('codigo_instruccion_personas_autorizadas.asunto',
   '{{remite}}: código para confirmar los accesos de sus personas autorizadas',
   '{{remite}}: code to confirm the access of your authorized people',
   '{{remite}}: código para confirmar os acessos das suas pessoas autorizadas'),

  ('codigo_instruccion_personas_autorizadas.texto',
   'Su código para confirmar la instrucción sobre los accesos de sus personas autorizadas es {{codigo}}. Vence en {{minutos}} minutos. Si no lo pidió usted, no lo use y avise a {{remite}}.',
   'Your code to confirm the instruction about the access of your authorized people is {{codigo}}. It expires in {{minutos}} minutes. If you did not ask for it, do not use it and let {{remite}} know.',
   'O seu código para confirmar a instrução sobre os acessos das suas pessoas autorizadas é {{codigo}}. Vence em {{minutos}} minutos. Se não pediu, não o use e avise {{remite}}.'),

  ('documento_observado.cuerpo',
   '{{documento}}: {{motivo}}. Vuelva a cargarlo.',
   '{{documento}}: {{motivo}}. Upload it again.',
   '{{documento}}: {{motivo}}. Envie-o novamente.'),

  ('documento_para_firmar.enviado',
   'Correo enviado',
   'Email sent',
   'E-mail enviado'),

  ('documento_para_firmar.enviar',
   'Enviar correo',
   'Send email',
   'Enviar e-mail'),

  ('documento_por_vencer.cuerpo',
   '{{documento}} vence el {{fecha}}. Suba la renovación.',
   '{{documento}} expires on {{fecha}}. Upload the renewal.',
   '{{documento}} vence em {{fecha}}. Envie a renovação.'),

  ('documento_vencido.cuerpo',
   '{{documento}} venció el {{fecha}}. Suba la renovación.',
   '{{documento}} expired on {{fecha}}. Upload the renewal.',
   '{{documento}} venceu em {{fecha}}. Envie a renovação.'),

  ('email_cambiado.asunto',
   'Cambió el correo de su cuenta',
   'Your account email changed',
   'O e-mail da sua conta mudou'),

  ('email_cambiado.texto',
   'El correo de su cuenta en {{empresa}} cambió. Si usted no pidió este cambio, comuníquese con {{empresa}}.',
   'The email on your {{empresa}} account changed. If you did not ask for this change, contact {{empresa}}.',
   'O e-mail da sua conta na {{empresa}} mudou. Se você não pediu esta alteração, entre em contato com {{empresa}}.'),

  ('entrada_desde_equipo_nuevo.texto',
   E'{{nombre}}: alguien entró a su cuenta desde un equipo que nunca antes se usó para entrar a ella.\n\nSi no fue usted, cambie su contraseña y cierre la sesión en todos los equipos desde su propia pantalla.',
   E'{{nombre}}: someone signed in to your account from a device never used before to sign in to it.\n\nIf this was not you, change your password and sign out on every device from your own screen.',
   E'{{nombre}}: alguém entrou na sua conta a partir de um equipamento nunca usado antes para entrar nela.\n\nSe não foi você, troque a sua senha e feche a sessão em todos os equipamentos pela sua própria tela.'),

  ('entrevista_agendada.cuerpo',
   E'Su entrevista está agendada para el {{cuando}}.\n\nEl día de la entrevista, ingrese con el enlace siguiente:\n{{enlace}}\n\nEl acceso se abre {{anticipo}} minutos antes de la hora. No necesita instalar nada ni crear una cuenta.',
   E'Your interview is scheduled for {{cuando}}.\n\nOn the day of the interview, join with the following link:\n{{enlace}}\n\nAccess opens {{anticipo}} minutes before the start time. You do not need to install anything or create an account.',
   E'Sua entrevista está marcada para {{cuando}}.\n\nNo dia da entrevista, entre pelo link a seguir:\n{{enlace}}\n\nO acesso abre {{anticipo}} minutos antes do horário. Não é necessário instalar nada nem criar uma conta.'),

  ('entrevista_reprogramada.cuerpo',
   E'Su entrevista está agendada para el {{cuando}}.\n\nIngrese por el mismo enlace de siempre:\n{{enlace}}\n\nEl acceso se abre {{anticipo}} minutos antes de la hora.',
   E'Your interview is scheduled for {{cuando}}.\n\nJoin through the same link as before:\n{{enlace}}\n\nAccess opens {{anticipo}} minutes before the start time.',
   E'Sua entrevista está marcada para {{cuando}}.\n\nEntre pelo mesmo link de sempre:\n{{enlace}}\n\nO acesso abre {{anticipo}} minutos antes do horário.'),

  ('estado_postulacion.aprobado',
   '{{empresa}} aprobó su postulación y se va a comunicar con usted.',
   '{{empresa}} approved your application and will get in touch with you.',
   'A {{empresa}} aprovou a sua candidatura e vai entrar em contato com você.'),

  ('estado_postulacion.asunto',
   '{{empresa}}: su postulación',
   '{{empresa}}: your application',
   '{{empresa}}: a sua candidatura'),

  ('estado_postulacion.rechazado',
   'Gracias por su interés en {{empresa}}. En esta oportunidad, {{empresa}} no avanza con su postulación.',
   'Thank you for your interest in {{empresa}}. At this time, {{empresa}} is not moving forward with your application.',
   'Obrigado pelo interesse na {{empresa}}. Desta vez, a {{empresa}} não avança com a candidatura.'),

  ('recuperacion_clave.antes_del_enlace',
   'Elija la contraseña nueva con el enlace siguiente:',
   'Choose your new password with the following link:',
   'Escolha a senha nova pelo link a seguir:'),

  ('recuperacion_clave.asunto',
   'Restablezca su contraseña en {{empresa}}',
   'Reset your {{empresa}} password',
   'Redefina a sua senha na {{empresa}}'),

  ('recuperacion_clave.boton',
   'Elegir una contraseña nueva',
   'Choose a new password',
   'Escolher uma senha nova'),

  ('recuperacion_clave.cuerpo',
   'Se pidió una contraseña nueva para su cuenta en {{empresa}}.',
   'A new password was requested for your {{empresa}} account.',
   'Foi pedida uma senha nova para a sua conta na {{empresa}}.'),

  ('recuperacion_clave.pie_de_aviso',
   'El enlace vence en {{horas}} horas y sirve una sola vez. Si no lo pidió, puede ignorar este correo: su contraseña sigue siendo la de siempre.',
   'The link expires in {{horas}} hours and works only once. If you did not ask for it, you can ignore this email: your password stays as it was.',
   'O link expira em {{horas}} horas e serve uma só vez. Se não pediu, pode ignorar este e-mail: a sua senha continua a mesma.'),

  ('vencimiento_documentos.asunto_uno',
   'Vencimientos próximos de {{etiqueta}}: {{cuantos}} Asistente',
   '{{etiqueta}} expiring soon: {{cuantos}} care worker',
   'Vencimentos próximos de {{etiqueta}}: {{cuantos}} Assistente'),

  ('vencimiento_documentos.asunto_varios',
   'Vencimientos próximos de {{etiqueta}}: {{cuantos}} Asistentes',
   '{{etiqueta}} expiring soon: {{cuantos}} care workers',
   'Vencimentos próximos de {{etiqueta}}: {{cuantos}} Assistentes');

UPDATE public.mensajes_del_sistema m
   SET i18n = m.i18n || jsonb_build_object('es-AR', c.es, 'en', c.en, 'pt-BR', c.pt)
  FROM mensajes_corregidos c
 WHERE m.clave = c.clave AND m.prestadora_id IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Comprobación: cada texto quedó corregido. Si no, se deshace todo.
-- ---------------------------------------------------------------------------------------------

DO $$
DECLARE
  faltan int;
BEGIN
  SELECT count(*) INTO faltan
    FROM mensajes_corregidos c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.mensajes_del_sistema m
      WHERE m.clave = c.clave AND m.prestadora_id IS NULL
        AND m.i18n ->> 'es-AR' = c.es AND m.i18n ->> 'en' = c.en AND m.i18n ->> 'pt-BR' = c.pt);
  IF faltan > 0 THEN
    RAISE EXCEPTION 'Quedaron % mensajes del sistema sin corregir', faltan;
  END IF;

  SELECT count(*) INTO faltan FROM public.advertencias_legales
   WHERE jurisdiccion = 'AR' AND funcion_clave IN ('penalizacion_inasistencias', 'ranking_plataforma')
     AND (texto_advertencia LIKE '%Conviene%' OR texto_advertencia LIKE '%ranking%' OR texto_advertencia LIKE '%—%');
  IF faltan > 0 OR (SELECT count(*) FROM public.advertencias_legales
                     WHERE jurisdiccion = 'AR' AND funcion_clave IN ('penalizacion_inasistencias', 'ranking_plataforma')) <> 2 THEN
    RAISE EXCEPTION 'Las advertencias legales no quedaron corregidas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.indices_de_actualizacion
                  WHERE codigo = 'ipc_indec_nacional'
                    AND nombre = 'IPC INDEC, nivel general nacional (base diciembre 2016 = 100)') THEN
    RAISE EXCEPTION 'El índice de actualización no quedó corregido';
  END IF;

  SELECT count(*) INTO faltan FROM public.textos_consentimiento
   WHERE jurisdiccion = 'AR' AND vigente_hasta IS NULL
     AND (titulo LIKE '%—%' OR cuerpo LIKE '%—%'
          OR cuerpo LIKE '%requieran%' OR cuerpo LIKE '% acá %' OR cuerpo LIKE '%Acá %'
          OR cuerpo LIKE '%aqui %' OR cuerpo LIKE 'We %' OR cuerpo LIKE 'Registramos%');
  IF faltan > 0 THEN
    RAISE EXCEPTION 'Quedaron % textos de consentimiento sin corregir', faltan;
  END IF;

  IF (SELECT count(*) FROM public.textos_consentimiento
       WHERE jurisdiccion = 'AR' AND clave = 'seguimiento_ubicacion' AND version = 2
         AND modalidad = 'autonomo' AND vigente_hasta IS NULL
         AND (cuerpo LIKE 'La aplicación registra %' OR cuerpo LIKE 'The app records %'
              OR cuerpo LIKE 'O aplicativo registra %')) <> 6 THEN
    RAISE EXCEPTION 'El consentimiento de ubicación, versión 2, no quedó corregido en sus seis textos';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
