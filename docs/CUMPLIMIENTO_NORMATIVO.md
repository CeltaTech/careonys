# A qué normas da cumplimiento Careonys

Este documento cita, con artículo, cada norma que alcanza a Careonys en Estados Unidos, Europa y
Latinoamérica, y dice para cada una en qué estado está el sistema. Está escrito para que lo lea un
auditor o el área de compras de un comprador, y para que cada afirmación se pueda verificar contra
el producto.

**Tres estados, y no hay un cuarto.**

| Estado | Qué significa |
|---|---|
| **Cumple** | Está construido y se puede mostrar funcionando |
| **En obra** | Está planificado en `docs/PLAN_HASTA_PRODUCCION.md`, con su paso |
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
| **México** | LFPDPPP de 2025, vigente desde el 21-03-2025, que abrogó la de 2010; el reglamento de 2011 sigue en pie y nadie lo reemplazó. Arts. 2, 7, 8, 9, 18, 19, 20, 35, 36; reglamento arts. 2, 4, 50-55, 57-66, 67-76. Autoridad: **Secretaría Anticorrupción y Buen Gobierno**, por su Dirección General de Datos Personales en el Sector Privado | NOM-004-SSA3-2012 num. 5.4, 5.10 y 5.12; **NOM-024-SSA3-2012**, que obliga también al desarrollador; Ley General de Salud, Capítulo VI BIS de salud digital, vigente desde el 16-01-2026 | **5 años desde la fecha del último acto médico** (NOM-004 num. 5.4). Es un piso de guarda: cumplido, **la norma no autoriza borrar** | **De inmediato, sólo al titular** (ley art. 19). No hay plazo en horas y **no se notifica a la autoridad** |
| **Colombia** | Ley 1581/2012, Ley 1266/2008, Decreto 1074/2015 — SIC. Arts. 5, 6, 17 f) y n), 23 d) | Res. 1995/1999 mod. **839/2017**; Ley 2015/2020; Res. 1888/2025 | **15 años desde la última atención**: 5 de gestión + 10 de archivo central | **15 días hábiles**, sólo a la autoridad |
| **Perú** | Ley 29733 y **DS 016-2024-JUS, vigente desde el 30-03-2025**. Arts. 34, 37, 46, 51, 52; 132-134 | NTS 139-MINSA/2018/DGAIN (RM 214-2018), que alcanza a los establecimientos **públicos, privados y mixtos** (numeral II); RENHICE (Ley 30024 y **DS 039-2015-SA**) | **20 años desde la última atención**: 5 de archivo activo + 15 de pasivo, y la propia norma hace la suma (5.3.1 num. 6 lit. e y num. 7 lit. f). **Cáncer ocupacional: 40 años** | **48 horas**, a la autoridad **y al titular** |
| **Uruguay** | Ley 18.331 arts. 4 E, 18, 19 y 23; Decreto 414/009; Decreto 64/020 arts. 4, 6 y 10. **Adecuación europea por Decisión 2012/484/UE** | HCEN: Decreto 242/017 arts. 3, 13 y 16; Decreto 122/019; Ley 19.869 y Decreto 127/024 (telemedicina) | 2 + 3 = 5 años (Decreto 355/982), pero es **facultad de destruir, no obligación de conservar**; la historia electrónica **no se borra** (242/017 art. 13) | 72 horas, **sólo a la autoridad** |
| **Ecuador** | LOPDP de 2021 y Reglamento — SPDP. **Art. 31: los datos de salud se seudonimizan «siempre que sea posible»**. Arts. 3, 34, 42, 43, 46, 47, 48, 51. Res. SPDP-SPD-2026-0004-R y **Res. SPDP-SPD-2026-0005-R, que declara gran escala a todo tratamiento de salud** | Ley Orgánica de Salud art. 7 lit. f) y h); Reglamento de la HCU **AM 00115-2021** (RO 378, 26-01-2021); Reglamento de la Historia Clínica **Electrónica** AM 0009 (RO 968, 2017); **Norma Técnica de Telesalud AM 00044-2025** (RO 2º Supl. 153, 28-10-2025); permiso ACESS por AM 00032-2020 | ⚠️ **Sin verificar.** La única cifra hallada es un manual del MSP que habla de 10 o 15 años —5 de archivo activo más 5 o 10 de pasivo— **desde la última atención**, y **10 años desde el fallecimiento**; la tabla que decide cuál de los dos no pudo leerse | **5 días hábiles** a la SPDP **y a ARCOTEL** (art. 43); el encargado avisa al responsable en **2 días**; al titular, **3 días desde que se conoció el riesgo** (art. 46) |
| **Costa Rica** | Ley 8968 —**sin ninguna reforma desde 2011**— y Decreto 37554-JP, hoy en su tercera versión tras los decretos 40008-JP y 41582 — PRODHAB. Arts. 3, 5, 6, 9, 11, 14, 21, 28; reglamento arts. 21, 29, 32, 33, 35, 36, 37, 40, 47 | Sin norma de plazo verificada para un prestador privado: el Reglamento del Expediente de Salud de la CCSS rige la Caja, que es una institución autónoma | **10 años desde la fecha de cada hecho registrado**, contados asiento por asiento y no por expediente; al vencer, **suprimir o desasociar** (Ley art. 6.1) | **5 días hábiles desde que ocurrió el hecho**, no desde que se conoce (reglamento art. 38), **al titular y a la autoridad** (art. 39) |
| **Panamá** | Ley 81 de 2019 —vigente desde el 29-03-2021— y Decreto 285 de 2021, **sin reformas ni reglamento posterior** — ANTAI, por su Dirección de Protección de Datos Personales. **Panamá no dice «encargado»: dice «custodio de la base de datos»** (Ley art. 4 num. 5). Arts. 4, 7, 8, 13, 31, 47-50, 59; decreto arts. 8, 35, 36, 37, 38, 48, 53 | Ley 68 de 2003 **arts. 49 y 50**; telesalud Ley 203 de 2021, que impone **HL7 obligatorio** | **20 años desde la muerte del paciente** (Ley 68 art. 49), y el mismo plazo para el núcleo documental tasado del art. 50. Lo que no sea relevante para la asistencia puede destruirse a los **2 años de la última atención**, y nada más | **72 horas desde que se conoce el incidente**, a la autoridad **y a los titulares en el mismo acto**, sin umbral de riesgo y sin excepción por cifrado (decreto art. 37). El custodio avisa al responsable **«de manera inmediata»** |

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
2. **Acceso limitado a lo necesario.** La norma panameña no dice «mínimo privilegio»: el art. 8 del
   Decreto 285 se titula **principio de proporcionalidad**, y su párrafo final impone tres límites
   que se acumulan — **quién** accede (sólo quien lo necesita para su función), **cuánta**
   información recibe y **por cuánto tiempo** conserva ese acceso. El tercero es el que casi
   siempre falta. Y el deber recae expresamente sobre el custodio, no sólo sobre la Prestadora.
   **En obra** — plan de aislamiento.
