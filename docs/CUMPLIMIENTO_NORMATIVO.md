# A qué normas da cumplimiento Careonys

Este documento cita, con artículo, cada norma que alcanza a Careonys en Estados Unidos, Europa y
Latinoamérica, y dice para cada una en qué estado está el sistema. Está escrito para que lo lea un
auditor o el área de compras de un comprador, y para que cada afirmación se pueda verificar contra
el producto.

**Tres estados, y no hay un cuarto.**

| Estado | Qué significa |
|---|---|
| **Cumple** | Está construido y se puede mostrar funcionando |
| **En obra** | Está planificado en `docs/PLAN_CUMPLIMIENTO_NORMATIVO.md` o en `docs/PLAN_AISLAMIENTO_DE_RAIZ.md`, con su tramo |
| **No alcanza** | La norma no aplica al producto, y se dice por qué |

Lo que no está en ninguno de los tres no se afirma.

**Lo que este documento no dice.** No afirma ninguna certificación. No existe certificación de
HIPAA de ninguna clase, ni oficial ni acreditada: todo sello que diga «HIPAA certified» es
autoafirmación y jurídicamente no sirve como defensa. Tampoco existe «estar certificado en GDPR»:
los arts. 42 y 43 certifican operaciones concretas, no organizaciones, y el art. 42(4) dice que la
certificación no reduce la responsabilidad. SOC 2 es una atestación y C5 es un dictamen de auditor,
ninguno de los dos es certificación. ISO/IEC 27001 sí se certifica, y hoy Careonys no la tiene.

**Qué es CeltaTech frente a cada norma.** CeltaTech desarrolla y licencia el software; quien presta
el servicio de cuidado es el Cliente. En el vocabulario de las normas, el Cliente es el responsable
del tratamiento —*covered entity* en Estados Unidos, *responsable*, *controlador* o *controlador* en
Latinoamérica— y CeltaTech es el encargado —*business associate*, *encargado*, *operador*,
*operador*—. Eso determina qué obligación es de cada uno, y está señalado en cada renglón.

---

## 1. Estados Unidos

### HIPAA — 45 CFR Partes 160 y 164

| Artículo | Qué exige | Estado |
|---|---|---|
| **164.308(b)(1)** y **164.502(e)** | Contrato de business associate con cada proveedor que toque datos de salud, incluido el proveedor de nube | **En obra** — tramo 1. Exige nivel de servicio con acuerdo firmado en el proveedor de base de datos |
| **164.312(a)(2)(i)** «Required» | Identificación única de cada persona que accede | **En obra** — tramo 8. Es «Required»: una cuenta compartida es incumplimiento sin evaluación de riesgo que valga |
| **164.312(a)(2)(ii)** «Required» | Procedimiento de acceso de emergencia | **En obra** — tramo 8 |
| **164.312(a)(2)(iii)** | Cierre de sesión automático | **En obra** — tramo 8. Hoy existe sólo para el permiso de acceso de CeltaTech |
| **164.312(a)(2)(iv)** y **164.312(e)(2)(ii)** | Cifrado en reposo y en tránsito, «Addressable» | **Cumple en tránsito** (TLS forzado). **En obra** el resto — tramo 9 |
| **164.306(d)(3)** | Lo «Addressable» que no se implementa se documenta por escrito | **En obra** — tramo 12 |
| **164.312(b)** | Registro que examine la actividad sobre los sistemas con datos de salud | **En obra** — tramo 2. Hoy se registran escrituras, no lecturas |
| **164.308(a)(1)(ii)(D)** «Required» | **Revisar** periódicamente los registros, con constancia | **En obra** — tramo 3 |
| **164.308(a)(1)(ii)(A)** | Análisis de riesgos | **En obra** — tramo 12, con el Apéndice C de NIST SP 800-66r2, que enumera el acceso entre clientes como amenaza |
| **164.306(a)(2)** | Protección frente a amenazas razonablemente anticipadas | **En obra** — plan de aislamiento completo |
| **164.308(a)(7)(ii)(A)(B)(C)** «Required» | Copia exacta y recuperable, restauración, modo de emergencia | **En obra** — tramo 10 |
| **164.308(a)(4)** y mínimo necesario **164.502(b)** | Acceso acotado a lo necesario | **En obra** — plan de aislamiento, tramos 1 a 4 |
| **164.312(d)** | Verificación de identidad de quien accede | **Cumple parcialmente**: segundo factor construido. **En obra** encenderlo — tramo 8 |
| **164.410** | El business associate notifica la brecha al covered entity | **En obra** — tramo 6, construido para 24 horas |
| **164.402(2)** | Presunción de brecha salvo evaluación de cuatro factores, con carga de la prueba de la empresa | **En obra** — tramo 6 |
| **164.404(c)** | Contenido mínimo del aviso, cinco elementos | **En obra** — tramo 6 |
| **164.316(b)(2)(i)** | Conservar la documentación seis años | **En obra** — tramo 12 |
| **164.504(e)(2)(ii)(J)** | Devolver o destruir los datos al terminar el contrato, alcanzando las copias | **En obra** — tramo 4 |

**42 U.S.C. §17941 (HITECH).** El regulador debe considerar las prácticas de seguridad reconocidas
acreditadas **durante no menos de los doce meses anteriores** al incidente. No es puerto seguro y no
impide la sanción, pero es la única palanca real que existe, y lo adoptado después del incidente no
cuenta. **En obra** — tramo 12.

**Estados.** Texas exige notificar dentro de los 30 días y avisar al Fiscal General cuando alcanza a
250 residentes. California permite reclamar 1.000 dólares nominales por persona sin probar daño, lo
que convierte cualquier brecha en litigio colectivo viable. **En obra** — tramo 6.

**Lo que HIPAA no exige, y por eso no se construye por esta vía:** segundo factor, prueba de
penetración, escaneo de vulnerabilidades, inventario de activos, auditoría anual —el 164.308(a)(8)
dice «periódica» sin definir plazo—, prueba de restauración, plazo o formato del registro de
accesos, ni localización de los datos. Varias de esas cosas están igual en el plan, pero por otras
normas o por el mercado. La ausencia de prescripción no es ausencia de obligación: el auditor juzga
la elección contra el propio análisis de riesgos.

