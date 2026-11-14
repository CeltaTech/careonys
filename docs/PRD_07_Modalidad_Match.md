# Modalidad Match — diseño de negocio (Cliente ↔ Asistente)

> Decisiones tomadas con el Desarrollador el 2026-07-24. Este documento fija **qué se decidió
> y por qué**. Lo que falta construir está en `docs/PLAN_HASTA_PRODUCCION.md`.

Las 2 modalidades de trabajo de una Prestadora —prestación directa e intermediación, cuyo
nombre comercial es Match— son **combinables entre sí**, no mutuamente excluyentes: una
Prestadora puede operar las dos a la vez.

## 2. Principio central: quién ejerce el control

Toda la lógica de riesgo legal de este documento se resuelve con una sola pregunta: **¿la
decisión la toma la plataforma sobre todo el sistema, o la toma el Cliente sobre su propio
vínculo?**

- Si el Cliente decide horario, penaliza inasistencias, o califica **a su propio
  Asistente**, está ejerciendo el rol de empleador doméstico que ya le reconoce la Ley de
  Personal de Casas Particulares (26.844) — con o sin plataforma de por medio. La
  plataforma solo le da la herramienta, no decide por él.
- Si la **plataforma** agrega esas decisiones entre todos los Clientes y las usa para
  decidir el futuro laboral del Asistente en general (ej. excluirlo de aparecer para
  cualquier Cliente, fijarle precio u horario de forma uniforme), ahí sí se parece a un
  empleador — es el mismo patrón que llevó a fallar en contra de Uber en el Reino Unido
  (Uber BV vs Aslam, 2021) y a la "Ley Rider" española.

Este principio decide, función por función, si algo es "herramienta del Cliente" (bajo
riesgo) o "decisión de la plataforma" (riesgo, ver §5).

## 3. Cómo la Prestadora le cobra al Cliente el acceso a los datos de contacto

El Cliente le paga a la Prestadora. **Cada Prestadora elige de qué forma cobra** —una suscripción
que se renueva sola, un paquete con una cantidad de contactos, o una forma que arme ella— y fija
sus propios valores. El producto le da las piezas y el mecanismo; no elige por ella ni le fija
precio ni duración.

De ahí se sigue que **la política de comercialización es un dato de la Prestadora y no código**
(`celtatech/CLAUDE.md`, «nunca hardcodear»). Lo que el producto guarda son las piezas sueltas —qué
se cobra, cada cuánto, con qué período gratuito, con qué saldo de contactos, si se renueva sola— y
la forma sale de cómo se combinen: una suscripción mensual es importe + cada 1 mes + renueva sola,
y un paquete de cinco contactos es importe + una sola vez + saldo 5. Cada Prestadora arma las suyas
en `formas_de_cobro_intermediacion`, y cualquier combinación que ella elija entra sin migración.

Lo que cada Cliente tiene habilitado se guarda en `accesos_intermediacion`: a qué forma se adhirió, con
qué importe —congelado el día del alta, para que un cambio de precio no le mueva lo pactado—, hasta
qué fecha y con cuántos contactos.

### 3.1 Quién cobra

**El cobro lo hace el software de cobranzas de la Prestadora, no Careonys.** En Match el Cliente
paga por adelantado, en el momento en que quiere ver el contacto de un Asistente; en prestación
directa paga después del servicio, contra factura. El mismo software atiende las dos, con los
mismos medios de pago de la Prestadora. Careonys no factura, no cobra, no gestiona la mora y no
decide restricciones.

**El botón de compra abre la ventana de pago de ese software** adentro de la página de Match, con
la imagen de la Prestadora. El software resuelve todos los medios de pago y, apenas el pago queda
aprobado, le avisa a Careonys con un aviso firmado. Careonys abre el contacto por esa orden y por
ninguna otra: no consulta el estado del pago ni toma por bueno lo que diga la ventana del
navegador. Qué tiene que cumplir ese software está en
`celtatech/docs/SOFTWARE_DE_CREDITOS_Y_COBRANZAS.md`, sección «La compra de un acceso de Match».