3. **Registro de accesos con identidad y período de todas las personas que ingresaron** (Panamá
   Decreto 285 art. 35 num. 12; Costa Rica reglamento art. 47). La norma panameña pide sólo dos
   datos: quién ingresó y en qué período; no exige anotar la operación ni el registro tocado. Aun
   así conviene anotar la operación, porque el art. 38 obliga a documentar «los hechos y efectos»
   de toda violación y sin eso es imposible. **En obra** — tramo 2. Hoy no se cumple: el registro
   anota escrituras, no lecturas.
4. **Corrección por nota aclaratoria, nunca por sobreescritura** (Brasil; Argentina; Uruguay
   Decreto 242/017 art. 13; Ecuador). **En obra** — tramo 7.
5. **Plazo de conservación y anonimización al vencer** (Costa Rica Ley art. 6.1, Panamá Decreto
   art. 7, Ecuador art. 31). **En obra** — tramo 4.

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
- **Costa Rica, art. 9.1.d de la Ley 8968.** Tratar datos de salud exige que lo haga personal
  sanitario sujeto a secreto profesional «**o por otra persona sujeta, asimismo, a una obligación
  equivalente de secreto**». La ley no define esa frase, pero la llenan el art. 11 —que impone el
  secreto a «quienes intervengan en cualquier fase del tratamiento» y lo mantiene después de
  terminada la relación—, el art. 3.f y el art. 2.m del reglamento, que alcanza a «toda persona que
  tenga participación en el tratamiento o almacenamiento». De ahí se sigue que **el personal
  técnico del proveedor ya está alcanzado por la ley, y que el contrato no lo obliga sino que lo
  vuelve demostrable.** La norma **no** exige que sea personal sanitario. Tratar sin ese recaudo es
  falta gravísima. **En obra** — tramo 8.
