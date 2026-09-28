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
| **Argentina** | Ley 25.326 y Decreto 1558/2001 — AAIP. Arts. 2, 7, 8 y 9. Res. AAIP 47/2018 | Ley 26.529; Ley 27.553 | Mínimo 10 años; copia al paciente en 48 horas | Sin plazo legal |
| **Brasil** | LGPD 13.709/2018 — ANPD. Arts. 5º II, 11, 46, 48, 41. Res. CD/ANPD 15/2024 y 19/2024 | Res. CFM 1.821/2007; Lei 14.510/2022; Res. CFM 2.314/2022 | Papel 20 años; **electrónico, guarda permanente** | 3 días hábiles, a la autoridad y al titular |
| **Chile** | Ley 19.628; **Ley 21.719 vigente desde el 1-12-2026**, crea la APDP | Ley 20.584 art. 13; Decreto 41/2012 | **15 años, o hasta los 34 años del paciente** | 72 horas |
| **México** | LFPDPPP de 2025, vigente desde el 21-03-2025. Autoridad: Secretaría Anticorrupción y Buen Gobierno | NOM-004-SSA3-2012 5.4; **NOM-024-SSA3-2012** | 5 años desde el último acto médico | De inmediato, **sólo al titular** |
| **Colombia** | Ley 1581/2012, Ley 1266/2008, Decreto 1074/2015 — SIC. Arts. 5, 6, 17 f) y n) | Res. 1995/1999 mod. 839/2017; Ley 2015/2020 | **5 años de gestión + 15 de archivo** | Sin plazo en horas |
| **Perú** | Ley 29733 y **DS 016-2024-JUS, vigente desde el 30-03-2025** | NTS 139-MINSA/2018/DGAIEN; RENHICE (Ley 30024, DL 1306) | 20 años | **48 horas** |
| **Uruguay** | Ley 18.331, Decreto 414/009, Ley 19.670 arts. 37-40, Decreto 64/020. **Adecuación europea por Decisión 2012/484/UE** | HCEN: Ley 19.355 art. 466 y Decreto 242/017; Ley 19.869 | 2 + 3 = 5 años (Decreto 355/982) | 72 horas, **sólo a la autoridad** |
| **Ecuador** | LOPDP de 2021 y Reglamento — SPDP. **Art. 31: los datos de salud deben anonimizarse o pseudonimizarse**. Res. SPDP-SPD-2026-0004-R | AM-00115-2021, AM-5216-2014, AM-5316-2016 | 15 años desde la última atención | Según la resolución de transferencias |
| **Costa Rica** | Ley 8968, Decreto 37554-JP y reformas — PRODHAB. Arts. 5, 9, 10, 11, 14; reglamento arts. 32, 34, 45, 47 | Reglamento del Expediente de Salud de la CCSS: arts. 10, 16, 17, 19, 32, 50 | Pasivo a los 5 años (art. 50); **desasociar a los 10 (Ley art. 6)** | **5 días hábiles desde que ocurrió** |
| **Panamá** | Ley 81 de 2019 y Decreto 285 de 2021 — ANTAI. Arts. 8, 13, 19, 20, 28, 31, 47-50; decreto arts. 8, 33, 35, 36, 38 | Ley 68 de 2003; telesalud Ley 203 de 2021 | **20 años desde la muerte del paciente** | De inmediato y dentro de **72 horas**, a los dos |

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
que tenerlo firmado antes del alta.

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
- **Ley 27.553.** Receta electrónica y teleasistencia.
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

**Dos obligaciones particulares que no se deducen de ningún parecido con otro país:**

- **Costa Rica, art. 9 de la Ley 8968.** Tratar datos de salud exige que quien los trate esté sujeto
  a secreto profesional «o a una obligación equivalente de secreto». El personal técnico del
  proveedor tiene que estar contractualmente sujeto, o el tratamiento cae en la prohibición, que es
  falta gravísima. **En obra** — tramo 8.
- **Brasil, art. 11 §4º de la LGPD.** Prohíbe compartir datos de salud con fines de ventaja
  económica. Cierra cualquier monetización, incluso agregada. **Cumple** — tramo 13.

**Transferencia internacional.** Argentina, Brasil, Perú, Uruguay y Ecuador exigen cláusulas
contractuales del modelo de su autoridad; Panamá aprobó las cláusulas de la Red Iberoamericana por
Resolución ANTAI-DG-003-2026, pero para datos de salud su art. 13 vuelve prácticamente ineludible el
consentimiento explícito; Costa Rica exige consentimiento expreso que cubra específicamente la
transferencia, sin régimen de adecuación; Colombia incluye a Estados Unidos como adecuado por
Circular Externa 005 de 2017; dentro de la Comunidad Andina las transferencias se consideran
adecuadas. **En obra** — tramos 1 y 11.

**Registro de bases ante la autoridad.** Perú inscribe todo banco de datos en el RNPD; Uruguay
dentro de los 90 días de iniciar actividad; Argentina en el registro del art. 21, gratuito;
Colombia sólo por encima de 100.000 UVT; Costa Rica sólo si hay distribución, difusión o
comercialización, con canon anual; Brasil, México y Panamá no tienen registro. **En obra** — tramo
11, como aviso por país. Nunca como bloqueo.

**Cuatro integraciones nacionales obligatorias que este plan no construye**, y cada una es obra
propia: HCEN uruguayo, interoperabilidad colombiana, RENHICE peruano y la certificación
NOM-024-SSA3-2012 mexicana, que es del producto y hay que obtenerla antes de vender en México.

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
- Diez de los once depósitos de archivos son privados y se sirven con dirección firmada y
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
  varios plazos de respuesta a derechos, el número de artículo panameño de los veinte años, y el
  monto vigente del canon costarricense.
- **Este documento es relevamiento de fuentes públicas, no asesoramiento legal.** Antes de vender en
  un país, ese país tiene que tener su documento propio en `docs/legal/`, revisado por un
  profesional de esa jurisdicción.