**Cada aviso nombra un acceso** y dice uno de cuatro estados: pagó el período, está en período de
gracia, quedó suspendido o se dio de baja. Careonys lo anota en `cobros_intermediacion` y mueve el
acceso según lo que dice; no calcula nada por su cuenta. La entrada que recibe ese aviso y el botón
de compra se construyen con Match: hoy Match está cerrado para los Clientes.

### 3.2 Lo que vale para cualquier forma

- La búsqueda, los perfiles, el chat interno y la videollamada son libres. Lo que se cobra es el
  acceso a los datos de contacto directo: teléfono, dirección, correo.
- Confirmación explícita en pantalla antes de cualquier cobro. Nunca un cobro como efecto
  colateral de otro botón.
- El acceso termina por una fecha o un saldo guardados, nunca por una cuenta hecha al vuelo.

### 3.3 Lo que vale para toda forma que se renueve sola

Resguardos obligatorios, no opcionales. Los cumple el software de cobranzas, que es quien cobra, y
la Prestadora lo elige sabiendo que tiene que cumplirlos:

- Mensaje previo antes de cualquier cobro por vencimiento del período gratuito. Nunca un cobro
  silencioso.
- Baja en un solo paso, sin tener que escribirle a nadie, en la misma ventana del software de
  cobranzas. El patrón contrario fue parte de la sanción de la FTC a Care.com en 2024, por USD 8,5
  millones.
- Quien cancela conserva el acceso hasta el fin del período ya pagado. No hay corte inmediato.
- Si el cobro falla, período de gracia con reintentos antes de suspender el acceso. Ni corte en el
  acto ni reintentos indefinidos sin avisar.

### 3.4 Las formas que salen de esas piezas

- **Suscripción** — importe, un período, y se renueva sola. Período gratuito e importe los pone la
  Prestadora. Sin permanencia mínima: un mínimo obligatorio es contraproducente bajo defensa del
  consumidor y además debilita el argumento de canal de contacto neutral. Si el Cliente intenta ver
  un dato de contacto antes de que termine el período gratuito, el período gratuito termina ahí,
  con confirmación. Lleva los resguardos del §3.3.
- **Paquete de contactos** — importe, sin período, y un saldo de contactos que se descuenta de a
  uno. No se renueva sola y no vence por calendario, así que no lleva los resguardos del §3.3.
- **Cualquier otra combinación** es la forma propia de esa Prestadora. Los resguardos del §3.3 le
  corresponden por la pieza que los dispara —renovarse sola—, no por cómo la haya llamado.

### 3.5 Dónde las carga

En **Panel > Formas de cobro de Match**, que es para esta modalidad lo que la lista de
precios es para la prestación directa. La pantalla pregunta por las piezas, no por un tipo de
forma: nombre, importe, cada cuántos y de qué, días gratis, contactos incluidos, si se renueva
sola y si se ofrece. La moneda no se pregunta —es la de la Prestadora y la completa la base—, y
las unidades de tiempo salen de `catalogo_periodos_cobro`, así que agregar una es una fila y no
un cambio de pantalla.

Verlas es de la administración; armarlas y cambiarlas, sólo del Admin de la Prestadora: cómo
cobra una Prestadora no es asunto de un rol técnico de CeltaTech. **Y no hay baja:** una forma
que ya se contrató se apaga con `ofrecida`, de modo que los accesos que la tienen siguen
apuntando a algo que existe.

**Lo que hay que cobrar de cada período lo toma el software de cobranzas** de
`GET /accesos/para-facturar`: los accesos vigentes con importe, moneda y fecha del próximo cobro.

### 3.6 Cómo se mueve el saldo de un paquete

**Se carga cuando entra la plata.** El paquete se paga una vez, y ése es el momento en que el
saldo existe: el aviso de pago del software de cobranzas le suma al acceso los contactos que
traiga la forma.

**Suma, no pisa.** Un paquete no vence por calendario, así que lo que quedó sin abrir de una
compra anterior sigue estando; escribir el total nuevo encima sería vencerlo.