**El proyecto de reglamento de enero de 2025 (90 FR 898) no es ley.** Está en acciones de largo
plazo con fecha proyectada en julio de 2027. No se construye contra él.

---

## 2. Unión Europea

### Reglamento General de Protección de Datos — 2016/679

| Artículo | Qué exige | Estado |
|---|---|---|
| **9(1) y 9(2)(h)** | Los datos de salud están prohibidos salvo excepción; la de asistencia sanitaria exige además el art. 9(3) | **Cumple** la estructura de consentimiento con texto versionado. **En obra** el secreto profesional del art. 9(3) — tramo 8 |
| **28(3)** | Contrato con el encargado, con contenido obligatorio | Es del contrato entre CeltaTech y el Cliente |
| **28(3)(f)** | El encargado asiste al responsable en la evaluación de impacto | **En obra** — tramo 12 |
| **28(10)** | Si el encargado determina fines propios, pasa a ser responsable | **Cumple**: no se entrenan modelos con datos de los Clientes — tramo 13 |
| **30(2)** | Registro de actividades del encargado. La exención del 30(5) no aplica porque se tratan datos del art. 9 | **En obra** — tramo 12 |
| **32(1)(b)** | Confidencialidad, integridad, disponibilidad y resiliencia permanentes | **En obra** — plan de aislamiento |
| **32(1)(d)** | **Verificar periódicamente la eficacia** de las medidas | **En obra** — tramo 12. Es lo que convierte la prueba de aislamiento en obligación legal |
| **33(2)** | El encargado avisa al responsable sin dilación indebida, **sin umbral** | **En obra** — tramo 6 |
| **33(5)** | Documentar toda violación, se notifique o no | **En obra** — tramo 6 |
| **34(3)(a)** | El cifrado exime de comunicar a las personas, **nunca** de notificar a la autoridad | **En obra** — tramo 9 |
| **35** | Evaluación de impacto obligatoria y **previa**: concurren el 35(3)(b) y cuatro criterios de la guía WP248 rev.01 contra un umbral de dos | **En obra** — tramo 12 |
| **15, 16, 17, 20** | Acceso, rectificación, supresión y portabilidad | **En obra** — tramo 5 |
| **17(3)** | El borrado es **por dato**, no por cuenta: «en la medida en que» | **En obra** — tramo 4 |
| **9(4)** | Los plazos de conservación de datos de salud los fija la ley nacional | **En obra** — tramos 4 y 11 |
| **Capítulo V** | Transferencia internacional. Brasil no tiene decisión de adecuación | **En obra** — tramo 1 |

### Alemania

- **§203 StGB** — secreto profesional. El §203(4) extiende la responsabilidad penal a quien colabora
  con el obligado: el personal técnico del proveedor queda alcanzado. **En obra** — tramo 8.
- **§393 SGB V** — desde el 1 de julio de 2025 exige **dictamen BSI C5 Tipo 2 vigente** y limita el
  lugar de tratamiento a Alemania, el Espacio Económico Europeo o un tercer país adecuado donde el
  proveedor tenga establecimiento nacional. **En obra** — tramo 1. Con los datos en Brasil, Alemania
  no se puede vender.
- **No hay obligación legal de conexión a la infraestructura telemática para cuidados
  domiciliarios.** El §106b SGB XI la financia pero no la impone, y el §378 SGB V alcanza a la
  atención médica contratada, no al cuidado domiciliario. Si un Cliente afirma una fecha
  obligatoria, se le pide el parágrafo.
- **El producto no es una DiGA** (§139e SGB V) y no se persigue esa inscripción.

### Francia

- **Art. L.1111-8 del Code de la santé publique** — alojar datos de salud exige alojador certificado
  HDS. **Art. L.1115-1** — hacerlo sin certificación es delito. **En obra** — tramo 1. Es condición
  para vender en Francia y hoy no se cumple.
- **El référentiel HDS no se pudo leer** y por eso no se afirma nada sobre su contenido de
  compartimentación entre clientes.

### España

- **LO 3/2018.** La disposición adicional decimoséptima remite a la legislación sanitaria para los
  plazos de historia clínica. **En obra** — tramo 11.
- **El Esquema Nacional de Seguridad (RD 311/2022) no alcanza** a un producto vendido a clientes
  privados.

### Suecia y Países Bajos

- **Patientdatalagen 4 kap. 2 §** — el acceso exige relación de cuidado con el paciente. No alcanza
  con pertenecer a la organización. **En obra** — tramo 3.
- **NEN 7513:2018** rige el registro de accesos en Países Bajos. **Es una norma de pago y no se
  leyó.** No se afirma cumplirla y no se diseña el registro contra una lista recordada.

### Directiva NIS2 — 2022/2555

Aviso temprano a las **24 horas**, notificación a las 72 y informe final al mes. Es el reloj más
corto del conjunto y por eso el sistema se construye para 24 horas. **En obra** — tramo 6.

### Espacio Europeo de Datos Sanitarios — 2025/327

No obliga todavía. Autocertificación desde el 26 de marzo de 2029 y ampliación en 2031, sin
organismo notificado. El art. 26(2) considera puesto en servicio el software ofrecido como servicio,
así que alcanzará al producto.

- **Anexo II sección 3** — cinco campos por evento de acceso. **En obra** — tramo 2.
- **Art. 9** — el paciente puede saber quién accedió a lo suyo, con tres años de disponibilidad.
  **En obra** — tramo 2.
- **Anexo II sección 2** — exportación en formato interoperable. **En obra** — tramo 5.
- **Art. 54** — prohíbe el uso de los datos para entrenar modelos. **Cumple** — tramo 13.

### Reglamento de Inteligencia Artificial — 2024/1689

- **Art. 50** — transparencia. **Rige desde el 2 de agosto de 2026**, sin aplazamiento.
- **Anexo III punto 4(b)** — alto riesgo: sistemas que asignan tareas según comportamiento o rasgos
  personales, o evalúan desempeño. Un emparejamiento o una planificación de Asistentes con
  puntuación cae acá. Rige desde el **2 de diciembre de 2027**, con autoevaluación. **En obra** —
  tramo 13.