- **Costa Rica: la condición socioeconómica es dato sensible.** El art. 3.e de la Ley 8968 la
  incluye en la definición, y el art. 31.a convierte en **falta gravísima** tratar datos sensibles
  fuera de la ley. Lo que el Cliente paga y su capacidad de pago entran por ahí. El art. 9.4, sobre
  comportamiento crediticio, es categoría aparte y rige para el Sistema Financiero Nacional: no
  aplica. Es el tercer país que protege el dato económico, con Perú y Chile. **En obra** — tramos
  4, 8 y 11.
- **Costa Rica: transmitir «por medio de mecanismos inseguros» es falta, sin que haga falta daño.**
  El art. 29.b del reglamento tipifica como falta leve recolectar, almacenar y transmitir así. Es
  el enganche directo entre una debilidad del software y la responsabilidad de la Prestadora, y no
  espera a que se filtre nada. **En obra** — plan de aislamiento.
- **Costa Rica no tiene niveles de seguridad: tiene un modelo de riesgo.** No existen los niveles
  básico, medio y alto. El art. 35 del reglamento enumera siete factores de riesgo y el art. 36
  siete acciones, entre ellas —inciso c— **poder declarar el motor de base de datos y su versión**.
  A eso se suman el análisis de riesgo, el riesgo residual y el plan de trabajo. Las medidas son
  información no divulgada y PRODHAB sólo las revisa in situ ante denuncia. Y el art. 37, último
  párrafo, fija la **única periodicidad obligatoria del régimen: con datos sensibles, las medidas
  se revisan al menos una vez al año.** **En obra** — tramos 8 y 10.
- **Costa Rica: el protocolo de actuación es obligatorio y se le entrega al encargado.** La Ley
  dice «podrán» (art. 12), pero el art. 32 del reglamento dice **deberán**, fija su contenido
  mínimo —incluido el inciso e, mantener un historial de los datos durante su tratamiento— y obliga
  a transmitírselo al encargado. Es el país donde la documentación que CeltaTech le entrega a cada
  Prestadora deja de ser cortesía. **En obra** — tramo 11.
- **Costa Rica: la base clínica de una Prestadora no se inscribe, y eso no exime de nada.** El art.
  21 de la Ley con el art. 2 del reglamento sólo obliga a inscribir la base «administrada con fines
  de distribución, difusión o comercialización»; el párrafo final del art. 44, agregado por el
  Decreto 40008-JP, deja afuera a la base interna. Se inscribe el responsable, nunca el encargado.
  Y la obligación de entregarle un «superusuario» a PRODHAB **está derogada**: quien lo haya
  facilitado tiene que desactivarlo.