**Se gasta de a un Asistente, no de a una mirada.** Abierto el contacto de alguien, volver a
mirarlo no descuenta otro: queda anotado a quién se le abrió, y eso es lo que hace que cinco
contactos alcancen para cinco personas y no para tres miradas dos veces. La anotación vale para el
Cliente entero, así que tampoco se paga dos veces por haber comprado dos paquetes.

**No abre nada un acceso que no está vigente**, aunque le haya quedado saldo, y un acceso que se
sostiene por fecha y no por saldo lo dice con sus propias palabras: comprar un paquete no es lo
que le falta.

**Y el descuento y la anotación pasan juntos, adentro de la base.** No es un detalle de
implementación: hacerlo desde afuera —leer el saldo, restarle uno, volver a escribirlo— deja que
dos ventanas abiertas a la vez descuenten una sola vez. El reparto de permisos de esas dos
funciones está en `docs/SECURITY.md`.

### 3.7 La baja, el corte y la gracia

**Los decide el software de cobranzas, y Careonys ejecuta lo que le avisa.** La baja se hace en la
ventana de ese software, en un solo paso; el aviso dice que el acceso no se renueva y hasta qué
fecha sigue vigente, y el acceso funciona igual hasta esa fecha. Un cobro que no entra lo informa
el mismo software como período de gracia, con la fecha hasta la que alcanza, y después como
suspensión. Cuando entra la plata, el aviso de pago vuelve a dejar el acceso vigente, incluso si ya
se lo había suspendido.

**Sólo se da de baja lo que se renueva solo.** Un paquete se pagó una vez y lo que lo sostiene es
su saldo: no hay renovación que apagar.

## 4. Qué sostiene el pago después del contacto

Conseguido el Asistente, el contacto ya no hace falta. Lo que el Cliente sigue usando es la
**herramienta de control sobre su propio vínculo** —check-in y check-out, reportes diarios,
historial—, la misma que en prestación directa, pero acá la administra y la decide el Cliente
sobre su propio Asistente (§2). Alrededor de eso, todo información o herramienta, nada de
intervención en el vínculo:

1. **Prioridad de acceso a los Asistentes disponibles del Padrón** ante una baja — no es garantía de reemplazo;
   conseguirlo y acordar con él sigue siendo del Cliente.
2. **Historial documental acumulado** (reportes, check-in/check-out, incidentes).
3. **Vigilancia de vencimiento de documentación** del Asistente contratado (antecedentes,
   certificados).
4. ~~Canal de mediación de conflictos~~ — **descartado explícitamente**: mediar en conflictos
   horarios o de convivencia se parece a dirigir el vínculo y rompe el argumento de canal de
   contacto neutral (§2). Es una decisión de riesgo legal, no comercial.
5. **Alertas críticas** (ausencia sin aviso, caída del check-in) por notificación o WhatsApp —
   reutiliza el mecanismo ya construido para prestación directa.
6. **Contenido y recursos para cuidadores familiares.**

## 5. Riesgo legal invertido (modalidad Match)

En prestación directa, el riesgo es que la Prestadora controle tanto al Asistente que
parezca su empleadora (art. 23 LCT, ver `docs/legal/argentina.md`). En Match el
riesgo es el mismo principio aplicado al revés: que la **plataforma** (no el Cliente)
ejerza ese control de forma agregada entre todos los Clientes.