- **No es alto riesgo por la vía sanitaria** del Anexo III punto 5(a), que requiere que lo use una
  autoridad pública.
- **El Reglamento de ciberresiliencia (2024/2847) no alcanza al software como servicio**; entraría
  por la aplicación de teléfono y su servidor.

---

## 3. Latinoamérica

Diez países relevados. Para cada uno, la autoridad, la norma de protección de datos, la norma de
historia clínica, el plazo de conservación, el plazo de brecha y el mecanismo de transferencia
internacional.

| País | Norma de datos | Historia clínica | Conservación | Brecha |
|---|---|---|---|---|
| **Argentina** | Ley 25.326 y Decreto 1558/2001 — AAIP. Arts. 2, 4(7), 7, 8, 9, 10, 11(4), 21 y 25. Res. AAIP 47/2018 y 126/2024 | Ley 26.529 y Decreto 1089/2012; Ley 27.553 y **Decreto 98/2023**; Ley 27.706 | Mínimo 10 años **desde la última actuación**; copia al paciente en 48 horas | Sin plazo legal |
| **Brasil** | LGPD 13.709/2018 — ANPD, hoy agencia reguladora por Lei 15.352/2026. Arts. 5º II, 11, 42 §1º, 46, 48, 41. Res. CD/ANPD 15/2024 y 19/2024 | Res. CFM 1.821/2007; Lei 13.787/2018; Lei 14.510/2022; Res. CFM 2.314/2022; RDC ANVISA 11/2006 | **20 años desde el último registro, cualquier soporte** (Lei 13.787/2018 art. 6º §5) | 3 días hábiles, a la autoridad y al titular |
| **Chile** | Ley 19.628; **Ley 21.719 vigente desde el 1-12-2026**, crea la APDP. Arts. 1 bis, 13, 14 quinquies, 14 sexies, 15 bis, 15 ter, 16 bis, 27-29, 34 quáter | Ley 20.584 arts. 3, 12 y 13; **Decreto 41/2012 arts. 6-13**; Ley 21.541 (telemedicina); Ley 21.668 | **15 años desde el último ingreso de información** (Decreto 41/2012 art. 11). Eliminar después es **facultativo** (art. 12) | **«Sin dilaciones indebidas»**, sin plazo en horas. También al titular por ser datos sensibles |
| **México** | LFPDPPP de 2025, vigente desde el 21-03-2025. Autoridad: Secretaría Anticorrupción y Buen Gobierno | NOM-004-SSA3-2012 5.4; **NOM-024-SSA3-2012** | 5 años desde el último acto médico | De inmediato, **sólo al titular** |
| **Colombia** | Ley 1581/2012, Ley 1266/2008, Decreto 1074/2015 — SIC. Arts. 5, 6, 17 f) y n), 23 d) | Res. 1995/1999 mod. **839/2017**; Ley 2015/2020; Res. 1888/2025 | **15 años desde la última atención**: 5 de gestión + 10 de archivo central | **15 días hábiles**, sólo a la autoridad |
| **Perú** | Ley 29733 y **DS 016-2024-JUS, vigente desde el 30-03-2025**. Arts. 34, 37, 46, 51, 52; 132-134 | NTS 139-MINSA/2018/DGAIN (RM 214-2018); RENHICE (Ley 30024 y **DS 039-2015-SA**) | ⚠️ Sin verificar: las fuentes discrepan entre 15 y 20 años | **48 horas**, a la autoridad **y al titular** |
| **Uruguay** | Ley 18.331 arts. 4 E, 18, 19 y 23; Decreto 414/009; Decreto 64/020 arts. 4, 6 y 10. **Adecuación europea por Decisión 2012/484/UE** | HCEN: Decreto 242/017 arts. 3, 13 y 16; Decreto 122/019; Ley 19.869 y Decreto 127/024 (telemedicina) | 2 + 3 = 5 años (Decreto 355/982), pero es **facultad de destruir, no obligación de conservar**; la historia electrónica **no se borra** (242/017 art. 13) | 72 horas, **sólo a la autoridad** |
| **Ecuador** | LOPDP de 2021 y Reglamento — SPDP. **Art. 31: los datos de salud se seudonimizan «siempre que sea posible»**. Arts. 3, 34, 42, 43, 46, 47, 48, 51. Res. SPDP-SPD-2026-0004-R | AM-00115-2021, AM-5216-2014, AM-5316-2016 | 15 años desde la última atención | **5 días hábiles** a la SPDP **y a ARCOTEL** (art. 43); el encargado avisa al responsable en **2 días**; al titular, **3 días desde que se conoció el riesgo** (art. 46) |
| **Costa Rica** | Ley 8968 —**sin ninguna reforma desde 2011**— y Decreto 37554-JP, reformado por los decretos 40008-JP y 41582 — PRODHAB. Arts. 5, 9, 10, 11, 14; reglamento arts. 32, 34, 45, 47 | Reglamento del Expediente de Salud de la CCSS: arts. 10, 16, 17, 19, 32, 50 | Pasivo a los 5 años (art. 50); **desasociar a los 10 (Ley art. 6)** | **5 días hábiles desde que ocurrió el hecho**, no desde que se conoce (reglamento art. 38), **al titular y a la autoridad** (art. 39) |
| **Panamá** | Ley 81 de 2019 y Decreto 285 de 2021 — ANTAI. Arts. 8, 13, 19, 20, 28, 31, 47-50; decreto arts. 8, 33, 35, 36, 38 | Ley 68 de 2003 **arts. 49 y 50**; telesalud Ley 203 de 2021, que impone **HL7 obligatorio** | **20 años desde la muerte del paciente** (Ley 68 art. 49), y el mismo plazo para el núcleo documental tasado del art. 50 | De inmediato y dentro de **72 horas**, a los dos |

### Argentina, que es donde se vende primero

Es el país más fácil de los diez, y aun así hay un punto que hay que resolver antes de la primera
Prestadora real.