- **Panamá: para salud el consentimiento es «previo, irrefutable y expreso».** El párrafo final del
  art. 8 de la Ley 81 usa esa palabra, y lo que agrega no es una formalidad sino una carga de
  prueba: hay que poder mostrar **qué texto** se consintió, **en qué versión** y **en qué momento**.
  Una casilla marcada no lo satisface. Y el num. 7 de ese artículo, que exime en caso de urgencia
  médica, **no cubre la prestación programada**: un servicio de cuidados contratado no es una
  urgencia. **En obra** — tramo 11.
- **Panamá: ANTAI fiscaliza directamente al custodio.** El art. 59 del Decreto 285 somete a
  fiscalización tanto al responsable como al custodio de la base. CeltaTech no queda detrás de la
  Prestadora: responde por sí misma ante la autoridad.
- **Panamá: un incidente que toque a varias Prestadoras se notifica por separado a cada una.** El
  art. 37 del Decreto 285 obliga al custodio a informarle al responsable «de manera inmediata», y
  cada responsable sólo puede ser informado de lo suyo. De ahí sale una exigencia de arquitectura
  que no es opcional: la detección tiene que poder contestar **a qué Prestadoras alcanzó el
  incidente**, o cumplir con una obliga a filtrarle datos de otra. **En obra** — tramo 6 y plan de
  aislamiento.
- **Ecuador: un producto de salud es «gran escala» por definición, sin contar titulares.** El art.
  14.1 de la Resolución SPDP-SPD-2026-0005-R califica directamente como gran escala los
  tratamientos de salud hechos en el marco de sistemas asistenciales o de gestión de historiales
  clínicos. No se aplica el modelo de cálculo por puntaje de los arts. 7 a 11: la calificación es
  automática aunque haya un solo paciente. Eso dispara **delegado de protección de datos
  obligatorio, evaluación de impacto previa, registro de actividades reforzado (art. 15), auditoría
  cada doce meses (art. 17) e informe anual de cumplimiento (art. 18), todo conservado cinco
  años**. Es la carga formal más pesada de los diez países. **No alcanza** en su parte societaria;
  **en obra** — tramos 10 y 11.
- **México: la norma de la historia clínica electrónica obliga al que hace el software, no sólo al
  que lo usa.** El numeral 1.2 de la NOM-024-SSA3-2012 alcanza a «las personas físicas o morales
  que tengan los derechos de propiedad, uso, autoría, distribución y comercialización» del sistema.
  Es el único de los diez países donde CeltaTech es destinataria directa de una norma sanitaria, y
  lo que exige es sustantivo: sistema de gestión de seguridad de la información (6.6.1), documentos
  inalterables (6.6.2), **firma electrónica avanzada con no repudio** (6.6.3 a 6.6.6),
  **intercambio en HL7 CDA / HL7 V3 / XML** (6.1.3.1), catálogos obligatorios con **CIE-10** (6.4.2
  y Apéndice A) y **certificación ante la DGIS** (capítulo 7), que sigue operativa. **No alcanza** —
  es obra propia, y tiene que estar antes de vender en México. Y hay una modificación en curso,
  todavía sin publicar, cuyo sentido declarado es apretar sobre el envío de información a la DGIS.
- **México: mandar los datos a São Paulo no es transferencia, es remisión.** El art. 53 del
  Reglamento: «Las remisiones nacionales e internacionales de datos personales entre un responsable
  y un encargado **no requerirán ser informadas al titular ni contar con su consentimiento**». La
  exclusión no depende de que el reglamento de 2011 siga vigente, porque la propia ley de 2025 la
  ancla en tres lugares (arts. 2 fracc. XII, 2 fracc. XX y 35). México tampoco tiene lista de países
  adecuados —evalúa la relación contractual, no el país (reglamento arts. 74 y 75)—, ni obligación
  de alojar en el país, ni registro de bases, ni representante local. **Pero el art. 53 fracc. I
  convierte automáticamente al encargado en responsable si usa los datos para una finalidad
  propia**: entrenar modelos o hacer estadística comercial con ellos sería exactamente eso.
