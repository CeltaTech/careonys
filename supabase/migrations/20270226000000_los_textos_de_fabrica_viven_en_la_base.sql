-- Los textos de fábrica de la medicación y del Pagador pasan a la base.
--
-- Hasta acá vivían escritos en el código, mientras que el de signos vitales ya estaba en
-- `textos_consentimiento`: dos soluciones para lo mismo. Todo texto vive en la base, por país y por
-- idioma, y cada Prestadora puede reemplazarlo por el suyo desde Configuración. El contenido es el
-- mismo que regía en el código, carácter por carácter.

INSERT INTO textos_consentimiento (jurisdiccion, clave, modalidad, version, idioma, titulo, cuerpo, puntos_clave, es_borrador)
VALUES
  ('AR', 'consentimiento_medicacion', NULL, 1, 'es-AR',
   E'Medicación que carga el Cliente',
   E'Declaro bajo juramento que los datos correspondientes a la prescripción médica —incluyendo el tratamiento, la medicación, la dosificación, la frecuencia, la vía de administración y la vigencia del período indicado— concuerdan fiel y exactamente con lo dispuesto por el profesional médico tratante.\n\nEn virtud de ello, asumo plena y exclusiva responsabilidad por la correcta carga e ingreso de dicha información en el sistema.\n\nLa entidad {{prestadora}} y el personal interviniente en la administración de la medicación actuarán sobre la base de la información registrada en el sistema, la cual reviste carácter de declaración jurada, quedando liberados de toda responsabilidad derivada de errores, omisiones o inexactitudes en la carga efectuada por el declarante.',
   '{}', false),
  ('AR', 'consentimiento_medicacion', NULL, 1, 'en',
   E'Medication entered by the Client',
   E'I declare under oath that the data of the medical prescription —including the treatment, the medication, the dosage, the frequency, the route of administration and the validity of the indicated period— faithfully and exactly match what was ordered by the treating physician.\n\nAccordingly, I assume full and exclusive responsibility for the correct entry of this information into the system.\n\nThe entity {{prestadora}} and the staff involved in administering the medication will act on the basis of the information recorded in the system, which has the nature of a sworn statement, and are released from all liability arising from errors, omissions or inaccuracies in the entry made by the declarant.',
   '{}', false),
  ('AR', 'consentimiento_medicacion', NULL, 1, 'pt-BR',
   E'Medicação cadastrada pelo Cliente',
   E'Declaro sob juramento que os dados correspondentes à prescrição médica —incluindo o tratamento, a medicação, a dosagem, a frequência, a via de administração e a vigência do período indicado— correspondem fiel e exatamente ao disposto pelo profissional médico responsável.\n\nEm virtude disso, assumo plena e exclusiva responsabilidade pelo correto cadastro e inserção dessas informações no sistema.\n\nA entidade {{prestadora}} e o pessoal envolvido na administração da medicação atuarão com base nas informações registradas no sistema, as quais têm caráter de declaração juramentada, ficando isentos de toda responsabilidade decorrente de erros, omissões ou inexatidões no cadastro efetuado pelo declarante.',
   '{}', false),
  ('AR', 'consentimiento_pagador', NULL, 1, 'es-AR',
   E'Consentimiento a la obligación de pagar',
   E'CONSENTIMIENTO A LA OBLIGACIÓN DE PAGAR\n\nPrestadora: {{prestadora}}\nQuien se obliga: {{pagador}}\nDocumento: {{documento}}\nFirma en su representación: {{apoderado}}\nServicio contratado para: {{cliente}}\nFecha: {{fecha}}\n\n------------------------------------------------------------------------\n\nQuien firma declara que conoce el servicio contratado y asume la obligación de pagarlo\na {{prestadora}}, en las condiciones y con la periodicidad que se hayan acordado.\n\nEsta obligación es propia y no depende de que un tercero —una obra social, una prepaga u\notra entidad— reconozca, autorice o pague la prestación.\n\nQuien firma puede dejar de estar obligado para adelante avisándolo por escrito a la\nPrestadora. Lo que ya se prestó hasta ese aviso queda alcanzado por esta obligación.\n\nLos datos personales que se dejan acá se usan para facturar y cobrar el servicio, y para\nnada más.\n\n------------------------------------------------------------------------\n\nFirma: ................................................................\n\nAclaración: ...........................................................\n',
   '{}', false);

NOTIFY pgrst, 'reload schema';