**Alojar en São Paulo es, para Argentina, transferencia a un país sin legislación adecuada.** El
art. 3 de la Disposición 60-E/2016, sustituido por el art. 1 de la Resolución AAIP 34/2019 y
vigente, enumera taxativamente los países adecuados: los de la Unión Europea y el Espacio Económico
Europeo, el Reino Unido, Suiza, Guernsey, Jersey, Isla de Man, Islas Feroe, Canadá sólo en su
sector privado, Andorra, Nueva Zelanda, Uruguay e Israel sólo para datos de tratamiento
automatizado. **Brasil no está.**

El art. 12(1) de la Ley 25.326 prohíbe la transferencia hacia países sin protección adecuada. Su
inciso 2(b) exceptúa el intercambio de datos médicos cuando lo exija el tratamiento del afectado o
una investigación epidemiológica: **es una excepción angosta, para un intercambio concreto, y no
habilita alojar el padrón completo de una Prestadora en Brasil.** No se la invoca.

**Lo que sí habilita: las cláusulas contractuales tipo del Anexo II de la Disposición 60-E/2016**,
que son precisamente las de prestación de servicios de tratamiento, incorporadas al contrato entre
CeltaTech y la Prestadora. **En obra** — tramo 1. Es un requisito del contrato, no del código, y hay
que tenerlo firmado antes del alta. Si el contrato se aparta del modelo, hay que presentarlo a la
AAIP dentro de los 30 días corridos de firmado.

**Y hay cuatro países donde alojar no necesita ningún instrumento**, porque la propia lista los
declara adecuados: la Unión Europea, el Reino Unido, Suiza y **Uruguay**. Uruguay es el único de
la región, y es el de menor demora de conexión desde Argentina. No se propone mudar nada: queda
anotado porque la decisión de región todavía no se tomó y este dato la cambia.

**Un aislamiento que falle no es un descuido: es una cesión.** El art. 11(4) dice que en una cesión
el cesionario queda sujeto a las mismas obligaciones y **el cedente responde solidaria y
conjuntamente**. Si datos de una Prestadora alcanzaran a otra, eso es jurídicamente una cesión sin
consentimiento del titular, y arrastra a las dos. Es el argumento legal —no técnico— del plan de
aislamiento.

**El contrato con el encargado es obligatorio y tiene contenido mínimo.** No sale de la ley sino de
la reglamentación del art. 25 por el Decreto 1558/2001: contrato escrito, **con los niveles de
seguridad**. Terminada la prestación los datos se destruyen, salvo autorización expresa, y con ella
pueden guardarse hasta dos años.

Lo demás de Argentina:

- **Ley 25.326 arts. 8 y 9.** El art. 8 habilita a los establecimientos sanitarios y a los
  profesionales de la salud a tratar datos de salud respetando el secreto profesional. El art. 9(1)
  exige medidas técnicas y organizativas contra la adulteración, la pérdida y **la consulta o
  tratamiento no autorizado**, y el 9(2) prohíbe registrar datos en bancos que no reúnan condiciones
  técnicas de integridad y seguridad. La medida contra la consulta no autorizada es el aislamiento:
  **en obra**, plan de aislamiento.
- **Resolución AAIP 47/2018.** Medidas de seguridad recomendadas y contenido del informe de
  incidente. No es obligatoria, pero es el estándar contra el que mide la autoridad. **En obra** —
  tramos 2, 6, 8 y 9.
- **Ley 26.529.** Historia clínica cronológica, foliada y completa, propiedad del paciente, con
  copia entregada dentro de las 48 horas y conservación de **diez años como mínimo**. **En obra** —
  tramos 4, 5 y 7.
- **El art. 4(7) manda destruir, y la Ley 26.529 manda guardar diez años.** No es contradicción sino
  dos relojes: el dato deja de ser necesario y se destruye, salvo el que una ley obliga a conservar.
  La consecuencia de producto es que la conservación se parametriza por tipo de dato, con el plazo
  más largo mandando, y nunca hay un borrado automático que alcance al registro clínico. **En obra**
  — tramo 4.
- **Ley 27.553 y Decreto 98/2023 — teleasistencia.** El art. 4 del Anexo es el más exigente que
  tiene Argentina sobre un producto como éste: obliga a resguardar credenciales y accesos, a alojar
  los servidores en lugar seguro, a **detectar desviaciones de información**, a **cifrar audio y
  video** —única exigencia expresa de cifrado en todo el derecho argentino—, y alcanza los registros
  médicos **y los administrativos con nombre**. Su inciso l) dice que **el dato sanitario disociado
  no es dato sensible**, que es lo que habilita los paneles agregados para un tercero pagador.
  ⚠️ Su inciso a) exige que las plataformas **se constituyan como responsables del tratamiento en
  territorio argentino**, lo que choca con el reparto responsable/encargado de la Ley 25.326 y con
  que la responsable es la Prestadora. **Hay que resolverlo con abogado antes de vender**, y sólo
  aplica si Careonys presta teleasistencia en los términos de esa norma.
- **Ley 27.706 art. 7.** Trazabilidad que asocie inequívocamente cada acción a una persona, y al
  menos tres niveles de acceso: consulta; consulta y actualización; consulta, actualización y
  modificación. **En obra** — tramos 2 y 8. ⚠️ Sin verificar si fue reglamentada.
- **Registro de bases del art. 21.** Lo inscribe la Prestadora, es gratuito, y el producto le avisa.
  **En obra** — tramo 11.
- **Sin plazo legal de notificación de brechas.** Se aplica igual el de 24 horas del tramo 6, porque
  el sistema se construye contra el reloj más corto y no por país.
- **Los proyectos de nueva ley de protección de datos no están sancionados.** No se construye contra
  ellos.

**Y falta el documento legal argentino de protección de datos.** `docs/legal/argentina.md` existe,
pero es de riesgo laboral: penalización de inasistencias, rankings, puntuaciones. La regla de la
empresa exige que antes de vender en un país ese país tenga su documento, y la materia de datos de
salud todavía no está escrita ahí. **En obra** — tramo 11.

**Las cinco exigencias que los diez comparten, y que el plan traduce a producto:**

1. **Consentimiento expreso para datos de salud** (Costa Rica art. 5, Panamá art. 8, Brasil art. 11,
   Argentina art. 8, Ecuador, Perú). **Cumple** la estructura; **en obra** los textos por país —
   tramo 11.
2. **Mínimo privilegio, escrito literalmente** en el art. 8 del Decreto 285 panameño. **En obra** —
   plan de aislamiento.