- **México: el consentimiento para datos de salud tiene que ser expreso y por escrito.** El art. 8
  de la ley no admite el consentimiento tácito, y acepta firma autógrafa, firma electrónica o
  cualquier mecanismo de autenticación; **la carga de probarlo es del responsable** (reglamento art.
  20). Los datos patrimoniales no son sensibles, pero también exigen consentimiento expreso (art. 7,
  párrafo quinto). La excepción sanitaria del art. 9 fracc. VI **no sirve como base de operación**:
  tiene dos candados que se acumulan —sólo mientras el titular esté impedido de consentir, y sólo
  por persona sujeta a secreto—. **En obra** — tramo 11.
- **Panamá: el reloj de la conservación arranca con un hecho que el sistema puede no enterarse
  nunca.** El art. 49 de la Ley 68 cuenta los veinte años **desde la muerte del paciente**, y no fija
  ningún plazo autónomo para pacientes vivos. Purgar por antigüedad de la última atención sería
  ilícito para el núcleo del art. 50. De ahí salen dos exigencias de producto que no se deducen de
  ningún otro país: **un dato de fallecimiento que dispare el cómputo**, y **el bloqueo de toda purga
  automática** mientras ese dato no exista. **En obra** — tramo 4.
- **Panamá: subcontratar el alojamiento necesita autorización previa y escrita, con el proveedor
  nombrado.** El art. 49 del Decreto 285. Es la misma exigencia que el art. 15 bis chileno, y alcanza
  al proveedor de nube de São Paulo. **En obra** — tramo 1.
- **Panamá: las multas alcanzan directamente al custodio.** El art. 36 de la Ley 81 fija de 1.000 a
  10.000 balboas —a la par del dólar, sin indexación—, y los arts. 38 a 41 gradúan: son **muy graves**
  no observar las regulaciones sobre datos sensibles (art. 41 num. 2) y el almacenamiento o la
  transferencia internacional ilícitos (num. 4), que es exactamente este caso. El art. 43 suma cierre
  y suspensión. Y el art. 62 num. 10 del Decreto 285 cuenta como **atenuante** tener registrado al
  oficial de protección de datos, registro que para el sector privado es optativo (art. 42).
- **Panamá: hay que revelar el uso de inteligencia artificial.** El art. 8.2 de la Ley 203 de 2021
  obliga a informarlo y a identificar al responsable de la plataforma; el art. 5.5 exige un acuerdo
  escrito con el proveedor de tecnología, exhibible; el art. 6, consentimiento informado firmado
  **dentro del expediente clínico**; y el art. 13, que toda actividad de telemedicina quede asentada
  en la historia clínica. Es el único de los diez países que legisla sobre revelar la inteligencia
  artificial. **En obra** — tramo 11.
- **Costa Rica: derecho al olvido a los diez años.** El art. 11 del reglamento, reformado en 2016,
  obliga a suprimir el dato a los diez años de terminado el objeto del tratamiento, salvo acuerdo de
  partes, relación continuada o interés público. Complementa el art. 6.1 de la Ley, que cuenta desde
  cada hecho registrado. **En obra** — tramo 4.
- **Ecuador: la telesalud tiene norma propia y es la más nueva del relevamiento.** El Acuerdo
  Ministerial 00044-2025 exige **dos consentimientos separados** —uno para usar medios telemáticos y
  otro para tratar los datos—, cifrado en la transmisión, cumplimiento del Esquema Gubernamental de
  Seguridad de la Información, un registro de trazabilidad de los servicios prestados y estándares de
  interoperabilidad **DICOM, HL7, FHIR, LOINC y SNOMED-CT**. Sólo se activa si el producto presta
  teleconsulta, teleseguimiento o telemonitoreo. **En obra** — tramos 9 y 11.
