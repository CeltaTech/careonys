# Legislación — Argentina

> Documento mínimo requerido por `celtatech/CLAUDE.md`, sección «El riesgo legal» antes de dar de alta la primera
> Prestadora real de esta jurisdicción. No es un dictamen legal cerrado — es la base para las
> advertencias que el software muestra al activar funciones de gestión de Asistentes. Antes
> de operar con Prestadoras reales en Argentina, conviene que un abogado laboralista lo
> revise y lo amplíe; hasta entonces, cubre el riesgo principal ya identificado.

## Marco de referencia

Ley de Contrato de Trabajo (LCT), art. 23: quien preste servicios se presume que lo hace
bajo relación de dependencia laboral, salvo que las circunstancias, relaciones o causas que
lo motiven demuestren lo contrario. Es una presunción que admite prueba en contra, pero el
riesgo aumenta cuanto más se parezca la relación real a la de un empleado en relación de
dependencia (horarios fijos impuestos, exclusividad de facto, subordinación técnica y
disciplinaria, penalización de incumplimientos al estilo de un régimen disciplinario
laboral).

Este riesgo aplica a la relación entre la Prestadora y sus Asistentes cuando estos operan
bajo la modalidad de autonomía/Match (ver `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal») — no aplica cuando el
Vínculo ya es un contrato de trabajo en relación de dependencia reconocido como tal.

## Tabla de advertencias (jurisdicción → función → texto)

| Función | Texto de advertencia mostrado al activar |
|---|---|
| Penalización de inasistencias o inconductas | Penalizar inasistencias o inconductas de un Asistente autónomo puede interpretarse como ejercicio de poder disciplinario, un indicio de subordinación bajo el art. 23 de la LCT. Evalúe si esta función es coherente con la modalidad de vínculo de sus Asistentes. |
| Rankings | Publicar rankings que condicionan el acceso futuro a Guardias puede interpretarse como una forma de control jerárquico propia de una relación de dependencia (art. 23 LCT). |
| Puntuaciones por aceptación de Guardia | Puntuar la aceptación de Guardias y usarlo para asignar futuras oportunidades puede funcionar como una exigencia de disponibilidad, un indicio de subordinación (art. 23 LCT) más que de autonomía real del Asistente. |
| Puntuaciones por calificación de Cliente/Paciente | Condicionar oportunidades futuras a una calificación de terceros puede interpretarse como una forma de evaluación de desempeño propia de una relación laboral (art. 23 LCT). |
| Límite de oportunidades futuras por rechazos | Limitar a un Asistente autónomo por rechazar Guardias reduce su libertad real de decidir su participación, un elemento central para sostener que la relación es autónoma y no dependiente (art. 23 LCT). |
| Niveles/categorías/jerarquías por servicio | Establecer niveles o categorías jerárquicas puede interpretarse como una estructura organizativa propia de relación de dependencia (art. 23 LCT). |
| Horarios fijos | Imponer horarios fijos (en vez de que el Asistente decida su disponibilidad) es uno de los indicios más fuertes de subordinación bajo el art. 23 de la LCT. |

## Notas de aplicación

- Estas advertencias se muestran una vez, al activar la función, y quedan auditadas (quién,
  cuándo, qué función, qué advertencia se mostró) — ver `celtatech/CLAUDE.md`, sección «El riesgo legal».
- Ninguna de estas funciones está bloqueada ni restringida por este documento: están
  disponibles sin restricción desde el día uno, coherente con `celtatech/CLAUDE.md`, sección «El riesgo legal»:
  «El producto no prohíbe ni bloquea nada por razones legales. Avisa.»
- Si se agrega una función nueva de gestión de Asistentes no listada acá, corresponde
  evaluar si aplica el mismo riesgo del art. 23 LCT y sumar su fila a esta tabla antes de
  activarla para una Prestadora real de Argentina.

## Modalidad Match — riesgo invertido

> Diseño completo en `docs/PRD_07_Modalidad_Match.md` (2026-07-24). Acá solo la
> tabla de advertencias que corresponde a esta jurisdicción — pendiente de revisión por un
> abogado laboralista antes de una Prestadora real en esta modalidad, igual que el resto de
> este documento (ver nota al inicio).

En prestación directa el riesgo es que la Prestadora controle tanto al Asistente que
parezca su empleadora. En Match el riesgo es el mismo principio del art. 23 LCT
aplicado al revés: que sea **la plataforma**, no el Cliente, quien ejerza ese control de
forma agregada entre todos los Clientes — mismo patrón que llevó a fallar en contra de
Uber en el Reino Unido (Uber BV vs Aslam, 2021).

Herramientas que el Cliente opera sobre **su propio** Asistente contratado (horario,
penalización, calificación) no generan este riesgo — es el Cliente ejerciendo su rol de
empleador doméstico ya reconocido por la Ley de Personal de Casas Particulares (26.844),
no la plataforma. El riesgo aparece solo cuando la decisión es de la plataforma, agregada
entre todos los Clientes:

| Función | Texto de advertencia mostrado al activar |
|---|---|
| Ranking o puntaje calculado por la plataforma que decide si un Asistente sigue apareciendo ante cualquier Cliente | Un ranking calculado por la plataforma que condiciona si el Asistente sigue visible para cualquier Cliente puede interpretarse como la plataforma decidiendo su acceso al trabajo en general, un indicio de subordinación bajo el art. 23 de la LCT — mismo hecho que pesó en contra de Uber en el caso Aslam (Reino Unido, 2021). |
| Consecuencia automática atada a la calificación agregada (ej. exclusión por debajo de un puntaje) | Atar una exclusión automática a la calificación agregada convierte la opinión de los Clientes en una decisión algorítmica de la plataforma sobre el Asistente, un indicio de subordinación bajo el art. 23 de la LCT. |
| Precio u horario fijado por la plataforma para todos los Clientes por igual | Fijar precio u horario de forma centralizada, en vez de que cada Cliente lo acuerde con su Asistente, es un indicio fuerte de subordinación bajo el art. 23 de la LCT. |
| Exclusividad exigida por la plataforma | Exigir exclusividad reduce la libertad real del Asistente de trabajar para otros, elemento central para sostener autonomía y no dependencia (art. 23 LCT). |
| Mediación de conflictos por la plataforma | Mediar activamente en conflictos entre Cliente y Asistente puede interpretarse como dirección del vínculo, un indicio de subordinación bajo el art. 23 de la LCT. |

No generan advertencia en Match (bajo riesgo): calificación por estrellas visible
como opinión sin consecuencia automática, verificación de identidad/antecedentes, toggle de
disponibilidad del Asistente, y las herramientas de horario/penalización/calificación
cuando las opera el Cliente sobre su propio vínculo.

## Indicaciones de medicación — riesgo de mala praxis por falta de habilitación

> Acá solo la advertencia que
> corresponde a esta jurisdicción — pendiente de revisión por un abogado antes de una
> Prestadora real que active esta función, igual que el resto de este documento (ver nota
> al inicio).

El riesgo acá no es laboral (art. 23 LCT) sino de **ejercicio ilegal de una profesión de la
salud / mala praxis**: ciertas vías de administración de medicación (por ejemplo,
inyectables) requieren una habilitación profesional específica según la ley de ejercicio de
la enfermería vigente (Ley 24.004 y su decreto reglamentario) — un/a Asistente sin matrícula
de enfermero/a no puede aplicar una inyección aunque el Cliente y la Prestadora estén de
acuerdo. Si una Prestadora acepta una indicación de medicación y asigna la Guardia a un
Asistente sin la habilitación requerida para esa vía, y ocurre un incidente, la Prestadora
puede quedar expuesta a responsabilidad civil (mala praxis) y el propio Asistente a
responsabilidad por ejercicio ilegal de la profesión.

| Función | Texto de advertencia mostrado al activar |
|---|---|
| Aceptar una indicación de medicación cuya vía de administración requiere una habilitación (según `configuracion_habilitacion_via_medicacion` de la Prestadora) sin que ningún Asistente asignado al Paciente la tenga vigente | Ningún Asistente actualmente asignado a este Paciente cuenta con la habilitación profesional requerida para esta vía de administración (ej. aplicación de inyectables exige enfermero/a matriculado/a). Aceptar esta indicación sin asignar un Asistente habilitado puede generar responsabilidad por mala praxis ante un incidente. |

Notas de aplicación (mismo principio que el resto del documento, `celtatech/CLAUDE.md`, sección «El riesgo legal»):

- La función nunca se bloquea: el Panel puede aceptar la indicación igual, la advertencia
  solo informa el riesgo y queda auditada (`auditoria_advertencias_legales`).
- El mapeo vía→habilitación requerida es configuración libre de cada Prestadora
  (`configuracion_habilitacion_via_medicacion`, tab "Habilitación de medicación" en
  Configuración del Panel) — este documento no fija qué vías requieren qué habilitación,
  solo documenta el riesgo detrás de la advertencia que el sistema ya trae seedeada
  (`inyectable → enfermero_matriculado`) como punto de partida, editable sin límite.
- Si en el futuro se agrega una vía de administración nueva con riesgo legal propio no
  cubierto por esta única advertencia, corresponde evaluarlo y, de aplicar, documentarlo acá
  antes de activarlo para una Prestadora real de Argentina.

## Fórmula de cálculo de cese

> La estructura descrita acá
> vive como dato en `formulas_cese` (jurisdicción `AR`). El código que la interpretaba salió del
> producto y está en `celtatech/Codigos-utiles/vinculo-laboral-cese-y-riesgo-de-dependencia` — este documento describe en lenguaje humano lo que esas
> filas codifican, no fija ningún valor nuevo. Pendiente de revisión por un abogado
> laboralista, igual que el resto de este documento (ver nota al inicio).

El cálculo de indemnización por cese de un Asistente en relación de dependencia depende de
la causal del cese (art. 231/232/241/242/244/245/248/249 LCT, art. 92 bis para el período de
prueba, arts. 178/182 para el agravamiento por embarazo o matrimonio). Cada causal compone
uno o más de estos componentes:

| Componente | Qué representa | Escala de la que depende (`escalas_legales`) |
|---|---|---|
| Preaviso sustitutivo | Días de preaviso adeudados, según antigüedad menor o mayor a 1 año | `preaviso_dias` (`menos_1_anio` / `mas_1_anio`) |
| Indemnización por antigüedad | Meses de mejor remuneración por año de antigüedad, con tope y piso mínimo | `indemnizacion_antiguedad`, `tope_indemnizatorio`, `piso_minimo_indemnizacion`, `fraccion_computable_antiguedad` |
| Integración del mes de despido | Días restantes hasta fin de mes calendario desde la fecha de cese | (aritmética de calendario, no depende de una escala) |
| Agravamiento por embarazo/matrimonio | Meses adicionales de remuneración que se suman sobre la indemnización de un despido sin causa | `multiplicador_agravado` (`embarazo_matrimonio`) |
| Verificación de período de prueba | Si la antigüedad está dentro de los días de período de prueba vigentes | `periodo_prueba_dias` |

Composición por causal (Argentina):

- **Renuncia**: sin monto a pagar por la Prestadora; solo informa el preaviso que el
  Asistente le adeudaría a su empleador si correspondiera.
- **Mutuo acuerdo** (art. 241 LCT): sin cálculo automático — el monto se define por acuerdo
  entre las partes, el sistema solo lo registra.
- **Período de prueba** (art. 92 bis LCT): sin indemnización si la antigüedad está dentro
  del período de prueba vigente; si lo excede, exige revisión de abogado (probablemente
  corresponda otra causal).
- **Despido sin causa** (arts. 232/233/245 LCT): indemnización por antigüedad + preaviso
  sustitutivo + integración del mes de despido.
- **Despido por embarazo o matrimonio** (arts. 178/182 LCT): el resultado íntegro de despido
  sin causa, más el agravamiento.
- **Despido con justa causa** (art. 242 LCT) / **abandono de trabajo** (art. 244 LCT): sin
  indemnización, pero exige revisión de abogado obligatoria antes de cerrar el registro.
- **Muerte del trabajador** (art. 248 LCT) / **muerte del empleador** (art. 249 LCT): la
  mitad de la indemnización por antigüedad; exige revisión de abogado en ambos casos. Muerte
  del empleador solo aplica cuando el vínculo es de dependencia directa con el Cliente, no
  con la Prestadora — el sistema lo advierte si no es así.

Quedan fuera de este cálculo automático, en cualquier jurisdicción (no dependen de la ley de
un país en particular): incapacidad absoluta, jubilación, fin de contrato comercial, muerte
de la persona cuidada.

### Sin fórmula cargada para una jurisdicción

Si una Prestadora opera en un país sin fila en `formulas_cese` para la causal elegida, el
sistema nunca aproxima con la fórmula de otro país (mismo principio que las advertencias de
este documento, `celtatech/CLAUDE.md`, sección «El riesgo legal»): devuelve `requiereRevisionAbogado: true`, sin monto
calculado, y una advertencia indicando que la legislación de esa jurisdicción todavía no fue
investigada.

## Protección de datos e historia clínica

> Los estados —**Cumple**,
> **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No alcanza**— significan lo que
> dice la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Lo que comparten los diez países
> relevados se queda allá.

### Las normas

- **Norma de datos:** Ley 25.326 y Decreto 1558/2001 — AAIP. Arts. 2, 4(7), 7, 8, 9, 10, 11(4), 21
  y 25. Res. AAIP 47/2018 y 126/2024.
- **Historia clínica:** Ley 26.529 y Decreto 1089/2012; Ley 27.553 y **Decreto 98/2023**; Ley
  27.706.
- **Conservación:** mínimo 10 años **desde la última actuación**; copia al paciente en 48 horas.
- **Brecha:** sin plazo legal.

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
CeltaTech y la Prestadora. **En obra** — paso 5. Es un requisito del contrato, no del código, y hay
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
  pasos 9, 13, 124 y 125.
- **Ley 26.529.** Historia clínica cronológica, foliada y completa, propiedad del paciente, con
  copia entregada dentro de las 48 horas y conservación de **diez años como mínimo**. **En obra** —
  tramos 4, 5 y 7.
- **El art. 4(7) manda destruir, y la Ley 26.529 manda guardar diez años.** No es contradicción sino
  dos relojes: el dato deja de ser necesario y se destruye, salvo el que una ley obliga a conservar.
  La consecuencia de producto es que la conservación se parametriza por tipo de dato, con el plazo
  más largo mandando, y nunca hay un borrado automático que alcance al registro clínico. **En obra**
  — paso 122.
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
  modificación. **En obra** — pasos 9 y 125. ⚠️ Sin verificar si fue reglamentada.
- **Registro de bases del art. 21.** Lo inscribe la Prestadora, es gratuito, y el producto le avisa.
  **En obra** — paso 127.
- **Sin plazo legal de notificación de brechas.** Se aplica igual el de 24 horas del paso 124, porque
  el sistema se construye contra el reloj más corto y no por país.
- **Los proyectos de nueva ley de protección de datos no están sancionados.** No se construye contra
  ellos.

**La regla de la empresa exige que antes de vender en un país ese país tenga su documento.** La
materia de datos de salud de Argentina es esta sección. **En obra** — paso 127.

### Lo que comparte con los otros nueve países

De las cinco exigencias que los diez comparten, listadas en `docs/CUMPLIMIENTO_NORMATIVO.md`,
Argentina figura en dos:

- **Consentimiento expreso para datos de salud** (Ley 25.326 art. 8). **Cumple** la estructura;
  **en obra** los textos por país — paso 127.
- **Corrección por nota aclaratoria, nunca por sobreescritura.** **En obra** — tramo 7.

### Las obligaciones particulares

- **El cifrado de audio y video ya no es una rareza argentina: son dos países.** El Decreto 98/2023
  argentino y el art. 10 del Decreto 127/024 uruguayo, que exige «sistema de cifrado actualizado» en
  los servicios con transmisión de audio y video en simultáneo. **En obra** — paso 13.

### Transferencia internacional

Argentina exige instrumento de transferencia aun para entregarle los datos al encargado, con las
cláusulas del modelo de su autoridad, igual que Brasil y Perú. **En obra** — pasos 5 y 127. Estados
Unidos no está en la lista argentina de países adecuados.

### Registro de bases ante la autoridad

**Argentina inscribe en el registro del art. 21, gratuito, obligatorio y sin excepción por tamaño
de empresa** —incluidas las cámaras de vigilancia, y alcanza también a responsables no
establecidos en el país—. **En obra** — paso 127, como aviso por país. Nunca como bloqueo.

Lo que esto le pide al producto es concreto: **cada Prestadora es la responsable y es quien
inscribe**, CeltaTech es el encargado, y el producto tiene que poder entregarle a cada una lo que
el formulario le pide —categorías de datos, medidas de seguridad, personas con acceso, tiempo de
conservación, encargados y países—. Sin eso, la Prestadora no puede inscribir, y sin inscripción
el art. 21(3) argentino prohíbe toda cesión.

### Lo que no se verificó

- **Si la Ley 27.706 argentina fue reglamentada**, y si el Ministerio de Salud dictó la política de
  seguridad que le ordena el Decreto 98/2023.
- **Si el proveedor de nube en Brasil cuenta como «agente de tratamento brasileiro»** a los efectos
  del art. 4º IV de la LGPD, y si Argentina «proporciona grado de protección adecuado» a esos mismos
  efectos. De esas dos respuestas depende que los datos de una Prestadora argentina alojados en São
  Paulo queden o no fuera de la ley brasileña. Son preguntas para abogado brasileño.