3. **Registro de accesos con identidad y período de todas las personas que ingresaron** (Panamá Ley
   81 art. 31 y Decreto art. 35; Costa Rica reglamento arts. 45 y 47). **En obra** — tramo 2. Hoy no
   se cumple: el registro anota escrituras, no lecturas.
4. **Corrección por nota aclaratoria, nunca por sobreescritura** (Costa Rica CCSS art. 32 y art. 17;
   Brasil; Argentina). **En obra** — tramo 7.
5. **Plazo de conservación y anonimización al vencer** (Costa Rica art. 6, Panamá Decreto art. 7,
   Ecuador art. 31). **En obra** — tramo 4.

**Las obligaciones particulares, que no se deducen de ningún parecido con otro país:**

- **Chile: el aislamiento tiene que seguir adentro de la Prestadora.** Es el hallazgo que más lejos
  llega de los diez países. El art. 13 de la Ley 20.584 prohíbe el acceso de terceros no
  relacionados con la atención «**Ello incluye al personal de salud y administrativo del mismo
  prestador, no vinculado a la atención de la persona**», y el art. 9 del Decreto 41/2012 obliga a
  tomar medidas para impedirlo. No alcanza con separar Prestadora de Prestadora: adentro de una
  Prestadora, quien no participa de la atención de esa persona no puede ver su historia. Es un
  segundo nivel de aislamiento, por vínculo con la atención y no por rol. **En obra** — plan de
  aislamiento y tramo 2.
- **Chile: el registro de accesos es de lecturas, y es reglamentario.** El mismo art. 9 del Decreto
  41/2012: «Este sistema debe llevar registro de las fechas y personas que han accedido a las
  fichas.» No es auditoría de escritura. **En obra** — tramo 2.
- **Chile: no hay refugio geográfico.** El art. 1 bis lit. b) de la Ley 19.628 nueva aplica la ley
  chilena al encargado que trata datos por cuenta de un responsable establecido en Chile, esté
  donde esté y con la base donde esté. Y el art. 3 de la Ley 20.584 lo dice desde el lado sanitario:
  el prestador es el responsable, los proveedores tienen «las responsabilidades propias de un
  mandatario», y **no lo exime usar software de terceros**.
- **Chile: subcontratar el alojamiento necesita permiso escrito de cada Prestadora.** El art. 15 bis
  prohíbe subencargar sin autorización específica y por escrito del responsable, y aun autorizada
  subsiste la responsabilidad solidaria. El proveedor de nube es un subencargado. **En obra** —
  tramo 1.
- **Chile: la situación socioeconómica pasa a ser dato sensible.** El art. 2 lit. g) del texto que
  entra en vigor la pone junto a la salud. Es el segundo país que lo hace, después de Perú. Y el
  matiz importa: lo que el Cliente paga por el servicio se trata por la ejecución del contrato (art.
  13 lit. c), pero una evaluación socioeconómica para asignar escalas de precio o subsidios es dato
  sensible y necesita base propia.
- **Ecuador: seudonimizar sí, anonimizar no.** El art. 31 numeral 2 manda seudonimizar o anonimizar
  los datos de salud «siempre que sea posible». Sobre el dato operativo no se activa —identificar al
  paciente es la finalidad misma del producto—, pero sí sobre todo lo derivado: tableros,
  estadísticas, reportes agregados, entornos de desarrollo y prueba, respaldos analíticos y
  registros de actividad. Y hay una trampa en el numeral 3: **todo tratamiento de datos de salud
  anonimizados necesita autorización previa de la autoridad**, con protocolo técnico e informe
  favorable de la autoridad sanitaria. **No menciona la seudonimización.** De ahí sale la regla del
  producto: se seudonimiza, no se anonimiza. **En obra** — tramo 4.
- **Ecuador exige representante local, y alcanza al encargado.** Art. 3 de la LOPDP y del
  Reglamento: quien no está establecido en Ecuador designa apoderado especial con residencia en el
  país, con poder apostillado. La única excepción —tratamiento ocasional, sin gran escala de
  categorías especiales, sin riesgo— no aplica a un producto de salud por ninguno de los tres
  filtros. Y el art. 6 de la Resolución SPDP-SPDP-2024-0002-R obliga además a **entregarle a la
  autoridad** el acuerdo de encargo, el registro de actividades de tratamiento, el análisis de
  riesgo, el flujo de datos y el detalle de las medidas de seguridad. Es el segundo país con
  representante local, después de Perú. **No alcanza** — es obligación societaria de CeltaTech.
- **Ecuador y Uruguay exigen delegado de protección de datos, y alcanza al encargado.** Ecuador por
  el art. 48 de la LOPDP —gran escala de categorías especiales— con el art. 47 in fine extendiendo
  las obligaciones al encargado, y con requisitos de persona: título de tercer nivel en Derecho,
  Comunicación o Tecnologías y cinco años de experiencia mínima. Uruguay por el art. 10 del Decreto
  64/020, cuando se tratan datos sensibles como actividad principal. **No alcanza** — es obligación
  societaria de CeltaTech, no del producto. En Chile, en cambio, el art. 50 lo deja **potestativo**.
- **El cifrado de audio y video ya no es una rareza argentina: son dos países.** El Decreto 98/2023
  argentino y el art. 10 del Decreto 127/024 uruguayo, que exige «sistema de cifrado actualizado» en
  los servicios con transmisión de audio y video en simultáneo. **En obra** — tramo 9.
- **Uruguay: la historia clínica electrónica no se borra.** El art. 13 del Decreto 242/017: «La
  información no podrá ser alterada o eliminada sin que quede registrada la modificación», y la
  corrección agrega el dato nuevo «sin suprimir lo corregido». Los cinco años del Decreto 355/982
  son **facultad de destruir**, pensada para el papel: quien no destruye no incumple. Refuerza la
  regla del tramo 4 —vencido el plazo el sistema avisa y espera, nunca borra— con un país donde
  borrar sería lo incorrecto.

- **Panamá castiga penalmente la falla de aislamiento.** La Ley 203 de 2021 reformó el art. 291 del
  Código Penal para agravar la intrusión contra bases de datos que contienen información médica. Es
  el único de los diez países donde el riesgo deja de ser administrativo. **En obra** — plan de
  aislamiento.