- **Ecuador: la empresa prestadora necesita permiso anual de ACESS.** Arts. 8 y 9 del Acuerdo
  Ministerial 00032-2020, con una excepción expresa: el profesional en libre ejercicio que atiende a
  domicilio **sin establecimiento** no lo requiere. La normativa sanitaria propia de la atención
  domiciliaria fue derogada en 2020 y no se reemplazó: hoy la atención domiciliaria queda absorbida
  en la definición general de establecimiento de salud. **No alcanza** — es trámite de la Prestadora,
  y el producto se lo avisa.
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

**Cuatro países dicen que entregarle los datos al encargado no es transferencia:**

- **Ecuador.** El art. 4 de la LOPDP define la transferencia como la que se hace «a una persona
  **distinta al titular, responsable o encargado**», y el art. 34 agrega que el acceso del encargado
  no constituye transferencia ni comunicación. El art. 23 de la Resolución SPDP-SPD-2026-0004-R lo
  dice sin rodeos: «el encargo de tratamiento no constituye una transferencia ni comunicación de
  datos personales. En consecuencia, las CCM entre responsables y encargados, emitidas por la RIPD,
  no son aplicables en la República del Ecuador.» Lo que sí exige es el **contrato de encargo** del
  art. 34 y las medidas de los arts. 37-42.
- **Costa Rica, con una salvedad.** El art. 40 del reglamento, reformado por el Decreto 40008-JP,
  dice que «no se considera transferencia el traslado de datos del responsable a un encargado,
  proveedor de servicios o intermediario tecnológico». Pero la Ley 8968 no recoge esa exclusión, y
  su art. 31.f sanciona como falta gravísima transferir sin consentimiento. Un reglamento no puede
  angostar la ley que reglamenta, así que **esto no se da por resuelto**.
- **México**, que llama a esto **remisión** y no transferencia. El art. 53 del Reglamento la exime
  de consentimiento y de aviso al titular, y la ley de 2025 ancla la exclusión en los arts. 2 fracc.
  XII, 2 fracc. XX y 35. Lo que sí hace falta es el contrato del art. 52 del Reglamento, que es la
  norma de cabecera del cómputo en la nube, y la autorización de subcontratación de los arts. 54 y
  55 —que puede darse anticipada en el propio contrato, y si el contrato calla hay que pedirla caso
  por caso, con la carga de acreditarla sobre el encargado—.
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
Resolución ANTAI-DG-003-2026, firmada el 26 de marzo de 2026 y **vigente desde su publicación en la
Gaceta Oficial 30541-A, el 8 de junio de 2026**, sin período de transición. Usarlas es
**voluntario** —el art. 53 num. 1 del Decreto 285 ya admitía cláusulas propias—, no hace falta
autorización previa de la ANTAI, y **el texto no se puede modificar**: sólo se completa donde el
propio modelo lo prevé, y sólo admite garantías adicionales que no lo contradigan ni bajen la
protección. Trae dos modelos —entre responsables, y entre responsable y encargado— y un tercer
anexo de terminología que **equipara expresamente «encargado del tratamiento» a «custodio de la
base de datos»**. Aun así, para datos de salud el art. 13 de la Ley 81 vuelve prácticamente
ineludible el consentimiento explícito. **Costa Rica** exige consentimiento expreso que cubra
específicamente la transferencia, sin régimen de adecuación ni lista de países adecuados: ese
concepto no existe en su derecho, y transferir sin consentimiento es falta gravísima (Ley art.
31.f). El art. 40 del reglamento dice que entregarle los datos a un encargado no es transferencia,
pero la Ley no recoge esa exclusión —**es una tensión de rango que decide un abogado**, y mientras
tanto lo prudente es que el consentimiento mencione el alojamiento y dónde está. **Colombia** incluye a Estados Unidos como adecuado por
Circular Externa 005 de 2017, y dentro de la Comunidad Andina las transferencias se consideran
adecuadas. **En obra** — tramos 1 y 11.