| Función | Riesgo | Motivo |
|---|---|---|
| Calificación por estrellas visible, como opinión del Cliente, **sin consecuencia automática decidida por la plataforma** | Bajo | Es información al consumidor, equivalente a una reseña de Google/MercadoLibre. La "autoexclusión" (nadie la elige por su nota baja) es el Cliente decidiendo, no la plataforma. |
| Verificación de identidad / antecedentes penales | Bajo | Función de seguridad, no de dirección del trabajo — describir con exactitud literal qué se verificó y qué no (caso California vs. Care.com: sancionados por afirmar una verificación que no hacían). |
| Toggle de disponibilidad del Asistente (activar/desactivar) | Bajo | El Asistente decide sobre sí misma; ya reconocido como autonomía del Asistente en `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo legal». |
| Herramientas de horario/penalización/calificación **operadas por el Cliente sobre su propio Asistente** | Bajo | Es el Cliente ejerciendo su rol de empleador doméstico (Ley 26.844), no la plataforma. |
| Ranking o puntaje que la **plataforma** calcula y usa para decidir si el Asistente sigue apareciendo ante *cualquier* Cliente | Alto | La plataforma decide el futuro laboral del Asistente en general — mismo hecho citado en Uber BV vs Aslam (Reino Unido, 2021). |
| Consecuencia automática atada a la nota agregada (ej. "por debajo de X estrellas dejás de aparecer") | Alto | Convierte la opinión del consumidor en una decisión algorítmica de la plataforma sobre el Asistente. |
| Precio u horario fijado por la plataforma para todos los Clientes por igual | Alto | Control económico/temporal centralizado, indicio clásico de subordinación. |
| Exclusividad exigida por la plataforma | Alto | Restringe la libertad de trabajar para otros, elemento central de la autonomía real. |
| Mediación de conflictos por la plataforma | Alto (por eso se descartó, §4) | Se parece a dirigir el vínculo. |

**Mitigante de diseño a incorporar, no opcional**: derecho de **descargo** del Asistente
ante una queja/calificación negativa — los casos que fallaron en contra de plataformas no
tenían ese resguardo.

**Mecánica de la advertencia**: igual que en prestación directa (`CLAUDE.md`, sección «De dónde sale cada advertencia legal») — nunca
bloquea, solo advierte al activar una función de riesgo alto, con texto propio de
Match (no reutilizar el texto de prestación directa, el riesgo apunta al revés). Ver
`docs/legal/argentina.md`, sección «Modalidad Match — riesgo invertido», para la tabla de advertencias.

## 6. Geolocalización del Asistente (check-in/checkout)

Requiere **consentimiento explícito y revocable** del Asistente (no solo buena práctica:
exigido por la Ley de Protección de Datos Personales 25.326 para geolocalizar a una
persona):

- La forma de seguimiento la elige la Prestadora en el Panel, en Configuración → Aplicaciones →
  «Ubicación del Asistente»: «Viaje y turno», la de partida, o «Sólo viaje». El Cliente no la elige.
- El Asistente acepta o rechaza en su aplicación el texto que corresponde a esa forma.
- Consentimiento auditado (quién, cuándo, qué aceptó — `celtatech/CLAUDE.md`, sección
  «Seguridad, privacidad y auditoría») y revocable en cualquier momento, no es una aceptación
  permanente.
- Cualquier costo asociado se acuerda entre Cliente y Asistente directamente — la
  plataforma no cobra ni intermedia ese dinero.

## 7. Alcance de las PWA en modalidad Match

**PWA Cliente:**
- Buscar/filtrar perfiles con insignias de verificación y calificación (opinión).
- Chat interno + videollamada, sin exponer contacto directo hasta que el cobro esté activo.
- Acceso a datos de contacto sólo con el cobro activo (§3).
- Herramienta de control sobre su propio Asistente contratado (reportes, check-in/checkout
  — sujeto al consentimiento del §6).
- Incentivos de retención del §4 (prioridad de reemplazo, historial, vencimientos,
  alertas críticas, contenido educativo).
- Gestión de su propio cobro con la Prestadora: ver el estado y darse de baja en un clic (§3).
- **No incluye**: mediación de conflictos, ni campos donde la plataforma fije precio u horario.

**PWA Asistente:**
- Perfil (experiencia, certificaciones, estado de verificación).
- Toggle de disponibilidad, sin consecuencia impuesta por la plataforma.
- Aceptar/rechazar contactos libremente, sin penalización que la excluya del sistema en
  general.
- Chat interno, mismo resguardo de contacto protegido.
- Ver sus propias calificaciones, con derecho a descargo.
- Gestión de su propia documentación (identidad, antecedentes, certificados).
- Consentimiento de geolocalización (§6), activable/revocable en cualquier momento.
- **No incluye**: horario fijado por la plataforma, precio fijado por la plataforma,
  ranking global que condicione su acceso a futuras oportunidades.