- **Costa Rica cuenta el plazo de brecha desde el hecho, no desde que se descubre.** El art. 38 del
  reglamento: «cinco días hábiles a partir del momento en que ocurrió la vulnerabilidad». Es el
  reloj más hostil de los diez, porque puede empezar a correr antes de que nadie sepa que hay algo
  que informar, y el art. 39 obliga a avisarle al titular **y** a la autoridad. De acá sale por qué
  el tramo 6 se construye contra detección y no contra aviso. **En obra** — tramo 6.
- **Costa Rica, art. 9 de la Ley 8968.** Tratar datos de salud exige que quien los trate esté sujeto
  a secreto profesional «o a una obligación equivalente de secreto». El personal técnico del
  proveedor tiene que estar contractualmente sujeto, o el tratamiento cae en la prohibición, que es
  falta gravísima. **En obra** — tramo 8.
- **Brasil, art. 11 §4º de la LGPD.** Prohíbe compartir datos de salud con fines de ventaja
  económica. Cierra cualquier monetización, incluso agregada. **Cumple** — tramo 13.
- **Brasil, art. 42 §1º I de la LGPD.** Quien trata datos por cuenta de otro responde
  **solidariamente y queda equiparado al responsable** cuando incumple la ley o se aparta de las
  instrucciones recibidas. Un aislamiento que falle es exactamente ese supuesto, y abre el catálogo
  entero del art. 52: multa, suspensión de la base hasta seis meses y prohibición de tratar. Es, con
  el art. 11(4) argentino, la razón legal del plan de aislamiento. **En obra** — plan de
  aislamiento.
- **Perú: los ingresos económicos del cliente son dato sensible.** El art. 2.5 de la Ley 29733
  pone «ingresos económicos» en la misma categoría que la salud. Es el único de los diez que lo
  hace, y significa que en Perú la facturación entra en la categoría más protegida: consentimiento
  **por escrito con firma** —manuscrita, digital o electrónica—, y las mismas medidas que el dato
  clínico. **En obra** — tramos 4, 8 y 11.
- **Perú: el registro de accesos se conserva dos años y tiene que estar disponible de inmediato.**
  El art. 46 del DS 016-2024-JUS lo dice con esa palabra, y enumera qué anotar: cuentas, hora de
  inicio y de fin de sesión, y las operaciones de tratamiento, **visualización**, modificación,
  eliminación, importación y exportación. Es la exigencia más precisa de los diez países y fija el
  piso del tramo 2. El art. 51 agrega respaldos **semanales** con verificación de integridad, y el
  52 exige cifrado en toda transferencia externa. **En obra** — tramos 2, 9 y 10.
- **Perú exige representante en el país a quien opera desde afuera.** Art. VII del Título Preliminar
  del DS 016-2024-JUS. Es obligación de CeltaTech, no del producto, y es societaria: hay que
  resolverla antes de vender ahí. Ninguno de los otros nueve países la tiene. **No alcanza** — no
  es materia de este plan.

**Transferencia internacional, y la pregunta previa que casi nadie hace.** Antes de preguntarse con
qué instrumento se transfiere, hay que preguntarse **si esto es una transferencia**. Y la respuesta
cambia de país en país, porque cada uno define la palabra a su manera.

**Tres países dicen que entregarle los datos al encargado no es transferencia:**

- **Ecuador.** El art. 4 de la LOPDP define la transferencia como la que se hace «a una persona
  **distinta al titular, responsable o encargado**», y el art. 34 agrega que el acceso del encargado
  no constituye transferencia ni comunicación. El art. 23 de la Resolución SPDP-SPD-2026-0004-R lo
  dice sin rodeos: «el encargo de tratamiento no constituye una transferencia ni comunicación de
  datos personales. En consecuencia, las CCM entre responsables y encargados, emitidas por la RIPD,
  no son aplicables en la República del Ecuador.» Lo que sí exige es el **contrato de encargo** del
  art. 34 y las medidas de los arts. 37-42.
- **Costa Rica.** La definición reformada de transferencia excluye la entrega de datos al encargado
  o al intermediario tecnológico.
- **Uruguay** no lo excluye por definición, pero llegó al mismo resultado por otro camino: la URCDP
  declaró **ajustadas a la normativa nacional las cláusulas contractuales de AWS** (Resolución
  42/022) y autorizó transferencias a servidores de AWS fundadas en ellas (Resolución 18/024). Eso
  es lo que habilita São Paulo para datos uruguayos, y hace falta porque **Brasil no está en la
  lista de países adecuados** de la Resolución URCDP 23/021, ampliada por la 63/023.

**Los que sí la exigen:** Argentina, Brasil y Perú, con las cláusulas del modelo de su autoridad.
**Chile** no tiene todavía lista de países adecuados ni cláusulas modelo —la Agencia no está
constituida—, así que la única vía practicable al 1-12-2026 es la del art. 27 lit. b), cláusulas
contractuales, **y la carga de acreditarlo es de la Prestadora** (art. 28), que sólo puede hacerlo
con documentación que le dé CeltaTech. **Panamá** aprobó las cláusulas de la Red Iberoamericana por
Resolución ANTAI-DG-003-2026, pero para datos de salud su art. 13 vuelve prácticamente ineludible el
consentimiento explícito. **Costa Rica** exige consentimiento expreso que cubra específicamente la
transferencia, sin régimen de adecuación. **Colombia** incluye a Estados Unidos como adecuado por
Circular Externa 005 de 2017, y dentro de la Comunidad Andina las transferencias se consideran
adecuadas. **En obra** — tramos 1 y 11.

**Y una advertencia que vale para los tres países que no llaman transferencia al encargo:** que no
haya que firmar cláusulas de transferencia no alivia nada. El contrato de encargo sigue siendo
obligatorio, con contenido mínimo, y las medidas de seguridad son las mismas. Lo único que
desaparece es un trámite.