**Y una advertencia que vale para los cuatro países que no llaman transferencia al encargo:** que no
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
Costa Rica sólo si la base se administra «con fines de distribución, difusión o comercialización»
(Ley art. 21 y reglamento art. 2), con un canon anual fijo de **200 dólares** —así, en dólares: no
se calcula en salarios base ni en colones— del art. 33 del reglamento; **la base clínica de una
Prestadora es base interna y no se inscribe** (reglamento art. 44, párrafo final), y el encargado
nunca se inscribe; **Ecuador no registra bases de datos**: el art. 51 de la LOPDP crea el Registro
Nacional, pero lo que el portal de la autoridad efectivamente inscribe son delegados de protección
de datos, apoderados, certificados, vulneraciones y denuncias —el registro del delegado es
gratuito—, y ninguno de sus trámites publicados es la inscripción de una base; Brasil, México y Panamá no tienen registro. **Chile tampoco**, y
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
la sección «Los cimientos» de `docs/PLAN_HASTA_PRODUCCION.md`, y es la condición previa de casi
todo lo de este documento.

---

## 5. Lo que hoy cumple, sin obra pendiente

- Los secretos de las pasarelas de pago no están en claro en la base: viven en Supabase Vault.
- Diez de los once depósitos de archivos son privados y se sirven con enlace temporal y
  vencimiento.
- El consentimiento se registra con texto versionado, con quién consintió, por qué medio, desde
  cuándo y hasta cuándo.
- Existe la estructura de aviso legal por jurisdicción, con constancia de que se avisó.
- El segundo factor está construido y el backend rechaza la credencial que no llegó a segundo factor.
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
- **El plazo de conservación de la historia clínica ecuatoriana.** Es el hueco más importante que
  quedó abierto. El articulado de archivo y custodia del AM 00115-2021 no se pudo leer —los dos
  ejemplares localizados son imágenes escaneadas sin texto—, y la tabla del manual del Ministerio
  que decidiría entre diez y quince años vive en un servidor inalcanzable. Tampoco se pudo leer el
  articulado del AM 0009, que es donde estarían las reglas ecuatorianas de seguridad, respaldo,
  registro de accesos y firma electrónica de la historia clínica electrónica: **es el documento que
  más le falta a este relevamiento**. Queda sin resolver si el AM 0457 de 2006 sigue vigente, y si
  un prestador privado está obligado a integrarse al RDACAA o a la plataforma PRAS.
- **Dos leyes mexicanas quedaron sin leer en su texto.** El art. 4 de la LFPDPPP, porque las fuentes
  discrepan sobre una reforma de noviembre de 2025 con entrada en vigor diferida; y el art. 52 del
  Reglamento, que es la norma de cabecera del contrato de cómputo en la nube y **sólo se leyó
  parafraseado**. Hay que leerlo literal antes de redactar ninguna cláusula. Además, **nadie abrogó
  ni confirmó el Reglamento de 2011**: que siga rigiendo «en lo que no se oponga» es inferencia, no
  texto leído, y sus remisiones internas quedaron corridas un número.
- **La autoridad mexicana está a medio armar.** No hay formulario ni trámite publicado para ejercer
  derechos contra un particular, ni resoluciones del sector privado publicadas, así que hoy **no hay
  dirección de trámite verificable que citar en un aviso de privacidad mexicano**. Y los
  Lineamientos del Aviso de Privacidad de 2013 perdieron su base legal: los firmó una Secretaría que
  la ley nueva no menciona ni una vez. El contenido mínimo del aviso se toma del art. 15 de la ley.
- **La ley ecuatoriana de personas adultas mayores y su reglamento.** Sólo se pudo leer un artículo
  suelto. Queda sin confirmar si un prestador domiciliario de personas adultas mayores necesita,
  además del permiso sanitario, una autorización de la autoridad de inclusión social. **Son dos
  habilitaciones de autoridades distintas si se confirma.**
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