**Para Brasil, estar en São Paulo no es un problema: es la solución.** Un dato brasileño alojado en
Brasil no es transferencia y no necesita instrumento alguno. Lo que sí hay que mirar es que las
cláusulas-patrón del Anexo II de la Resolución CD/ANPD 19/2024 se adoptan **íntegras y sin
modificar** —cualquier cambio las invalida— y que el plazo para adaptar contratos anteriores venció
el 23 de agosto de 2025. Brasil reconoció adecuada únicamente a la Unión Europea, por Resolución
CD/ANPD 32/2026. Estados Unidos no está en ninguna de las dos listas, ni la brasileña ni la
argentina.

**Registro de bases ante la autoridad.** Perú inscribe todo banco de datos en el Registro Nacional,
sin umbral y de forma gratuita; Uruguay dentro de los 90 días de iniciar actividad; **Argentina en
el registro del art. 21, gratuito, obligatorio y sin excepción por tamaño de empresa** —incluidas
las cámaras de vigilancia, y alcanza también a responsables no establecidos en el país—; Colombia
sólo por encima de 100.000 UVT de activos, con actualización anual entre el 2 de enero y el 31 de
marzo y aviso de cambios sustanciales dentro de los 10 primeros días hábiles del mes siguiente;
Costa Rica sólo si hay distribución, difusión o comercialización, con un canon de 200 dólares (art.
78 del reglamento) que por ese alcance **no le toca a una Prestadora** ni a CeltaTech; **Ecuador, cada
base o tratamiento dentro de los 10 días hábiles de iniciado** (art. 51 de la LOPDP y art. 86 del
Reglamento), aunque el registro **no figura como trámite publicado** en el catálogo de la autoridad,
que tiene seis y ninguno es éste; Brasil, México y Panamá no tienen registro. **Chile tampoco**, y
además el art. tercero transitorio de la Ley 21.719 ordena **eliminar** el registro de bancos de
datos que hoy lleva el Registro Civil. **En obra** — tramo 11, como aviso por país. Nunca como bloqueo.

Lo que esto le pide al producto es concreto: **cada Prestadora es la responsable y es quien
inscribe**, CeltaTech es el encargado, y el producto tiene que poder entregarle a cada una lo que
el formulario le pide —categorías de datos, medidas de seguridad, personas con acceso, tiempo de
conservación, encargados y países—. Sin eso, la Prestadora no puede inscribir, y sin inscripción
el art. 21(3) argentino prohíbe toda cesión.

**Cinco integraciones nacionales obligatorias que este plan no construye**, y cada una es obra
propia: HCEN uruguayo, interoperabilidad colombiana, RENHICE peruano, la certificación
NOM-024-SSA3-2012 mexicana —que es del producto y hay que obtenerla antes de vender en México— y
**Panamá, que es la más exigente en lo técnico**: la Ley 203 de 2021 impone **HL7 obligatorio**,
clasificación internacional de enfermedades e interoperabilidad con los sistemas públicos, más un
convenio escrito entre la Prestadora y el proveedor tecnológico que hay que poder exhibir ante la
autoridad sanitaria. Y esa misma ley reformó el art. 291 del Código Penal para **agravar penalmente
la intrusión contra bases con datos médicos**: en Panamá una falla de aislamiento no termina en
multa administrativa.

---

## 4. Los marcos de auditoría

Ninguno es ley, y todos los pide el mercado.

| Marco | Qué es | Qué dice sobre separar clientes | Estado |
|---|---|---|---|
| **BSI C5:2026** | Dictamen de auditor, no certificación. Condición legal en Alemania por §393 SGB V | `OPS-30.01B` exige políticas de separación atadas a un modelo documentado de capas, con medidas por capa, monitoreo y acción ante desvíos, y cubre **cliente-de-cliente y cliente-del-proveedor**. `OPS-31.02B`: datos «segura y estrictamente separados». `OPS-31.03B`: revisión ante cambios y **al menos anual**. `OPS-15.01B`: identificación del acceso **a nivel de cliente**. `COS-06.01B`: separación de red | **En obra** — tramos 2, 8 y 12 |
| **ISO/IEC 27017:2015** | Se audita junto con ISO/IEC 27001 | `CLD.9.5.1` — separación lógica de datos, aplicaciones, sistemas operativos, almacenamiento y red, **y separar la administración del proveedor de los recursos de los clientes** | **En obra** — plan de aislamiento |
| **CSA CCM v4** | Cuestionario de mercado | `IVS-06` — el acceso del proveedor y el de cada cliente segmentados, monitoreados y restringidos respecto de otros clientes | **En obra** |
| **SOC 2** | Atestación, no certificación | `CC6.1` es genérico. **No existe una regla de SOC 2 que diga «aísle a sus clientes»**: los controles los define la empresa. Sirve igual, porque es el sustituto de mercado del derecho de auditoría que HIPAA no da | No obtenido |
| **PCI DSS 4.0, Apéndice A1** | Aplica sólo si se procesan tarjetas | El único marco con separación entre clientes dura y con plazo: A1.1.1 a A1.1.3, y **A1.1.4 confirmación de la eficacia de la separación lógica al menos cada seis meses mediante pruebas de penetración**, exigible desde el 31 de marzo de 2025 | **No alcanza** hoy: el cobro lo hacen pasarelas de terceros |
| **ISO 27799** | Guía de seguridad en salud | **No se certifica** | — |
| **HITRUST** | Marco privado | No es requisito legal en ningún país | No obtenido |
| **TISAX** | Sector automotriz | **No alcanza** | — |

**La respuesta honesta a la pregunta que hace todo comprador.** Ninguna norma alcanzada exige que el
control de acceso viva fuera de la aplicación, ni base, esquema o instancia separados por cliente.
**La seguridad a nivel de fila sobre una sola base PostgreSQL es aceptable bajo todos estos marcos.
Lo que no es aceptable es no poder demostrarla**, y la demostración no es un documento de
arquitectura: es una prueba de penetración de tercero dirigida al acceso entre clientes, más una
prueba de aislamiento repetible que **pueda fallar**. Comprobar que una consulta devuelve vacío no
prueba nada, porque una política que niega todo devuelve exactamente lo mismo.

Y hay un hallazgo que deshace una historia de aislamiento por lo demás buena: **una credencial que
pueda leer a todos los clientes.** Hoy Careonys la tiene. Sacarla es el objeto entero de
`docs/PLAN_AISLAMIENTO_DE_RAIZ.md`, y es la condición previa de casi todo lo de este documento.

---

## 5. Lo que hoy cumple, sin obra pendiente

- Los secretos de las pasarelas de pago no están en claro en la base: viven en Supabase Vault.
- Diez de los once depósitos de archivos son privados y se sirven con enlace temporal y
  vencimiento.
- El consentimiento se registra con texto versionado, con quién consintió, por qué medio, desde
  cuándo y hasta cuándo.
- Existe la estructura de aviso legal por jurisdicción, con constancia de que se avisó.
- El segundo factor está construido y el backend rechaza el pase que no llegó a segundo factor.
- No se entrenan modelos con datos de los Clientes, y no se monetiza ningún dato de salud.
- El tráfico va cifrado.

---

## 6. Lo que no se verificó

Se declara para que nadie lo tome por cumplido.

- **El référentiel HDS francés** no se pudo leer. Es donde estaría la exigencia francesa de
  compartimentación entre clientes.
- **NEN 7513:2018** es de pago y no se leyó. El registro de accesos para Países Bajos no se diseña
  sin comprarla.
- **El protocolo de auditoría del regulador estadounidense** no se leyó: la lista de evidencia sale
  del texto reglamentario, no del protocolo.
- **Los importes de sanción vigentes** no se consultaron, en ningún país. Ninguna cifra de multa se
  usa sin buscar la tabla del año.
- **Italia, Bélgica, Polonia, Dinamarca, Noruega y Finlandia** no se relevaron. El de Finlandia es
  el que más importa: la ley 784/2021 clasifica los sistemas en clase A o B con evaluación de
  conformidad por organismos aprobados.
- **Las posiciones de la autoridad francesa, PGSSI-S, Ségur y ESMS numérique** no se pudieron leer.
- En Latinoamérica quedaron sin verificar los regímenes sancionatorios de casi todos los países,
  varios plazos de respuesta a derechos.
- **Si Chile posterga la vigencia de su ley al 1-12-2027.** Hay un proyecto en trámite —boletín
  18.623-07, ingresado el 1-9-2026— que lo haría. **No es ley**, y su texto no se pudo leer: el
  sitio de la Cámara devolvió 403. Todo el diseño se hace contra el 1-12-2026, que es la fecha
  vigente.
- **Los estándares de seguridad que el art. 3 de la Ley 20.584 chilena manda dictar al Ministerio de
  Salud.** Se sabe que existen como mandato y que el prestador responde por incumplirlos; **no se
  identificó el acto que los contiene**. Puede haber requisitos técnicos obligatorios adicionales a
  los del Decreto 41/2012.
- **El reglamento chileno de acreditación de plataformas de salud digital** (art. 10 bis de la Ley
  20.584) y la actualización del Decreto 41/2012 que ordenó la Ley 21.668. No se localizaron.
- **Si existen cláusulas contractuales modelo chilenas.** Una fuente secundaria afirma que sí. Se
  considera dudoso: la Agencia que debería dictarlas no está constituida —el Senado rechazó la
  propuesta de consejeros el 20-5-2026 por falta de quórum—, y sin Agencia tampoco hay lista de
  países adecuados, ni contratos tipo, ni mecanismo de certificación.
- **Si el proveedor de nube en Brasil cuenta como «agente de tratamento brasileiro»** a los efectos
  del art. 4º IV de la LGPD, y si Argentina «proporciona grado de protección adecuado» a esos mismos
  efectos. De esas dos respuestas depende que los datos de una Prestadora argentina alojados en São
  Paulo queden o no fuera de la ley brasileña. Son preguntas para abogado brasileño.
- **El encuadre sanitario chileno de cada Prestadora.** El Decreto 1/2022 excluye de la
  hospitalización domiciliaria a la atención domiciliaria ambulatoria y de libre elección, lo que
  cambia mucho la carga regulatoria. Depende de cómo esté constituida y autorizada cada Prestadora,
  y no es algo que el producto pueda resolver en abstracto.
- **El régimen uruguayo de cuidados domiciliarios sin habilitación sanitaria.** El Decreto 242/017
  obliga a todos los prestadores a llevar historia clínica electrónica y a usar la Plataforma, pero
  delega condiciones y plazos en el Ministerio, que sólo los fijó para siete grupos del Plan de
  Adopción. Los cuidados domiciliarios sin habilitación sanitaria **no están en ninguno**. La
  internación domiciliaria sí es servicio habilitado y entraría como prestador privado parcial.
- **El plazo de conservación de la historia clínica peruana.** La NTS 139-MINSA no se pudo leer en
  su texto oficial y las fuentes secundarias discrepan entre 15 y 20 años. **Ninguna de las dos
  cifras se usa hasta confirmarla.** Es el hueco más importante que quedó abierto.
- **La versión consolidada del Título V de la autoridad colombiana.** De ahí sale la lista de países
  adecuados, y no se pudo comprobar si alguna circular posterior a 2017 la cambió. La conclusión de
  que Colombia acepta a Estados Unidos depende de eso.
- **Si el art. 15 de la Resolución 1995/1999 colombiana está derogado o modificado.** Los quince
  años no están en duda; de qué norma cuelgan, sí. Y hay un proyecto de resolución de historia
  clínica de julio de 2026 que reemplazaría todo el régimen.
- **Ninguna resolución de la autoridad brasileña se pudo comprobar contra el diario oficial**, que
  estuvo caído; se leyeron de copias de terceros. Tampoco se leyó el manual de certificación SBIS
  ni las portarias de consolidación del sistema público brasileño, y **las normas de la agencia de
  planes de salud brasileña no se relevaron**.
- **Si la Ley 27.706 argentina fue reglamentada**, y si el Ministerio de Salud dictó la política de
  seguridad que le ordena el Decreto 98/2023.
- **Los valores de las unidades con que se calculan las multas** —UVT y salario mínimo colombianos,
  UIT peruana— no se consultaron para 2026.
- **Este documento es relevamiento de fuentes públicas, no asesoramiento legal.** Antes de vender en
  un país, ese país tiene que tener su documento propio en `docs/legal/`, revisado por un
  profesional de esa jurisdicción.
